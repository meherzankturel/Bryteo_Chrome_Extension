import { defineContentScript } from 'wxt/sandbox';
import { parsePlayerResponse, parseTimedTextXml, parseJson3 } from '../src/lib/transcript';
import type { AppMessage } from '../src/lib/messages';

type Diagnostic = { step: string; ok: boolean; note?: string };

export default defineContentScript({
  matches: ['https://*.youtube.com/watch*'],
  runAt: 'document_idle',
  async main() {
    console.log('[bryteo] content script ready on', location.href);

    chrome.runtime.onMessage.addListener((msg: AppMessage, _sender, sendResponse) => {
      if (msg.type === 'PING') {
        sendResponse({ ok: true, pong: true });
        return false;
      }

      if (msg.type === 'REQUEST_OUTLINE') {
        (async () => {
          const diagnostics: Diagnostic[] = [];
          try {
            const payload = await captureTranscript(diagnostics);
            sendResponse({ ok: true, payload, diagnostics });
          } catch (e: any) {
            sendResponse({
              ok: false,
              error: e?.message ?? 'transcript error',
              diagnostics
            });
          }
        })();
        return true;
      }

      if (msg.type === 'SEEK_VIDEO') {
        const video = document.querySelector('video');
        if (video) {
          video.currentTime = msg.payload.seconds;
          video.play().catch(() => {});
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false, error: 'no video element' });
        }
        return true;
      }
    });
  }
});

async function captureTranscript(diagnostics: Diagnostic[]) {
  const playerResponse = readPlayerResponseFromPage();
  if (!playerResponse) {
    diagnostics.push({ step: 'playerResponse', ok: false, note: 'not in window or scripts' });
    throw new Error('player response not found');
  }
  diagnostics.push({ step: 'playerResponse', ok: true });

  const meta = parsePlayerResponse(playerResponse);
  if (!meta) {
    diagnostics.push({ step: 'parseMeta', ok: false });
    throw new Error('could not parse video metadata');
  }
  diagnostics.push({ step: 'parseMeta', ok: true, note: `${meta.title} (${meta.durationS}s)` });

  // --- Strategy "InnerTube" (PRIMARY for 2026): re-call YouTube's own
  // InnerTube /youtubei/v1/player endpoint with Android client context.
  // YouTube's classic /api/timedtext endpoint returns 0 bytes for ASR captions
  // because the pot/signature requirements changed, BUT a fresh playerResponse
  // fetched via InnerTube returns caption URLs that DO work. This is what
  // NoteGPT, Eightify, and modern YT transcript extensions use in 2026.
  try {
    const innerTubeTranscript = await tryInnerTubeCaptions(meta.videoId, diagnostics);
    if (innerTubeTranscript) {
      diagnostics.push({
        step: 'extracted',
        ok: true,
        note: `${innerTubeTranscript.length} chars (InnerTube)`
      });
      return { ...meta, transcript: innerTubeTranscript };
    }
  } catch (e: any) {
    diagnostics.push({ step: 'innerTube', ok: false, note: `threw: ${e?.message ?? e}` });
  }

  if (meta.chapters && meta.chapters.length > 0) {
    diagnostics.push({
      step: 'chapters',
      ok: true,
      note: `${meta.chapters.length} chapter markers`
    });
  } else {
    diagnostics.push({ step: 'chapters', ok: false, note: 'no chapter markers' });
  }

  // --- Strategy 0: DOM scrape FIRST when transcript panel is already visible ---
  // Many users have the transcript panel pre-open. Don't waste time on URL fetches.
  const alreadyVisible = collectSegments();
  if (alreadyVisible.length >= 5) {
    diagnostics.push({
      step: 'preCheck:panelAlreadyOpen',
      ok: true,
      note: `${alreadyVisible.length} segments visible`
    });
    const transcript = extractTranscriptText(alreadyVisible);
    if (transcript) {
      diagnostics.push({ step: 'extracted', ok: true, note: `${transcript.length} chars (from open panel)` });
      return { ...meta, transcript };
    }
  }

  // --- Strategy 1: direct caption-URL fetch (json3 → srv1 → srv3) ---
  if (meta.captionUrl) {
    diagnostics.push({ step: 'captionUrl', ok: true, note: meta.captionUrl.slice(0, 100) + '…' });
    const formats: Array<{ fmt: 'json3' | 'srv1' | 'srv3'; parse: (b: string) => string }> = [
      { fmt: 'json3', parse: (body) => { try { return parseJson3(JSON.parse(body)); } catch { return ''; } } },
      { fmt: 'srv1', parse: parseTimedTextXml },
      { fmt: 'srv3', parse: parseTimedTextXml }
    ];
    for (const { fmt, parse } of formats) {
      try {
        const u = new URL(meta.captionUrl);
        u.searchParams.set('fmt', fmt);
        const resp = await fetch(u.toString());
        if (!resp.ok) {
          diagnostics.push({ step: `fetch:${fmt}`, ok: false, note: `HTTP ${resp.status}` });
          continue;
        }
        const body = await resp.text();
        const transcript = parse(body);
        if (transcript) {
          diagnostics.push({ step: `fetch:${fmt}`, ok: true, note: `${transcript.length} chars` });
          return { ...meta, transcript };
        }
        diagnostics.push({
          step: `fetch:${fmt}`,
          ok: false,
          note: `HTTP ${resp.status}, ${body.length}b, parsed empty`
        });
      } catch (e: any) {
        diagnostics.push({ step: `fetch:${fmt}`, ok: false, note: `threw: ${e?.message ?? e}` });
      }
    }
  } else {
    diagnostics.push({ step: 'captionUrl', ok: false, note: 'no caption track in playerResponse' });
  }

  // --- Strategy 2: DOM scrape with engagement-panel manipulation + button click ---
  try {
    const scraped = await scrapeTranscriptFromDOM(diagnostics);
    if (scraped) {
      diagnostics.push({ step: 'extracted', ok: true, note: `${scraped.length} chars (DOM scrape)` });
      return { ...meta, transcript: scraped };
    }
  } catch (e: any) {
    diagnostics.push({ step: 'domScrape', ok: false, note: `threw: ${e?.message ?? e}` });
  }

  throw new Error("Couldn't read this video's captions. Try a different video.");
}

/**
 * Re-call YouTube's own InnerTube /youtubei/v1/player endpoint with the
 * Android client context. This returns a FRESH playerResponse with caption
 * URLs that actually serve content — sidestepping the dead /api/timedtext
 * endpoint that returns 0 bytes for ASR captions in 2026.
 *
 * Why Android client: web client now requires `pot` (proof of token) on
 * caption URL fetches. Android client doesn't — it gets unsigned URLs.
 */
async function tryInnerTubeCaptions(
  videoId: string,
  diag: Diagnostic[]
): Promise<string> {
  // Extract INNERTUBE_API_KEY from the page (it's embedded in ytcfg or scripts)
  const apiKey = extractInnerTubeApiKey();
  if (!apiKey) {
    diag.push({ step: 'innerTube:apiKey', ok: false, note: 'no INNERTUBE_API_KEY in page' });
    return '';
  }
  diag.push({ step: 'innerTube:apiKey', ok: true });

  // POST to InnerTube player endpoint with Android client context
  let playerData: any;
  try {
    const resp = await fetch(
      `https://www.youtube.com/youtubei/v1/player?key=${apiKey}&prettyPrint=false`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: {
            client: {
              clientName: 'ANDROID',
              clientVersion: '19.09.37',
              androidSdkVersion: 30,
              hl: 'en',
              gl: 'US',
              userAgent:
                'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip'
            }
          },
          videoId
        })
      }
    );
    if (!resp.ok) {
      diag.push({
        step: 'innerTube:player',
        ok: false,
        note: `HTTP ${resp.status}`
      });
      return '';
    }
    playerData = await resp.json();
    diag.push({ step: 'innerTube:player', ok: true });
  } catch (e: any) {
    diag.push({ step: 'innerTube:player', ok: false, note: `fetch: ${e?.message ?? e}` });
    return '';
  }

  // Pull caption tracks from the Android player response
  const tracks: any[] =
    playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  if (tracks.length === 0) {
    diag.push({ step: 'innerTube:tracks', ok: false, note: 'no caption tracks' });
    return '';
  }

  // Prefer English; if none, take the first track
  const track = tracks.find((t) => t.languageCode === 'en') ?? tracks[0];
  const baseUrl: string | undefined = track?.baseUrl;
  if (!baseUrl) {
    diag.push({ step: 'innerTube:tracks', ok: false, note: 'track has no baseUrl' });
    return '';
  }
  diag.push({
    step: 'innerTube:tracks',
    ok: true,
    note: `${tracks.length} tracks, using ${track.languageCode ?? '?'}`
  });

  // Fetch the actual transcript JSON
  try {
    const url = baseUrl + (baseUrl.includes('fmt=') ? '' : '&fmt=json3');
    const resp = await fetch(url);
    if (!resp.ok) {
      diag.push({
        step: 'innerTube:captionFetch',
        ok: false,
        note: `HTTP ${resp.status}`
      });
      return '';
    }
    const body = await resp.text();
    if (body.length === 0) {
      diag.push({ step: 'innerTube:captionFetch', ok: false, note: 'empty body' });
      return '';
    }

    // Parse as json3 first, fall back to XML
    let transcript = '';
    try {
      transcript = parseJson3(JSON.parse(body));
    } catch {
      transcript = parseTimedTextXml(body);
    }

    if (!transcript) {
      diag.push({
        step: 'innerTube:captionFetch',
        ok: false,
        note: `body ${body.length}b but parsed empty`
      });
      return '';
    }

    diag.push({
      step: 'innerTube:captionFetch',
      ok: true,
      note: `${transcript.length} chars`
    });
    return transcript;
  } catch (e: any) {
    diag.push({
      step: 'innerTube:captionFetch',
      ok: false,
      note: `threw: ${e?.message ?? e}`
    });
    return '';
  }
}

function extractInnerTubeApiKey(): string | null {
  // Try the global ytcfg object first
  const w = window as any;
  const fromCfg = w.ytcfg?.data_?.INNERTUBE_API_KEY ?? w.ytcfg?.get?.('INNERTUBE_API_KEY');
  if (typeof fromCfg === 'string' && fromCfg.length > 10) return fromCfg;

  // Fall back to scanning inline scripts
  const scripts = document.querySelectorAll('script');
  for (const s of Array.from(scripts)) {
    const text = s.textContent ?? '';
    const m = text.match(/"INNERTUBE_API_KEY":\s*"([^"]+)"/);
    if (m && m[1]) return m[1];
  }

  // Last resort: scan body's text
  const bodyText = document.documentElement.outerHTML;
  const m = bodyText.match(/"INNERTUBE_API_KEY":\s*"([^"]+)"/);
  return m?.[1] ?? null;
}

/**
 * Robust multi-strategy DOM scrape for YouTube's transcript panel.
 *
 * In 2026 YouTube ships several different layouts (web, web-with-redesign,
 * mobile-web, embedded). We try in this order:
 *   1. Already-rendered segments anywhere on the page
 *   2. Engagement-panel direct expansion (no click needed)
 *   3. "Show transcript" button click (with description expansion + options menu)
 *   4. Force-render via engagement-panel hidden→expanded toggle
 *   5. Final lazy-load scroll to fetch any remaining segments
 */
async function scrapeTranscriptFromDOM(diag: Diagnostic[]): Promise<string> {
  // Strategy A: segments already in the DOM
  let segs = collectSegments();
  if (segs.length >= 5) {
    diag.push({ step: 'domScrape:alreadyVisible', ok: true, note: `${segs.length} segs` });
    await loadAllSegments(diag);
    segs = collectSegments();
    return extractTranscriptText(segs);
  }

  // Strategy B: engagement panel exists but is hidden. Make it visible.
  if (tryOpenEngagementPanel(diag)) {
    // Scroll the panel into view in case YouTube uses IntersectionObserver to
    // trigger segment render on visibility (some 2026 layouts do).
    const transcriptPanel = document.querySelector<HTMLElement>(
      '[target-id*="transcript"]'
    );
    transcriptPanel?.scrollIntoView({ block: 'center' });

    segs = await waitForSegments(7000);
    if (segs.length >= 2) {
      diag.push({ step: 'domScrape:viaEngagementPanel', ok: true, note: `${segs.length} segs` });
      await loadAllSegments(diag);
      segs = collectSegments();
      return extractTranscriptText(segs);
    }
  }

  // Strategy C: click "Show transcript" button (expanding description first if needed)
  let btn = findShowTranscriptButton();
  if (!btn) {
    const expand = findExpandDescriptionButton();
    if (expand) {
      diag.push({ step: 'domScrape:expandDesc', ok: true });
      expand.click();
      await sleep(500);
      btn = findShowTranscriptButton();
    }
  }

  if (!btn) {
    diag.push({
      step: 'domScrape:findButton',
      ok: false,
      note: 'no "Show transcript" button after expand'
    });
    return '';
  }
  diag.push({ step: 'domScrape:findButton', ok: true });

  btn.click();

  // Wait for segments to render after click
  segs = await waitForSegments(10_000);
  if (segs.length === 0) {
    diag.push({ step: 'domScrape:waitSegments', ok: false, note: '10s timeout, no segments' });
    // Defensive diagnostic: snapshot the transcript panel so we can see what
    // new DOM structure YouTube shipped. Goes to the page console only —
    // would blow up the diagnostics payload if we round-tripped it.
    dumpTranscriptPanelStructure();
    return '';
  }
  diag.push({ step: 'domScrape:waitSegments', ok: true, note: `${segs.length} initial segs` });

  await loadAllSegments(diag);
  segs = collectSegments();
  return extractTranscriptText(segs);
}

function dumpTranscriptPanelStructure(): void {
  const panel =
    document.querySelector('[target-id*="transcript"]') ??
    document.querySelector('ytd-engagement-panel-section-list-renderer');
  if (!panel) {
    console.log('[bryteo:debug] no transcript panel element found at all');
    return;
  }
  console.log('[bryteo:debug] transcript panel tag:', panel.tagName);
  console.log('[bryteo:debug] target-id:', panel.getAttribute('target-id'));
  console.log('[bryteo:debug] visibility:', panel.getAttribute('visibility'));
  console.log('[bryteo:debug] outerHTML head (first 3000 chars):');
  console.log((panel as HTMLElement).outerHTML.slice(0, 3000));

  // Also log what looks like potential segment elements
  const allEls = panel.querySelectorAll('*');
  const sampleTags = new Set<string>();
  for (const el of Array.from(allEls).slice(0, 500)) {
    if (el.tagName.toLowerCase().includes('segment') || el.tagName.toLowerCase().includes('transcript')) {
      sampleTags.add(el.tagName.toLowerCase());
    }
  }
  console.log('[bryteo:debug] transcript-related tag names inside panel:', [...sampleTags]);
}

/**
 * Find transcript segments anywhere on the page. Must handle:
 *   - Classic engagement panel: ytd-transcript-segment-renderer (legacy)
 *   - PAmodern engagement panel: ytd-search-segment-renderer (2026)
 *   - INLINE description-area transcript: new YouTube 2025+ layout where the
 *     panel is rendered directly under the video description, not in the
 *     side engagement panel. Different DOM entirely.
 *
 * Strategy:
 *   1. Explicit known tag names
 *   2. Class-based selectors
 *   3. Direct children of any transcript engagement panel's segments-container
 *   4. GLOBAL timestamp-pattern detection — find ANY element whose textContent
 *      starts with "0:00 word..." (timestamp + text). Cluster by parent; the
 *      parent with the most such children IS the transcript container,
 *      wherever YouTube renders it.
 */
function collectSegments(): Element[] {
  // 1. Explicit tag names (old + modern + experimental)
  const explicitTags = [
    'ytd-transcript-segment-renderer',
    'ytd-search-segment-renderer',
    'yt-transcript-segment-renderer',
    'yt-search-segment-renderer'
  ];
  for (const tag of explicitTags) {
    const found = document.querySelectorAll(tag);
    if (found.length > 0) return Array.from(found);
  }

  // 2. Class-based selectors
  const classSels = [
    '[class*="transcript-segment-renderer"]',
    '[class*="ytd-transcript-segment"]',
    '[class*="yt-transcript-segment"]',
    '[class*="search-segment-renderer"]'
  ];
  for (const sel of classSels) {
    const found = document.querySelectorAll(sel);
    if (found.length > 0) return Array.from(found);
  }

  // 3. Direct children of any transcript engagement panel's segments-container
  const panelSelectors = [
    'ytd-engagement-panel-section-list-renderer[target-id*="transcript"]',
    'ytd-engagement-panel-section-list-renderer[target-id*="PAmodern_transcript"]',
    '[target-id*="transcript_view"]',
    '[target-id*="transcript"]'
  ];
  for (const ps of panelSelectors) {
    const panel = document.querySelector(ps);
    if (!panel) continue;
    const containerSels = [
      '#segments-container',
      '[id*="segments-container"]',
      '[class*="segments-container"]',
      'ytd-transcript-segment-list-renderer'
    ];
    for (const cs of containerSels) {
      const container = panel.querySelector(cs);
      if (container && container.children.length >= 2) {
        return Array.from(container.children);
      }
    }
  }

  // 4. GLOBAL timestamp-pattern detection. This catches YouTube's new
  // inline-transcript layout (rendered in description area, not engagement
  // panel) AND any other format we haven't seen yet.
  return findTimestampedSegmentsGlobally();
}

/**
 * Walk the whole page looking for elements whose textContent starts with a
 * timestamp ("0:00", "00:00", "0:00:00") followed by text. Cluster matches by
 * parent — the parent with the most such children is the transcript container.
 * This works no matter where YouTube renders the transcript (engagement panel,
 * description area, new inline panel, future layouts).
 */
function findTimestampedSegmentsGlobally(): Element[] {
  const timestampRe = /^\s*\d{1,2}:\d{2}(?::\d{2})?\s+\S/;
  const allEls = document.querySelectorAll<HTMLElement>('*');
  const matches: HTMLElement[] = [];

  for (const el of Array.from(allEls)) {
    // Skip large/wrong-shape elements early
    if (el.children.length > 3) continue;
    const tag = el.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') continue;
    const text = el.textContent ?? '';
    if (text.length < 6 || text.length > 600) continue;
    if (!timestampRe.test(text)) continue;
    matches.push(el);
  }

  if (matches.length === 0) return [];

  // Cluster by parent element — the parent with the most matches is the
  // transcript container. Other "0:00 ..." text on the page (chapter
  // descriptions, comment timestamps) will live in different parents and
  // get filtered out.
  const parentCount = new Map<Element, number>();
  for (const el of matches) {
    const p = el.parentElement;
    if (!p) continue;
    parentCount.set(p, (parentCount.get(p) ?? 0) + 1);
  }

  let bestParent: Element | null = null;
  let bestCount = 0;
  for (const [parent, count] of parentCount.entries()) {
    if (count > bestCount) {
      bestCount = count;
      bestParent = parent;
    }
  }

  if (bestParent && bestCount >= 3) {
    return matches.filter((m) => m.parentElement === bestParent);
  }

  // No dominant parent — return all matches if we have a reasonable number
  return matches.length >= 5 ? matches : [];
}

/**
 * YouTube renders all engagement panels (chapters, transcript, comments etc.)
 * upfront in the DOM but keeps them hidden via the `visibility` attribute.
 * For chaptered/transcripted videos we can flip that attribute to EXPANDED and
 * the panel renders without any button click.
 */
function tryOpenEngagementPanel(diag: Diagnostic[]): boolean {
  const panels = document.querySelectorAll<HTMLElement>(
    'ytd-engagement-panel-section-list-renderer'
  );
  for (const panel of Array.from(panels)) {
    const target = panel.getAttribute('target-id') ?? '';
    if (target.toLowerCase().includes('transcript')) {
      panel.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');
      diag.push({
        step: 'domScrape:engagementPanelFlip',
        ok: true,
        note: `target=${target}`
      });
      return true;
    }
  }
  diag.push({ step: 'domScrape:engagementPanelFlip', ok: false, note: 'no transcript panel in DOM' });
  return false;
}

/**
 * Multi-pattern button finder. YouTube ships at least 5 different button shells:
 *   - <button aria-label="Show transcript">
 *   - <yt-button-renderer> with inner button
 *   - <tp-yt-paper-button> (legacy material)
 *   - <ytd-button-renderer>
 *   - role="button" on a div (some newer layouts)
 * Plus the label text varies: "Show transcript", "Transcript", "Open transcript".
 */
function findShowTranscriptButton(): HTMLElement | null {
  const candidates = document.querySelectorAll<HTMLElement>(
    'button, [role="button"], tp-yt-paper-button, ytd-button-renderer button, yt-button-renderer button'
  );
  for (const el of Array.from(candidates)) {
    const aria = (el.getAttribute('aria-label') ?? '').toLowerCase();
    const text = (el.textContent ?? '').toLowerCase().trim();
    const matchesAria =
      aria === 'show transcript' ||
      aria === 'transcript' ||
      aria.startsWith('show transcript') ||
      aria.startsWith('open transcript');
    const matchesText =
      text === 'show transcript' || text === 'transcript' || text === 'open transcript';
    if (matchesAria || matchesText) {
      // Reject "hide transcript" / "close transcript" buttons that share text patterns
      if (aria.includes('hide') || aria.includes('close')) continue;
      return el;
    }
  }
  return null;
}

function findExpandDescriptionButton(): HTMLElement | null {
  // Try the well-known selectors first
  const selectors = [
    'tp-yt-paper-button#expand',
    'ytd-text-inline-expander #expand',
    'ytd-video-description-renderer #expand',
    '#description-inline-expander #expand',
    '#description #expand'
  ];
  for (const sel of selectors) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) return el;
  }

  // Fallback: text-based
  for (const b of Array.from(document.querySelectorAll<HTMLElement>('button, tp-yt-paper-button'))) {
    const t = (b.textContent ?? '').trim().toLowerCase();
    if (t === '...more' || t === '…more' || t === 'show more' || t === 'more') return b;
  }
  return null;
}

/**
 * MutationObserver-backed segment-wait. Resolves as soon as ANY segments appear,
 * or after maxMs with whatever's there (could be []).
 */
function waitForSegments(maxMs: number): Promise<Element[]> {
  return new Promise((resolve) => {
    const initial = collectSegments();
    if (initial.length > 0) {
      resolve(initial);
      return;
    }

    const observer = new MutationObserver(() => {
      const segs = collectSegments();
      if (segs.length > 0) {
        observer.disconnect();
        resolve(segs);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      resolve(collectSegments());
    }, maxMs);
  });
}

/**
 * Some YouTube transcript panels lazy-load segments as the user scrolls. Pre-render
 * everything by scrolling the panel to the bottom and waiting briefly. This keeps
 * us from missing 80% of a long course's transcript.
 */
async function loadAllSegments(diag: Diagnostic[]): Promise<void> {
  // Find the scrollable transcript container
  const scrollContainer = document.querySelector<HTMLElement>(
    '#segments-container, ytd-transcript-search-panel-renderer, ' +
      'ytd-transcript-renderer #body, [class*="transcript-renderer"] [class*="body"]'
  );

  if (!scrollContainer) return;

  let prevCount = collectSegments().length;
  let stableRounds = 0;

  // Scroll repeatedly until segment count stops growing for 3 consecutive rounds.
  for (let i = 0; i < 25 && stableRounds < 3; i++) {
    scrollContainer.scrollTop = scrollContainer.scrollHeight;
    await sleep(150);
    const nowCount = collectSegments().length;
    if (nowCount === prevCount) stableRounds++;
    else { stableRounds = 0; prevCount = nowCount; }
  }

  diag.push({
    step: 'domScrape:loadedAll',
    ok: true,
    note: `${prevCount} segments after lazy-load scroll`
  });
}

/**
 * Pull readable text out of segment elements. Tries a hierarchy of selectors,
 * falls back to raw textContent with timestamp prefix stripped.
 * Filters duplicate adjacent lines (common in some transcript layouts).
 */
function extractTranscriptText(segments: Element[]): string {
  const lines: string[] = [];
  let lastLine = '';

  for (const seg of segments) {
    let text = '';
    const textEl = seg.querySelector<HTMLElement>(
      '.segment-text, [class*="segment-text"], yt-formatted-string.segment-text, ' +
        'yt-formatted-string[class*="segment"]'
    );
    if (textEl) text = (textEl.textContent ?? '').trim();

    if (!text) {
      // Fallback: raw text + strip "0:00" / "00:00" / "0:00:00" timestamp prefix
      text = (seg.textContent ?? '').trim();
      text = text.replace(/^\d{1,2}:\d{2}(?::\d{2})?\s*/, '');
    }

    text = text.replace(/\s+/g, ' ').trim();
    if (text && text !== lastLine) {
      lines.push(text);
      lastLine = text;
    }
  }

  return lines.join(' ').trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function readPlayerResponseFromPage(): any | null {
  const w = window as any;
  if (w.ytInitialPlayerResponse) return w.ytInitialPlayerResponse;

  const script = [...document.querySelectorAll('script')].find((s) =>
    s.textContent?.includes('ytInitialPlayerResponse')
  );
  if (!script?.textContent) return null;

  const m = script.textContent.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/);
  if (!m || !m[1]) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

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
    diagnostics.push({ step: 'playerResponse', ok: false, note: 'not found in window or scripts' });
    throw new Error('player response not found');
  }
  diagnostics.push({ step: 'playerResponse', ok: true });

  const meta = parsePlayerResponse(playerResponse);
  if (!meta) {
    diagnostics.push({ step: 'parseMeta', ok: false });
    throw new Error('could not parse video metadata');
  }
  diagnostics.push({ step: 'parseMeta', ok: true, note: `${meta.title} (${meta.durationS}s)` });

  if (!meta.captionUrl) {
    diagnostics.push({ step: 'captionUrl', ok: false, note: 'no caption track in playerResponse' });
    throw new Error('no captions available for this video');
  }
  diagnostics.push({ step: 'captionUrl', ok: true, note: meta.captionUrl.slice(0, 120) + '…' });

  if (meta.chapters && meta.chapters.length > 0) {
    diagnostics.push({
      step: 'chapters',
      ok: true,
      note: `${meta.chapters.length} chapter markers from YouTube`
    });
  } else {
    diagnostics.push({ step: 'chapters', ok: false, note: 'no chapter markers' });
  }

  // --- Attempt 1: direct URL fetch (json3 → srv1 → srv3) ---
  const formats: Array<{ fmt: 'json3' | 'srv1' | 'srv3'; parse: (body: string) => string }> = [
    {
      fmt: 'json3',
      parse: (body) => {
        try {
          return parseJson3(JSON.parse(body));
        } catch {
          return '';
        }
      }
    },
    { fmt: 'srv1', parse: parseTimedTextXml },
    { fmt: 'srv3', parse: parseTimedTextXml }
  ];

  for (const { fmt, parse } of formats) {
    try {
      const u = new URL(meta.captionUrl);
      u.searchParams.set('fmt', fmt);

      const resp = await fetch(u.toString());
      const status = `HTTP ${resp.status}`;

      if (!resp.ok) {
        diagnostics.push({ step: `fetch:${fmt}`, ok: false, note: status });
        continue;
      }

      const body = await resp.text();
      const transcript = parse(body);

      if (transcript) {
        diagnostics.push({
          step: `fetch:${fmt}`,
          ok: true,
          note: `${status}, ${transcript.length} chars`
        });
        return { ...meta, transcript };
      }

      diagnostics.push({
        step: `fetch:${fmt}`,
        ok: false,
        note: `${status}, body ${body.length}b, parsed empty. head=${body.slice(0, 120)}`
      });
    } catch (e: any) {
      diagnostics.push({ step: `fetch:${fmt}`, ok: false, note: `threw: ${e?.message ?? e}` });
    }
  }

  // --- Attempt 2: scrape YouTube's own transcript panel ---
  // The URL-based fetches all failed (404, 403, empty body, or signature missing).
  // Last resort: programmatically open YouTube's "Show transcript" panel and read it.
  // This uses YouTube's own session/cookies — anything they require to fetch their own
  // captions, the page already has.
  try {
    diagnostics.push({ step: 'domScrape', ok: false, note: 'starting' });
    const scraped = await scrapeTranscriptFromDOM(diagnostics);
    if (scraped) {
      diagnostics.push({ step: 'domScrape', ok: true, note: `${scraped.length} chars` });
      return { ...meta, transcript: scraped };
    }
  } catch (e: any) {
    diagnostics.push({ step: 'domScrape', ok: false, note: `threw: ${e?.message ?? e}` });
  }

  throw new Error("Couldn't read this video's captions. Try a different video.");
}

/**
 * Open YouTube's built-in transcript panel and harvest the text. Fragile because
 * it depends on YouTube DOM selectors, but it's the most reliable backup since
 * it uses YouTube's own session to fetch.
 */
async function scrapeTranscriptFromDOM(diag: Diagnostic[]): Promise<string> {
  // 1. Find (or surface) the "Show transcript" button.
  let btn = findShowTranscriptButton();
  if (!btn) {
    // Try expanding the description first — the button is often hidden under "...more"
    const expand = findExpandDescriptionButton();
    if (expand) {
      diag.push({ step: 'domScrape:expandDesc', ok: true });
      expand.click();
      await sleep(400);
      btn = findShowTranscriptButton();
    }
  }

  if (!btn) {
    diag.push({
      step: 'domScrape:findButton',
      ok: false,
      note: 'no "Show transcript" button found in DOM'
    });
    return '';
  }
  diag.push({ step: 'domScrape:findButton', ok: true });

  btn.click();

  // 2. Wait for the transcript panel to render segments.
  let segments: Element[] = [];
  for (let i = 0; i < 50; i++) {
    await sleep(100);
    segments = Array.from(
      document.querySelectorAll(
        'ytd-transcript-segment-renderer, [class*="transcript-segment-renderer"]'
      )
    );
    if (segments.length > 0) break;
  }

  if (segments.length === 0) {
    diag.push({
      step: 'domScrape:waitSegments',
      ok: false,
      note: 'panel never rendered any segments (5s timeout)'
    });
    return '';
  }
  diag.push({ step: 'domScrape:waitSegments', ok: true, note: `${segments.length} segments` });

  // 3. Extract text from each segment.
  const lines: string[] = [];
  for (const seg of segments) {
    const textEl = seg.querySelector(
      '.segment-text, [class*="segment-text"], yt-formatted-string.segment-text'
    );
    const text = textEl?.textContent?.trim();
    if (text) lines.push(text);
  }

  return lines.join(' ').replace(/\s+/g, ' ').trim();
}

function findShowTranscriptButton(): HTMLElement | null {
  const candidates = document.querySelectorAll('button, tp-yt-paper-button, ytd-button-renderer button');
  for (const el of Array.from(candidates)) {
    const aria = el.getAttribute('aria-label')?.toLowerCase() ?? '';
    const text = el.textContent?.toLowerCase().trim() ?? '';
    if (aria.includes('show transcript') || text === 'show transcript') {
      return el as HTMLElement;
    }
  }
  return null;
}

function findExpandDescriptionButton(): HTMLElement | null {
  const explicit = document.querySelector<HTMLElement>(
    'tp-yt-paper-button#expand, ytd-text-inline-expander #expand'
  );
  if (explicit) return explicit;

  for (const b of Array.from(document.querySelectorAll('button'))) {
    const t = b.textContent?.trim().toLowerCase() ?? '';
    if (t === '...more' || t === 'show more' || t === 'more') {
      return b as HTMLElement;
    }
  }
  return null;
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

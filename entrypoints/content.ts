import { defineContentScript } from 'wxt/sandbox';
import { parsePlayerResponse, parseTimedTextXml, parseJson3 } from '../src/lib/transcript';
import type { AppMessage } from '../src/lib/messages';

export default defineContentScript({
  matches: ['https://*.youtube.com/watch*'],
  runAt: 'document_idle',
  async main() {
    console.log('[bryteo] content script ready on', location.href);

    chrome.runtime.onMessage.addListener((msg: AppMessage, _sender, sendResponse) => {
      if (msg.type === 'PING') {
        sendResponse({ ok: true, pong: true });
        return false; // sync response
      }

      if (msg.type === 'REQUEST_OUTLINE') {
        (async () => {
          try {
            const payload = await captureTranscript();
            sendResponse({ ok: true, payload });
          } catch (e: any) {
            sendResponse({ ok: false, error: e?.message ?? 'transcript error' });
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

async function captureTranscript() {
  const playerResponse = readPlayerResponseFromPage();
  if (!playerResponse) throw new Error('player response not found');

  const meta = parsePlayerResponse(playerResponse);
  if (!meta) throw new Error('could not parse video metadata');
  if (!meta.captionUrl) throw new Error('no captions available for this video');

  console.log('[bryteo] captionUrl:', meta.captionUrl);

  // Waterfall: try the most reliable format first, then degrade.
  // - json3: YouTube's modern format; works for auto-generated AND manual tracks
  // - srv1:  classic XML with <text> tags; manual tracks; legacy ASR
  // - srv3:  modern XML with <p><s> per-word structure; some ASR tracks
  const attempts: Array<{ fmt: 'json3' | 'srv1' | 'srv3'; parse: (body: string) => string }> = [
    {
      fmt: 'json3',
      parse: (body) => {
        try {
          return parseJson3(JSON.parse(body));
        } catch (e) {
          console.warn('[bryteo] json3 JSON.parse failed:', e);
          return '';
        }
      }
    },
    { fmt: 'srv1', parse: parseTimedTextXml },
    { fmt: 'srv3', parse: parseTimedTextXml }
  ];

  for (const { fmt, parse } of attempts) {
    try {
      const u = new URL(meta.captionUrl);
      u.searchParams.set('fmt', fmt);

      const resp = await fetch(u.toString());
      console.log(`[bryteo] ${fmt} → HTTP ${resp.status} (${resp.headers.get('content-type')})`);
      if (!resp.ok) continue;

      const body = await resp.text();
      console.log(`[bryteo] ${fmt} body length: ${body.length}`);

      const transcript = parse(body);
      if (transcript) {
        console.log(`[bryteo] success with ${fmt}, transcript length: ${transcript.length}`);
        return { ...meta, transcript };
      }
      console.warn(`[bryteo] ${fmt} returned empty; trying next format`);
      console.warn(`[bryteo] ${fmt} body head:`, body.slice(0, 300));
    } catch (e) {
      console.warn(`[bryteo] ${fmt} threw:`, e);
    }
  }

  console.error('[bryteo] all caption formats failed');
  throw new Error("This video's captions came back empty. Try a different video.");
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

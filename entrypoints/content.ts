import { defineContentScript } from 'wxt/sandbox';
import { parsePlayerResponse, parseTimedTextXml } from '../src/lib/transcript';
import type { AppMessage } from '../src/lib/messages';

export default defineContentScript({
  matches: ['https://*.youtube.com/watch*'],
  runAt: 'document_idle',
  async main() {
    chrome.runtime.onMessage.addListener((msg: AppMessage, _sender, sendResponse) => {
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

  const xml = await fetch(meta.captionUrl).then((r) => r.text());
  const transcript = parseTimedTextXml(xml);
  if (!transcript) throw new Error('empty transcript');

  return { ...meta, transcript };
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

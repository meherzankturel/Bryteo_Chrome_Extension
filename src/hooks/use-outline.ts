import { useMutation } from '@tanstack/react-query';
import { generateOutline, type OutlinePayload } from '../api/outlines';
import { classifyContent } from '../lib/content-type';
import { assessTranscriptQuality } from '../lib/transcript';

/**
 * Discriminated union describing why a pre-Gemini gate fired. The side panel
 * reads this off the thrown error to decide which notice copy to render and
 * to drive the "Analyze anyway" CTA.
 */
export type AnalyzeGate =
  | { kind: 'non-educational'; category?: string }
  | { kind: 'borderline'; category?: string }
  | {
      kind: 'transcript-quality';
      reason: 'too-short' | 'mostly-music' | 'too-repetitive';
    };

/**
 * Error subclass we attach the gate metadata to. Callers can detect it with
 * the `gate` property — easier than parsing `error.message`.
 */
export class GateError extends Error {
  gate: AnalyzeGate;
  constructor(gate: AnalyzeGate) {
    super(`gate:${gate.kind}`);
    this.name = 'GateError';
    this.gate = gate;
  }
}

/**
 * Ping the content script on the given tab. Returns true if it responds,
 * false if the channel is closed (no listener). Never throws.
 */
async function pingContentScript(tabId: number): Promise<boolean> {
  try {
    const resp = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
    return Boolean(resp?.ok);
  } catch {
    return false;
  }
}

/**
 * Make sure the content script is loaded on the given tab. If a ping fails
 * (either because the extension was reloaded after the tab loaded, or because
 * the script never ran), inject it programmatically and re-ping. Throws a
 * user-friendly error if the injection itself fails (e.g. the user is on a
 * URL we can't inject into).
 */
async function ensureContentScript(tabId: number): Promise<void> {
  if (await pingContentScript(tabId)) return;

  console.log('[bryteo] content script not responsive, injecting…');
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content-scripts/content.js']
    });
  } catch (e: any) {
    console.error('[bryteo] injection failed:', e);
    throw new Error(
      "Couldn't connect to this YouTube tab. Try refreshing it (Cmd+R), then click Analyze again."
    );
  }

  // The script defines its listener inside main(); give it a beat to register.
  await new Promise((r) => setTimeout(r, 120));

  if (!(await pingContentScript(tabId))) {
    throw new Error(
      "Couldn't reach this YouTube tab. Try refreshing it (Cmd+R) and try again."
    );
  }
}

export function useGenerateOutline() {
  return useMutation({
    mutationFn: async (
      opts?: { override?: boolean }
    ): Promise<{
      videoId: string;
      outline: OutlinePayload;
      captionKind?: 'manual' | 'asr' | 'unknown';
    }> => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('Open a YouTube video tab first.');

      const url = tab.url ?? '';
      console.log('[bryteo] analyzing tab:', tab.id, url);

      if (!url.includes('youtube.com/watch')) {
        throw new Error('Open a YouTube video (youtube.com/watch?v=…) to analyze it.');
      }

      await ensureContentScript(tab.id);

      let resp: { ok: boolean; payload?: any; error?: string; diagnostics?: any[] };
      try {
        resp = await chrome.tabs.sendMessage(tab.id, {
          type: 'REQUEST_OUTLINE',
          payload: { videoId: '' }
        });
      } catch (e: any) {
        const msg = String(e?.message ?? e ?? '');
        if (msg.includes('Receiving end does not exist')) {
          throw new Error(
            'Lost the YouTube tab. Refresh the page (Cmd+R), then try again.'
          );
        }
        throw new Error(msg || 'Could not reach the YouTube tab.');
      }

      // Surface the content script's per-step diagnostics in THIS console
      // (the side-panel console, where the user is already looking).
      if (resp?.diagnostics?.length) {
        console.groupCollapsed('[bryteo] transcript diagnostics');
        for (const d of resp.diagnostics) {
          const tag = d.ok ? '✓' : '✗';
          console.log(`${tag} ${d.step}${d.note ? ' — ' + d.note : ''}`);
        }
        console.groupEnd();
      }

      if (!resp?.ok) {
        const err = resp?.error ?? 'Could not read transcript';
        if (err.includes('no captions')) {
          throw new Error("This video doesn't have captions. Try a video with the CC icon.");
        }
        if (err.includes('player response not found')) {
          throw new Error('Refresh the YouTube tab (Cmd+R), then try again.');
        }
        throw new Error(err);
      }

      // --- Pre-Gemini gates ---
      // Cheap, local checks that decide whether the video is worth a Gemini
      // call at all. The user can always click "Analyze anyway" to bypass —
      // that re-fires this mutation with { override: true } which skips the
      // gates entirely.
      if (!opts?.override) {
        const verdict = classifyContent(resp.payload?.category);
        if (verdict === 'non-educational') {
          throw new GateError({
            kind: 'non-educational',
            category: resp.payload?.category
          });
        }
        if (verdict === 'borderline') {
          throw new GateError({
            kind: 'borderline',
            category: resp.payload?.category
          });
        }
        const q = assessTranscriptQuality(resp.payload?.transcript ?? '');
        if (!q.ok) {
          throw new GateError({ kind: 'transcript-quality', reason: q.reason });
        }
      }

      // resp.payload now includes chapters from playerResponse when present —
      // generateOutline forwards them to the Edge Function which uses them as
      // the section scaffold.
      const captionKind = resp.payload?.captionKind as
        | 'manual'
        | 'asr'
        | 'unknown'
        | undefined;
      const result = await generateOutline(resp.payload);
      return { ...result, captionKind };
    }
  });
}

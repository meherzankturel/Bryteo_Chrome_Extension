import { useMutation } from '@tanstack/react-query';
import { generateOutline, type OutlinePayload } from '../api/outlines';

export function useGenerateOutline() {
  return useMutation({
    mutationFn: async (): Promise<{ videoId: string; outline: OutlinePayload }> => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('Open a YouTube video tab first.');
      if (!tab.url?.includes('youtube.com/watch')) {
        throw new Error('Open a YouTube video to analyze it.');
      }

      const resp = await chrome.tabs.sendMessage(tab.id, {
        type: 'REQUEST_OUTLINE',
        payload: { videoId: '' }
      });
      if (!resp?.ok) {
        const err = resp?.error ?? 'Could not read transcript';
        // Friendlier messages for common cases
        if (err.includes('no captions')) {
          throw new Error("This video doesn't have captions. Try a video with the CC icon.");
        }
        if (err.includes('player response not found')) {
          throw new Error('Reload the YouTube tab, then try again.');
        }
        throw new Error(err);
      }

      return generateOutline(resp.payload);
    }
  });
}

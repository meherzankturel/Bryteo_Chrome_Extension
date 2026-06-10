import { describe, it, expect } from 'vitest';
import { isAppMessage, type AppMessage } from '@/lib/messages';

describe('messages', () => {
  it('accepts a valid TRANSCRIPT_READY message', () => {
    const m: AppMessage = {
      type: 'TRANSCRIPT_READY',
      payload: {
        videoId: 'abc123',
        title: 'Test',
        channel: 'Ch',
        durationS: 120,
        thumbnailUrl: 'https://example.com/t.jpg',
        transcript: 'hello world'
      }
    };
    expect(isAppMessage(m)).toBe(true);
  });

  it('rejects unknown shapes', () => {
    expect(isAppMessage({ foo: 'bar' })).toBe(false);
    expect(isAppMessage(null)).toBe(false);
    expect(isAppMessage('x')).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import fixture from '../fixtures/youtube-player-response.json';
import { parsePlayerResponse, parseTimedTextXml } from '@/lib/transcript';

describe('parsePlayerResponse', () => {
  it('extracts video metadata + caption URL', () => {
    const r = parsePlayerResponse(fixture);
    expect(r).toEqual({
      videoId: 'abc123',
      title: 'How LLMs Work',
      channel: 'Andrej Karpathy',
      durationS: 1234,
      thumbnailUrl: 'https://i.ytimg.com/vi/abc123/hqdefault.jpg',
      captionUrl: 'https://www.youtube.com/api/timedtext?v=abc123&lang=en'
    });
  });

  it('returns null captionUrl when no captions exist', () => {
    const noCaps = { ...fixture, captions: undefined };
    const r = parsePlayerResponse(noCaps);
    expect(r?.captionUrl).toBeNull();
  });
});

describe('parseTimedTextXml', () => {
  it('joins all text nodes with spaces', () => {
    const xml = `<?xml version="1.0"?><transcript>
      <text start="0" dur="2">Hello</text>
      <text start="2" dur="2">world</text>
    </transcript>`;
    expect(parseTimedTextXml(xml)).toBe('Hello world');
  });

  it('decodes HTML entities', () => {
    const xml = `<?xml version="1.0"?><transcript>
      <text start="0" dur="2">Tom &amp;amp; Jerry</text>
    </transcript>`;
    expect(parseTimedTextXml(xml)).toContain('Tom & Jerry');
  });
});

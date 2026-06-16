import { describe, it, expect } from 'vitest';
import fixture from '../fixtures/youtube-player-response.json';
import {
  parsePlayerResponse,
  parseTimedTextXml,
  parseJson3,
  parseChapters,
  assessTranscriptQuality
} from '@/lib/transcript';

describe('parsePlayerResponse', () => {
  it('extracts video metadata + caption URL', () => {
    const r = parsePlayerResponse(fixture);
    expect(r).toEqual({
      videoId: 'abc123',
      title: 'How LLMs Work',
      channel: 'Andrej Karpathy',
      durationS: 1234,
      thumbnailUrl: 'https://i.ytimg.com/vi/abc123/hqdefault.jpg',
      captionUrl: 'https://www.youtube.com/api/timedtext?v=abc123&lang=en',
      captionKind: 'manual',
      category: undefined
    });
  });

  it('extracts category from microformat.playerMicroformatRenderer', () => {
    const withMicroformat = {
      ...fixture,
      microformat: {
        playerMicroformatRenderer: {
          category: 'Education'
        }
      }
    };
    const r = parsePlayerResponse(withMicroformat);
    expect(r?.category).toBe('Education');
  });

  it('falls back to videoDetails.category when microformat is absent', () => {
    const withVideoDetailsCategory = {
      ...fixture,
      videoDetails: { ...fixture.videoDetails, category: 'Science & Technology' }
    };
    const r = parsePlayerResponse(withVideoDetailsCategory);
    expect(r?.category).toBe('Science & Technology');
  });

  it('returns undefined category when neither field is set', () => {
    const r = parsePlayerResponse(fixture);
    expect(r?.category).toBeUndefined();
  });

  it('returns null captionUrl when no captions exist', () => {
    const noCaps = { ...fixture, captions: undefined };
    const r = parsePlayerResponse(noCaps);
    expect(r?.captionUrl).toBeNull();
    expect(r?.captionKind).toBe('unknown');
  });

  it('marks ASR captions when kind=asr', () => {
    const asrFixture = {
      ...fixture,
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: [
            {
              baseUrl: 'https://www.youtube.com/api/timedtext?v=abc123&lang=en',
              languageCode: 'en',
              kind: 'asr'
            }
          ]
        }
      }
    };
    const r = parsePlayerResponse(asrFixture);
    expect(r?.captionKind).toBe('asr');
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

  it('falls back to srv3 <p><s> structure when no <text> tags', () => {
    const xml = `<?xml version="1.0"?>
      <timedtext>
        <body>
          <p t="0" d="2500"><s>Hello</s></p>
          <p t="2500" d="2000"><s>world</s></p>
        </body>
      </timedtext>`;
    expect(parseTimedTextXml(xml)).toBe('Hello world');
  });

  it('strips inner srv3 tags and concatenates words', () => {
    const xml = `<p t="0" d="3000"><s>How</s><s ac="1"> are</s><s> you</s></p>`;
    expect(parseTimedTextXml(xml)).toBe('How are you');
  });

  it('returns empty string when no recognizable structure', () => {
    expect(parseTimedTextXml('<not-a-known-format/>')).toBe('');
    expect(parseTimedTextXml('')).toBe('');
  });
});

describe('parseJson3', () => {
  it('concatenates utf8 segments across events', () => {
    const j = {
      wireMagic: 'pb3',
      events: [
        { tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: 'Hello' }, { utf8: ' world' }] },
        { tStartMs: 2000, dDurationMs: 2000, segs: [{ utf8: ' goodbye' }] }
      ]
    };
    expect(parseJson3(j)).toBe('Hello world goodbye');
  });

  it('skips events without segs', () => {
    const j = {
      events: [
        { tStartMs: 0, dDurationMs: 2000 },
        { tStartMs: 2000, dDurationMs: 2000, segs: [{ utf8: 'real text' }] }
      ]
    };
    expect(parseJson3(j)).toBe('real text');
  });

  it('skips segs without utf8 (formatting events have other shapes)', () => {
    const j = {
      events: [
        { segs: [{ utf8: 'Hello' }, { acAsrConf: 250 }, { utf8: ' world' }] }
      ]
    };
    expect(parseJson3(j)).toBe('Hello world');
  });

  it('returns empty for malformed input', () => {
    expect(parseJson3(null)).toBe('');
    expect(parseJson3({})).toBe('');
    expect(parseJson3({ events: 'not-an-array' })).toBe('');
  });
});

describe('assessTranscriptQuality', () => {
  it('flags too-short transcripts (<300 chars)', () => {
    const r = assessTranscriptQuality('Hi there, welcome to the channel.');
    expect(r).toEqual({ ok: false, reason: 'too-short' });
  });

  it('flags music-notation-heavy transcripts', () => {
    // 20 [Music] markers + a few short connector words → music-marker ratio
    // dominates. Pad to >=300 chars so the too-short check doesn't fire first.
    const padded = ('[Music] yeah '.repeat(40)).padEnd(400, ' ');
    const r = assessTranscriptQuality(padded);
    expect(r).toEqual({ ok: false, reason: 'mostly-music' });
  });

  it('flags chorus-style repetitive transcripts', () => {
    // 200 words, but only ~5 unique words — top-10 dominates total count.
    const chorus = ('na na na hey hey yeah yeah baby baby oh '.repeat(20)).trim();
    expect(chorus.length).toBeGreaterThan(300);
    const r = assessTranscriptQuality(chorus);
    expect(r).toEqual({ ok: false, reason: 'too-repetitive' });
  });

  it('accepts a normal lecture-style transcript', () => {
    // 30 varied sentences — long enough, no music markers, low repetition.
    const sentences = [
      'Today we are going to talk about how transformers work in machine learning.',
      'The architecture was introduced in the paper Attention Is All You Need.',
      'Each transformer layer combines self-attention with a feed-forward network.',
      'Self-attention computes a weighted average of values based on similarity.',
      'The keys queries and values are linear projections of the input embeddings.',
      'Positional encodings inject information about token order into the model.',
      'Multi-head attention runs several attention computations in parallel.',
      'Residual connections and layer normalization stabilize deeper networks.',
      'The decoder uses masked self-attention to prevent peeking at future tokens.',
      'Cross attention lets the decoder consult the encoder representations.',
      'Training uses teacher forcing where the model sees the correct previous token.',
      'Beam search improves generation quality at inference time over greedy decoding.',
      'Larger models tend to follow predictable scaling laws across many domains.',
      'Pretraining on next-token prediction transfers surprisingly well to many tasks.',
      'Fine-tuning adapts a pretrained model to a downstream task with less data.'
    ];
    const transcript = sentences.join(' ');
    const r = assessTranscriptQuality(transcript);
    expect(r).toEqual({ ok: true });
  });
});

describe('parseChapters', () => {
  it('extracts chapters from frameworkUpdates macroMarkersListEntity', () => {
    const pr = {
      frameworkUpdates: {
        entityBatchUpdate: {
          mutations: [
            {
              payload: {
                macroMarkersListEntity: {
                  markersList: {
                    markers: [
                      { title: { simpleText: 'Introduction' }, startTimeMillis: '0' },
                      { title: { simpleText: 'What is Python?' }, startTimeMillis: '56000' },
                      { title: { simpleText: 'Installing Python' }, startTimeMillis: '251000' }
                    ]
                  }
                }
              }
            }
          ]
        }
      }
    };
    expect(parseChapters(pr)).toEqual([
      { title: 'Introduction', start_s: 0 },
      { title: 'What is Python?', start_s: 56 },
      { title: 'Installing Python', start_s: 251 }
    ]);
  });

  it('supports title.runs alternative shape', () => {
    const pr = {
      frameworkUpdates: {
        entityBatchUpdate: {
          mutations: [
            {
              payload: {
                macroMarkersListEntity: {
                  markersList: {
                    markers: [
                      { title: { runs: [{ text: 'Intro' }] }, startMillis: '0' }
                    ]
                  }
                }
              }
            }
          ]
        }
      }
    };
    expect(parseChapters(pr)).toEqual([{ title: 'Intro', start_s: 0 }]);
  });

  it('returns [] when no chapter data is present', () => {
    expect(parseChapters({})).toEqual([]);
    expect(parseChapters({ frameworkUpdates: {} })).toEqual([]);
    expect(parseChapters(null)).toEqual([]);
  });

  it('skips markers missing a title or timestamp', () => {
    const pr = {
      frameworkUpdates: {
        entityBatchUpdate: {
          mutations: [
            {
              payload: {
                macroMarkersListEntity: {
                  markersList: {
                    markers: [
                      { title: { simpleText: 'Good' }, startTimeMillis: '0' },
                      { title: { simpleText: '' }, startTimeMillis: '5000' },
                      { startTimeMillis: '10000' }
                    ]
                  }
                }
              }
            }
          ]
        }
      }
    };
    expect(parseChapters(pr)).toEqual([{ title: 'Good', start_s: 0 }]);
  });
});

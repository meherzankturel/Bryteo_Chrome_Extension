import { z } from 'https://esm.sh/zod@3.23.0';

export const outlineRequest = z.object({
  videoId: z.string().min(1),
  title: z.string().min(1),
  channel: z.string().optional(),
  durationS: z.number().int().optional(),
  thumbnailUrl: z.string().url().optional(),
  // 500K chars covers up to ~6-8h lecture courses while staying well under
  // Gemini's 1M-token context window.
  transcript: z.string().min(50).max(500_000),
  // YouTube's own chapter markers when present — used as the section scaffold
  // for chaptered videos (much more accurate than letting the AI guess).
  chapters: z
    .array(z.object({ title: z.string().min(1), start_s: z.number().int().nonnegative() }))
    .max(64)
    .optional()
});

export const outlineSection = z.object({
  title: z.string(),
  summary: z.string(),
  start_s: z.number().int().nonnegative(),
  end_s: z.number().int().nonnegative(),
  key_points: z.array(z.string()).min(1).max(8)
});

export const outlineResponse = z.object({
  // Cap raised from 12 to 60 so chaptered marathon courses don't get truncated.
  sections: z.array(outlineSection).min(1).max(60)
});

export const cardsRequest = z.object({
  deckId: z.string().uuid(),
  outlineSection: outlineSection,
  style: z.enum(['quick', 'exam', 'deep', 'language'])
});

export const cardOut = z.object({
  type: z.enum(['basic', 'cloze']),
  front: z.string().min(1),
  back: z.string().min(1),
  source_ts_s: z.number().int().nonnegative()
});

export const cardsResponse = z.object({ cards: z.array(cardOut).min(1).max(40) });

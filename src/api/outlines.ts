import { supabase } from './supabase';

export type OutlineSection = {
  title: string;
  summary: string;
  start_s: number;
  end_s: number;
  key_points: string[];
};

export type OutlinePayload = { sections: OutlineSection[] };

export async function generateOutline(input: {
  videoId: string;
  title: string;
  channel?: string;
  durationS?: number;
  thumbnailUrl?: string;
  transcript: string;
  chapters?: Array<{ title: string; start_s: number }>;
}): Promise<{ videoId: string; outline: OutlinePayload }> {
  const { data, error } = await supabase.functions.invoke('generate-outline', {
    body: input
  });
  if (error) {
    // supabase-js wraps non-2xx as a generic "FunctionsHttpError". The actual
    // payload (e.g. our validation_failed JSON) lives on error.context — a
    // Response object we can re-read.
    let detail: any = null;
    try {
      const ctx = (error as any).context;
      if (ctx?.json) detail = await ctx.json();
    } catch {}

    console.error('[bryteo] generate-outline failed', { error, detail });

    if (detail?.error === 'validation_failed') {
      throw new Error(
        detail.field === 'transcript'
          ? `Transcript ${detail.detail}. ` +
            'This video might be too long for the current plan.'
          : `Request validation failed: ${detail.detail}`
      );
    }
    if (detail?.error === 'rate_limit') {
      throw new Error("You've hit today's analyze limit. Try again tomorrow.");
    }
    if (detail?.error === 'ai_invalid_json') {
      throw new Error('AI returned an unexpected response. Try again.');
    }

    throw new Error(detail?.error ?? error.message ?? 'Server error');
  }
  return data;
}

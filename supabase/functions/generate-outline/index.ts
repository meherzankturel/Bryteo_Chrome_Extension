import { serve } from 'https://deno.land/std@0.220.0/http/server.ts';
import { z } from 'https://esm.sh/zod@3.23.0';
import { corsHeaders } from '../_shared/cors.ts';
import { getUserFromRequest, serviceClient } from '../_shared/auth.ts';
import { outlineRequest, outlineResponse } from '../_shared/schemas.ts';
import { checkAndIncrement } from '../_shared/rate-limit.ts';
import { callGemini, modelFor } from '../_shared/gemini.ts';
import { sampleTranscript } from '../_shared/sampling.ts';

// Keep the prompt small enough to fit Gemini Flash Lite's context comfortably
// AND fast enough to return in 3-5s even for marathon courses.
const PROMPT_TRANSCRIPT_CHARS = 30_000;

const SYSTEM = `You convert YouTube transcripts into structured study outlines.

Return JSON ONLY, in this exact shape:
{
  "sections": [
    {
      "title": "Short section title",
      "summary": "One-paragraph summary of this section.",
      "start_s": 0,
      "end_s": 120,
      "key_points": ["point 1", "point 2", "point 3"]
    }
  ]
}

Rules — these are strict, your response will be rejected otherwise:
1. If chapter markers are provided in the user message, use them as the section list. ONE section per chapter, in the same order. Use the chapter title as the section title. Do not invent extra sections, do not merge chapters.
2. If no chapter markers are provided, generate sections by inferring structure from the transcript:
   - Short videos (under 15 min): 3-5 sections
   - Medium videos (15-60 min): 5-8 sections
   - Long lectures/courses (1h+): 8-12 sections
3. start_s and end_s MUST be integer seconds (not strings, not decimals). Both must be within the video duration. end_s must be > start_s.
4. key_points MUST be a non-empty array of 2-6 concrete factual strings. If a section is short and lacks 2 distinct points, repeat the most important fact rather than emit an empty array.
5. Section titles should use the video's actual terminology, never generic labels like "Section 1".
6. summary is one paragraph; key_points are one-line facts (not sentences with subordinate clauses).
7. Reply with ONLY the JSON. No prose, no markdown fences, no comments.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { user } = await getUserFromRequest(req);

    let body: z.infer<typeof outlineRequest>;
    try {
      body = outlineRequest.parse(await req.json());
    } catch (e: any) {
      if (e instanceof z.ZodError) {
        const issue = e.errors?.[0];
        const field = issue?.path?.join('.') ?? 'unknown';
        const detail = issue?.message ?? 'invalid request';
        console.error('[generate-outline] validation failed:', field, detail);
        return new Response(
          JSON.stringify({
            error: 'validation_failed',
            field,
            detail
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
      throw e;
    }

    const sb = serviceClient();

    // --- Cache hit fast-path: if this user already has an outline for this
    // video, return it instantly (no rate-limit charge, no Gemini call).
    const { data: existingVideo } = await sb
      .from('videos')
      .select('id, outlines(sections, model_used)')
      .eq('user_id', user.id)
      .eq('yt_video_id', body.videoId)
      .maybeSingle();

    const existingOutline = (existingVideo as any)?.outlines?.[0];
    if (existingVideo && existingOutline?.sections) {
      console.log('[generate-outline] cache hit for', body.videoId);
      return new Response(
        JSON.stringify({
          videoId: existingVideo.id,
          outline: { sections: existingOutline.sections },
          cached: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: profile } = await sb
      .from('profiles').select('pro_status').eq('id', user.id).single();
    const tier = (profile?.pro_status ?? 'free') as 'free' | 'pro' | 'founding' | 'student';

    const rl = await checkAndIncrement(user.id, 'outlines_today', 1, tier);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: 'rate_limit', remaining: 0 }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const model = modelFor(tier);

    // Sample long transcripts down to a fixed budget so generation time stays
    // ~constant regardless of video length.
    const promptTranscript = sampleTranscript(body.transcript, PROMPT_TRANSCRIPT_CHARS);
    const sampledNote =
      body.transcript.length > PROMPT_TRANSCRIPT_CHARS
        ? `\n\n(This is a ${Math.round((body.durationS ?? 0) / 60)}-minute video; transcript was sampled to a fixed budget. Use the timestamps you see to anchor sections — extrapolate ranges for unseen middle content.)`
        : '';

    // When YouTube provides chapter markers (creator-uploaded), use them as
    // the section scaffold. This is much more accurate than letting the AI
    // infer structure from a sampled transcript.
    //
    // Hard cap at 30 chapters in the prompt so even a chaptered marathon
    // course's JSON output fits inside Gemini Flash's 8192-token output limit.
    // For videos with more chapters we'd group adjacent chapters — left as a
    // future enhancement; ~99% of YouTube videos have <30 chapters.
    let chapterDirective = '';
    const CHAPTER_PROMPT_MAX = 30;
    const usedChapters = body.chapters?.slice(0, CHAPTER_PROMPT_MAX) ?? [];
    if (usedChapters.length > 0) {
      const chapterList = usedChapters
        .map((c) => `- ${c.start_s}s · ${c.title}`)
        .join('\n');
      const truncatedNote =
        body.chapters && body.chapters.length > CHAPTER_PROMPT_MAX
          ? `\n(Showing first ${CHAPTER_PROMPT_MAX} of ${body.chapters.length} chapters; extend coverage to the end of the video using your judgement for the rest.)`
          : '';
      // For chaptered videos with many chapters, ask for TERSE per-section
      // output — otherwise the JSON exceeds the output token budget.
      const terseGuidance =
        usedChapters.length >= 10
          ? '\n\nIMPORTANT: Because this video has many chapters, keep each section TERSE — summary 1-2 sentences max, exactly 2 key_points per section, key_points one short phrase each (under 12 words). This is mandatory to fit the response budget.'
          : '';
      chapterDirective = `\n\nThis video has chapter markers set by the creator. Use them as your section boundaries — ONE outline section per chapter, in the same order. Don't merge or split chapters. Use the chapter title as your section title.${terseGuidance}\n\nChapters:\n${chapterList}${truncatedNote}`;
    }

    const userPrompt = `Video title: ${body.title}\nDuration: ${body.durationS ?? 'unknown'} seconds.${chapterDirective}\n\nTranscript:\n${promptTranscript}${sampledNote}`;

    // Scale output budget to expected section count and verbosity. Each terse
    // section ≈ 110 tokens; each verbose section ≈ 250 tokens. Add a 30% safety
    // buffer. Gemini 2.5 Flash supports up to 65K output tokens, so we have
    // headroom for any realistic outline.
    const expectedSections =
      usedChapters.length > 0
        ? usedChapters.length
        : estimateSectionsFromDuration(body.durationS);
    const tersePerSection = usedChapters.length >= 10;
    const tokensPerSection = tersePerSection ? 110 : 250;
    const maxOutputTokens = Math.min(
      32_768,
      Math.max(2048, Math.round(expectedSections * tokensPerSection * 1.3) + 800)
    );
    console.log(
      `[generate-outline] expectedSections=${expectedSections} ` +
        `terse=${tersePerSection} maxOutputTokens=${maxOutputTokens}`
    );

    const text = await callGemini({
      model,
      system: SYSTEM,
      turns: [{ role: 'user', text: userPrompt }],
      jsonMode: true,
      maxOutputTokens
    });

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      console.error('[generate-outline] JSON.parse failed; head:', text.slice(0, 600));
      return jsonErr('ai_invalid_json', 502);
    }

    parsed = normalizeOutline(parsed, body.durationS ?? 0);

    const outline = outlineResponse.safeParse(parsed);
    if (!outline.success) {
      console.error(
        '[generate-outline] schema validation failed:',
        JSON.stringify(outline.error.errors).slice(0, 1000)
      );
      console.error(
        '[generate-outline] sections received:',
        Array.isArray(parsed?.sections) ? parsed.sections.length : 'not-an-array'
      );
      console.error(
        '[generate-outline] first section sample:',
        JSON.stringify(parsed?.sections?.[0]).slice(0, 400)
      );

      const issues = outline.error.errors.slice(0, 5).map((e) =>
        `${e.path.join('.')}: ${e.message}`
      ).join('; ');
      const retryText = await callGemini({
        model,
        system: SYSTEM,
        turns: [
          { role: 'user', text: userPrompt },
          { role: 'model', text },
          {
            role: 'user',
            text: `Your previous response failed validation: ${issues}. Reply again with valid JSON only — pay special attention to: start_s and end_s must be integer seconds, key_points must be a non-empty array of strings.`
          }
        ],
        jsonMode: true,
        maxOutputTokens
      });
      try {
        parsed = JSON.parse(retryText);
      } catch {
        console.error('[generate-outline] retry JSON.parse failed; head:', retryText.slice(0, 600));
        return jsonErr('ai_invalid_json', 502);
      }
      parsed = normalizeOutline(parsed, body.durationS ?? 0);
      const second = outlineResponse.safeParse(parsed);
      if (!second.success) {
        console.error(
          '[generate-outline] retry also failed schema:',
          JSON.stringify(second.error.errors).slice(0, 1000)
        );
        return jsonErr('ai_invalid_json', 502);
      }
      parsed = second.data;
    } else {
      parsed = outline.data;
    }

    const { data: video, error: vErr } = await sb.from('videos')
      .upsert({
        user_id: user.id,
        yt_video_id: body.videoId,
        title: body.title,
        channel: body.channel,
        duration_s: body.durationS,
        thumbnail_url: body.thumbnailUrl
      }, { onConflict: 'user_id,yt_video_id' })
      .select().single();
    if (vErr || !video) return jsonErr('db_video', 500);

    const { error: oErr } = await sb.from('outlines').upsert({
      video_id: video.id,
      sections: parsed.sections,
      model_used: model
    }, { onConflict: 'video_id' });
    if (oErr) return jsonErr('db_outline', 500);

    return new Response(JSON.stringify({ videoId: video.id, outline: parsed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return jsonErr('server_error', 500);
  }
});

function jsonErr(error: string, status: number) {
  return new Response(JSON.stringify({ error }), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// Match the section-count guidance in the SYSTEM prompt so the output budget
// always matches expected verbosity.
function estimateSectionsFromDuration(durationS: number | undefined): number {
  const minutes = (durationS ?? 0) / 60;
  if (minutes < 15) return 4;     // short: 3-5 sections
  if (minutes < 60) return 6;     // medium: 5-8 sections
  if (minutes < 180) return 10;   // long: 8-12 sections
  return 12;                      // marathon w/o chapters: cap at 12 inferred sections
}

/**
 * Defensive normalization of Gemini's output before schema validation. Fixes
 * common quirks that would otherwise fail strict Zod:
 *   - start_s / end_s arriving as "123" strings or floats like 56.5
 *   - end_s being missing, zero, or before start_s
 *   - empty / non-array key_points
 *   - Sections missing title or summary
 *   - Extra unknown fields
 *   - Whole outline wrapped in `{"outline": {...}}` or just an array
 */
function normalizeOutline(raw: any, videoDurationS: number): { sections: any[] } {
  // Some models return {outline: {sections: ...}} or a bare array.
  let r: any = raw;
  if (Array.isArray(r)) r = { sections: r };
  if (r?.outline?.sections) r = r.outline;

  const rawSections = Array.isArray(r?.sections) ? r.sections : [];

  const sections = rawSections
    .map((s: any, i: number) => {
      const title = typeof s?.title === 'string' ? s.title.trim() : '';
      const summary = typeof s?.summary === 'string' ? s.summary.trim() : '';
      const start_s = coerceSeconds(s?.start_s);
      let end_s = coerceSeconds(s?.end_s);

      // Sanitize timestamp range.
      const safeStart = clamp(start_s, 0, Math.max(0, videoDurationS - 1));
      if (end_s <= safeStart) {
        // Estimate: use next section's start, or video end.
        const nextRaw = rawSections[i + 1]?.start_s;
        const next = nextRaw != null ? coerceSeconds(nextRaw) : NaN;
        end_s = Number.isFinite(next) && next > safeStart
          ? next
          : Math.min(videoDurationS, safeStart + 60);
      }
      const safeEnd = clamp(end_s, safeStart + 1, Math.max(safeStart + 1, videoDurationS));

      // Key points: filter to non-empty strings, cap at 8. If none, use a
      // single derived bullet from the summary so we always pass min(1).
      let key_points: string[] = Array.isArray(s?.key_points)
        ? s.key_points
            .filter((p: any) => typeof p === 'string' && p.trim().length > 0)
            .map((p: string) => p.trim())
            .slice(0, 8)
        : [];
      if (key_points.length === 0 && summary) {
        key_points = [summary.slice(0, 140)];
      }

      return { title, summary, start_s: safeStart, end_s: safeEnd, key_points };
    })
    .filter((s: any) => s.title && s.summary && s.key_points.length > 0);

  return { sections };
}

function coerceSeconds(v: any): number {
  if (typeof v === 'number') return Math.floor(v);
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isFinite(n) ? Math.floor(n) : 0;
  }
  return 0;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

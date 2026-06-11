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
Return JSON with this shape:
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

Section count guidance:
- Short videos (under 15 min): 3-5 sections
- Medium videos (15-60 min): 5-8 sections
- Long lectures/courses (1h+): 8-12 sections, each covering a coherent topic
  even if the total span runs hours

Other rules:
- Timestamps must lie inside the video's duration.
- 2-6 key points per section, written as concrete facts (not vague themes).
- Section titles use the video's actual terminology, not generic labels.
- Reply with ONLY the JSON. No prose, no markdown fences.`;

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
      chapterDirective = `\n\nThis video has chapter markers set by the creator. Use them as your section boundaries — ONE outline section per chapter, in the same order. Don't merge or split chapters. Use the chapter title as your section title.\n\nChapters:\n${chapterList}${truncatedNote}`;
    }

    const userPrompt = `Video title: ${body.title}\nDuration: ${body.durationS ?? 'unknown'} seconds.${chapterDirective}\n\nTranscript:\n${promptTranscript}${sampledNote}`;

    // Scale output budget to expected section count. Each section in JSON
    // averages ~220 tokens (title + summary + 3-4 key points + structure).
    // We add a safety buffer + a hard cap at 8192 (Gemini Flash's max).
    const expectedSections =
      usedChapters.length > 0
        ? usedChapters.length
        : estimateSectionsFromDuration(body.durationS);
    const maxOutputTokens = Math.min(8192, Math.max(2048, expectedSections * 250 + 600));
    console.log(
      `[generate-outline] expectedSections=${expectedSections} maxOutputTokens=${maxOutputTokens}`
    );

    const text = await callGemini({
      model,
      system: SYSTEM,
      turns: [{ role: 'user', text: userPrompt }],
      jsonMode: true,
      maxOutputTokens
    });

    let parsed: any;
    try { parsed = JSON.parse(text); }
    catch { return jsonErr('ai_invalid_json', 502); }

    const outline = outlineResponse.safeParse(parsed);
    if (!outline.success) {
      const retryText = await callGemini({
        model,
        system: SYSTEM,
        turns: [
          { role: 'user', text: userPrompt },
          { role: 'model', text },
          { role: 'user', text: 'That JSON did not match the schema. Reply again with valid JSON only.' }
        ],
        jsonMode: true,
        maxOutputTokens
      });
      try { parsed = JSON.parse(retryText); }
      catch { return jsonErr('ai_invalid_json', 502); }
      const second = outlineResponse.safeParse(parsed);
      if (!second.success) return jsonErr('ai_invalid_json', 502);
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

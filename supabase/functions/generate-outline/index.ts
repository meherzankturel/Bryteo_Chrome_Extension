import { serve } from 'https://deno.land/std@0.220.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { getUserFromRequest, serviceClient } from '../_shared/auth.ts';
import { outlineRequest, outlineResponse } from '../_shared/schemas.ts';
import { checkAndIncrement } from '../_shared/rate-limit.ts';
import { callGemini, modelFor } from '../_shared/gemini.ts';

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
- 3 to 8 sections.
- Timestamps must lie inside the video.
- 2-6 key points per section.
- Reply with ONLY the JSON. No prose, no markdown fences.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { user } = await getUserFromRequest(req);
    const body = outlineRequest.parse(await req.json());

    const sb = serviceClient();
    const { data: profile } = await sb
      .from('profiles').select('pro_status').eq('id', user.id).single();
    const tier = (profile?.pro_status ?? 'free') as 'free' | 'pro' | 'founding' | 'student';

    const rl = await checkAndIncrement(user.id, 'outlines_today', 1, tier);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: 'rate_limit', remaining: 0 }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const model = modelFor(tier);
    const userPrompt = `Video title: ${body.title}\nDuration: ${body.durationS ?? 'unknown'} seconds.\nTranscript:\n${body.transcript}`;

    const text = await callGemini({
      model,
      system: SYSTEM,
      turns: [{ role: 'user', text: userPrompt }],
      jsonMode: true
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
        jsonMode: true
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

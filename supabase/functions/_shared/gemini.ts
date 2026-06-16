const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!;

// All tiers use 2.0-flash for now. When we go paid at launch, switch the 'pro'
// + 'founding' tiers to gemini-2.5-pro for sharper outputs.
// 'latest' aliases auto-track Google's current stable, so we don't break
// when a specific version (e.g. 2.0-flash) gets sunset. Swap pro/founding
// to gemini-pro-latest at launch for sharper outputs.
// Pin to specific stable versions instead of -latest aliases. The aliases can
// silently jump to preview / experimental models (notably gemini-flash-latest
// was aliasing to a Gemini 3 preview that truncates mid-output even with
// 8K maxOutputTokens). Stable 2.5-flash is the speed/quality sweet spot;
// 2.5-pro for paying users.
const MODELS: Record<string, string> = {
  free: 'gemini-2.5-flash',
  pro: 'gemini-2.5-pro',
  founding: 'gemini-2.5-pro',
  student: 'gemini-2.5-flash'
};

export function modelFor(tier: 'free' | 'pro' | 'founding' | 'student'): string {
  return MODELS[tier] ?? MODELS.free!;
}

export type ChatTurn = { role: 'user' | 'model'; text: string };

/**
 * Call Gemini's generateContent endpoint.
 * Forces JSON output via responseMimeType — much more reliable than asking for
 * "reply with only JSON" in a prompt.
 */
export async function callGemini(opts: {
  model: string;
  system: string;
  turns: ChatTurn[];
  jsonMode?: boolean;
  maxOutputTokens?: number;
}): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:generateContent?key=${GEMINI_API_KEY}`;

  const body: any = {
    contents: opts.turns.map((t) => ({
      role: t.role,
      parts: [{ text: t.text }]
    })),
    systemInstruction: { parts: [{ text: opts.system }] },
    generationConfig: {
      maxOutputTokens: opts.maxOutputTokens ?? 4096,
      temperature: 0.4
    }
  };

  if (opts.jsonMode) {
    body.generationConfig.responseMimeType = 'application/json';
  }

  const bodyJson = JSON.stringify(body);
  console.log(
    `[gemini] → request model=${opts.model} bodyBytes=${bodyJson.length} ` +
      `maxOutputTokens=${opts.maxOutputTokens ?? 4096}`
  );

  // Hard timeout — better to fail fast than let the side panel hang.
  // Supabase Edge Functions cap at 150s; we cap fetch at 90s to leave headroom
  // for the rest of the function.
  const controller = new AbortController();
  const timeoutMs = 90_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const t0 = Date.now();

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: bodyJson,
      signal: controller.signal
    });
  } catch (e: any) {
    clearTimeout(timer);
    const elapsed = Date.now() - t0;
    if (e?.name === 'AbortError') {
      throw new Error(`Gemini timeout after ${elapsed}ms (limit ${timeoutMs}ms)`);
    }
    throw new Error(`Gemini fetch failed after ${elapsed}ms: ${e?.message ?? e}`);
  }
  clearTimeout(timer);
  const elapsed = Date.now() - t0;
  console.log(`[gemini] ← response status=${resp.status} after ${elapsed}ms`);

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gemini API ${resp.status}: ${errText.slice(0, 300)}`);
  }

  const data = await resp.json();
  const candidate = data?.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text;
  const finishReason = candidate?.finishReason;
  const usage = data?.usageMetadata;

  console.log(
    `[gemini] model=${opts.model} finishReason=${finishReason} ` +
      `promptTokens=${usage?.promptTokenCount} ` +
      `outputTokens=${usage?.candidatesTokenCount} ` +
      `textLength=${text?.length ?? 0}`
  );

  if (finishReason === 'MAX_TOKENS') {
    throw new Error(
      `Gemini truncated output (MAX_TOKENS at ${usage?.candidatesTokenCount} tokens). ` +
        `Increase maxOutputTokens or shorten the prompt.`
    );
  }
  if (finishReason === 'SAFETY' || finishReason === 'PROHIBITED_CONTENT') {
    throw new Error(`Gemini blocked the response (finishReason: ${finishReason}).`);
  }
  if (typeof text !== 'string' || text.length === 0) {
    throw new Error(
      `Gemini returned no text (finishReason: ${finishReason ?? 'unknown'})`
    );
  }
  return text;
}

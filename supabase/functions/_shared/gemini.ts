const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!;

// All tiers use 2.0-flash for now. When we go paid at launch, switch the 'pro'
// + 'founding' tiers to gemini-2.5-pro for sharper outputs.
// 'latest' aliases auto-track Google's current stable, so we don't break
// when a specific version (e.g. 2.0-flash) gets sunset. Swap pro/founding
// to gemini-pro-latest at launch for sharper outputs.
const MODELS: Record<string, string> = {
  free: 'gemini-flash-latest',
  pro: 'gemini-flash-latest',
  founding: 'gemini-flash-latest',
  student: 'gemini-flash-latest'
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

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gemini API ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string' || text.length === 0) {
    throw new Error('Gemini returned no text');
  }
  return text;
}

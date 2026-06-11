/**
 * Sample a long transcript down to a token-budget-friendly size while
 * preserving signal density. Strategy:
 *
 *  - If the transcript is already short, return it unchanged.
 *  - Otherwise keep three slices:
 *      • the first N chars (intro — establishes topic, sets the agenda)
 *      • evenly-spaced excerpts from the middle (preserves coverage)
 *      • the last N chars (conclusion — recaps key points)
 *
 * Inserts `[…]` markers between slices so the LLM knows we sampled.
 */
export function sampleTranscript(transcript: string, budgetChars: number): string {
  if (transcript.length <= budgetChars) return transcript;

  // 35% intro, 50% sampled middle, 15% conclusion — intros/conclusions tend
  // to carry the most outline signal per character.
  const introBudget = Math.floor(budgetChars * 0.35);
  const conclBudget = Math.floor(budgetChars * 0.15);
  const midBudget = budgetChars - introBudget - conclBudget;

  const intro = transcript.slice(0, introBudget).trim();
  const concl = transcript.slice(-conclBudget).trim();

  // Middle: sample 6 windows of equal width spread across the remaining text.
  const midSource = transcript.slice(introBudget, transcript.length - conclBudget);
  const numWindows = 6;
  const windowSize = Math.floor(midBudget / numWindows);
  const stride = Math.floor((midSource.length - windowSize * numWindows) / (numWindows - 1));

  const midParts: string[] = [];
  for (let i = 0; i < numWindows; i++) {
    const start = i * (windowSize + stride);
    midParts.push(midSource.slice(start, start + windowSize).trim());
  }

  return [intro, '[…]', midParts.join(' […] '), '[…]', concl]
    .filter(Boolean)
    .join('\n\n');
}

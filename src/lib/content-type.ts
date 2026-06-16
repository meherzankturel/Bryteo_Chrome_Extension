/**
 * Coarse content classifier driven by YouTube's own category field. Used as
 * a pre-Gemini gate: if a video clearly isn't educational we don't want to
 * burn an outline call producing absurd "flashcards" from a Drake track.
 *
 * We deliberately keep this dumb and category-only — the user can always
 * override with "Analyze anyway". Misclassifying a borderline-but-educational
 * video as "non-educational" costs them one extra click, not silent failure.
 */
export type ContentVerdict = 'educational' | 'borderline' | 'non-educational';

// Categories that almost always carry teachable factual content.
const EDUCATIONAL_CATEGORIES = new Set<string>([
  'Education',
  'Science & Technology',
  'Howto & Style',
  'News & Politics',
  'Nonprofits & Activism'
]);

// Categories that almost never produce useful study material.
const NON_EDUCATIONAL_CATEGORIES = new Set<string>([
  'Music',
  'Entertainment',
  'Comedy',
  'Sports',
  'Gaming',
  'Trailers',
  'Movies',
  'Shows',
  'Autos & Vehicles',
  'Travel & Events',
  'Pets & Animals'
]);

// People & Blogs and Film & Animation can swing either way (vloggers vs.
// genuine tutorials, indie short films vs. animated explainers), so we mark
// them borderline and let the user decide.

export function classifyContent(category: string | undefined): ContentVerdict {
  if (!category) return 'borderline';
  if (EDUCATIONAL_CATEGORIES.has(category)) return 'educational';
  if (NON_EDUCATIONAL_CATEGORIES.has(category)) return 'non-educational';
  return 'borderline';
}

/**
 * Render a category in lowercase for inline use in user-facing copy
 * ("This looks like a music video…"). Falls back to "this type of" when
 * we don't have a category to plug in.
 */
export function describeForUser(category: string | undefined): string {
  return category ? category.toLowerCase() : 'this type of';
}

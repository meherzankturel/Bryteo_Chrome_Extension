export type Chapter = { title: string; start_s: number };

/**
 * How the captions were sourced. Affects how confidently we can present
 * facts derived from them.
 *   - manual: creator uploaded their own caption file → ~99% accurate
 *   - asr:    YouTube auto-generated speech recognition → ~85-95% accurate
 *   - unknown: couldn't determine from playerResponse
 */
export type CaptionKind = 'manual' | 'asr' | 'unknown';

export type VideoMeta = {
  videoId: string;
  title: string;
  channel: string;
  durationS: number;
  thumbnailUrl: string;
  captionUrl: string | null;
  captionKind: CaptionKind;
  chapters?: Chapter[];
  /**
   * YouTube category as published in the playerResponse. Used by the content
   * classifier to gate non-educational videos before we burn a Gemini call.
   * Lives in microformat.playerMicroformatRenderer.category most reliably,
   * with a fallback to videoDetails.category on older payload shapes.
   */
  category?: string;
};

/**
 * Extract chapter markers from a YouTube playerResponse. Chapters live inside
 * frameworkUpdates entity batch updates under a macroMarkersListEntity. When
 * a video has manual chapter timestamps, this is the most accurate section
 * scaffold we can offer the LLM — it sidesteps Gemini having to guess.
 */
export function parseChapters(pr: any): Chapter[] {
  const mutations =
    pr?.frameworkUpdates?.entityBatchUpdate?.mutations ?? [];

  for (const m of mutations) {
    const markers = m?.payload?.macroMarkersListEntity?.markersList?.markers;
    if (!Array.isArray(markers) || markers.length === 0) continue;

    const chapters: Chapter[] = [];
    for (const marker of markers) {
      const title = marker?.title?.simpleText
        ?? marker?.title?.runs?.[0]?.text;
      const startMs =
        marker?.startTimeMillis ??
        marker?.startMillis ??
        marker?.startTimeMs;
      if (!title) continue;
      const start_s = startMs != null ? Math.floor(Number(startMs) / 1000) : NaN;
      if (Number.isNaN(start_s)) continue;
      chapters.push({ title: String(title).trim(), start_s });
    }
    if (chapters.length > 0) return chapters;
  }
  return [];
}

export function parsePlayerResponse(pr: any): VideoMeta | null {
  const d = pr?.videoDetails;
  if (!d?.videoId) return null;

  const tracks = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  const englishTrack = Array.isArray(tracks)
    ? tracks.find((t: any) => t.languageCode === 'en') ?? tracks[0]
    : null;

  // Determine whether the chosen track is auto-generated (ASR) or manually
  // uploaded. ASR tracks set kind: "asr" on the track object.
  let captionKind: CaptionKind = 'unknown';
  if (englishTrack) {
    captionKind = englishTrack.kind === 'asr' ? 'asr' : 'manual';
  }

  const chapters = parseChapters(pr);

  // YouTube exposes the user-visible category two ways depending on response
  // shape: modern responses put it in microformat.playerMicroformatRenderer;
  // older / stripped responses sometimes only set videoDetails.category.
  const microformatCategory =
    pr?.microformat?.playerMicroformatRenderer?.category;
  const videoDetailsCategory = d?.category;
  const rawCategory =
    typeof microformatCategory === 'string' && microformatCategory.trim()
      ? microformatCategory.trim()
      : typeof videoDetailsCategory === 'string' && videoDetailsCategory.trim()
        ? videoDetailsCategory.trim()
        : undefined;

  return {
    videoId: d.videoId,
    title: d.title ?? '',
    channel: d.author ?? '',
    durationS: parseInt(d.lengthSeconds ?? '0', 10),
    thumbnailUrl: d.thumbnail?.thumbnails?.[0]?.url ?? '',
    captionUrl: englishTrack?.baseUrl ?? null,
    captionKind,
    chapters: chapters.length > 0 ? chapters : undefined,
    category: rawCategory
  };
}

export function parseTimedTextXml(xml: string): string {
  // srv1 format: <text start="0" dur="2">content</text> — used when ?fmt=srv1.
  const srv1Matches = [...xml.matchAll(/<text[^>]*>([^<]*)<\/text>/g)];
  if (srv1Matches.length > 0) {
    const text = srv1Matches.map((m) => decodeEntities(m[1] ?? '')).join(' ');
    return text.replace(/\s+/g, ' ').trim();
  }

  // srv3 fallback: <p t="0" d="2500"><s>word</s><s ac="1"> word</s></p>.
  // YouTube returns this by default if ?fmt is not specified.
  const srv3Matches = [...xml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)];
  if (srv3Matches.length > 0) {
    const text = srv3Matches
      .map((m) => {
        // Strip any inner tags (<s>, <i>, <b>, etc.) and decode entities.
        const inner = (m[1] ?? '').replace(/<[^>]+>/g, '');
        return decodeEntities(inner);
      })
      .join(' ');
    return text.replace(/\s+/g, ' ').trim();
  }

  return '';
}

function decodeEntities(s: string): string {
  // YouTube timedtext often double-encodes ampersands (e.g. `&amp;amp;` → `&`).
  // Run the decode pass twice to flatten double-encoded entities.
  return decodeOnce(decodeOnce(s));
}

function decodeOnce(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * JSON3 is YouTube's modern captions format — works for both manual and
 * auto-generated tracks. Returned by appending `?fmt=json3`. Shape:
 *   { wireMagic: "pb3", events: [{ tStartMs, dDurationMs, segs: [{utf8: "..."}] }] }
 */
/**
 * Cheap pre-Gemini check on the transcript itself. Lets us refuse music videos,
 * silent / mostly-music content, and chorus-heavy song lyrics before paying for
 * a Gemini call we know will produce garbage flashcards.
 *
 * Heuristics:
 *   - too-short: <300 chars after trim → likely silent / non-speech video
 *   - mostly-music: >30% of words are `[Music]`-style notation markers
 *   - too-repetitive: the top-10 most-common words make up >60% of total
 *     word occurrences → chorus-heavy lyrics or repetitive ad copy
 */
export type TranscriptQuality =
  | { ok: true }
  | { ok: false; reason: 'too-short' | 'mostly-music' | 'too-repetitive' };

export function assessTranscriptQuality(transcript: string): TranscriptQuality {
  if (transcript.trim().length < 300) {
    return { ok: false, reason: 'too-short' };
  }

  const musicMarkers = transcript.match(
    /\[(?:Music|music|♪|♫)\]|\(\s*music\s*\)|♪|♫/g
  );
  const musicMarkerCount = musicMarkers?.length ?? 0;
  const words = transcript.split(/\s+/).filter(Boolean).length;
  if (words > 0 && musicMarkerCount / words > 0.3) {
    return { ok: false, reason: 'mostly-music' };
  }

  // Word-frequency repetition: tokenize on non-word boundaries (lowercased),
  // then check whether the top-10 unique words dominate the distribution.
  const wordCounts = new Map<string, number>();
  for (const w of transcript.toLowerCase().split(/\W+/).filter(Boolean)) {
    wordCounts.set(w, (wordCounts.get(w) ?? 0) + 1);
  }
  const sorted = [...wordCounts.values()].sort((a, b) => b - a);
  const top10 = sorted.slice(0, 10).reduce((a, b) => a + b, 0);
  const total = sorted.reduce((a, b) => a + b, 0);
  if (total > 100 && top10 / total > 0.6) {
    return { ok: false, reason: 'too-repetitive' };
  }

  return { ok: true };
}

export function parseJson3(json: any): string {
  if (!json || !Array.isArray(json.events)) return '';
  const parts: string[] = [];
  for (const ev of json.events) {
    if (!Array.isArray(ev?.segs)) continue;
    for (const seg of ev.segs) {
      if (typeof seg?.utf8 === 'string') parts.push(seg.utf8);
    }
  }
  return parts.join('').replace(/\s+/g, ' ').trim();
}

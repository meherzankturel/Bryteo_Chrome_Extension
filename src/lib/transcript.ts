export type VideoMeta = {
  videoId: string;
  title: string;
  channel: string;
  durationS: number;
  thumbnailUrl: string;
  captionUrl: string | null;
};

export function parsePlayerResponse(pr: any): VideoMeta | null {
  const d = pr?.videoDetails;
  if (!d?.videoId) return null;

  const tracks = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  const englishTrack = Array.isArray(tracks)
    ? tracks.find((t: any) => t.languageCode === 'en') ?? tracks[0]
    : null;

  return {
    videoId: d.videoId,
    title: d.title ?? '',
    channel: d.author ?? '',
    durationS: parseInt(d.lengthSeconds ?? '0', 10),
    thumbnailUrl: d.thumbnail?.thumbnails?.[0]?.url ?? '',
    captionUrl: englishTrack?.baseUrl ?? null
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

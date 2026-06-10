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
  const matches = [...xml.matchAll(/<text[^>]*>([^<]*)<\/text>/g)];
  const text = matches.map((m) => decodeEntities(m[1] ?? '')).join(' ');
  return text.replace(/\s+/g, ' ').trim();
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

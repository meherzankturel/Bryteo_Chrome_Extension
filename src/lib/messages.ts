export type TranscriptReady = {
  type: 'TRANSCRIPT_READY';
  payload: {
    videoId: string;
    title: string;
    channel?: string;
    durationS?: number;
    thumbnailUrl?: string;
    transcript: string;
  };
};

export type RequestOutline = {
  type: 'REQUEST_OUTLINE';
  payload: { videoId: string };
};

export type SeekVideo = {
  type: 'SEEK_VIDEO';
  payload: { seconds: number };
};

export type AppMessage = TranscriptReady | RequestOutline | SeekVideo;

export function isAppMessage(x: unknown): x is AppMessage {
  if (!x || typeof x !== 'object') return false;
  const t = (x as any).type;
  return t === 'TRANSCRIPT_READY' || t === 'REQUEST_OUTLINE' || t === 'SEEK_VIDEO';
}

import { supabase } from './supabase';

export type OutlineSection = {
  title: string;
  summary: string;
  start_s: number;
  end_s: number;
  key_points: string[];
};

export type OutlinePayload = { sections: OutlineSection[] };

export async function generateOutline(input: {
  videoId: string;
  title: string;
  channel?: string;
  durationS?: number;
  thumbnailUrl?: string;
  transcript: string;
}): Promise<{ videoId: string; outline: OutlinePayload }> {
  const { data, error } = await supabase.functions.invoke('generate-outline', {
    body: input
  });
  if (error) throw new Error(error.message);
  return data;
}

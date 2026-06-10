import { supabase } from './supabase';

export async function getVideo(videoId: string) {
  const { data, error } = await supabase
    .from('videos').select('*').eq('id', videoId).single();
  if (error) throw new Error(error.message);
  return data;
}

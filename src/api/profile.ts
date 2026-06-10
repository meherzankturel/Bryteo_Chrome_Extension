import { supabase } from './supabase';
import type { Database } from '../types/db';

export type Profile = Database['public']['Tables']['profiles']['Row'];

export async function getMyProfile(): Promise<Profile> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

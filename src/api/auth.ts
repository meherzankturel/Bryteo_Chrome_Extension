import { supabase } from './supabase';
import type { Session } from '@supabase/supabase-js';

export async function ensureSignedIn(): Promise<Session> {
  const { data: { session: existing } } = await supabase.auth.getSession();
  if (existing) return existing;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw new Error(error.message);
  if (!data.session) throw new Error('signInAnonymously returned no session');
  return data.session;
}

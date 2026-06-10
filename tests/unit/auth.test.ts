import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ensureSignedIn } from '@/api/auth';

vi.mock('@/api/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      signInAnonymously: vi.fn()
    }
  }
}));

import { supabase } from '@/api/supabase';

describe('ensureSignedIn', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns existing session if signed in', async () => {
    (supabase.auth.getSession as any).mockResolvedValue({
      data: { session: { user: { id: 'u1' } } }, error: null
    });
    const session = await ensureSignedIn();
    expect(session?.user.id).toBe('u1');
    expect(supabase.auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it('signs in anonymously when no session exists', async () => {
    (supabase.auth.getSession as any).mockResolvedValue({
      data: { session: null }, error: null
    });
    (supabase.auth.signInAnonymously as any).mockResolvedValue({
      data: { session: { user: { id: 'u2' } } }, error: null
    });
    const session = await ensureSignedIn();
    expect(session?.user.id).toBe('u2');
    expect(supabase.auth.signInAnonymously).toHaveBeenCalledOnce();
  });

  it('throws when anon signin fails', async () => {
    (supabase.auth.getSession as any).mockResolvedValue({
      data: { session: null }, error: null
    });
    (supabase.auth.signInAnonymously as any).mockResolvedValue({
      data: { session: null }, error: { message: 'boom' }
    });
    await expect(ensureSignedIn()).rejects.toThrow('boom');
  });
});

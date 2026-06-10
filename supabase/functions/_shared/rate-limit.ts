import { serviceClient } from './auth.ts';

const LIMITS = {
  free: { outlines: 20, cards: 200 },
  pro:  { outlines: 200, cards: 2000 },
  founding: { outlines: 200, cards: 2000 },
  student: { outlines: 200, cards: 2000 }
};

export async function checkAndIncrement(
  userId: string,
  field: 'outlines_today' | 'cards_today',
  amount: number,
  tier: keyof typeof LIMITS
): Promise<{ allowed: boolean; remaining: number }> {
  const sb = serviceClient();
  const day = new Date().toISOString().slice(0, 10);
  const max = field === 'outlines_today' ? LIMITS[tier].outlines : LIMITS[tier].cards;

  const { data, error } = await sb.rpc('rate_limit_increment', {
    p_user_id: userId,
    p_day: day,
    p_field: field,
    p_amount: amount
  });
  if (error) throw new Error(error.message);

  const used = (data as number) ?? 0;
  return { allowed: used <= max, remaining: Math.max(0, max - used) };
}

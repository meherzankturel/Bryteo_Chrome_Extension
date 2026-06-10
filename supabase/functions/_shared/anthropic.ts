import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.30.0';

export const anthropic = new Anthropic({
  apiKey: Deno.env.get('ANTHROPIC_API_KEY')!
});

export function modelFor(tier: 'free' | 'pro' | 'founding' | 'student') {
  return tier === 'free' ? 'claude-haiku-4-5' : 'claude-sonnet-4-6';
}

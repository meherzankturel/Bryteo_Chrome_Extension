import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

export async function getUserFromRequest(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) throw new Response('Unauthorized', { status: 401 });

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } }
  });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) throw new Response('Unauthorized', { status: 401 });
  return { user, userClient };
}

export function serviceClient() {
  return createClient(supabaseUrl, serviceRoleKey);
}

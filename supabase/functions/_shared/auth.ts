import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.3';

/** Extract the authenticated user from the Supabase JWT in the request's Authorization header. */
export async function getUserFromRequest(req: Request): Promise<{ id: string; email: string | null } | null> {
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: auth } } }
  );
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}

export function json(body: unknown, init: number | ResponseInit = 200): Response {
  const status = typeof init === 'number' ? init : (init.status ?? 200);
  const headers = { 'Content-Type': 'application/json', ...corsHeaders, ...(typeof init === 'object' ? (init.headers ?? {}) : {}) };
  return new Response(JSON.stringify(body), { status, headers });
}

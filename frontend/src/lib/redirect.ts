interface RedirectLocation {
  pathname?: unknown;
  search?: unknown;
  hash?: unknown;
}

/** Rebuild a protected in-app URL without allowing an external redirect. */
export function redirectFromState(state: unknown): string {
  const from = (state as { from?: RedirectLocation } | null)?.from;
  const pathname = typeof from?.pathname === 'string' ? from.pathname : '/';
  if (!pathname.startsWith('/') || pathname.startsWith('//')) return '/';
  const search = typeof from?.search === 'string' && from.search.startsWith('?') ? from.search : '';
  const hash = typeof from?.hash === 'string' && from.hash.startsWith('#') ? from.hash : '';
  return `${pathname}${search}${hash}`;
}

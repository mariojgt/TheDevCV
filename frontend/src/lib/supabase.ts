/**
 * Local API client — self-hosted replacement for the old Supabase client.
 *
 * Exposes the same tiny surface the app already uses (`from().select().eq()…`,
 * `auth.getUser()`, `rpc()`, `functions.invoke()`) but backed by the bundled
 * Node server's JSON-file store instead of Postgres. This keeps every existing
 * call site working without a rewrite.
 *
 * There is no auth in self-hosted mode: a single static local user is always
 * "signed in", and credit/billing RPCs resolve locally as free/unlimited.
 */

export interface User {
  id: string;
  email: string;
}

export interface Session {
  user: User;
}

export const LOCAL_USER: User = { id: 'local', email: 'you@localhost' };

const API_BASE = '/api';

type Row = Record<string, unknown>;
type Result<T> = { data: T; error: { message: string } | null };

async function apiFetch(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; body: unknown; response: Response }> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  let body: unknown = null;
  try { body = await response.clone().json(); } catch { /* empty body */ }
  return { ok: response.ok, status: response.status, body, response };
}

/**
 * Minimal PostgREST-style query builder over /api/db/:table.
 * Thenable, so both `await q` and `q.then(...)` work like supabase-js.
 */
class QueryBuilder implements PromiseLike<Result<any>> {
  private action: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private where: Row = {};
  private orderBy: { column: string; ascending: boolean }[] = [];
  private limitN?: number;
  private wantSingle = false;
  private payload: unknown;

  constructor(private table: string) {}

  select(_columns = '*') {
    return this;
  }

  insert(rows: Row | Row[]) {
    this.action = 'insert';
    this.payload = rows;
    return this;
  }

  update(patch: Row) {
    this.action = 'update';
    this.payload = patch;
    return this;
  }

  delete() {
    this.action = 'delete';
    return this;
  }

  eq(column: string, value: unknown) {
    this.where[column] = value;
    return this;
  }

  order(column: string, opts: { ascending?: boolean } = {}) {
    this.orderBy.push({ column, ascending: opts.ascending ?? true });
    return this;
  }

  limit(n: number) {
    this.limitN = n;
    return this;
  }

  single() {
    this.wantSingle = true;
    return this;
  }

  maybeSingle() {
    this.wantSingle = true;
    return this;
  }

  private async execute(): Promise<Result<any>> {
    try {
      let rows: Row[];
      if (this.action === 'select') {
        const params = new URLSearchParams();
        if (Object.keys(this.where).length) params.set('where', JSON.stringify(this.where));
        if (this.orderBy.length) params.set('order', JSON.stringify(this.orderBy));
        if (this.limitN !== undefined) params.set('limit', String(this.limitN));
        const qs = params.toString();
        const { ok, body } = await apiFetch(`/db/${this.table}${qs ? `?${qs}` : ''}`);
        if (!ok) return { data: null, error: { message: (body as any)?.error ?? 'request failed' } };
        rows = body as Row[];
      } else if (this.action === 'insert') {
        const { ok, body } = await apiFetch(`/db/${this.table}`, {
          method: 'POST',
          body: JSON.stringify({ rows: this.payload }),
        });
        if (!ok) return { data: null, error: { message: (body as any)?.error ?? 'insert failed' } };
        rows = body as Row[];
      } else if (this.action === 'update') {
        const { ok, body } = await apiFetch(`/db/${this.table}`, {
          method: 'PATCH',
          body: JSON.stringify({ where: this.where, patch: this.payload }),
        });
        if (!ok) return { data: null, error: { message: (body as any)?.error ?? 'update failed' } };
        rows = body as Row[];
      } else {
        const params = new URLSearchParams({ where: JSON.stringify(this.where) });
        const { ok, body } = await apiFetch(`/db/${this.table}?${params}`, { method: 'DELETE' });
        if (!ok) return { data: null, error: { message: (body as any)?.error ?? 'delete failed' } };
        return { data: null, error: null };
      }

      if (this.wantSingle) {
        const row = rows[0] ?? null;
        if (!row) return { data: null, error: { message: 'Row not found' } };
        return { data: row, error: null };
      }
      return { data: rows, error: null };
    } catch (err) {
      return { data: null, error: { message: err instanceof Error ? err.message : 'network error' } };
    }
  }

  then<TResult1 = Result<any>, TResult2 = never>(
    onfulfilled?: ((value: Result<any>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

/** Error shape matching what supabase-js threw for edge-function failures —
 *  `context` carries the Response so callers can read the JSON body. */
export class FunctionsError extends Error {
  constructor(message: string, public context: Response) {
    super(message);
    this.name = 'FunctionsError';
  }
}

/** Credit/billing RPCs are meaningless self-hosted — resolve them locally as free/unlimited. */
const LOCAL_RPCS: Record<string, unknown> = {
  get_my_credits: [{ balance: 999999, lifetime_granted: 999999, lifetime_consumed: 0 }],
  is_admin: false,
  consume_credits: true,
  grant_credits: true,
};

export const supabase = {
  from(table: string) {
    return new QueryBuilder(table);
  },

  async rpc(name: string, args?: Row): Promise<Result<any>> {
    if (name in LOCAL_RPCS) return { data: LOCAL_RPCS[name], error: null };
    try {
      const { ok, body } = await apiFetch(`/rpc/${name}`, { method: 'POST', body: JSON.stringify(args ?? {}) });
      if (!ok) return { data: null, error: { message: (body as any)?.error ?? `rpc ${name} failed` } };
      return { data: body, error: null };
    } catch (err) {
      return { data: null, error: { message: err instanceof Error ? err.message : 'network error' } };
    }
  },

  functions: {
    async invoke(name: string, opts: { body?: unknown } = {}): Promise<{ data: any; error: FunctionsError | null }> {
      try {
        const { ok, body, response } = await apiFetch(`/fn/${name}`, {
          method: 'POST',
          body: JSON.stringify(opts.body ?? {}),
        });
        if (!ok) return { data: null, error: new FunctionsError((body as any)?.error ?? `function ${name} failed`, response) };
        return { data: body, error: null };
      } catch (err) {
        return {
          data: null,
          error: new FunctionsError(err instanceof Error ? err.message : 'network error', new Response(null, { status: 0 })),
        };
      }
    },
  },

  auth: {
    async getUser() {
      return { data: { user: LOCAL_USER }, error: null };
    },
    async getSession() {
      return { data: { session: { user: LOCAL_USER } as Session }, error: null };
    },
    onAuthStateChange(_cb: (event: string, session: Session | null) => void) {
      return { data: { subscription: { unsubscribe() { /* no-op */ } } } };
    },
    async signOut() { /* no-op in self-hosted mode */ },
  },
};

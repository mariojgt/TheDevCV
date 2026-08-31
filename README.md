# The Dev CV — self-hosted

ATS-compliant CV builder for developers. Part of [The Dev Realm](https://new.thedevrealm.com).

Fully self-hosted and local-first: **no database, no accounts, no billing, no tracking**. One small Node server stores everything as plain JSON files on disk and ships with an **MCP server built in**, so you can connect Claude (or any MCP client) and ask it to improve and iterate on your CVs.

- **Frontend** — React 19 + Vite + Tailwind 4 (`frontend/`)
- **Server** — single Node process (`server/`): static hosting + JSON-file storage + AI proxy + MCP
- **AI** — Anthropic Claude, proxied through the server so your key never reaches the browser (optional)
- **MCP** — `POST /mcp` (Streamable HTTP) with 9 CV-editing tools

---

## Quick start (Docker)

```sh
# optional: put ANTHROPIC_API_KEY=sk-ant-... in a .env file next to docker-compose.yml
docker compose up -d
# → http://localhost:8720
```

Your data lives in `./data` as human-readable JSON — back it up by copying the folder (or use **Settings → Download backup** in the app).

Without Docker:

```sh
cd frontend && npm install && npm run build && cd ..
cd server && npm install && cd ..
ANTHROPIC_API_KEY=sk-ant-... node server/index.mjs
# → http://localhost:8720
```

### Server environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | *(unset)* | Enables AI features (rewrites, ATS tailoring, cover letters). Everything else works without it. |
| `AI_MODEL` | `claude-opus-5` | Claude model used by AI features |
| `DATA_DIR` | `./data` (`/data` in Docker) | Where the JSON files live |
| `PORT` | `8720` | HTTP port |

---

## MCP — let AI improve your CVs

The server exposes an MCP endpoint at `http://localhost:8720/mcp`. Connect it and ask Claude things like *"review my CV and tighten the experience bullets"*, *"duplicate my CV tailored for a Staff Engineer role"*, or *"add the keywords from this job ad"*. The dashboard live-refreshes as edits land.

**Claude Code:**

```sh
claude mcp add --transport http thedevcv http://localhost:8720/mcp
```

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "thedevcv": { "type": "http", "url": "http://localhost:8720/mcp" }
  }
}
```

Tools: `list_cvs`, `get_cv`, `create_cv`, `update_cv`, `duplicate_cv`, `delete_cv`, `add_cv_item`, `update_cv_item`, `delete_cv_item`.

> ⚠️ The MCP endpoint (like the rest of the app) has **no authentication** — it's a single-user, local-first tool. Keep it on localhost or put your own reverse-proxy auth in front if you expose it.

The **Settings** page in the app shows the same connection snippets with copy buttons, plus server/AI status and a one-click JSON backup.

---

## Local development

Two processes — the API server and the Vite dev server (which proxies `/api` + `/mcp` to it):

```sh
# terminal 1 — API + MCP + storage
cd server && npm install && PORT=8720 node index.mjs

# terminal 2 — frontend with HMR
cd frontend && npm install && npm run dev
# → http://localhost:5174
```

No frontend env vars are needed. `VITE_BACKEND_URL` overrides the dev-proxy target if your server runs elsewhere.

---

## HTTP API

Everything the frontend uses is a plain JSON API you can script against:

| Route | Purpose |
| --- | --- |
| `GET/POST/PATCH/DELETE /api/db/:table` | Generic CRUD over the JSON store (`cv_profiles`, `cv_experience`, …, `job_applications`) |
| `POST /api/rpc/:name` | `ensure_share_token`, `get_shared_cv`, `record_cv_event`, `get_cv_stats` |
| `POST /api/fn/ai` | Claude proxy — `{ prompt, system?, max_tokens? }` → `{ text }` |
| `POST /api/fn/jobs-proxy` | Job-board aggregation (Remotive/RemoteOK/Arbeitnow) + company intel |
| `GET /api/events` | SSE change feed (`{ table }`) — powers live refresh |
| `GET /api/export` | Full JSON backup of every table |
| `GET /api/health` | Status, AI availability, data dir |
| `POST /mcp` | MCP endpoint (Streamable HTTP) |

---

## Project layout

```
TheDevCV/
├── frontend/
│   └── src/
│       ├── App.tsx                    # Router (no auth — straight to dashboard)
│       ├── lib/
│       │   ├── supabase.ts            # Local API client (same query surface as the old Supabase client)
│       │   ├── ai-client.ts           # aiComplete() → POST /api/fn/ai
│       │   └── useLiveRefresh.ts      # SSE subscription hook
│       ├── contexts/                  # Static local user, everything unlocked
│       ├── pages/Settings.tsx         # Server status, MCP connect snippets, backup
│       └── modules/cv/                # Editor, templates, ATS analysis, job tracker
├── server/
│   ├── index.mjs                      # HTTP server: static + /api + /mcp + SSE
│   ├── store.mjs                      # JSON-file store (atomic writes, change events)
│   ├── cv.mjs                         # Share links, analytics, duplicate — old RPC ports
│   ├── jobs.mjs                       # Jobs/company proxy
│   └── mcp.mjs                        # MCP server (9 CV tools)
├── Dockerfile                         # Multi-stage → small alpine image
└── docker-compose.yml                 # One service + ./data volume
```

---

## Conventions

- **AI calls** go through `aiComplete()` in `src/lib/ai-client.ts`. Never import the Anthropic SDK in the browser.
- **Data access** goes through the query client in `src/lib/supabase.ts` (kept under its old name so the CV module's call sites stay unchanged). It speaks to `/api/db/:table` — there is no Postgres and no RLS; the server is the trust boundary (which, self-hosted, is you).
- **Everything is unlocked** — `useApp().hasCredits()` always passes and `costOf()` is 0. The old credit/plan gates remain in the UI code but are permanently open.
- **Brand tokens** live in `src/index.css` (`--color-primary` is emerald-400, surfaces are near-black).

## Migrating from the old Supabase version

Export each table from Postgres as JSON arrays and drop the files into `DATA_DIR` as `<table>.json` (e.g. `cv_profiles.json`). Column names are unchanged. `user_id` values don't matter anymore — the self-hosted build ignores them.

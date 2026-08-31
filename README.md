# The Dev CV — self-hosted

ATS-friendly CV builder for developers. The app is fully self-hosted: no Supabase, no external database, no billing, and no tracking.

- **Frontend:** React 19, Vite and Tailwind 4 (`frontend/`)
- **Server:** one Node process for static hosting, accounts, JSON storage, AI proxy and MCP (`server/`)
- **Storage:** human-readable JSON files in `data/`, with atomic writes
- **Accounts:** email/password login, HTTP-only session cookies and per-user data isolation
- **AI:** each user can save an Anthropic key in Settings; the browser never receives it again
- **MCP:** authenticated Streamable HTTP endpoint at `POST /mcp` with nine CV tools

## Quick start with Docker

```sh
docker compose up -d --build
docker compose logs thedevcv
# open http://localhost:8720
```

Create an account on the first visit. The first account form asks for the one-time setup token shown in the startup logs; this proves that the person claiming the installation can access the server. You can instead set your own `BOOTSTRAP_TOKEN` in `.env` before the first start. The token is no longer accepted after the first account exists.

On an existing no-account installation, that first account automatically claims the existing CVs and job applications.

All persistent state is in `./data`. Back up that whole folder, including hidden files: it contains CV data, password hashes, user settings and the generated secret used for sessions and API-key encryption.

AI is optional. After signing in, open **Settings → Anthropic API key**, paste your key, and choose **Validate & save**. The key is validated using Anthropic's Models API and encrypted before being written to disk.

## Account and deployment settings

Copy `.env.example` to `.env` when you need overrides:

| Variable | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | unset | Optional server-wide AI-key fallback shared by signed-in users |
| `AI_MODEL` | `claude-opus-5` | Model used for AI requests |
| `REGISTRATION_MODE` | `open` | `open`, `first-user`, or `disabled` |
| `BOOTSTRAP_TOKEN` | generated in `data/.bootstrap-token` | One-time proof required to create the first account |
| `COOKIE_SECURE` | `auto` | `auto`, `true`, or `false` for the session-cookie Secure flag |
| `SESSION_SECRET` | generated in `data/.session-secret` | Signs login sessions |
| `SETTINGS_ENCRYPTION_KEY` | session secret | Encrypts user API keys at rest |
| `DATA_DIR` | `./data` (`/data` in Docker) | JSON storage directory |
| `PORT` | `8720` | HTTP port |

For a private single-owner installation, `REGISTRATION_MODE=first-user` allows initial setup and then closes signup. Use `open` when several people need separate accounts; only the first person needs the bootstrap token. If registration is open, prefer per-user keys from Settings instead of a shared `ANTHROPIC_API_KEY`.

When exposing the app beyond localhost, put it behind HTTPS. With `COOKIE_SECURE=auto`, direct HTTPS or a reverse proxy that sends `X-Forwarded-Proto: https` produces Secure session cookies. Use long, stable values for `SESSION_SECRET` and `SETTINGS_ENCRYPTION_KEY`; changing the latter makes previously saved API keys unreadable.

On Linux, if the container reports `EACCES` for `/data`, create `./data` first and make it writable by the container user (UID 1000 by default).

## MCP — let an AI client improve CVs

Every account has its own MCP token. Copy the current command or JSON configuration from **Settings → MCP**. For Claude Code, the shape is:

```sh
claude mcp add --transport http thedevcv http://localhost:8720/mcp \
  --header "Authorization: Bearer YOUR_MCP_TOKEN"
```

Generic remote HTTP configuration:

```json
{
  "mcpServers": {
    "thedevcv": {
      "type": "http",
      "url": "http://localhost:8720/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_MCP_TOKEN"
      }
    }
  }
}
```

Available tools: `list_cvs`, `get_cv`, `create_cv`, `update_cv`, `duplicate_cv`, `delete_cv`, `add_cv_item`, `update_cv_item`, and `delete_cv_item`.

The token grants read/write access only to that account's CVs. Rotate it from Settings if it is exposed. The dashboard refreshes automatically when an MCP client changes a CV.

## Run without Docker

```sh
cd frontend
npm install
npm run build
cd ../server
npm install
cd ..
node server/index.mjs
```

Open `http://localhost:8720`.

## Local development

Run the API and Vite dev server separately:

```sh
# terminal 1
cd server && npm install && PORT=8720 node index.mjs

# terminal 2
cd frontend && npm install && npm run dev
# http://localhost:5174
```

The Vite server proxies `/api` and `/mcp` to port 8720. `VITE_BACKEND_URL` can override that target. No browser-side secrets or other frontend environment variables are required.

## HTTP API

All private routes require the HTTP-only session cookie. The MCP token is intentionally accepted only by `/mcp`, not by the REST API.

| Route | Auth | Purpose |
| --- | --- | --- |
| `POST /api/auth/register` | public | Create an account and session; first account also requires `setup_token` |
| `POST /api/auth/login` | public | Sign in |
| `POST /api/auth/logout` | public | Clear the session cookie |
| `GET /api/auth/me` | session | Current user |
| `GET/POST/PATCH/DELETE /api/db/:table` | session | User-scoped JSON CRUD |
| `GET /api/settings` | session | AI status and MCP token |
| `PUT/DELETE /api/settings/anthropic-key` | session | Validate, save or remove a per-user key |
| `POST /api/settings/mcp-token` | session | Rotate the MCP token |
| `POST /api/rpc/:name` | session, except shared-CV reads | Sharing and analytics helpers |
| `POST /api/fn/ai` | session | Anthropic proxy |
| `POST /api/fn/jobs-proxy` | session | Job-board and company-intel proxy |
| `GET /api/events` | session | Live-refresh event stream |
| `GET /api/export` | session | JSON backup scoped to the current user |
| `GET /api/health` | public | Health and version |
| `POST /mcp` | session or MCP Bearer token | Streamable HTTP MCP endpoint |

## Project layout

```text
TheDevCV/
├── frontend/src/
│   ├── App.tsx
│   ├── contexts/              # auth + per-user app settings
│   ├── pages/                 # login, signup and Settings
│   ├── lib/supabase.ts        # local API compatibility client
│   └── modules/cv/            # editor, templates, ATS and job tracker
├── server/
│   ├── index.mjs              # HTTP router, static files, AI and SSE
│   ├── auth.mjs               # accounts and signed sessions
│   ├── access.mjs             # row-level user isolation
│   ├── settings.mjs           # encrypted keys and MCP tokens
│   ├── store.mjs              # atomic JSON-file store
│   ├── cv.mjs                 # sharing, analytics and duplication
│   ├── jobs.mjs               # jobs/company proxy
│   └── mcp.mjs                # nine authenticated CV tools
├── Dockerfile
└── docker-compose.yml
```

## Migrating from the old Supabase build

Export each application table as a JSON array and place it at `DATA_DIR/<table>.json`, for example `data/cv_profiles.json`. Keep the existing column names. On a server with no `users.json`, the first newly registered account (verified with the bootstrap token) claims all imported profile and application rows; child CV sections follow their parent profile automatically.

For later backups, copy the complete data directory rather than only the application table files. The in-app download is intentionally scoped to the signed-in user's CV and job data and does not contain credentials or server secrets.

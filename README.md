# The Dev CV

ATS-compliant CV builder for developers. Part of [The Dev Realm](https://new.thedevrealm.com).

- **Frontend** — React 19 + Vite + Tailwind 4 (`frontend/`)
- **Backend** — Supabase (Postgres + Auth + Edge Functions) (`supabase/`)
- **Billing** — Stripe Checkout + Customer Portal (webhook-synced)
- **AI** — Anthropic Claude proxied through a Supabase Edge Function (so the key is never exposed to the browser)

---

## Plans

| Capability                         | Free           | Pro |
| ---------------------------------- | -------------- | --- |
| CV versions                        | **1** (DB-enforced) | Unlimited |
| ATS score & gap analysis           | ✅             | ✅ |
| PDF export (ATS-safe template)     | ✅             | ✅ |
| AI field-level rewrites            | ✅             | ✅ |
| AI tailor-to-job (full CV rewrite) | —              | ✅ |
| Cover-letter generator             | —              | ✅ |
| Premium templates                  | —              | ✅ |
| Interview prep / salary intel      | —              | ✅ |

Free-tier enforcement lives in the database (`enforce_cv_profile_quota` trigger in `supabase/migrations/00003_plans.sql`) — the client can't bypass it.

---

## Local development

### 1. Install

```sh
cd frontend
npm install
```

### 2. Environment variables

Copy `.env.example` to `.env` and fill in the Supabase + Stripe values:

```sh
cp frontend/.env.example frontend/.env
```

Required:

- `VITE_SUPABASE_URL` — your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase publishable (anon) key
- `VITE_STRIPE_PUBLISHABLE_KEY` — Stripe public key (optional, only if you render Stripe Elements)
- `VITE_APP_URL` — e.g. `http://localhost:5174`

The publishable key shipped in `.env` is public by design — it can't mutate data outside what RLS allows. Never commit your **service_role** key.

### 3. Run

```sh
cd frontend
npm run dev
# → http://localhost:5174
```

---

## Supabase setup

### Apply migrations

```sh
supabase link --project-ref <your-project-ref>
supabase db push
```

Migrations, in order:

| File                              | What it does |
| --------------------------------- | ------------ |
| `00001_init.sql`                  | Extensions + `update_updated_at()` trigger fn |
| `00002_cv_schema.sql`             | `cv_profiles`, `cv_experience`, …, `job_applications` with RLS |
| `00003_plans.sql`                 | `user_plans` + free-tier quota trigger + `get_my_plan()` |
| `00004_stripe.sql`                | Stripe columns, `stripe_events` idempotency table, `apply_stripe_subscription()` |

### Deploy Edge Functions

```sh
# AI proxy (required for any AI feature)
supabase functions deploy ai

# Stripe billing (required for Pro)
supabase functions deploy stripe-checkout
supabase functions deploy stripe-portal
supabase functions deploy stripe-webhook   # note: JWT verification disabled in config.toml
```

### Required Edge Function secrets

```sh
# AI
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set AI_MODEL=claude-sonnet-4-6       # optional

# Stripe
supabase secrets set STRIPE_SECRET_KEY=sk_live_or_test_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase secrets set STRIPE_PRICE_PRO_MONTHLY=price_...
supabase secrets set STRIPE_PRICE_PRO_YEARLY=price_...
supabase secrets set APP_URL=https://thedevcv.com     # or your deployed URL
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

### Stripe webhook endpoint

Point your Stripe webhook at:

```
https://<project-ref>.supabase.co/functions/v1/stripe-webhook
```

Subscribe to:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

---

## Project layout

```
TheDevCV/
├── frontend/
│   ├── src/
│   │   ├── App.tsx                    # Router
│   │   ├── main.tsx                   # Entrypoint (providers)
│   │   ├── index.css                  # Brand tokens (dark, emerald accent)
│   │   ├── contexts/
│   │   │   ├── AuthContext.tsx        # Supabase session
│   │   │   └── AppContext.tsx         # Plan gating: useApp().plan + .can(capability)
│   │   ├── components/
│   │   │   ├── AppShell.tsx           # Sidebar + main layout
│   │   │   ├── RequireAuth.tsx
│   │   │   ├── Logo.tsx, PlanBadge.tsx
│   │   │   └── ui/                    # Button, Card, Badge, Toast, …
│   │   ├── lib/
│   │   │   ├── supabase.ts
│   │   │   ├── ai-client.ts           # Thin wrapper around the `ai` Edge Function
│   │   │   ├── ocr.ts                 # PDF + image → text (tesseract.js + pdf.js)
│   │   │   └── types.ts
│   │   ├── pages/
│   │   │   ├── Landing.tsx, Login.tsx, Signup.tsx
│   │   │   ├── Pricing.tsx, BillingSuccess.tsx, Account.tsx
│   │   │   └── UpgradeRequired.tsx
│   │   └── modules/cv/                # Ported from the Archiva CV module
│   │       ├── pages/                 # CVDashboard, CVEditor, CVImport, CVJobMatch, JobTracker
│   │       ├── components/            # Templates + ATS analysis + OptimizePanel
│   │       ├── hooks/                 # useCV, useJobs
│   │       ├── lib/                   # ai.ts, jobAI.ts, import.ts, pdf.ts
│   │       └── types.ts
│   └── ...
└── supabase/
    ├── config.toml                    # Local dev config; stripe-webhook has verify_jwt = false
    ├── migrations/                    # See table above
    └── functions/
        ├── _shared/{cors.ts,auth.ts}
        ├── ai/                        # Claude proxy
        ├── stripe-checkout/           # Creates a Checkout Session for Pro
        ├── stripe-portal/             # Opens the Stripe billing portal
        └── stripe-webhook/            # Flips user_plans on subscription events
```

---

## Conventions

- **AI calls** go through `aiComplete()` in `src/lib/ai-client.ts`. Never import the Anthropic SDK in the browser.
- **Plan gating** — use `const { plan, can } = useApp();` to guard UI. Wrap routes with `<ProRoute>` in `App.tsx` for hard gates.
- **Free tier is DB-enforced** — even if a client bypasses the UI, the `enforce_cv_profile_quota` trigger will reject the insert with error code `P0001`.
- **Brand tokens** live in `src/index.css` (`--color-primary` is emerald-400, surfaces are near-black).

---

## What's left / nice-to-have

- Google OAuth (Supabase Auth supports it — just flip it on)
- Stripe Tax auto-registration per country
- Email notifications (magic-link sign-in, interview reminders)
- Public share links for CVs (read-only)
- Mobile-first editor polish

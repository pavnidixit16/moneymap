# MoneyMap

A financial commitments planner for working professionals in India: what's already
committed, what's due next, and roughly how much remains until payday.

MoneyMap is an independent prototype. It has no access to bank or payment accounts and
is not affiliated with any bank or payment app.

- Product specification: [`docs/SPEC.md`](docs/SPEC.md) (source of truth)
- Setup guide (GitHub, Supabase, Google sign-in, Vercel): [`docs/SETUP.md`](docs/SETUP.md)

## Stack

Next.js (App Router, TypeScript, Tailwind) · Supabase (Postgres, Auth, row-level
security) · Vercel · Vitest.

## Project layout

| Path | What it is |
|---|---|
| `src/app` | Pages and route handlers |
| `src/proxy.ts` | Refreshes the session and redirects signed-out visitors |
| `src/lib/supabase` | Supabase clients (browser and server) |
| `supabase/migrations` | Database schema, constraints and access policies, applied in order |
| `supabase/tests` | Two-user isolation test (safe to run in the Supabase SQL Editor) |
| `src/lib/engine` | Pure pay-cycle calculations (R1–R10) with unit tests |
| `e2e` | Browser tests and the local test stack |
| `scripts/check-secrets.sh` | Fails if a secret is in git, its history or the browser bundle |

## Commands

```bash
npm run dev            # local development server
npm test               # unit tests
npm run typecheck      # TypeScript
npm run lint           # ESLint
npm run build          # production build
npm run check:secrets  # secret scan (run after build to include the bundle)
npm run test:e2e       # browser tests on a local stack (see e2e/local/run.sh)
```

The browser tests run the real migrations in a local Postgres behind the real PostgREST
server, with a small stand-in for Supabase Auth (`e2e/local/gateway.mjs`, local only).

## Security model

Only the Supabase project URL and publishable key reach the browser. Every table has
row-level security so each user can read and change only their own rows; anonymous
visitors can read nothing. No service-role key is used.

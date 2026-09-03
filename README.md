# 🌉 ImpactBridge

A grant & nonprofit funding management platform — connecting **NGOs**, **donors**, and **funding companies** in one place.

> Think *Airbnb meets LinkedIn* for nonprofits: NGOs build verified public profiles, donors discover and fund causes they care about, and funding organisations run real grant programmes end to end.

---

## ▶ Live

**<https://impactbridge-web.onrender.com>**

Deployed on Render from `render.yaml` — a Dockerised Express API, a static Vite
frontend, and Postgres. The site calls the API at relative `/api/*` paths through
a rewrite, so the browser only ever sees one origin and the auth cookie stays
same-origin.

Seeded with 8 organisations (7 verified), ~500 donations and 6 open grant
programmes, so nothing is an empty state.

### Signing in

| Role | Email | Password |
| --- | --- | --- |
| Donor | `donor@impactbridge.dev` | `Password123` |
| Nonprofit | `ngo@impactbridge.dev` | `Password123` |
| Funder | `funder@impactbridge.dev` | `Password123` |

The seed also creates a platform-admin account, which is not listed here
because it can verify and suspend organisations. Be aware that this is a speed
bump and not a control: the account follows the same naming as the rest and the
seeded password is documented further down for local development, so treat the
live instance as a demo anyone can poke at — and change that password on the
deployed database if you ever want it to mean something.

### Donating

Payments run **Razorpay in TEST mode**. No real money moves and no live key can
ever be used — the server refuses to boot on an `rzp_live_` key.

Use a **domestic** test card: `4100 2800 0000 1007`, any future expiry, any CVV,
and any 4–10 digit OTP. Razorpay's international test cards are blocked, as
international payments are off by default.

The full loop is real: order → gateway → signed webhook → verified capture →
gapless receipt number → updated dashboards.

### Two things to expect

**The first request may take ~50 seconds.** The free tier sleeps after 15 minutes
idle. Open it once and it stays warm.

**Registration emails are not delivered.** Every message routes through one
`sendMail` function that currently logs instead of sending, so the verification
link only reaches the server console. Use the accounts above. Wiring a provider
is a one-file change — see `apps/api/src/lib/mailer.ts`.

---

## What makes it interesting

Most "donation apps" stop at a payment button. ImpactBridge models the part that actually happens in the sector — **the grant lifecycle** — as a guarded state machine:

```
Grant posted → NGO applies → Review pending → Reviewer assigned
   → Interview → Approved → Funds released → Progress reports → Completed
```

Every transition is validated server-side against the actor's role and the application's current state, so the workflow can't be skipped or forged from the client.

## Roles

| Role | Can do |
| --- | --- |
| **NGO Admin** | Build org profile, upload legal docs, add causes & impact metrics, receive donations, apply for grants, post progress reports |
| **Donor** | Browse & search NGOs, donate (one-off), download receipts, bookmark and follow orgs |
| **Funder / Company** | Post grants with eligibility rules, review & compare applicants, approve/reject, allocate funds, leave reviewer comments |
| **Platform Admin** | Verify NGOs, suspend fraudulent orgs, moderate content, view platform analytics & audit logs |

---

## Tech stack

**Frontend** — React · TypeScript · Vite · Tailwind CSS · shadcn/ui · React Query · React Hook Form · Zod
**Backend** — Node.js · Express · TypeScript · Prisma · PostgreSQL · JWT · Socket.io
**Infrastructure** — Docker · Render (Postgres + Docker API + static site, via `render.yaml`) · Cloudinary · GitHub Actions

### Monorepo layout

```
ImpactBridge/
├─ apps/
│  ├─ web/        React frontend
│  └─ api/        Express API + Prisma schema
├─ packages/
│  └─ shared/     Zod schemas + types shared by BOTH sides
└─ docker-compose.yml
```

The `shared` package is the point: a schema is written **once** and used for API validation, form validation, and TypeScript types. If a shape changes, both ends fail to compile — no silent drift between client and server.

---

## Getting started

**Prerequisites:** Node 22+, pnpm, Docker Desktop.

Node 22 is a hard floor, not a preference: the pinned pnpm 11 requires the
`node:sqlite` built-in, which does not exist before 22. On Node 20 pnpm itself
crashes with `ERR_UNKNOWN_BUILTIN_MODULE` before it installs anything.

```bash
pnpm install
```

```bash
cp apps/api/.env.example apps/api/.env
```

Start Postgres (runs in Docker — no local Postgres install needed):

```bash
pnpm db:up
```

Apply the database schema:

```bash
pnpm --filter @impactbridge/api prisma migrate dev
```

Run both apps:

```bash
pnpm dev
```

| Service | URL |
| --- | --- |
| Web | http://localhost:5173 |
| API | http://localhost:4000 |
| Health check | http://localhost:4000/api/health |
| Postgres | `localhost:5433` |

### Useful commands

```bash
pnpm typecheck
```

```bash
pnpm --filter @impactbridge/api prisma studio
```

```bash
pnpm db:down
```

---

## Authentication

Two-token model, chosen so that a stolen credential is either short-lived or unreadable:

- **Access token** — a 15-minute JWT held only in memory (never `localStorage`, which any injected script can read). Sent as a `Bearer` header and verified statelessly.
- **Refresh token** — a 30-day random string in an `httpOnly`, `sameSite=lax` cookie, so JavaScript cannot read it even if the page is compromised. Only a SHA-256 **hash** is stored server-side, so a database leak yields no usable tokens.

Refresh tokens **rotate** on every use. Reusing a rotated token is treated as theft and revokes the user's entire token family — with a 15-second grace window so that two tabs refreshing simultaneously isn't mistaken for an attack. Revocations record *why* (`ROTATED`, `LOGOUT`, `THEFT_DETECTED`, `PASSWORD_RESET`), and only `ROTATED` is eligible for that grace.

Passwords use **Argon2id** at OWASP-recommended parameters. Login returns an identical error for an unknown email and a wrong password — and performs a dummy hash comparison when the user doesn't exist — so neither the message nor the response time reveals which accounts are registered.

### Demo accounts

Seeded by `pnpm --filter @impactbridge/api db:seed`, all pre-verified, password `Password123`:

| Email | Role |
| --- | --- |
| `donor@impactbridge.dev` | Donor |
| `ngo@impactbridge.dev` | NGO Admin |
| `funder@impactbridge.dev` | Funder |
| `admin@impactbridge.dev` | Platform Admin |

Verification and password-reset emails are not sent in development — the link is printed to the API console by the dev mailer.

## Payments

Donations run on **Razorpay test mode** — the real Razorpay API and the real checkout flow, paid with [test cards](https://razorpay.com/docs/payments/payments/test-card-details/). Use the **domestic** card `4100 2800 0000 1007` (any CVV, any future expiry), then any 4–10 digit OTP on the mock bank page to succeed. No real money moves at any point.

Payments sit behind a **provider interface** (`apps/api/src/payments/`) with two implementations:

| Provider | When it's used |
| --- | --- |
| `razorpay` | Real test-mode payments, selected automatically when API keys are present |
| `mock` | A local gateway that issues orders, signs results and posts its own webhook — so donations work end to end with **no account, no keys and no internet** |

That abstraction exists for a concrete reason: this project originally integrated Stripe, which turned out to be unavailable (Stripe India is invite-only and needs a registered business). Being coupled to one gateway made that a rewrite instead of a config change.

**A donation is confirmed by three independent paths, all idempotent:**

1. the browser posts the signed result to `/api/donations/verify`,
2. the gateway posts a signature-verified webhook to `/api/webhooks/payments`,
3. the server asks the gateway directly whether the order was captured (reconciliation).

None of them is *trusted* — every path re-checks with the gateway before crediting anything, and the amount is taken from the gateway rather than the client. Path 3 is what makes a lost confirmation self-heal instead of silently costing the donor money.

Grant "fund release" between a funder and an NGO is a ledger/status transition inside the database, not a real transfer.

---

## AI assistance

Three features, all built on **Google Gemini's free tier** (no card required) behind a provider interface, so the model is swappable the same way the payment gateway is:

| Feature | Who sees it |
| --- | --- |
| Reviewer summary of an application | Funder |
| "What's missing from my application?" | Applying NGO |
| Grant ↔ organisation matching | NGO |

Two rules the implementation holds to:

**The model advises, it never decides.** Nothing in the AI layer writes a status, an award, or a verification flag. A funder reads a summary and then makes the call themselves through the state machine — an LLM in the approval path would be unaccountable, and for grant money, indefensible.

**Model output is never treated as fact.** Grant matches come back as ids, which are re-resolved against the database — the title, amount and link a user sees are ours, and a hallucinated id is dropped rather than rendered. Results are cached against a SHA-256 of their source text, so quota isn't spent regenerating an unchanged answer, and editing a proposal invalidates its summary automatically.

## Build roadmap

Built in vertical slices, so the app is runnable at every step.

- [x] **Phase 0** — Monorepo scaffold, Docker Postgres, health check
- [x] **Phase 1** — Auth & roles (JWT access + refresh, email verification, RBAC)
- [x] **Phase 2** — Donor journey: browse, search, filter, donate, receipts
- [x] **Phase 3** — NGO journey: profile, document uploads, causes, impact metrics, analytics
- [x] **Phase 4** — Funder journey: grants, applications, review workflow, funds release, progress reports
- [x] **Phase 5** — Platform admin: verification, moderation, audit logs
- [x] **Phase 6** — Real-time notifications (Socket.io)
- [x] **Phase 7** — AI layer: proposal summaries, gap detection, NGO↔grant matching
- [x] **Phase 8** — CI/CD, production Docker images, deployment

## Deployment

Both apps ship as production Docker images, built from the repo root:

```bash
docker compose -f docker-compose.prod.yml up --build
```

| Image | Size | Contents |
| --- | --- | --- |
| `impactbridge-api` | ~658MB | Bundled Node server + production deps + Prisma engines |
| `impactbridge-web` | ~74MB | nginx serving the static Vite build — no Node in the final image |

Three things in the API build are worth knowing, because each one caused a failure that only showed up at runtime, never at compile time:

- **The API is bundled, not just compiled.** `packages/shared` ships raw TypeScript so a schema edit is instantly visible to both apps in development. `tsx` resolves that; plain `node` does not — a `tsc`-only build produced output that compiled cleanly and then died on boot with `ERR_MODULE_NOT_FOUND`. `apps/api/build.mjs` bundles the workspace package in and leaves real dependencies external.
- **The Prisma client is generated in the runtime stage.** `pnpm deploy` copies resolved packages but not the generated output written into them, so a client built earlier does not survive the copy — the container started and immediately exited with "@prisma/client did not initialize yet".
- **Migrations run on container start**, not at image build. The database only exists at runtime, and running them here means a deploy can never serve traffic against a schema the code doesn't expect.

The web image needed its own fix: nginx's `add_header` does not merge, so a location block declaring any header discards everything inherited from the server block. Because `try_files … /index.html` internally redirects into the `= /index.html` location, declaring the security headers once at server level silently dropped them from every HTML response. They are repeated per location deliberately.

CI (`.github/workflows/ci.yml`) typechecks all three workspaces, runs the state-machine tests, builds both apps, and applies every migration against a throwaway Postgres — that last step matters because several migrations were hand-written with `prisma migrate diff`.

## Tests

```bash
cd apps/api && npm run test:workflow
```

27 tests over the grant state machine: the happy path, stage-skipping, wrong-actor attempts, terminal states, and the rule that an NGO cannot withdraw once funds are committed.

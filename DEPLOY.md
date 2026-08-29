# Deploying ImpactBridge

Everything the deploy needs is in `render.yaml`. What follows is the part a
person has to do, because it needs your login and nobody else's.

**Time: about 15 minutes, most of it waiting for the first build.**

---

## 1. Create the services (5 minutes of clicking)

1. Go to <https://dashboard.render.com> and sign in with **GitHub**.
2. **New → Blueprint**.
3. Pick `Dumku-13/ImpactBridge`. Render finds `render.yaml` by itself.
4. Approve the plan it shows you — one Postgres, one web service, one static
   site, all free tier — and click **Apply**.

The API's first build takes roughly 5–8 minutes (it is a Docker build). The
static site is quicker.

## 2. Fix the one URL that cannot be inferred

`render.yaml` proxies the web app's `/api/*` to
`https://impactbridge-api.onrender.com`. **If Render gave your API a different
name** — it appends a suffix when the name is taken — edit that one line and
push:

```yaml
- type: rewrite
  source: /api/*
  destination: https://YOUR-ACTUAL-API-HOST/api/*
```

You will see the real host at the top of the API service's page.

## 3. Seed the demo data (once)

The database comes up empty, and an empty ImpactBridge is not a demo. In the
Render dashboard open **impactbridge-api → Shell** and run:

```bash
pnpm --filter @impactbridge/api db:seed
pnpm --filter @impactbridge/api db:seed:profiles
pnpm --filter @impactbridge/api exec tsx prisma/seedDonations.ts
```

That gives you 8 verified organisations, ~550 donations, 2 open grants, the
galleries and the teams. All four demo logins work with `Password123`.

## 4. Optional keys

The deploy runs with **no keys at all**:

- **Payments** default to the offline mock gateway, which completes a donation
  end to end without touching Razorpay. To use Razorpay TEST mode instead, set
  `PAYMENT_PROVIDER=razorpay`, `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in
  the API service's Environment tab.
- **AI** endpoints answer 503 without `GEMINI_API_KEY`, and the UI hides every
  AI control when they do. That is a working state, not a broken one — set the
  key only if you want the matcher live in the demo.

Set them in the dashboard. **Never in this file or in `render.yaml`.**

---

## Things worth knowing before you demo it

**The free tier sleeps.** After 15 minutes idle, the API spins down and the next
request takes ~50 seconds to wake it. Before walking into the interview, open the
site once and let it load — then it stays warm for the conversation. If you want
to be certain, upgrade the API service to the cheapest paid tier for the day.

**The free Postgres expires after 30 days.** Fine for an interview, not for
anything you leave running. Render will email you.

**Migrations run on container start**, not at build. A deploy therefore cannot
serve traffic against a schema the code does not expect.

**Cookies depend on the rewrite.** The web app calls `/api/...` relative so the
refresh cookie is same-origin. If you ever point the frontend directly at the
API's own domain instead, sign-in will appear to work and then silently fail on
the next page load, because the browser will drop the cookie.

---

## If it does not come up

| Symptom | Cause |
|---|---|
| API deploy fails on `prisma migrate deploy` | `DATABASE_URL` did not bind — check the API service's Environment tab shows it linked from `impactbridge-db` |
| Site loads, every request 404s | The `/api/*` rewrite destination does not match the real API host — step 2 |
| Sign-in works, then you are logged out on refresh | Something is calling the API cross-origin instead of through the rewrite |
| First request takes ~50s | Free tier cold start. Expected |

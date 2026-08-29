# ImpactBridge — handoff

**Read section 3 before touching the front end.** Every rule there was learned by
shipping the bug first.

Current as of **2026-08-29**. Repo: <https://github.com/Dumku-13/ImpactBridge>
(public, `main`, everything below is pushed).

---

## 1. The project

pnpm monorepo:

| Path | What |
|---|---|
| `apps/api` | Express + Prisma + Postgres. 25 models, 11-state grant workflow, Razorpay TEST mode, Socket.io, Cloudinary, Gemini |
| `apps/web` | React 18 + Vite + Tailwind + React Query + GSAP |
| `packages/shared` | Zod schemas used by BOTH sides — single source of truth for validation |

**The backend is more sophisticated than the UI ever communicated.** That was the
entire point of the redesign. Do not rebuild backend logic; it works.

### Running it

```bash
docker compose up -d postgres      # REQUIRED — see section 6
pnpm --filter @impactbridge/api dev
pnpm --filter @impactbridge/web dev
```

Demo accounts, all password `Password123`:
`donor@` / `ngo@` / `funder@` / `admin@impactbridge.dev`, plus one per NGO
(`jalmitra@`, `aarogya@`, `saheli@`, `streetpaws@`, `setu@`, `nilgiri@`,
`kadam@`).

---

## 2. Art direction

The first attempt was rejected as "too AI-ish / generic SaaS" — blue-grey
palette, imagery used as card decoration. Both are gone.

### Palette — ink, paper, vermilion, marigold, olive

In `apps/web/src/index.css`. Five colours. No decorative gradients.

| Token | Role |
|---|---|
| `--background` / `--foreground` | Warm paper / ink. **These SWAP with the theme** |
| `--primary` | Vermilion — the one loud colour. Actions, live state |
| `--accent` | Marigold — money and emphasis only, never chrome |
| `--olive` | Deep olive — ground for inverted sections |
| `--ink` / `--paper` | **THEME-INDEPENDENT, never swap.** Use for art-directed sections |

### Typography

- `font-grotesk` — Archivo Variable, weight 100–900 **and width 62–125%**. The
  shouting voice. Always set `fontStretch`; the landing opening runs it at its
  narrow extreme (62% / weight 900), which reads as a different typeface for no
  extra download.
- `font-display` — Fraunces Variable. Serif voice. Set `fontVariationSettings: "SOFT" 12`.
- `font-sans` — Manrope. All UI text.
- `.tnum` — tabular figures. Use on every number.

### Public vs authenticated

Public pages (home, browse, grants, org profile): bold, editorial, kinetic.
Dashboards: professional, dense, restrained. **Do not make dashboards cinematic.**

---

## 3. HARD RULES — each one came from a real shipped bug

### 3.1 Never pin a ScrollTrigger

Tried twice, broke twice: pinning switches the element to fixed positioning
inside a generated spacer, and a margin or full-bleed breakout then renders
off-frame — the user saw a **blank black band**.

`position: sticky` is fine and is what the landing opening uses. It is CSS, keeps
the element in normal flow, and cannot produce that failure.

### 3.2 A resting state must NEVER be invisible

Shipped **twice** on grant rows — filtering left every grant at `opacity: 0`, so
the page looked empty. An animation that has been created but is not advancing
paints and holds its FIRST keyframe.

**Rule:** entrance animations start at `opacity: 0.3`, never `0`.

This applies to **every** keyframe. `fade-up`, `fade-in`, `scale-in` and
`slide-down` in `tailwind.config.js` all started at zero and were fixed on
2026-08-26. `fade-in`/`scale-in` are the dialog backdrop and panel, where a
frozen first keyframe gives an invisible modal that has already trapped focus.

`Reveal` had the same bug from the other side: it held at `opacity-0` until
IntersectionObserver fired, so anywhere IO does not deliver the hold was
permanent. It holds at `opacity-30` now.

### 3.3 Art-directed sections use `--ink` / `--paper`

The semantic tokens swap with the theme. A hero built on `--foreground` inverted
in dark mode into a pale panel with dark text and bleached footage.

### 3.4 Full-bleed breakout needs `overflow-x: clip`

`w-screen` is `100vw`, which **includes the scrollbar**. `html, body {
overflow-x: clip }` is set in `index.css`. Use `clip`, **never `hidden`** —
`hidden` silently creates a scroll container and breaks every `position: sticky`
element on the page.

### 3.5 Abstract footage behind type, never a face

A face behind a headline always loses: the eye goes to the face, the type needs a
heavy scrim, and the scrim bleaches the footage. This rule killed two heroes.

**Of the five ambient loops, only `tree` (canopy) and `water` are on-vibe.**
`texture` and `community` are North American construction sites and `people` is
from the same source — do not reach for them. The user cut `water`.

### 3.5b Scroll-linked motion: one variable, gated behind a class

The landing opening (`components/home/Opening.tsx` + the `.op-*` rules in
`index.css`) uses no animation library. A rAF-throttled listener writes a single
custom property — `--op-p`, 0 → 1 — and adds `.op-scrub`; every movement is a
`calc()` off it. Lifted from the F1 dashboard's `--hero-p`. Prefer it for any new
scroll scene:

- **It is testable.** Arithmetic on a variable can be driven by hand and
  measured. A GSAP timeline cannot be inspected that way, which is why every
  earlier scroll effect could only be checked for *mechanism*.
- **The base state is the readable state.** Rules live behind a class only JS
  adds, so reduced motion / no JS leaves a still, legible page.
- One property write per frame, no React render, no library on the path.

**Background-explode structure** (also from the F1 dashboard):

```
zone (3.4 screens)
├── sticky top-0, h-svh, -mb-[100svh]   ← background: headline + ink wash
└── relative z-10                        ← foreground: figures scrolling over it
```

The negative bottom margin pulls the foreground up over the sticky layer. Swept
at quarter-viewport steps for the blank band that pattern is famous for; clean.

**The zone must use `min-h`, not `h`.** With a fixed height the foreground grew
taller than the zone and the last block hung out of the bottom onto the next
section.

### 3.5c The page thread, and the z-layer it needs

`components/home/PageThread.tsx` draws ONE line down the whole landing page —
`getTotalLength()`, `stroke-dasharray`, `stroke-dashoffset` scrubbed by scroll.
Two rules from the GSAP squiggle reference are honoured deliberately:

- **The trigger is the wrapping DIV, never the SVG.** SVG internals live in their
  own coordinate space and cannot be measured against the viewport.
- **The range is clamped**: the draw starts when the region's top reaches the
  middle of the screen and ends when its bottom does.

**The viewBox must match the region's aspect ratio.** It was `0 0 100 100`
stretched over a box ~1430 × 9500, where a horizontal unit costs as much path
length as a vertical one while being worth a tenth as much on screen — **81% of
the line's length went sideways**, so the draw raced through the loops and
crawled between them. It is computed now (`0 0 100 H`, `H = 100 × height /
width`); sideways spend is 39% and drawn-fraction tracks scrolled-fraction to
within 3%.

**No filters.** A `drop-shadow` on a 13.6-megapixel element repainting every
scroll frame lagged the entire site. The dark halo path underneath does the
legibility job.

**The layering rule, easy to break by accident:**

```
z-5   the thread          (above every section BACKGROUND)
z-10  every text column   (above the thread)
```

Every section's content wrapper on the landing page carries `relative z-10`. All
25 sample points along the path fall inside the content column, so without this
the line crosses the copy. **If you add a section to the landing page, give its
inner column `relative z-10`.**

### 3.6 GSAP hygiene

- Always inside `gsap.context(..., root)` with `ctx.revert()` on unmount.
- GSAP is dynamically imported by story routes only. **It must never land in the
  shared vendor chunk** — check build output (currently its own 115 kB chunk;
  shared chunk ~246 kB).
- `useScrollTriggerRefresh()` in `lib/gsap.ts` re-measures after fonts, `load`, a
  1.2s backstop — **and on any change in document height**, via a debounced
  ResizeObserver. That last one exists because the landing page now renders
  panels fetched over the network which sit ABOVE every scroll-driven section: a
  timer cannot cover content that arrives whenever the network says so.

### 3.7 Never invent data

The product's whole argument is traceable money. Deliberately NOT built because
the data does not exist:

- Platform-wide "people reached" — `ImpactMetric.value` is a free-form **string**, not summable.
- Funding split by cause — donations carry no category.
- "Trace funding" allocation tree — no line-item allocations are recorded.

The same rule decides content: the AI match checklist is computed server-side
from real eligibility rules rather than asked of the model, and gallery
photographs are matched honestly to each cause even when that means an animal
charity gets ONE plate, because the library holds exactly one animal photograph.

---

## 4. What is DONE

### The landing page (rebuilt 2026-08-27 → 29)

`HomePage` composes, in order: `Opening` → `Premise` → `FundingFlow` →
`StatBand` → `StoryRail` → `Causes` → audiences. `PageThread` spans the lot;
`ScrollSpine` floats beside it.

| Component | What it is |
|---|---|
| `Opening` | No photograph. "Funding that actually reaches the ground." at 62%-width Archivo, exploding radially in a sticky background across 3.4 screens while three figures scroll over it. Each figure sits beside **the records behind it** — best-funded organisations with proportional bars, all eight verified orgs with cities, the live open grants — from `/organizations` and `/grants` |
| `PageThread` | One SVG line down the whole page, drawn by scroll, marigold → white |
| `ScrollSpine` | Fixed rail: fills with scroll, ticks per section, names the section you are in (vertically). Full rail ≥1360px, bare line below |
| `StoryRail` | Horizontal photo essay. A real `overflow-x` scroller driven by scroll position — **no scroll-snap**, which fought the driver |

Deleted along the way: `Hero.tsx`, `ImpactStories.tsx`, `heroSequence`.

### Other pages

| Page | State |
|---|---|
| **Browse** | The approved prototype gate. Canopy hero + real figures, 5 asymmetric org plates with parallax |
| **Grants** | Typographic opening, `CauseModes`, rows with cursor-tracking imagery, AI matcher with a real checklist |
| Org profile | Documentary: full-bleed `OrgOpening`, then numbered chapters — the work / `OrgGallery` mosaic / what they report / who is accountable. Donate rail is FIRST in the DOM and moved to column two at `lg`, so phone donors don't scroll 4341px to reach it |
| Donation success | The impact moment: amount at display scale on ink, the org's real totals, the donor's real cumulative giving, the org's own reported metrics attributed to them |
| Application detail | `ApplicationTimeline`, `TraceFunding`, reviewer picker |
| Apply | 4-step form + autosave |
| Dashboards | Hairline stat bands, editorial headers, deliberately restrained |

### Backend (all additive, no migrations — the enum values already existed)

- **`GRANT_ALLOCATION`** written on APPROVED; `GRANT_RELEASE` still on release.
  Admin revenue reads `GRANT_RELEASE` specifically, so nothing double-counts.
- **`REPORT_POSTED`** emitted to the grant's funder when an NGO posts a report.
- **Grant `COMPLETED`** reachable: funder-only, only from a published grant,
  refused while any application is still open (DRAFT excluded). Un-reopenable.
- **Reviewer assignment**: `GET /applications/reviewers` (funder-only, ids and
  names only) + a picker. Empty selection still means self-assign.
- `GET /api/stats/public`, `verifiedAt` on org detail, gallery double-filtered on
  `isPublic` AND `type: GALLERY_IMAGE`.

All verified at runtime against the database: a script drove apply → submit →
review → assign a DIFFERENT reviewer → approve → release → report → complete →
complete the grant → confirm reopen 409s, then deleted everything it created.

### AI layer

**Model is pinned to `gemini-3.5-flash`** and the request timeout is 60s.
`gemini-flash-latest` stopped responding entirely on 2026-08-26 — hanging, not
erroring, so it surfaced as our own 504 and pointed at our code. If AI stalls
again, **start here** (returns in under a second even while generation hangs):

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY"
```

All three features measured live: matcher 10.3s (instant on cache hit), funder
summary 11.8s, NGO self-review 17.6s.

**The match checklist is deterministic.** The model returns only a score and a
sentence; the "What this is based on" lines are computed server-side from the
grant's eligibility JSON and the organisation's record, mirroring
`assertEligible` exactly. A row the API would reject is badged "You don't
qualify yet".

### Seeds

- `db:seed` is **safe to re-run on a live database**. Money totals and
  verification apply on CREATE only — they are authored at runtime
  (`seedDonations.ts`, admin decisions) and a re-seed must not contradict the
  donation history or the audit log. A second consecutive run is a no-op.
- `db:seed:profiles` (new) gives every organisation a gallery and a team,
  additively and idempotently. **Team members have no photographs on purpose**:
  captioning a real photographed person as an officer of a fictional nonprofit
  misrepresents them.

### Audit (2026-08-29)

Swept the whole codebase and every route as all four roles. Three defects found
and fixed: stale ScrollTrigger ranges (see §3.6), the spine re-subscribing on
every render (`sections={[...SPINE]}` — new array identity each time), and a
rate-limiter bucket-key collision where two limiters on one path each counted
the same request, silently halving both limits. Plus an accessibility fix: the
applicant queue's "★ 4 (1)" read aloud as "4 (1)".

Dead exports removed: `useConfirm`, `useGsap`, `refreshScrollTriggers`,
`getSocket`, `heroSequence`. Five more un-exported but kept.

**Checked and found sound, so nobody re-audits them:** authorization on every
id-taking endpoint (404 not 403 for outsiders; comments and reviews filtered by
viewer), money in minor units throughout, no unbounded queries, single-flight
token refresh, hashed and expiring reset tokens, production error redaction,
`noopener` on external links, labelled form controls, 33 indexes, and no
`console.log`, hardcoded hosts or TODOs.

---

## 5. What is LEFT

### Blocked on the user

- **One real Razorpay test payment.** Cannot be automated (their iframe).
  Domestic test cards `5267 3181 8797 5449` or `4111 1111 1111 1111`; any CVV,
  future expiry, 4–10 digit OTP. Easier: UPI `success@razorpay`.
- **Visual sign-off on the motion.** The preview browser cannot judge
  appearance — see section 6.

### Real gaps, in the order worth doing

1. **Deploy it.** `render.yaml` + `DEPLOY.md` are written and pushed — a
   Blueprint deploy on Render stands up Postgres, the API from its Dockerfile
   and the web app as a static site, with the `/api/*` rewrite that keeps the
   refresh cookie same-origin. **This needs the user's Render login and nobody
   else's**, so it cannot be done from a session. Roughly 15 minutes of their
   time, most of it waiting for the first Docker build.
2. **Email is a console stub.** `lib/mailer.ts` prints to the API log; the
   Resend implementation was never written. Password reset and email
   verification links exist only in the terminal, so a real signup cannot be
   completed in a demo. Needs a Resend account and key — also the user's.
3. **No refunds.** `TransactionType.REFUND` and `DonationStatus.REFUNDED` are in
   the schema and never written by any code path. Deliberately left alone in the
   run-up to the interview: it is invisible in a demo and it is money code.
4. **No donor account page.** NGOs and funders can edit their profile; a donor
   cannot change their name or password. Note this needs API work too — there is
   no self-update endpoint at all (`PATCH /auth/me` and a change-password route
   would both be new).

Done since this list was written: the 404 page and the notifications page.

### Housekeeping

- **3.7 MB of orphaned hero frames.** `apps/web/public/media/hero/` holds 100
  committed frames that nothing references since `heroSequence` was removed, and
  `build-media.mjs` still generates them. Offered to delete; the user has not
  decided.
- The **F1 dashboard** (`Dumku-13/f1-dashboard`) is still private. Making it
  public would add a strong pinned repo and backfill its history onto the
  contribution graph — see the standing profile goal in memory.

---

## 6. Environment gotchas

### Docker must be running — and it is unstable on this machine

Postgres runs at **localhost:5433** via `docker-compose.yml`. If Docker is not
running, every request fails with a Prisma initialisation error and the API looks
"crashed". **Check this first, always.**

On 2026-08-29 Docker Desktop stopped three times mid-session and its daemon hung
for minutes on restart, with `docker ps` returning nothing at all rather than an
error. Symptom to recognise: API returns 500 with "Can't reach database server at
localhost:5433". Fix: start Docker Desktop, wait, `docker compose up -d postgres`.

### The preview browser does not composite

`requestAnimationFrame` never fires in the automated preview tab. You can verify
*mechanism* but **not appearance** — ask the user to look.

**Verify the probe before believing it.** Three artifacts have each masqueraded
as a bug:

- **rAF never fires**, so GSAP and CSS animations freeze at their first keyframe.
- **`IntersectionObserver` never delivers**, so every `Reveal` reads as
  invisible. Test IO on a known-visible element before concluding anything.
- **The pane can collapse to `0×0`**, at which point every rectangle is garbage
  and the layout looks catastrophically broken. Assert `innerWidth > 0` first and
  set an explicit viewport with `resize_window`.

This is exactly why §3.5b's one-variable technique matters: `--op-p` and `--th-p`
can be set by hand and the resulting geometry measured, in a browser that never
draws a frame.

---

## 7. Verification

```bash
pnpm -r typecheck                              # 3 packages, must be clean
pnpm --filter @impactbridge/api test:workflow  # 46 tests, all must pass
pnpm --filter @impactbridge/web build          # confirm GSAP is NOT in the shared chunk
```

A reusable page probe (install once in the preview tab, call per route) sweeps in
half-viewport steps recording dead bands, measures the worst resting opacity of
any text block, lists images rendered above their natural width, counts `h1`s,
and pushes the window sideways to prove `scrollX` returns 0. It found six real
bugs in one pass on 2026-08-26.

Manual checks that each caught a real bug:

1. **Dead-band sweep** — assert something visible is on screen at every step.
2. **Filter then re-check opacity** — every row still `opacity >= 0.29`.
3. **Both themes** — the hero inversion bug only appeared in dark mode.
4. **375px** — assert `window.scrollX` stays 0 after `scrollTo(400, 0)`.
5. **API down** — pages must show an error or a sentence, never an empty box.

---

## 8. Working style the user asked for

- Build ONE thing, get it looked at, then continue. No broad speculative passes.
- The user is blunt and time-pressed. Lead with what changed and what broke.
  Skip preamble and self-congratulation.
- **State what was measured, not what was intended.** Numbers where possible.
- When a claim turns out to be wrong, say so plainly and move on — that happened
  twice here (an "unprotected auth" claim that was already handled, and a
  "not moving" rail whose real cause was viewBox geometry), and correcting it
  fast was worth more than being right first time.
- Secrets: `API keys.txt` at the repo root holds LIVE Razorpay and Gemini
  credentials. It is gitignored, not encrypted. Never commit it, never paste it.

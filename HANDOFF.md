# ImpactBridge — UI/UX overhaul handoff

**State:** the blue-grey SaaS look has been replaced with an ink/paper editorial
direction. Browse is the approved-prototype gate; other pages follow only once
the user confirms it lands.

Read **section 3 (Hard rules)** before touching the front end. Every rule there
was learned by shipping the bug first.

---

## 1. The project

pnpm monorepo:

| Path | What |
|---|---|
| `apps/api` | Express + Prisma + Postgres. 25 models, 11-state grant workflow, Razorpay TEST mode, Socket.io, Cloudinary |
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
`donor@` / `ngo@` / `funder@` / `admin@impactbridge.dev`

---

## 2. Art direction

The first attempt was rejected as "too AI-ish / generic SaaS" — blue-grey palette,
imagery used as card decoration. Both are gone.

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
  shouting voice. Always set `fontStretch` (78–88%) at display size.
- `font-display` — Fraunces Variable. Serif voice. Set `fontVariationSettings: "SOFT" 12`.
- `font-sans` — Manrope. All UI text.
- `.tnum` — tabular figures. Use on every number.

### Public vs authenticated

Public pages (home, browse, grants, org profile): bold, editorial, kinetic.
Dashboards: professional, dense, restrained. **Do not make dashboards cinematic.**

---

## 3. HARD RULES — each one came from a real shipped bug

### 3.1 Never pin a ScrollTrigger

Tried twice, broke twice.

- **Homepage hero** pinned ~1300px to watch a woman walk. User: *"scroll down and
  the lady just moves, eww"*. Motion must deliver information per unit of scroll.
- **Browse opening** pinned a section that also had a negative margin, inside
  AppLayout's padded container. Pinning switches the element to fixed positioning
  inside a generated spacer; the margin fought it and content rendered off-frame.
  The user saw a **blank black band**.

Everything now uses normal document flow with scroll-triggered reveals.

### 3.2 A resting state must NEVER be invisible

Shipped this **twice** on grant rows — filtering left every grant at `opacity: 0`,
so the page looked empty.

- `gsap.fromTo` applies its `from` state instantly and needs the frame loop to escape it.
- **A CSS keyframe starting at `opacity: 0` does exactly the same thing.**
  Moving GSAP → CSS did NOT fix it. That was a wrong theory, held for one round.

**Rule:** entrance animations start at `opacity: 0.3`, never `0`. Worst case is
"briefly dim", never "gone". See `.row-enter` in `index.css`.

### 3.3 Art-directed sections use `--ink` / `--paper`

The semantic tokens swap with the theme. A hero built on `--foreground` inverted
in dark mode into a pale panel with dark text and bleached footage. The user sent
a screenshot of exactly that.

### 3.4 Full-bleed breakout needs `overflow-x: clip`

`w-screen` is `100vw`, which **includes the scrollbar** — a viewport breakout is
always a scrollbar's width too wide. `html, body { overflow-x: clip }` is set in
`index.css`.

Use `clip`, **never `hidden`** — `hidden` silently creates a scroll container and
breaks every `position: sticky` element on the page.

### 3.5 Abstract footage behind type, never a face

A face behind a headline always loses: the eye goes to the face, the type needs a
heavy scrim, and the scrim bleaches the footage. Texture reads as depth at any
opacity. **Only `tree-loop` is currently used** — the user explicitly cut the
water and the walking-person footage.

### 3.6 GSAP hygiene

- Always inside `gsap.context(..., root)` with `ctx.revert()` on unmount.
  Verified no leak: trigger count returns to baseline across navigations.
- GSAP is dynamically imported by story routes only. **It must never land in the
  shared vendor chunk** — check build output. (It did once; shared chunk went
  243 → 385 kB until HomePage was made lazy.)
- `useScrollTriggerRefresh()` in `lib/gsap.ts` re-measures after fonts and images
  settle. Without it, ranges compute as `0→0` or negative.

### 3.7 Never invent data

The product's whole argument is traceable money. Deliberately NOT built because
the data does not exist:

- Platform-wide "people reached" — `ImpactMetric.value` is a free-form **string**, not summable.
- Funding split by cause — donations carry no category, orgs hold up to 6, so
  every slice would get 100% and the parts would exceed the whole.
- "Trace funding" allocation tree — no line-item allocations are recorded.

---

## 4. What is DONE

### Foundations
- `Dialog` — portal, focus trap, Escape, scroll lock, focus restore. Verified.
- `ConfirmDialog` — wired to grant delete, which previously deleted on ONE click.
- `Toast` + provider, `Reveal`, `CountUp`, `SectionTheme`
- Editorial primitives: `DisplayStack`, `StatBlock`
- `ScrollProgress` rail in AppLayout
- Star ratings removed — never written at runtime, so real orgs always showed 0
- Notification click marks read (`useMarkRead` — endpoint existed, client hook didn't)

### Media pipeline — `scripts/build-media.mjs`

Idempotent, ffmpeg-based. Source frame folders are **gitignored and READ-ONLY**.
Outputs to `apps/web/public/media/` (~20 MB, committed).

- Hero sequence: 100 frames at 1126×648 — **native, do not upscale** (an earlier
  version scaled to 1550px, inventing 38% of the pixels)
- Loops: `water`, `tree`, `texture`, `people`, `community` (mp4 + webm)
- `people` and `community` are **ping-pong** encoded (forward + reversed) for a
  seamless seam. Note: `-frames:v` after `-i` is an OUTPUT limiter and silently
  truncated these to half length — the fix uses `trim` in the filter graph.
- `posters/` — first-frame still per loop
- 18 story slices from the contact sheet. **Small: wide ≈489px, portrait ≈222px.
  Never render full-bleed.**
- 18 optimised stills

**Excluded: `ngo video/` (890 frames)** — another organisation's campaign text is
burned into the pixels. Do not use it.

Both watermarks (hero sparkle, "bigBLOCK") are cropped and visually verified.

### Pages

| Page | State |
|---|---|
| Home | Hero (still + fade), Premise, FundingFlow (scrubbed SVG path), StatBand, **StoryRail**, Causes |
| **Browse** | **The approved prototype gate.** Canopy hero + real figures, then 5 asymmetric org plates with parallax and hover-dim. Grid and filters below untouched |
| **Grants** | Typographic opening, `CauseModes` (giant words; hover swaps a real photograph), rows with cursor-tracking cause imagery |
| Org profile | **Documentary**: full-bleed `OrgOpening` plate, then numbered chapters — the work / `OrgGallery` / what they report / who is accountable — with the donate rail sticky beside them |
| Application detail | `ApplicationTimeline` (real events, actors, timestamps), `TraceFunding` dialog |
| Apply | 4-step form + autosave — verified 1 create then patches, never duplicate drafts |
| Dashboards | Hairline stat bands, editorial headers, deliberately restrained |
| Auth | Photograph brand panel |

### Added since this handoff was written (2026-08-26)

**Front end**

- `StoryRail` (`components/home/StoryRail.tsx`) — the horizontal-scroll story
  section, finally built. Replaces the vertical `ImpactStories` photo-essay,
  which ran to ~3 screens. **No pin**: the rail is a real `overflow-x` scroll
  container (swipe, drag, wheel, Tab all work with no JS) and a ScrollTrigger
  merely writes its `scrollLeft` as the section crosses the viewport. If the
  driver never runs it degrades to an ordinary carousel, never a blank band.
  A pointer/touch/key interaction holds the driver off for 1.6s so a visitor
  dragging the rail isn't fought by the page.
- Donation success is now the **impact moment**: full-bleed ink plate with the
  amount at display scale over the organisation's own cover, then the
  organisation's real totals, the donor's real cumulative giving
  (`useDonorStats`), and the organisation's own reported metrics, attributed to
  them in plain words. Every honest state — polling, browser-verify failure,
  FAILED, not-found — is unchanged.
- Org profile rebuilt as a documentary (see the Pages table).
- **AI match checklist** — each recommended grant now expands into "What this is
  based on". Computed SERVER-side from the grant's eligibility JSON and the
  organisation's record, mirroring `assertEligible` exactly; the model still
  contributes only the score and one sentence, and the UI says so. A match the
  API would reject is badged "You don't qualify yet" on the row.
- Funder can pick a **reviewer** when assigning (`GET /applications/reviewers`,
  funder-only, ids and names only). Empty selection still means self-assign.
- Funder can **mark a grant complete** from the dashboard, behind a
  `ConfirmDialog` because it is terminal.

**Backend** (no migrations — every enum value already existed)

- `GRANT_ALLOCATION` is written on APPROVED; `GRANT_RELEASE` still on release.
  Admin revenue reads `GRANT_RELEASE` specifically, so nothing double-counts.
- `REPORT_POSTED` is emitted to the grant's funder when an NGO posts a report.
- Grant `COMPLETED` is reachable: funder-only, only from a published grant, and
  refused while any application is still open (DRAFT excluded — the funder
  can't resolve someone else's abandoned draft). Still un-reopenable.
- `prisma/seedProfiles.ts` (`db:seed:profiles`) — additive and idempotent; gives
  every organisation a gallery from the project's own media library and a team.
  **Team members are seeded without photographs on purpose**: captioning a real
  photographed person as an officer of a fictional nonprofit misrepresents them.

All of the above was verified at runtime against the real database, not just
typechecked — a script drove the full lifecycle (apply → submit → review →
assign a DIFFERENT reviewer → approve → release → report → complete → complete
the grant → confirm reopen is refused) and then deleted everything it created.
46 workflow tests still pass; GSAP is still its own chunk (115 kB), not in the
243→246 kB shared chunk.

### Backend additions — all additive, no migrations

- `GET /api/stats/public` — unauthenticated, 60s cache, only derivable values
- `verifiedAt` on org detail — makes the verified badge a checkable claim
- Gallery images exposed, **double-filtered** on `isPublic` AND
  `type: GALLERY_IMAGE` because legal documents share that table. Verified a
  registration certificate does not leak.

---

## 5. What is LEFT

### Blocked on the user

- **One real Razorpay test payment.** Cannot be automated (their iframe). Domestic
  test cards: `5267 3181 8797 5449` or `4111 1111 1111 1111`; any CVV, any future
  expiry, 4–10 digit OTP. Easier path: UPI `success@razorpay`.
- **Visual sign-off on Browse** — and now on the three new moments (StoryRail,
  the donation impact moment, the documentary profile). The automated preview
  cannot judge appearance; see section 6.

### Known data problem in the demo database

`vidya-jyoti-foundation` — the org behind `ngo@impactbridge.dev`, the primary
demo NGO — has **no categories, no state, no founding year and no description**.
They look wiped rather than never-set (the seed defines all four), most likely
by an edit through the NGO settings form. Consequences: its profile renders
almost empty, and it fails eligibility on any grant with a years-active rule.
`db:seed` would restore it, but it also rewrites `totalRaisedMinor` /
`donorCount` from static values, so run `seedDonations.ts` after it or the
donation figures go stale.

### Not started

- NGO profile as a scroll-driven documentary — **done**, see section 4.
- Horizontal-scroll story section — **done**, see section 4.
- Donation success as a larger "impact moment" — **done**, see section 4.
- AI match checklist — **done**, computed server-side rather than asked of the
  model, see section 4.

Nothing from the original list remains. Candidates if more is wanted:

- The AI matcher itself could not be exercised end-to-end on 2026-08-26 —
  Gemini's free tier returned 502 "high demand" on every attempt. The checklist
  logic was verified directly against real grants and organisations, and the UI
  was verified with a stubbed response; the model call itself was not.
- The project is **not under version control**. There is a `.gitignore` but no
  `.git`. Every rewrite in this session was backed up by hand instead.

## 6. Environment gotchas

### Docker must be running

Postgres runs at **localhost:5433** via `docker-compose.yml`. If Docker Desktop is
not running, every request fails with a Prisma initialisation error and the API
looks "crashed". This caused a long misdiagnosis — the API was blamed three times
before the real cause was found. **Check this first, always.**

### The preview browser does not composite

`requestAnimationFrame` never fires in the automated preview tab. Consequences:

- Screenshots time out
- **GSAP tweens and CSS animations freeze at their first keyframe**
- `ScrollTrigger` progress stays 0 until `ScrollTrigger.update()` is called manually

You can verify *mechanism* (does the timeline advance when forced) but **not
appearance**. Ask the user to look. Several alarming "bugs" during this work were
measurement artifacts — verify the probe before trusting a scary number. Examples
that wasted time: contrast measured against the wrong backdrop (reported 1.15:1,
actually fine); `fonts.check()` returning false because it does not trigger a
fetch; a focus-trap "failure" caused by opening a dialog with a synthetic click.

---

## 7. Verification

```bash
pnpm -r typecheck                              # 3 packages, must be clean
pnpm --filter @impactbridge/api test:workflow  # 46 tests, all must pass
pnpm --filter @impactbridge/web build          # confirm GSAP is NOT in the shared chunk
```

Manual checks that each caught a real bug — run after front-end changes:

1. **Dead-band sweep** — scroll in half-viewport steps, assert something visible
   is on screen at every step. Caught the black hole.
2. **Filter then re-check opacity** — click a cause filter, assert every row is
   still `opacity >= 0.29`. Caught invisible grants, twice.
3. **Both themes** — the hero inversion bug only appeared in dark mode.
4. **375px** — assert `window.scrollX` stays 0 after `scrollTo(400, 0)`.

---

## 8. Working style the user asked for

- Use subagents (sonnet/haiku) for mechanical work; keep design and architecture
  in the main session. **Subagents hit account session limits repeatedly** — if
  one fails, do the work directly rather than retrying in a loop.
- Build ONE section, get it approved, then continue. No broad speculative passes.
- The user is blunt and time-pressed. Lead with what changed and what broke.
  Skip preamble and self-congratulation.

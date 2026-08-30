# Security

This document walks a twenty-point pre-launch checklist and states, honestly, where
ImpactBridge stands on each item.

Two of the twenty do not apply to this stack. They are marked **N/A** with an
explanation of what plays the equivalent role, rather than given a tick they have not
earned — a checklist that launders "not applicable" into "done" is worse than no
checklist, because it removes the prompt to think about the underlying risk.

Where a control has a real limitation, the limitation is stated next to it.

**Scope:** ImpactBridge is a demonstration platform. Payments run against a gateway in
test mode and no real money moves. That lowers the stakes of a breach; it does not
change how the code is written.

---

## 1. Hide API keys — **Done**

Every secret is read from the environment through `apps/api/src/config/env.ts`, which
validates the whole environment with Zod once at boot and refuses to start on anything
missing or malformed. Nothing is hard-coded; a repository-wide search for key-shaped
strings (`sk_`, `rzp_`, `AIza`, `ghp_`) returns nothing.

The split that matters is in the payment keys. `RAZORPAY_KEY_ID` is public by design —
it ships to the browser to open Checkout. `RAZORPAY_KEY_SECRET` and
`RAZORPAY_WEBHOOK_SECRET` are server-only and never leave the process. On Render both
JWT secrets use `generateValue: true`, so they are created by the platform and never
seen by a person.

A loose `API keys.txt` in the project root holds live credentials for local
development. It is gitignored by name and has never been committed (see item 2).

## 2. Purge Git secrets — **Done**

`git log --all --diff-filter=A` over the full history returns no `.env` file, no
`API keys.txt`, and no other credential file. There is nothing to purge, which is the
good case: history rewriting is destructive and invalidates every existing clone, so
avoiding the need is worth more than knowing the remedy.

`.gitignore` covers `.env`, `.env.local`, `.env.*.local` (with `!.env.example`
re-included) and the loose notes file.

## 3. Use public DB key — **N/A**

This item assumes a Supabase-shaped architecture, where the browser talks to the
database directly using a publishable `anon` key and the database decides what that key
may see.

ImpactBridge has no such key because the browser never talks to the database. The
React app calls an Express API; only the API holds `DATABASE_URL`, and it is a
server-side secret with full privileges. There is no public database credential to get
right, because there is no public database credential.

The nearest real equivalent — "know which of your keys is deliberately public, and
make sure it is the harmless one" — is handled under item 1: the Razorpay key id is
public on purpose, and the secret is not.

## 4. Enable row-level security — **N/A (enforced in the service layer instead)**

Row-level security is a Postgres feature that shines when untrusted clients connect to
the database directly, which is exactly the Supabase model above. Here, every query
already passes through server code that knows who is asking, so the equivalent
guarantee is enforced one layer up.

The pattern, consistently applied: fetch, then authorise, then filter. From
`applicationService.getApplication`:

```ts
const isApplicant = organization?.id === row.organizationId;
const isFunder    = row.grant.funderId === userId;
const isAdmin     = role === "PLATFORM_ADMIN";

if (!isApplicant && !isFunder && !isAdmin) {
  // 404 rather than 403 — we don't confirm the application exists.
  throw new HttpError(404, "Application not found");
}
```

Two details worth keeping. The failure is a **404, not a 403**: a 403 would confirm
that the id names a real application, turning the endpoint into an enumeration oracle.
And the check is on the *record's* ownership, not on the caller's role alone — being a
funder is not enough, you must be the funder who posted that grant.

**Limitation, stated plainly:** because this lives in application code rather than in
the database, a future query written outside these service functions would not inherit
it. RLS would fail closed in that situation; this does not. That is the real cost of
the trade, and it is why new data access should go through the service layer.

## 5. Encrypt sensitive data — **Done**

- **In transit:** TLS everywhere. HTTP is refused in production (item 19).
- **Passwords:** Argon2id (item 10).
- **Tokens at rest:** every long-lived token is stored as a SHA-256 hash and never in
  its raw form — refresh tokens, email-verification tokens and password-reset tokens
  alike (`generateSecureToken`/`hashToken` in `apps/api/src/lib/auth/tokens.ts`; the
  `tokenHash` columns in `prisma/schema.prisma`). A database dump therefore yields no
  usable session and no account-takeover link.

  SHA-256 rather than Argon2 is correct *here* specifically because the input is 32
  bytes of `crypto.randomBytes` — already beyond brute force, so a deliberately slow
  hash would buy nothing and cost latency on every request. The same choice would be
  wrong for passwords, which is why passwords use Argon2id.

## 6. Enforce server-side auth — **Done**

`requireAuth` verifies the JWT signature and expiry on the server for every protected
route; `requireRole` gates by role on top of it. The React `ProtectedRoute` component
exists for user experience — it prevents a pointless render and a confusing flash — and
is not a security boundary. Deleting it would change nothing about what the API allows.

## 7. Lock record access — **Done**

Covered by the pattern in item 4, applied throughout. Ownership is resolved from the
authenticated user, never from a client-supplied id: `where: { ownerId: userId }` to
find the caller's organisation, `findFirst({ where: { id, organizationId } })` to scope
a lookup, `findFirst({ where: { id: grantId, funderId } })` before a funder may act on
a grant.

## 8. Block field tampering — **Done**

Zod objects are non-strict, so unknown keys are **stripped** before anything reaches
Prisma. Posting `{"verified": true}` to the profile endpoint does not fail — the field
simply never exists by the time it could matter.

The privileged fields are absent from every input schema by construction:

- `verified` / `verifiedAt` appear only in *output* schemas. An NGO cannot self-verify;
  only a platform admin can, and that action is written to the audit log.
- Signup accepts `signupRoleSchema`, which is the role enum with `PLATFORM_ADMIN`
  excluded, so the admin role cannot be self-assigned.
- Application `status` is never taken from the request body. Transitions go through the
  guarded state machine in `services/grantWorkflow.ts`, which validates the move
  against the actor's role *and* the application's current state (covered by 46
  assertions in `grantWorkflow.test.ts`).

## 9. Secure session cookies — **Done**

The refresh cookie is `httpOnly` (so an XSS bug cannot read it), `secure` in production,
`sameSite: "lax"` (the CSRF defence), and `path: "/api/auth"` so it is not attached to
every unrelated API call. Rationale is documented inline in `lib/auth/cookies.ts`.

The access token is deliberately kept in memory only, never in `localStorage`.

## 10. Hash passwords — **Done**

Argon2id at the OWASP-recommended parameters (19 MiB memory cost, 2 iterations,
parallelism 1), with per-hash salts embedded in the encoded output. Memory-hardness is
the point: it makes GPU and ASIC cracking dramatically more expensive than bcrypt's
CPU-bound work. `verifyPassword` returns `false` rather than throwing on a malformed
hash, so one corrupt row cannot 500 the login endpoint.

## 11. Rate limit login — **Done, with a known limitation**

Two independent buckets, because they answer different questions:

- **Per IP** (`authRateLimit`, 20 per 15 min) — stops one machine grinding a password
  list.
- **Per account** (`loginAccountRateLimit`, 10 per 15 min) — stops a *distributed*
  credential-stuffing run where every request comes from a different address and each
  one sits comfortably inside the per-IP limit while a single account absorbs thousands
  of guesses.

The per-account bucket is keyed on the submitted email and never touches the database,
so an address with no account is throttled identically to one with an account — same
threshold, same 429, same wording. It cannot be used to discover who has registered.

**Limitations:** state is in-process memory, so it resets on restart and does not
coordinate across instances; Redis would fix both. And anyone who knows your address can
burn your ten attempts and delay your sign-in for the rest of the window — an accepted
trade, since the account is never disabled and the window expires on its own.

## 12. Add bot protection — **Done, and deliberately modest**

A honeypot field (`_hp`) that is hidden off-screen, `aria-hidden`, skipped by the tab
order and set to `autoComplete="off"`, plus a mount timestamp (`_ts`) that lets the
server reject submissions completed faster than a human could type. Both are checked by
`middleware/botGuard.ts` on register, login and forgot-password — the endpoints that
either send mail to an address the sender chose, or are worth guessing at.

Both fields are optional, so a legitimate client that omits them (curl, a test, a stale
cached bundle) still works.

**This stops drive-by form spam and nothing more.** It will not stop an attacker who
looks at the page once. Rate limiting, Argon2id and email verification are the controls
actually holding that door; treating a honeypot as though it were one would be a
mistake.

## 13. Parameterize queries — **Done**

Prisma parameterises everything by construction. The five raw queries in the codebase
(`health.ts`, `adminService.ts`, `donationService.ts`, `ngoService.ts`,
`statsService.ts`) are all `$queryRaw` **tagged templates**, which are parameterised —
interpolated values become bind parameters, not string concatenation. There is no use
of `$queryRawUnsafe` or `$executeRawUnsafe` anywhere.

## 14. Validate all input — **Done**

Every request body is parsed with a Zod schema from `packages/shared` before it reaches
a service. The same schema drives the browser form, so the two sides cannot disagree
about what is valid — and the server still re-validates, because the client check is
convenience and the server check is the boundary.

Query parameters are coerced and clamped at the edge (`z.coerce.number().int().min(1)
.catch(1)` for pagination), so hostile input becomes a sane default instead of a `NaN`
that reaches the database.

## 15. Escape user content — **Done**

React escapes interpolated values by default, and the codebase contains **no**
`dangerouslySetInnerHTML`. AI-generated markdown is parsed and rendered through a
component that builds React elements rather than injecting HTML — the one place where
an HTML sink would have been the convenient choice.

## 16. Restrict file uploads — **Done**

Four layers on every upload route:

1. Size and count capped by multer (10 MB, one file) before the body is buffered.
2. A per-route `fileFilter` allowlisting declared MIME types — images only for logos,
   covers and team photos; images or PDF for legal documents.
3. **Magic-number verification** (`lib/fileType.ts`): the actual leading bytes must
   match the declared type. A declared MIME is attacker-controlled and proves nothing,
   so this is the layer that does the real work. Signatures are matched strictly at
   offset 0, which rejects polyglot files that are valid as two formats at once.
4. Uploads are throttled per account so one user cannot burn the shared Cloudinary
   quota.

Files are buffered in memory and streamed straight to Cloudinary — nothing is written
to disk, so there is no upload directory to traverse into or serve from.

## 17. Trim API responses — **Done**

`toPublicUser` is the single chokepoint every user-bearing response passes through, so
`passwordHash` cannot leak by someone forgetting to omit it at a call site.

Beyond that, responses are trimmed by *who is asking*, not just by shape.
`getApplication` filters internal funder comments and unshared reviewer scores out of
the payload sent to an applicant:

```ts
const visibleComments = row.comments.filter(
  (comment) => isFunder || isAdmin || !comment.internal,
);
const visibleReviews = isFunder || isAdmin ? row.reviews : [];
```

Filtering on the server rather than hiding in the UI is the same rule as donor
anonymity: what is never sent cannot leak.

## 18. Add security headers — **Done**

**API** (`middleware/securityHeaders.ts`, mounted above the router stack so the 404 and
error paths carry them too): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: no-referrer`, a `Permissions-Policy` that gives up camera, microphone
and geolocation, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`, and a CSP
suited to a pure JSON API (`default-src 'none'; frame-ancestors 'none'; base-uri
'none'`). `x-powered-by` is disabled.

**Web** (`render.yaml`, on the static site that serves the document): a full CSP plus
`X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` and HSTS.

The web CSP allows the single inline script in `index.html` — the pre-paint theme
switch that prevents a white flash for dark-mode users — **by SHA-256 hash rather than
`'unsafe-inline'`**. Every source in the policy was derived from what the app actually
loads and then verified against a real build served with that exact header. That
testing caught a genuine bug: Fontsource inlines small font subsets as `data:` URIs, so
`font-src 'self'` alone silently blocked the display typeface.

`style-src` does retain `'unsafe-inline'`, and that is unavoidable: React renders
`style={{…}}` props as inline style attributes and GSAP writes transforms the same way.
It is also the least dangerous inline allowance, since a style cannot execute script.

**Maintenance note:** editing that inline script by even one character invalidates the
hash, and the browser will then block it — the app still works, but dark mode flashes
white on first load, and nothing fails loudly. `render.yaml` carries the command to
regenerate the hash, including the newline normalisation needed to make it match on a
Windows checkout.

## 19. Force HTTPS — **Done**

`middleware/forceHttps.ts`, production only. TLS terminates at Render's edge, so
`req.protocol` would read "http" for everyone; the honest signal is
`x-forwarded-proto`, read as the first value in the chain.

Three details that each prevent a specific failure:

- **Only GET/HEAD are redirected.** A 301 on a POST lets the client drop the body (most
  downgrade the method to GET outright), which would deliver an empty request to the
  https endpoint — a donation form that silently submits nothing, and a payment webhook
  whose signed body vanishes so the signature check fails and the donation is never
  recorded. Non-safe methods over http get a 403 instead, so the client can retry with
  its body intact.
- **The health check is exempt.** Render probes `/api/health` from inside the private
  network with no `x-forwarded-proto`; answering that with a redirect would mark every
  deploy unhealthy and roll it back.
- **The `Host` header is validated** before being interpolated into the redirect target,
  because `Host` is client-supplied and blindly trusting it builds an open redirect.

HSTS is set for two years with `includeSubDomains`, in production only — sending it in
development would pin `localhost` to https in the developer's browser, which is
genuinely painful to undo.

## 20. Scan dependencies — **Done**

- **Dependabot** opens weekly PRs for npm and GitHub Actions.
- **CI** runs `pnpm audit --audit-level high` as a blocking job.

The gate currently passes. It did not at first: two high advisories were open —
`nanoid` (GHSA-2v37-7h3g-55p8, reached through postcss) and `deepmerge-ts`
(GHSA-ggr8-5vv4-36mx, reached through `@prisma/config`). Both are build-time only and
neither is reachable from the running API or the shipped browser bundle, so the easy
move would have been to lower the threshold. They are instead pinned to patched
versions via `overrides` in `pnpm-workspace.yaml`, and the build and migration jobs
prove the `deepmerge-ts` major bump is safe.

The threshold is `high` rather than `moderate` because three moderate advisories remain
open against dev-only tooling with no patch published, and a gate that is red on every
unrelated pull request is a gate people learn to ignore. It should be raised once those
have fixes.

---

## Reporting

This is a portfolio project, not a service holding anyone's money. If you find something
wrong with it, please open an issue.

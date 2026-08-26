import crypto from "node:crypto";
import type { AiInsightKind } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { ai } from "../ai/index.js";
import { env } from "../config/env.js";
import { HttpError } from "../middleware/errorHandler.js";

/**
 * AI assistance.
 *
 * ── Two rules this file follows throughout ───────────────────────────────────
 *
 * 1. The model ADVISES, it never decides. Nothing here writes a status, an
 *    award, or a verification flag. A funder reads a summary and then makes the
 *    call themselves through the state machine. An LLM in the approval path
 *    would be both unaccountable and, for grant money, indefensible.
 *
 * 2. Results are cached against a hash of their input. Generation is slow and
 *    quota-limited, so the same funder reopening the same application reuses
 *    the previous result — but editing the proposal changes the hash and
 *    regenerates, so a cached answer can never describe stale content.
 */

/** Stable digest of whatever text a result was derived from. */
function hashInput(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/**
 * Return a cached insight if one exists for this exact input, otherwise
 * generate, store and return a fresh one.
 */
async function cached(
  kind: AiInsightKind,
  targetType: string,
  targetId: string,
  source: string,
  generate: () => Promise<string>,
): Promise<{ content: string; cached: boolean; generatedAt: string }> {
  const inputHash = hashInput(source);

  const existing = await prisma.aiInsight.findUnique({
    where: { targetType_targetId_kind: { targetType, targetId, kind } },
  });

  if (existing && existing.inputHash === inputHash) {
    return {
      content: existing.content,
      cached: true,
      generatedAt: existing.createdAt.toISOString(),
    };
  }

  const content = await generate();

  /*
   * Upsert rather than create: a stale row for this target already exists
   * whenever the source text changed, and the unique constraint is on the
   * target, not the hash.
   */
  const saved = await prisma.aiInsight.upsert({
    where: { targetType_targetId_kind: { targetType, targetId, kind } },
    create: {
      kind,
      targetType,
      targetId,
      inputHash,
      content,
      model: env.GEMINI_MODEL,
    },
    update: {
      inputHash,
      content,
      model: env.GEMINI_MODEL,
      createdAt: new Date(),
    },
  });

  return {
    content: saved.content,
    cached: false,
    generatedAt: saved.createdAt.toISOString(),
  };
}

/** Fail early and clearly when no key is configured. */
function requireAi(): void {
  if (!ai.isAvailable) {
    throw new HttpError(
      503,
      "AI assistance is not configured on this server.",
    );
  }
}

/**
 * Load an application the caller is entitled to, plus everything the model
 * needs. Access is resolved from ownership, exactly like applicationService —
 * an AI endpoint must not become a way around the normal permission checks.
 */
async function loadApplicationFor(
  userId: string,
  applicationId: string,
  side: "FUNDER" | "NGO",
) {
  const application = await prisma.grantApplication.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      status: true,
      requestedAmountMinor: true,
      proposal: true,
      organizationId: true,
      organization: {
        select: {
          name: true,
          mission: true,
          city: true,
          state: true,
          foundedYear: true,
          verified: true,
          totalRaisedMinor: true,
          categories: { select: { name: true } },
        },
      },
      grant: {
        select: {
          funderId: true,
          title: true,
          summary: true,
          amountMinor: true,
          maxAwardMinor: true,
          questions: true,
          eligibility: true,
        },
      },
    },
  });

  if (!application) throw new HttpError(404, "Application not found");

  if (side === "FUNDER") {
    if (application.grant.funderId !== userId) {
      throw new HttpError(404, "Application not found");
    }
  } else {
    const organization = await prisma.organization.findUnique({
      where: { ownerId: userId },
      select: { id: true },
    });

    if (organization?.id !== application.organizationId) {
      throw new HttpError(404, "Application not found");
    }
  }

  return application;
}

/** Flatten an application into the text the model reasons over. */
function describeApplication(application: {
  requestedAmountMinor: number;
  proposal: unknown;
  organization: {
    name: string;
    mission: string;
    city: string | null;
    state: string | null;
    foundedYear: number | null;
    verified: boolean;
    totalRaisedMinor: number;
    categories: Array<{ name: string }>;
  };
  grant: {
    title: string;
    summary: string;
    amountMinor: number;
    maxAwardMinor: number | null;
    questions: unknown;
  };
}): string {
  const proposal = application.proposal as
    | { pitch?: string; answers?: string[] }
    | null;

  const questions = Array.isArray(application.grant.questions)
    ? (application.grant.questions as string[])
    : [];

  const answers = questions
    .map(
      (question, index) =>
        `Q: ${question}\nA: ${proposal?.answers?.[index]?.trim() || "(left blank)"}`,
    )
    .join("\n\n");

  const org = application.organization;

  return [
    `GRANT: ${application.grant.title}`,
    `Grant purpose: ${application.grant.summary}`,
    `Total fund: ₹${application.grant.amountMinor / 100}`,
    application.grant.maxAwardMinor
      ? `Maximum per award: ₹${application.grant.maxAwardMinor / 100}`
      : "No per-award cap.",
    "",
    `APPLICANT: ${org.name}`,
    `Mission: ${org.mission}`,
    `Causes: ${org.categories.map((c) => c.name).join(", ") || "none listed"}`,
    `Location: ${[org.city, org.state].filter(Boolean).join(", ") || "not stated"}`,
    `Founded: ${org.foundedYear ?? "not stated"}`,
    `Verified on platform: ${org.verified ? "yes" : "no"}`,
    `Raised to date through the platform: ₹${org.totalRaisedMinor / 100}`,
    "",
    `AMOUNT REQUESTED: ₹${application.requestedAmountMinor / 100}`,
    "",
    "PROPOSAL:",
    proposal?.pitch?.trim() || "(no proposal text)",
    "",
    answers ? `ANSWERS TO THE FUNDER'S QUESTIONS:\n\n${answers}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/* ── 1. Summarise an application (funder side) ────────────────────────────── */

export async function summariseApplication(
  funderId: string,
  applicationId: string,
) {
  requireAi();

  const application = await loadApplicationFor(
    funderId,
    applicationId,
    "FUNDER",
  );

  const source = describeApplication(application);

  return cached(
    "APPLICATION_SUMMARY",
    "GrantApplication",
    applicationId,
    source,
    () =>
      ai.complete({
        system:
          "You help grant reviewers at a nonprofit funding platform read applications faster. " +
          "Be concise, concrete and neutral. Never invent facts that are not in the application — " +
          "if something important is missing, say it is missing rather than guessing. " +
          "You are summarising for a human who will make the funding decision; do not recommend " +
          "approving or rejecting.",
        prompt:
          "Summarise this grant application in markdown, using exactly these sections:\n\n" +
          "**What they want to do** — two or three sentences.\n" +
          "**Fit with the grant** — how well the applicant matches what this grant funds.\n" +
          "**Notable strengths** — up to three bullets.\n" +
          "**Open questions** — up to three bullets a reviewer should ask before deciding.\n\n" +
          "Keep the whole thing under 250 words.\n\n" +
          `---\n\n${source}`,
        maxOutputTokens: 2500,
      }),
  );
}

/* ── 2. Pre-submission check (NGO side) ───────────────────────────────────── */

export async function reviewOwnApplication(
  userId: string,
  applicationId: string,
) {
  requireAi();

  const application = await loadApplicationFor(userId, applicationId, "NGO");
  const source = describeApplication(application);

  return cached(
    "APPLICATION_REVIEW",
    "GrantApplication",
    applicationId,
    source,
    () =>
      ai.complete({
        system:
          "You help small nonprofits strengthen grant applications before they submit. " +
          "Be specific and practical, never generic. Point at the actual text. " +
          "Be encouraging but honest — a vague 'looks good' helps nobody. " +
          "Never write the application for them; tell them what to address.",
        prompt:
          "Review this draft grant application and reply in markdown with exactly:\n\n" +
          "**Missing information** — anything a funder would expect that is absent " +
          "(unanswered questions, no numbers, no timeline, no budget detail). " +
          "If nothing is missing, say so plainly.\n" +
          "**Weakest part** — the single section most likely to cost them the grant, and why.\n" +
          "**Three specific improvements** — numbered, each actionable in one sitting.\n\n" +
          "Under 250 words.\n\n" +
          `---\n\n${source}`,
        maxOutputTokens: 2500,
      }),
  );
}

/* ── 3. Match open grants to an organisation (NGO side) ───────────────────── */

const MATCH_SCHEMA_HINT = `{
  "matches": [
    { "grantId": "string", "score": 0-100, "reason": "one sentence, max 25 words" }
  ]
}`;

/**
 * A single line of the fit checklist shown against a recommended grant.
 *
 * `fail` means the SERVER would reject an application on this ground — these
 * are the same three rules `assertEligible` enforces in applicationService, read
 * from the same two sources (the grant's `eligibility` JSON and the
 * organisation's own record). `info` is context that cannot block anything.
 */
export type MatchCheck = {
  label: string;
  status: "pass" | "fail" | "info";
  detail: string;
};

/**
 * Build the checklist for one grant/organisation pair.
 *
 * This exists because the model returns only `{ grantId, score, reason }` — a
 * number and a sentence. An NGO reading "84/100" reasonably wants to know what
 * that is made of, and the tempting answer is to ask the model for a breakdown.
 * That would be a fabrication dressed as a check: the model does not evaluate
 * rules, it predicts text, and a confident "✓ Location: eligible" that turns
 * into a 403 on submission is worse than no checklist at all.
 *
 * So none of this comes from the model. Every line is computed here, from data
 * the server already holds, and mirrors the enforcement path exactly — right
 * down to treating a missing founding year as zero years rather than as
 * unknown, which is what `assertEligible` does.
 */
export function buildMatchChecks(
  grant: {
    eligibility: unknown;
    deadline: Date;
    amountMinor: number;
    maxAwardMinor: number | null;
    categories: { name: string }[];
  },
  organization: {
    verified: boolean;
    foundedYear: number | null;
    state: string | null;
    categories: { name: string }[];
  },
): { checks: MatchCheck[]; eligible: boolean } {
  const rules =
    grant.eligibility && typeof grant.eligibility === "object"
      ? (grant.eligibility as {
          verifiedOnly?: boolean;
          minYearsActive?: number;
          states?: string[];
        })
      : {};

  const checks: MatchCheck[] = [];

  /* ── Cause overlap. Not an enforced rule, so it can never be a `fail` ── */
  const orgCauses = new Set(organization.categories.map((c) => c.name));
  const shared = grant.categories
    .map((c) => c.name)
    .filter((name) => orgCauses.has(name));

  checks.push(
    shared.length > 0
      ? {
          label: "Cause",
          status: "pass",
          detail: `You both work on ${shared.join(", ")}.`,
        }
      : {
          label: "Cause",
          status: "info",
          detail:
            `This grant is listed under ${
              grant.categories.map((c) => c.name).join(", ") || "no cause"
            }; your profile lists ${
              organization.categories.map((c) => c.name).join(", ") || "none"
            }. Funders often still consider related work.`,
        },
  );

  /* ── Verification — enforced ─────────────────────────────────────────── */
  if (rules.verifiedOnly) {
    checks.push(
      organization.verified
        ? {
            label: "Verification",
            status: "pass",
            detail: "Verified-only grant, and your organisation is verified.",
          }
        : {
            label: "Verification",
            status: "fail",
            detail:
              "This grant is open to verified organisations only. Complete verification before applying.",
          },
    );
  } else {
    checks.push({
      label: "Verification",
      status: "info",
      detail: "This grant does not require a verified organisation.",
    });
  }

  /* ── Operating history — enforced ────────────────────────────────────── */
  if (rules.minYearsActive && rules.minYearsActive > 0) {
    // Deliberately identical to assertEligible: no founding year counts as 0.
    const years = organization.foundedYear
      ? new Date().getFullYear() - organization.foundedYear
      : 0;

    checks.push(
      years >= rules.minYearsActive
        ? {
            label: "Years active",
            status: "pass",
            detail: `Requires ${rules.minYearsActive}+ years; your profile shows ${years}.`,
          }
        : {
            label: "Years active",
            status: "fail",
            detail: organization.foundedYear
              ? `Requires ${rules.minYearsActive}+ years; your profile shows ${years}.`
              : `Requires ${rules.minYearsActive}+ years, and your profile has no founding year — which counts as zero.`,
          },
    );
  }

  /* ── Location — enforced ─────────────────────────────────────────────── */
  if (rules.states && rules.states.length > 0) {
    const permitted = Boolean(
      organization.state && rules.states.includes(organization.state),
    );

    checks.push(
      permitted
        ? {
            label: "Location",
            status: "pass",
            detail: `Open to ${rules.states.join(", ")}, and you are in ${organization.state}.`,
          }
        : {
            label: "Location",
            status: "fail",
            detail: organization.state
              ? `Limited to ${rules.states.join(", ")}; your profile says ${organization.state}.`
              : `Limited to ${rules.states.join(", ")}; your profile has no state set.`,
          },
    );
  }

  /* ── Deadline and ceiling — facts, not rules ─────────────────────────── */
  const daysLeft = Math.ceil(
    (grant.deadline.getTime() - Date.now()) / 86_400_000,
  );
  checks.push({
    label: "Deadline",
    status: "info",
    detail:
      daysLeft <= 0
        ? "Closes today."
        : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left to apply.`,
  });

  const cap = grant.maxAwardMinor ?? grant.amountMinor;
  checks.push({
    label: "Most you can request",
    status: "info",
    detail: `₹${(cap / 100).toLocaleString("en-IN")}${
      grant.maxAwardMinor ? " per award" : " (the whole fund)"
    }.`,
  });

  return {
    checks,
    eligible: checks.every((check) => check.status !== "fail"),
  };
}

export async function matchGrantsForOrganization(userId: string) {
  requireAi();

  const organization = await prisma.organization.findUnique({
    where: { ownerId: userId },
    select: {
      id: true,
      name: true,
      mission: true,
      description: true,
      state: true,
      foundedYear: true,
      verified: true,
      status: true,
      categories: { select: { name: true } },
    },
  });

  if (!organization) {
    throw new HttpError(404, "You don't have an organisation profile yet.");
  }

  if (organization.status === "SUSPENDED") {
    throw new HttpError(
      403,
      "Your organisation has been suspended. Contact support.",
    );
  }

  const grants = await prisma.grant.findMany({
    where: { status: "OPEN", deadline: { gte: new Date() } },
    orderBy: { deadline: "asc" },
    // Bounded so one call can't send an unbounded prompt as the platform grows.
    take: 20,
    select: {
      id: true,
      slug: true,
      title: true,
      summary: true,
      amountMinor: true,
      maxAwardMinor: true,
      deadline: true,
      eligibility: true,
      categories: { select: { name: true } },
    },
  });

  if (grants.length === 0) {
    return { matches: [], cached: false, generatedAt: new Date().toISOString() };
  }

  const grantList = grants
    .map(
      (grant) =>
        `id: ${grant.id}\n` +
        `title: ${grant.title}\n` +
        `about: ${grant.summary}\n` +
        `causes: ${grant.categories.map((c) => c.name).join(", ") || "any"}\n` +
        `fund: ₹${grant.amountMinor / 100}` +
        (grant.maxAwardMinor
          ? `, max per award ₹${grant.maxAwardMinor / 100}`
          : "") +
        `\ncloses: ${grant.deadline.toISOString().slice(0, 10)}`,
    )
    .join("\n\n");

  const profile =
    `name: ${organization.name}\n` +
    `mission: ${organization.mission}\n` +
    `about: ${organization.description ?? "not provided"}\n` +
    `causes: ${organization.categories.map((c) => c.name).join(", ") || "none listed"}\n` +
    `state: ${organization.state ?? "not stated"}\n` +
    `founded: ${organization.foundedYear ?? "not stated"}\n` +
    `verified: ${organization.verified ? "yes" : "no"}`;

  const source = `${profile}\n\n===\n\n${grantList}`;

  const result = await cached(
    "GRANT_MATCH",
    "Organization",
    organization.id,
    source,
    () =>
      ai.completeJson({
        system:
          "You match nonprofits to grant opportunities. Judge fit on cause overlap, " +
          "eligibility and the organisation's stated work. Only include grants that are a " +
          "genuine fit — returning fewer, better matches is far more useful than ranking " +
          "everything. Never invent a grantId; use only the ids given.",
        prompt:
          "Here is a nonprofit's profile, then a list of open grants. " +
          "Return at most 5 grants that genuinely suit this organisation, best first. " +
          "Score 0-100 for fit, and give a one-sentence reason naming the specific overlap.\n\n" +
          `NONPROFIT:\n${profile}\n\nOPEN GRANTS:\n\n${grantList}`,
        schemaHint: MATCH_SCHEMA_HINT,
        maxOutputTokens: 3000,
        temperature: 0.1,
      }),
  );

  /*
   * The model's output is untrusted. Ids are re-resolved against the grants we
   * actually queried, so a hallucinated or stale id is dropped rather than
   * surfacing as a broken card — and the title/amount the user sees comes from
   * the database, never from the model.
   */
  const byId = new Map(grants.map((grant) => [grant.id, grant]));

  let parsed: { matches?: Array<{ grantId?: string; score?: number; reason?: string }> };

  try {
    parsed = JSON.parse(result.content);
  } catch {
    throw new HttpError(502, "The AI returned an unreadable response.");
  }

  const matches = (parsed.matches ?? [])
    .map((match) => {
      const grant = match.grantId ? byId.get(match.grantId) : undefined;
      if (!grant) return null;

      /*
       * The checklist is computed here, from the database, NOT asked of the
       * model — see `buildMatchChecks`. It is also computed outside the cache,
       * so a cached recommendation still gets today's deadline count and
       * today's verification state.
       */
      const { checks, eligible } = buildMatchChecks(grant, organization);

      return {
        grantId: grant.id,
        /*
         * Title, slug and amount come from the DATABASE row, never from the
         * model's reply. The model only contributes the score and the reason;
         * everything the user sees as fact is ours. It also means the client
         * can render a match that isn't on its current filtered page.
         */
        slug: grant.slug,
        title: grant.title,
        amountMinor: grant.amountMinor,
        deadline: grant.deadline.toISOString(),
        score: Math.max(0, Math.min(100, Math.round(match.score ?? 0))),
        reason: String(match.reason ?? "").slice(0, 200),
        checks,
        eligible,
      };
    })
    .filter((m): m is NonNullable<typeof m> => m !== null)
    .slice(0, 5);

  return {
    matches,
    cached: result.cached,
    generatedAt: result.generatedAt,
  };
}

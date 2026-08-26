import type { GrantEligibility } from "@impactbridge/shared";
import { Alert } from "@/components/ui/Alert";

interface Applicant {
  verified: boolean;
  foundedYear: number | null;
  state: string | null;
}

/**
 * Mirrors `assertEligible` in `apps/api/src/services/applicationService.ts`.
 *
 * These three rules — verified-only, minimum years active, permitted states —
 * are enforced server-side and rejected with a 403. The server remains the
 * authority; this only reads the same inputs so the applicant learns they don't
 * qualify BEFORE writing a proposal, rather than after.
 *
 * Kept as a pure function so the wording of each reason stays close to the
 * server's own message.
 */
export function eligibilityFailures(
  eligibility: GrantEligibility | null,
  applicant: Applicant | undefined,
): string[] {
  if (!eligibility || !applicant) return [];

  const reasons: string[] = [];

  if (eligibility.verifiedOnly && !applicant.verified) {
    reasons.push("This grant is open to verified organisations only.");
  }

  if (eligibility.minYearsActive && eligibility.minYearsActive > 0) {
    // Matches the server exactly, including treating a missing founding year
    // as zero years rather than as unknown.
    const years = applicant.foundedYear
      ? new Date().getFullYear() - applicant.foundedYear
      : 0;
    if (years < eligibility.minYearsActive) {
      reasons.push(
        `This grant requires at least ${eligibility.minYearsActive} years of operating history${
          applicant.foundedYear ? ` — your profile shows ${years}.` : "."
        }`,
      );
    }
  }

  if (eligibility.states.length > 0) {
    if (!applicant.state || !eligibility.states.includes(applicant.state)) {
      reasons.push(
        `This grant is limited to organisations in: ${eligibility.states.join(", ")}.`,
      );
    }
  }

  return reasons;
}

export function EligibilityNotice({ reasons }: { reasons: string[] }) {
  if (reasons.length === 0) return null;

  return (
    <Alert variant="error">
      <p className="font-semibold">
        Your organisation doesn&rsquo;t meet this grant&rsquo;s requirements
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-4 text-sm leading-relaxed">
        {reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
      <p className="mt-2 text-sm leading-relaxed">
        You can still write and save a draft, but the funder will reject a
        submission on these grounds. Check your organisation profile if any of
        this looks out of date.
      </p>
    </Alert>
  );
}

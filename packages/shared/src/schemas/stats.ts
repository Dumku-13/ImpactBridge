import { z } from "zod";

/**
 * Public platform totals.
 *
 * Every field here is directly derivable from a row count or a sum — nothing is
 * modelled, estimated, or extrapolated. That constraint is deliberate and it
 * excluded the figures a marketing page would most like to show:
 *
 *  - "people reached" is impossible. `ImpactMetric.value` is a free-form STRING
 *    ("146,000", "2 in 3", "98%"), authored by each nonprofit, so it cannot be
 *    summed across organisations under any interpretation.
 *  - a funding split by cause is impossible. Donations carry no category, and
 *    an organisation may hold up to six, so every slice would receive the whole
 *    total and the parts would exceed the whole.
 *
 * On a platform whose entire pitch is traceable money, a number nobody can
 * derive is worse than no number at all.
 */
export const publicStatsSchema = z.object({
  /** Organisations with status ACTIVE — i.e. publicly listed. */
  organizations: z.number(),
  verifiedOrganizations: z.number(),
  /** Grants currently OPEN with a deadline still in the future. */
  openGrants: z.number(),
  /** Sum of SUCCEEDED donations, in minor units. */
  totalRaisedMinor: z.number(),
  /** Distinct non-empty `state` values across active organisations. */
  states: z.number(),
  currency: z.string(),
});

export type PublicStats = z.infer<typeof publicStatsSchema>;

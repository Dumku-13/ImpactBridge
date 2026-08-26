import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Bell, Bookmark } from "lucide-react";
import {
  formatMoney,
  formatMoneyCompact,
  fundingProgress,
} from "@impactbridge/shared";
import {
  useOrganization,
  useToggleBookmark,
  useToggleFollow,
} from "@/api/organizations";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Skeleton } from "@/components/ui/Skeleton";
import { Alert } from "@/components/ui/Alert";
import { Reveal } from "@/components/ui/Reveal";
import { DonateCard } from "@/components/donations/DonateCard";
import { VerificationPanel } from "@/components/organizations/VerificationPanel";
import { OrgOpening } from "@/components/organizations/OrgOpening";
import { OrgGallery } from "@/components/organizations/OrgGallery";
import { useScrollTriggerRefresh } from "@/lib/gsap";
import { cn } from "@/lib/utils";

/**
 * An organisation's public profile, told as a documentary rather than listed
 * as a record.
 *
 * The old page was a cover strip, a heading, and five equal-weight card grids —
 * metrics, team, about, gallery — each announced by an identical grey label.
 * Everything was present and nothing was said. This version gives the page an
 * order: who they are (the opening plate), what they do, what it looks like,
 * what they claim, and who is accountable for it — numbered chapters, each at a
 * different scale, with the donate path held in view the entire way down.
 *
 * The content is unchanged: every field rendered here was already on the wire.
 * What changed is which of it is allowed to be large.
 */

/** Chapter heading device: a number, a rule, and a label at small caps. */
function Chapter({
  index,
  label,
  children,
}: {
  index: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <section>
      <Reveal>
        <div className="flex items-baseline gap-3 border-t border-border pt-4">
          <span className="tnum font-grotesk text-sm font-bold text-primary">
            {index}
          </span>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {label}
          </h2>
        </div>
      </Reveal>
      <div className="mt-8">{children}</div>
    </section>
  );
}

export function OrganizationProfilePage() {
  const { slug = "" } = useParams();
  const { user } = useAuth();
  const { data: org, isPending, isError, error } = useOrganization(slug);

  const toggleBookmark = useToggleBookmark();
  const toggleFollow = useToggleFollow();

  /*
   * The opening plate's parallax ranges are measured at mount, before the cover
   * photograph has an intrinsic size and before the web fonts swap in. Both
   * change document height, and a range computed against the wrong height
   * collapses to zero or goes negative — the scrub then never advances.
   */
  useScrollTriggerRefresh();

  const isDonor = user?.role === "DONOR";

  if (isPending) return <ProfileSkeleton />;

  if (isError || !org) {
    return (
      <div className="mx-auto max-w-2xl py-12">
        <Alert variant="error">
          {error instanceof Error
            ? error.message
            : "This organisation could not be found."}
        </Alert>
        <Link
          to="/browse"
          className="mt-4 inline-flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to browse
        </Link>
      </div>
    );
  }

  const progress = fundingProgress(org.totalRaisedMinor, org.fundingGoalMinor);

  return (
    <div className="pb-20">
      <Link
        to="/browse"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to browse
      </Link>

      <OrgOpening org={org} />

      <div className="grid gap-14 pt-16 lg:grid-cols-[1fr_360px] lg:gap-12">
        {/*
          Deliberately FIRST in the DOM, and moved to the second column at `lg`
          with `order`.

          Written the other way round — main column first, `order-first` on the
          aside for small screens — it looked identical and was wrong: CSS
          `order` moves pixels, not the accessibility tree or the tab sequence,
          so a keyboard or screen-reader user still met the donate form last,
          after four chapters. This way the visual order, the reading order and
          the tab order all agree at every width.

          It matters because of where this sat before: on a 375px screen the
          donate card began at 4341px of a 4654px page — a phone donor had to
          scroll past the entire profile to reach the one control the page
          exists for.
        */}
        <aside className="space-y-4 lg:order-2 lg:sticky lg:top-24 lg:self-start">
          <div className="border-t border-border pt-4">
            <p
              className="tnum font-grotesk text-3xl font-extrabold leading-none tracking-[-0.02em] text-foreground"
              style={{ fontStretch: "88%" }}
            >
              {formatMoney(org.totalRaisedMinor, org.currency)}
            </p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              raised of {formatMoneyCompact(org.fundingGoalMinor, org.currency)}{" "}
              goal
            </p>

            <ProgressBar
              value={progress}
              className="mt-3"
              label={`${org.name} funding progress`}
            />
            <p className="tnum mt-2 text-xs text-muted-foreground">
              {progress}% funded · {org.donorCount.toLocaleString("en-IN")}{" "}
              donors
            </p>
          </div>

          <DonateCard organization={org} />

          <VerificationPanel verified={org.verified} verifiedAt={org.verifiedAt} />

          {isDonor && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                fullWidth
                onClick={() => toggleBookmark.mutate(org.id)}
                aria-pressed={org.isBookmarked}
              >
                <Bookmark
                  className={cn(
                    "h-4 w-4",
                    org.isBookmarked && "fill-primary text-primary",
                  )}
                />
                {org.isBookmarked ? "Saved" : "Save"}
              </Button>
              <Button
                variant="outline"
                fullWidth
                onClick={() => toggleFollow.mutate(org.id)}
                aria-pressed={org.isFollowing}
              >
                <Bell
                  className={cn(
                    "h-4 w-4",
                    org.isFollowing && "fill-primary text-primary",
                  )}
                />
                {org.isFollowing ? "Following" : "Follow"}
              </Button>
            </div>
          )}
        </aside>
        {/* ── The account ──────────────────────────────────────────────── */}
        <div className="min-w-0 space-y-16 lg:order-1">
          {org.description && (
            <Chapter index="01" label="The work">
              <Reveal>
                {/*
                  Set at reading scale on a measure of roughly 68 characters.
                  The old page ran this at 16px across the full column width,
                  which is around 110 characters — past the point where the eye
                  reliably finds the start of the next line.
                */}
                <p className="max-w-[38rem] whitespace-pre-line font-display text-lg leading-[1.7] text-foreground sm:text-xl">
                  {org.description}
                </p>
              </Reveal>
            </Chapter>
          )}

          {org.gallery.length > 0 && (
            <Chapter index="02" label="From their work">
              <OrgGallery images={org.gallery} />
            </Chapter>
          )}

          {org.impactMetrics.length > 0 && (
            <Chapter index="03" label={`What ${org.name} reports`}>
              {/*
                `ImpactMetric.value` is a free-form STRING the nonprofit writes
                itself ("146,000", "2 in 3", "98%"). It is not summable and the
                platform has not audited it, so it is attributed to them in
                plain words instead of being dressed up as a platform figure.
                See HANDOFF §3.7.
              */}
              <dl className="grid gap-x-10 gap-y-10 sm:grid-cols-2">
                {org.impactMetrics.map((metric, i) => (
                  <Reveal key={metric.id} delay={i * 80}>
                    <dd
                      className="tnum font-grotesk text-5xl font-extrabold leading-none tracking-[-0.03em] text-foreground sm:text-6xl"
                      style={{ fontStretch: "86%" }}
                    >
                      {metric.value}
                    </dd>
                    <dt className="mt-3 text-sm leading-relaxed text-muted-foreground">
                      {metric.label}
                      {metric.unit ? ` (${metric.unit})` : ""}
                    </dt>
                  </Reveal>
                ))}
              </dl>
              <p className="mt-8 max-w-[38rem] text-xs leading-relaxed text-muted-foreground">
                These figures are published by the organisation. ImpactBridge
                verifies who they are and that donations reach them — it does
                not audit what they report.
              </p>
            </Chapter>
          )}

          {org.teamMembers.length > 0 && (
            <Chapter index="04" label="Who is accountable">
              <ul className="divide-y divide-border border-y border-border">
                {org.teamMembers.map((member) => (
                  <li
                    key={member.id}
                    className="flex items-start gap-5 py-6 first:pt-0 last:pb-0"
                  >
                    {member.photoUrl ? (
                      <img
                        src={member.photoUrl}
                        alt={member.name}
                        loading="lazy"
                        className="h-16 w-16 shrink-0 object-cover grayscale"
                      />
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center bg-secondary font-grotesk text-lg font-bold text-muted-foreground">
                        {member.name
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((p) => p[0]?.toUpperCase() ?? "")
                          .join("")}
                      </div>
                    )}

                    <div className="min-w-0">
                      <p
                        className="font-display text-xl font-semibold text-foreground"
                        style={{ fontVariationSettings: '"SOFT" 12' }}
                      >
                        {member.linkedinUrl ? (
                          <a
                            href={member.linkedinUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-primary hover:underline"
                          >
                            {member.name}
                          </a>
                        ) : (
                          member.name
                        )}
                      </p>
                      <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                        {member.role}
                      </p>
                      {member.bio && (
                        <p className="mt-2 max-w-[34rem] text-sm leading-relaxed text-muted-foreground">
                          {member.bio}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Chapter>
          )}
        </div>

        {/* ── The donate path ──────────────────────────────────────────── */}
        {/*
          Sticky for the whole descent. The opening plate carries the same
          figures, but they scroll away — and a donor who has just read the
          team's bios should not have to scroll back up to act.
        */}
      </div>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-5 w-32" />
      {/* Matches the opening plate's real footprint, so confirmation of load
          doesn't move the page under the reader. */}
      <Skeleton className="h-[72svh] w-full" />
      <div className="grid gap-12 pt-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-2/3" />
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    </div>
  );
}

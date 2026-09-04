import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { formatMoney } from "@impactbridge/shared";
import type { Donation } from "@impactbridge/shared";
import { useOrganization } from "@/api/organizations";
import { causes, editorial, type MediaAsset } from "@/content/media";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Cause slug → art-directed photograph.
 *
 * The organisations DO carry a `coverUrl`, and it is deliberately not used
 * here: every seeded one is a remote Unsplash stock URL, which is precisely the
 * generic placeholder this section exists to avoid. The local library is
 * art-directed to the rest of the site, ships from our own origin, and is the
 * only imagery on the platform that looks like the platform.
 */
const CAUSE_IMAGE: Record<string, MediaAsset> = {
  education: causes.education,
  healthcare: causes.healthcare,
  "women-empowerment": causes.womenEmpowerment,
  environment: causes.environment,
  animals: causes.animals,
  "disaster-relief": causes.disasterRelief,
};

/**
 * One contribution, given room.
 *
 * ── Which contribution ─────────────────────────────────────────────────────
 *
 * The most recent one. The tempting choice is "the organisation you have given
 * most to", and it is not available: the donations endpoint is paginated ten at
 * a time, so a total per organisation computed here would be a total across the
 * most recent ten donations of eighty-one, presented as though it were a
 * lifetime figure. Most-recent is the one selection this page can make and
 * label truthfully.
 *
 * ── Why the photograph is not the organisation's own ───────────────────────
 *
 * See `CAUSE_IMAGE`.
 *
 * ── Sizing ─────────────────────────────────────────────────────────────────
 *
 * `content/media.ts` records a real pixel width per asset because the library
 * spans 1600px down to 414px, and it warns that a small asset rendered
 * full-bleed looks broken. The cause stills run 480–1024px, so the panel is
 * capped at the chosen asset's own width rather than stretched to the column.
 */
export function ImpactStory({
  donations,
  isPending,
}: {
  donations: Donation[] | undefined;
  isPending: boolean;
}) {
  const mediaRef = useRef<HTMLDivElement>(null);

  /*
   * The most recent SUCCEEDED donation. A pending or failed payment has not
   * funded anything yet, and presenting one as impact would be a lie the
   * receipt could disprove.
   */
  const contribution = donations?.find((d) => d.status === "SUCCEEDED");
  const slug = contribution?.organization.slug;

  // `useOrganization` is disabled until there is a slug, so this costs nothing
  // for a donor with no completed contributions.
  const { data: organization } = useOrganization(slug ?? "");

  const category = organization?.categories[0];
  const image =
    (category ? CAUSE_IMAGE[category.slug] : undefined) ?? editorial.ngoCommunity;

  /*
   * A slow scale as the panel crosses the viewport. Same scrub treatment the
   * Browse opening already uses, rather than a new mechanism: it is proven on
   * this site, it is compositor-only, and one scrubbed image is the single
   * piece of scroll choreography this section needs.
   */
  useEffect(() => {
    const node = mediaRef.current;
    if (!node || prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        node,
        { scale: 1.06 },
        {
          scale: 1,
          ease: "none",
          scrollTrigger: {
            trigger: node,
            start: "top bottom",
            end: "bottom top",
            scrub: 0.6,
          },
        },
      );
    });

    return () => ctx.revert();
  }, [image.src]);

  if (isPending) {
    return (
      <section className="border-b border-border py-14">
        <Skeleton className="h-3 w-40" />
        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Skeleton className="aspect-[4/3] w-full rounded-sm" />
          <div className="space-y-4">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        </div>
      </section>
    );
  }

  // Nothing completed yet — the giving overview already carries the prompt to
  // start, so this section simply stands down rather than inventing a story.
  if (!contribution || !organization) return null;

  const place = [organization.city, organization.state]
    .filter(Boolean)
    .join(", ");

  return (
    <section className="border-b border-border py-14">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Your most recent contribution
      </p>

      <div className="mt-8 grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div
          className="overflow-hidden rounded-sm bg-secondary"
          style={{ maxWidth: image.maxWidth }}
        >
          <div ref={mediaRef} className="will-change-transform">
            <img
              src={image.src}
              alt={image.alt}
              loading="lazy"
              className="aspect-[4/3] w-full object-cover"
              style={image.focalPoint ? { objectPosition: image.focalPoint } : undefined}
            />
          </div>
        </div>

        <div className="min-w-0">
          <p
            className="tnum font-display text-3xl font-semibold tracking-[-0.02em] text-accent sm:text-4xl"
            style={{ fontVariationSettings: '"SOFT" 12' }}
          >
            {formatMoney(contribution.amountMinor, contribution.currency)}
          </p>

          <h2 className="mt-4 font-grotesk text-3xl font-extrabold uppercase leading-[0.95] tracking-[-0.02em] text-foreground sm:text-4xl">
            {organization.name}
          </h2>

          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {[category?.name, place].filter(Boolean).join(" · ")}
          </p>

          <p className="mt-5 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base sm:leading-relaxed">
            {organization.mission}
          </p>

          <Link
            to={`/ngo/${organization.slug}`}
            className="group mt-7 inline-flex items-center gap-2 text-sm font-semibold text-foreground transition-colors hover:text-primary"
          >
            View organisation
            <ArrowUpRight className="h-4 w-4 transition-transform duration-200 ease-out-soft group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

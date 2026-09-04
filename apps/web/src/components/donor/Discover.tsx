import { Link } from "react-router-dom";
import { ArrowUpRight, BadgeCheck } from "lucide-react";
import { formatMoneyCompact } from "@impactbridge/shared";
import { useOrganizations } from "@/api/organizations";
import { causes, editorial, type MediaAsset } from "@/content/media";
import { Skeleton } from "@/components/ui/Skeleton";

/** Same mapping the impact story uses — the curated library, not stock covers. */
const CAUSE_IMAGE: Record<string, MediaAsset> = {
  education: causes.education,
  healthcare: causes.healthcare,
  "women-empowerment": causes.womenEmpowerment,
  environment: causes.environment,
  animals: causes.animals,
  "disaster-relief": causes.disasterRelief,
};

/**
 * Where to go next.
 *
 * ── Why these three, and what the heading may claim ────────────────────────
 *
 * `sort: "most-funded"` — verified organisations the platform can already show
 * a funding record for. That is a real ordering from real data, and the heading
 * says exactly that rather than "recommended for you".
 *
 * A genuine recommendation would need to compare this donor's history against
 * organisations they have not given to, and nothing on the client can do that
 * honestly: the donations endpoint pages ten at a time and returns no category
 * on the organisations it does return, so "because you support education" has
 * no basis to stand on. Personalisation belongs in an endpoint that can see the
 * whole record. Calling an arbitrary three "picked for you" would be the
 * dashboard's first lie.
 *
 * ── Editorial, not a card grid ─────────────────────────────────────────────
 *
 * No borders and no boxes: a photograph, a name, a place, a figure and a rule.
 * The hover crops the image rather than lifting a card — the image scales
 * inside a fixed frame, so the layout never moves and only the picture does.
 */
export function Discover() {
  const { data, isPending } = useOrganizations({
    pageSize: 3,
    sort: "most-funded",
    verifiedOnly: true,
  });

  if (isPending) {
    return (
      <section className="border-b border-border py-14">
        <Skeleton className="h-3 w-36" />
        <div className="mt-8 grid gap-8 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="aspect-[4/3] w-full rounded-sm" />
              <Skeleton className="mt-4 h-4 w-3/4" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  const organizations = data?.items ?? [];
  if (organizations.length === 0) return null;

  return (
    <section className="border-b border-border py-14">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Verified, and already funded
      </p>

      <div className="mt-8 grid gap-10 sm:grid-cols-3 sm:gap-8">
        {organizations.map((org) => {
          const category = org.categories[0];
          const image =
            (category ? CAUSE_IMAGE[category.slug] : undefined) ?? editorial.ngoCommunity;
          const place = [org.city, org.state].filter(Boolean).join(", ");

          return (
            <Link key={org.id} to={`/ngo/${org.slug}`} className="group block">
              <div className="overflow-hidden rounded-sm bg-secondary">
                <img
                  src={image.src}
                  alt={image.alt}
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover transition-transform duration-500 ease-out-soft group-hover:scale-[1.05]"
                  style={image.focalPoint ? { objectPosition: image.focalPoint } : undefined}
                />
              </div>

              <div className="mt-4 flex items-start justify-between gap-3">
                <h3 className="font-display text-lg font-semibold leading-snug text-foreground transition-colors duration-200 group-hover:text-primary">
                  {org.name}
                </h3>
                <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out-soft group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </div>

              <p className="mt-2 flex flex-wrap items-center gap-x-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {org.verified ? (
                  <BadgeCheck aria-label="Verified" className="h-3.5 w-3.5 text-primary" />
                ) : null}
                {[category?.name, place].filter(Boolean).join(" · ")}
              </p>

              <p className="tnum mt-3 text-sm font-semibold text-accent">
                {formatMoneyCompact(org.totalRaisedMinor, org.currency)}
                <span className="ml-2 font-normal text-muted-foreground">raised</span>
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

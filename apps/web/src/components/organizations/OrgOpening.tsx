import { useEffect, useRef } from "react";
import { BadgeCheck, CalendarDays, Globe, MapPin } from "lucide-react";
import {
  formatMoneyCompact,
  fundingProgress,
  type OrganizationDetail,
} from "@impactbridge/shared";
import { gsap, prefersReducedMotion } from "@/lib/gsap";

/**
 * The opening plate of an organisation's profile.
 *
 * The profile used to open on a 3:1 cover strip with the name set at heading
 * size beneath it — the same composition as every directory listing on the
 * internet, and it made a verified nonprofit with a real balance sheet look
 * like a search result. This opens like a documentary title card instead: the
 * organisation's own photograph full-bleed, its name at display scale, and the
 * four figures that decide whether a stranger trusts it, all before the fold.
 *
 * Every figure is real and already on the wire — total raised, goal, donor
 * count, verification date. Nothing here is computed for effect.
 *
 * Ground is `--ink`/`--paper` — the theme-INDEPENDENT pair. The semantic tokens
 * swap with the theme, which would invert this whole plate in dark mode into
 * pale card with dark type over a bleached photograph (HANDOFF §3.3).
 *
 * And no pin: the cover drifts on a scrub, in normal document flow (§3.1).
 */
export function OrgOpening({ org }: { org: OrganizationDetail }) {
  const rootRef = useRef<HTMLDivElement>(null);

  const progress = fundingProgress(org.totalRaisedMinor, org.fundingGoalMinor);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      // The photograph sinks as the type lifts. Separating the two layers is
      // what stops a flat cover image reading as wallpaper.
      gsap.to(".oo-cover", {
        yPercent: 10,
        ease: "none",
        scrollTrigger: {
          trigger: root,
          start: "top top",
          end: "bottom top",
          scrub: 0.5,
        },
      });
      gsap.to(".oo-lockup", {
        yPercent: -14,
        ease: "none",
        scrollTrigger: {
          trigger: root,
          start: "top top",
          end: "bottom top",
          scrub: 0.5,
        },
      });
    }, root);

    return () => ctx.revert();
  }, []);

  return (
    <div
      ref={rootRef}
      /* Full-bleed breakout from AppLayout's padded container. `w-screen`
         includes the scrollbar, hence the global `overflow-x: clip` (§3.4). */
      className="relative left-1/2 w-screen -translate-x-1/2 overflow-hidden bg-[hsl(var(--ink))] text-[hsl(var(--paper))]"
    >
      {org.coverUrl && (
        <img
          src={org.coverUrl}
          alt=""
          aria-hidden="true"
          /* Taller than the frame so the parallax drift never exposes an edge. */
          className="oo-cover pointer-events-none absolute inset-0 h-[118%] w-full object-cover opacity-45"
        />
      )}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(125%_105%_at_0%_100%,hsl(var(--ink)/0.97)_10%,hsl(var(--ink)/0.78)_46%,hsl(var(--ink)/0.3)_100%)]"
      />

      <div className="relative mx-auto flex min-h-[72svh] max-w-6xl flex-col justify-end px-6 py-16 sm:py-20">
        <div className="oo-lockup">
          <div className="flex items-center gap-4">
            {org.logoUrl && (
              <img
                src={org.logoUrl}
                alt={`${org.name} logo`}
                className="h-12 w-12 shrink-0 border border-[hsl(var(--paper)/0.25)] object-cover sm:h-14 sm:w-14"
              />
            )}
            <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
              {org.categories.map((category) => (
                <span key={category.id}>{category.name}</span>
              ))}
            </p>
          </div>

          <h1
            className="mt-7 max-w-4xl font-grotesk text-[13vw] font-extrabold uppercase leading-[0.84] tracking-[-0.04em] sm:text-[7.5vw]"
            style={{ fontStretch: "78%" }}
          >
            {org.name}
            {org.verified && (
              <BadgeCheck
                className="ml-3 inline-block h-[0.42em] w-[0.42em] align-baseline text-primary"
                aria-label="Verified organisation"
              />
            )}
          </h1>

          <p
            className="mt-7 max-w-2xl font-display text-xl leading-snug text-[hsl(var(--paper)/0.82)] sm:text-2xl"
            style={{ fontVariationSettings: '"SOFT" 12' }}
          >
            {org.mission}
          </p>

          <dl className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-[hsl(var(--paper)/0.6)]">
            {org.city && (
              <div className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                <dd>
                  {org.city}
                  {org.state ? `, ${org.state}` : ""}
                </dd>
              </div>
            )}
            {org.foundedYear && (
              <div className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                <dd>Working since {org.foundedYear}</dd>
              </div>
            )}
            {org.website && (
              <div className="inline-flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5" />
                <dd>
                  <a
                    href={org.website}
                    target="_blank"
                    /* noreferrer/noopener stops the opened page reaching back
                       through window.opener — a real security concern. */
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Website
                  </a>
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {/* The figures, folded into the plate rather than given a band of their
          own further down where nobody reaching for the donate button sees. */}
      <div className="relative border-t border-[hsl(var(--paper)/0.15)]">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-8 gap-y-8 px-6 py-9 sm:grid-cols-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[hsl(var(--paper)/0.55)]">
              Raised
            </p>
            {/* Marigold: this token is money and emphasis, never chrome. */}
            <p
              className="tnum mt-2 font-grotesk text-3xl font-extrabold leading-none text-accent sm:text-5xl"
              style={{ fontStretch: "84%" }}
            >
              {formatMoneyCompact(org.totalRaisedMinor, org.currency)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[hsl(var(--paper)/0.55)]">
              Of their goal
            </p>
            <p
              className="tnum mt-2 font-grotesk text-3xl font-extrabold leading-none sm:text-5xl"
              style={{ fontStretch: "84%" }}
            >
              {progress}%
            </p>
            <p className="mt-1.5 text-[11px] text-[hsl(var(--paper)/0.5)]">
              {formatMoneyCompact(org.fundingGoalMinor, org.currency)} target
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[hsl(var(--paper)/0.55)]">
              Donors
            </p>
            <p
              className="tnum mt-2 font-grotesk text-3xl font-extrabold leading-none sm:text-5xl"
              style={{ fontStretch: "84%" }}
            >
              {org.donorCount.toLocaleString("en-IN")}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[hsl(var(--paper)/0.55)]">
              Verified
            </p>
            <p
              className="mt-2 font-grotesk text-3xl font-extrabold leading-none sm:text-5xl"
              style={{ fontStretch: "84%" }}
            >
              {org.verified ? "Yes" : "No"}
            </p>
            <p className="mt-1.5 text-[11px] text-[hsl(var(--paper)/0.5)]">
              {org.verified && org.verifiedAt
                ? new Date(org.verifiedAt).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : "Under review"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

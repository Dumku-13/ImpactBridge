import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import {
  formatMoneyCompact,
  type OrganizationCard,
} from "@impactbridge/shared";
import { loops, posters } from "@/content/media";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { cn } from "@/lib/utils";

/**
 * The Browse opening.
 *
 * ONE piece of footage — the canopy — and it is abstract on purpose. A face
 * behind a headline always loses: the eye goes to the face, the type needs a
 * heavy scrim to stay legible, and that scrim bleaches the footage into a
 * ghost. Texture reads as depth at any opacity and never competes.
 *
 * The ground is `--ink`/`--paper`, which are theme-independent. The semantic
 * tokens swap with the theme, so using them here inverted the whole section in
 * dark mode into a pale panel with dark text.
 *
 * And still: NO PIN. Normal document flow only.
 */
export function BrowseOpening({
  organizations,
  total,
  causes,
  cities,
}: {
  organizations: OrganizationCard[];
  total: number;
  causes: number;
  cities: number;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const featured = organizations.slice(0, 5);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      gsap.to(".bo-statement", {
        yPercent: -20,
        ease: "none",
        scrollTrigger: { trigger: ".bo-hero", start: "top top", end: "bottom top", scrub: 0.5 },
      });
      // Canopy drifts down as the type lifts — the two separate, which is what
      // makes a flat video read as a layer rather than a backdrop.
      gsap.to(".bo-video", {
        yPercent: 14,
        ease: "none",
        scrollTrigger: { trigger: ".bo-hero", start: "top top", end: "bottom top", scrub: 0.5 },
      });

      gsap.utils.toArray<HTMLElement>(".bo-plate").forEach((plate, i) => {
        const img = plate.querySelector("img");
        if (!img) return;
        gsap.fromTo(
          img,
          { yPercent: i % 2 === 0 ? -6 : -10 },
          {
            yPercent: i % 2 === 0 ? 6 : 10,
            ease: "none",
            scrollTrigger: { trigger: plate, start: "top bottom", end: "bottom top", scrub: 0.6 },
          },
        );
      });
    }, root);

    return () => ctx.revert();
  }, [featured.length]);

  return (
    <div
      ref={rootRef}
      className="relative left-1/2 w-screen -translate-x-1/2 bg-[hsl(var(--ink))] text-[hsl(var(--paper))]"
    >
      {/* ── Statement, under the canopy ─────────────────────────────────── */}
      <section className="bo-hero relative flex min-h-[94svh] flex-col justify-center overflow-hidden">
        <video
          aria-hidden="true"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster={posters.tree}
          className="bo-video pointer-events-none absolute inset-0 h-[118%] w-full object-cover opacity-[0.5] motion-reduce:hidden"
        >
          <source src={loops.tree} type="video/mp4" />
        </video>

        {/* Weighted to the lower-left where the type sits, so the canopy stays
            alive in the upper right rather than being flattened everywhere. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(125%_105%_at_0%_100%,hsl(var(--ink)/0.97)_12%,hsl(var(--ink)/0.75)_45%,hsl(var(--ink)/0.3)_100%)]"
        />

        <div className="relative w-full px-6 py-20 sm:px-10">
          <p className="mb-6 text-[10px] font-semibold uppercase tracking-[0.24em] text-[hsl(var(--paper)/0.55)]">
            The archive
          </p>

          <h1
            className="bo-statement font-grotesk text-[17vw] font-extrabold uppercase leading-[0.78] tracking-[-0.05em] sm:text-[12vw]"
            style={{ fontStretch: "78%" }}
          >
            People
            <br />
            doing
            <br />
            the <span className="text-primary">work.</span>
          </h1>

          {/* The three real figures, folded into the hero rather than given a
              second video section of their own. */}
          <div className="mt-12 flex flex-wrap items-end gap-x-12 gap-y-6 border-t border-[hsl(var(--paper)/0.15)] pt-8">
            {[
              { label: "Organisations", value: total },
              { label: "Causes", value: causes },
              { label: "Locations", value: cities },
            ].map((stat) => (
              <div key={stat.label}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[hsl(var(--paper)/0.55)]">
                  {stat.label}
                </p>
                <p
                  className="tnum mt-2 font-grotesk text-4xl font-extrabold leading-none sm:text-6xl"
                  style={{ fontStretch: "84%" }}
                >
                  {stat.value}
                </p>
              </div>
            ))}

            <p className="ml-auto max-w-xs text-xs leading-relaxed text-[hsl(var(--paper)/0.6)]">
              Every one had its registration, documents and identity checked by
              a person before it could take a rupee.
            </p>
          </div>

          <p className="mt-10 inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[hsl(var(--paper)/0.5)]">
            <ArrowDown className="h-3 w-3" />
            Scroll
          </p>
        </div>
      </section>

      {/* ── The organisations ───────────────────────────────────────────── */}
      <section className="relative border-t border-[hsl(var(--paper)/0.12)] pb-24 pt-20">
        <div className="mx-auto max-w-6xl px-6">
          {featured.map((org, i) => (
            <Link
              key={org.id}
              to={`/ngo/${org.slug}`}
              onMouseEnter={() => setHovered(org.id)}
              onMouseLeave={() => setHovered(null)}
              className={cn(
                "bo-plate group relative mb-20 block transition-opacity duration-500 ease-out-soft sm:mb-28",
                i % 3 === 0 && "sm:ml-0 sm:w-[70%]",
                i % 3 === 1 && "sm:ml-auto sm:w-[56%]",
                i % 3 === 2 && "sm:ml-[16%] sm:w-[62%]",
                hovered && hovered !== org.id && "opacity-35",
              )}
            >
              <div className="relative overflow-hidden">
                <div className="aspect-[16/10] overflow-hidden bg-[hsl(var(--olive))]">
                  {org.coverUrl && (
                    <img
                      src={org.coverUrl}
                      alt=""
                      loading={i < 2 ? "eager" : "lazy"}
                      className="h-[112%] w-full object-cover transition-transform duration-700 ease-out-soft group-hover:scale-[1.03]"
                    />
                  )}
                </div>

                <span
                  className="tnum pointer-events-none absolute left-4 top-2 font-grotesk text-6xl font-extrabold leading-none text-[hsl(var(--paper))] mix-blend-difference sm:text-8xl"
                  style={{ fontStretch: "82%" }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>

              <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
                    {org.categories.slice(0, 2).map((c) => c.name).join(" · ")}
                  </p>
                  <h2
                    className="mt-2 flex items-center gap-3 font-grotesk text-3xl font-extrabold uppercase leading-[0.92] tracking-[-0.03em] sm:text-5xl"
                    style={{ fontStretch: "82%" }}
                  >
                    {org.name}
                    <ArrowUpRight className="hidden h-7 w-7 shrink-0 opacity-0 transition-all duration-300 ease-out-soft group-hover:translate-x-1 group-hover:opacity-100 sm:block" />
                  </h2>
                </div>

                <p className="tnum shrink-0 text-right">
                  <span
                    className="block font-grotesk text-2xl font-extrabold leading-none text-accent sm:text-4xl"
                    style={{ fontStretch: "86%" }}
                  >
                    {formatMoneyCompact(org.totalRaisedMinor, org.currency)}
                  </span>
                  <span className="mt-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--paper)/0.5)]">
                    raised {org.city ? `· ${org.city}` : ""}
                  </span>
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

import { useEffect, useRef } from "react";
import { ArrowDown } from "lucide-react";
import { formatMoneyCompact } from "@impactbridge/shared";
import { gsap, prefersReducedMotion } from "@/lib/gsap";

/**
 * The Grants opening.
 *
 * Deliberately typographic: no footage. The canopy belongs to Browse, and the
 * imagery on this page arrives through interaction instead — the cause modes
 * swap a real photograph as you move across them, and each row floods its own
 * cause picture on hover.
 *
 * Same hard rule as everywhere else — NO PIN. Normal document flow only, so it
 * cannot strand the reader in an empty band.
 */
export function GrantsOpening({
  openCount,
  totalMinor,
  currency,
}: {
  openCount: number;
  totalMinor: number;
  currency: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      // Type and footage drift apart as the section leaves — depth, cheaply.
      gsap.to(".grants-statement", {
        yPercent: -16,
        ease: "none",
        scrollTrigger: { trigger: root, start: "top top", end: "bottom top", scrub: 0.5 },
      });
      gsap.from(".grants-figure", {
        y: 30,
        opacity: 0,
        duration: 0.9,
        stagger: 0.12,
        ease: "power2.out",
        scrollTrigger: { trigger: ".grants-figures", start: "top 88%", once: true },
      });
    }, root);

    return () => ctx.revert();
  }, []);

  return (
    <div
      ref={rootRef}
      // Full-bleed via a viewport translate — safe now that `overflow-x: clip`
      // is set on html/body and nothing on this page pins.
      className="relative left-1/2 w-screen -translate-x-1/2 text-[hsl(var(--paper))]"
    >
      <section className="relative flex min-h-[80svh] items-center overflow-hidden bg-[hsl(var(--ink))]">
        {/*
          No footage here on purpose. The canopy belongs to Browse, and running
          it on both openings would make the two pages read as the same page.
          Grants earns its imagery elsewhere — the cause modes below swap a real
          photograph as you move across them, and each row floods its own cause
          picture on hover. A third video would be repetition, not richness.
        */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--ink)/0.97)] via-[hsl(var(--ink)/0.8)] to-[hsl(var(--ink)/0.45)]"
        />

        <div className="relative w-full px-6">
          <h1
            className="grants-statement font-grotesk text-[16vw] font-extrabold uppercase leading-[0.8] tracking-[-0.045em] sm:text-[11vw]"
            style={{ fontStretch: "80%" }}
          >
            Money
            <br />
            for the
            <br />
            right <span className="text-primary">work.</span>
          </h1>

          {/* Both figures are real: a count of open grants and the sum of their
              funds. Nothing here is modelled. */}
          <div className="grants-figures mt-10 flex flex-wrap gap-10 sm:gap-16">
            <div className="grants-figure">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--paper)/0.6)]">
                Open now
              </p>
              <p
                className="tnum mt-2 font-grotesk text-4xl font-extrabold leading-none sm:text-6xl"
                style={{ fontStretch: "86%" }}
              >
                {openCount}
              </p>
            </div>
            <div className="grants-figure">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--paper)/0.6)]">
                On the table
              </p>
              <p
                className="tnum mt-2 font-grotesk text-4xl font-extrabold leading-none text-accent sm:text-6xl"
                style={{ fontStretch: "86%" }}
              >
                {formatMoneyCompact(totalMinor, currency)}
              </p>
            </div>
          </div>

          <p className="mt-10 inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[hsl(var(--paper)/0.55)]">
            <ArrowDown className="h-3 w-3" />
            Every rule, every deadline, before you write a word
          </p>
        </div>
      </section>
    </div>
  );
}

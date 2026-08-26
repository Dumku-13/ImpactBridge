import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowRight } from "lucide-react";
import { formatMoneyCompact } from "@impactbridge/shared";
import { usePublicStats } from "@/api/stats";
import { gsap, prefersReducedMotion } from "@/lib/gsap";

/**
 * The landing opening: three statements that assemble out of chaos as you
 * scroll, and resolve into the headline.
 *
 * ── Why there is no photograph here ────────────────────────────────────────
 *
 * This replaced a full-bleed hero. Two versions of that failed for the same
 * reason: a person's face behind a headline takes the eye, forces a scrim heavy
 * enough to bleach the photograph, and — with stock-feeling footage — reads as a
 * template. Type at this scale IS the image. It also means the first photograph
 * anyone sees on this site is a real one of real work, further down, where it
 * lands properly.
 *
 * ── How the motion works, and why it isn't pinned ──────────────────────────
 *
 * The obvious build is to pin a single screen and play the beats through it.
 * Pinning is banned here and the ban was earned twice (HANDOFF §3.1) — it
 * switches the element to fixed positioning inside a generated spacer, and
 * anything with a margin or a full-bleed breakout renders off-frame, leaving a
 * blank band.
 *
 * So each beat is an ordinary section in normal document flow, and the letters
 * are what move: scattered and overlapping as the beat enters, converging into
 * the line at the moment it sits centred in the viewport, dispersing again as
 * it leaves. Scroll distance buys you a sentence assembling itself, which is
 * motion that carries information rather than motion that fills time.
 *
 * With `prefers-reduced-motion`, or if the script never runs, no scatter is
 * ever applied and the resting DOM is three legible statements. The worst case
 * is "no animation", never "no content" (§3.2).
 */

/** Deterministic pseudo-random in [-1, 1], stable across renders and reloads. */
function jitter(seed: number): number {
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

/**
 * One display line, split into characters so they can move independently.
 *
 * `aria-label` carries the real sentence and the pieces are hidden from the
 * accessibility tree: a screen reader announcing "M — o — n — e — y" letter by
 * letter is how kinetic type usually breaks for the people least able to
 * work around it.
 */
function SplitLine({
  text,
  className,
  highlight,
}: {
  text: string;
  className?: string;
  /** Word (case-sensitive) painted in the accent colour. */
  highlight?: string;
}) {
  const words = text.split(" ");
  let charIndex = 0;

  return (
    <span aria-label={text} className={className}>
      {words.map((word, w) => (
        <span key={`${word}-${w}`} aria-hidden="true" className="inline-block whitespace-nowrap">
          {[...word].map((char, c) => {
            const i = charIndex++;
            return (
              <span
                key={`${char}-${c}`}
                className="op-char inline-block will-change-transform"
                data-seed={i}
                style={highlight === word ? { color: "hsl(var(--accent))" } : undefined}
              >
                {char}
              </span>
            );
          })}
          {/* A real space between words, outside the animated spans, so the
              line still wraps and reads correctly when nothing is moving. */}
          {w < words.length - 1 && <span className="inline-block">&nbsp;</span>}
        </span>
      ))}
    </span>
  );
}

function Beat({
  index,
  line,
  highlight,
  figure,
  caption,
}: {
  index: string;
  line: string;
  highlight?: string;
  /** The real number underneath. Pre-formatted by the caller. */
  figure: ReactNode;
  caption: string;
}) {
  return (
    <section className="op-beat relative flex min-h-[64svh] items-center py-10">
      <div className="mx-auto w-full max-w-7xl px-6">
        <p className="tnum text-[10px] font-semibold uppercase tracking-[0.24em] text-[hsl(var(--paper)/0.45)]">
          {index}
        </p>

        <p
          className="mt-6 font-grotesk uppercase leading-[0.82] tracking-[-0.045em] text-[hsl(var(--paper))]"
          style={{
            // Archivo's width axis pushed to its narrow extreme. The face has
            // carried a 62–125% width range all along and the site only ever
            // used the middle of it; at 62% and weight 900 it is a different,
            // stranger typeface — for no extra download, because it is the same
            // file already loaded.
            fontStretch: "62%",
            fontWeight: 900,
            fontSize: "clamp(3.5rem, 15vw, 13rem)",
          }}
        >
          <SplitLine text={line} highlight={highlight} />
        </p>

        {/*
          The figure. Every one is read live from /stats/public, which only
          serves values derivable from a row count or a SUM — see the schema's
          own note on why "people reached" is not among them.
        */}
        <div className="op-figure mt-10 flex flex-wrap items-baseline gap-x-5 gap-y-2 border-t border-[hsl(var(--paper)/0.15)] pt-6">
          <span
            className="tnum font-grotesk text-3xl font-extrabold leading-none text-[hsl(var(--paper))] sm:text-5xl"
            style={{ fontStretch: "84%" }}
          >
            {figure}
          </span>
          <span className="max-w-md text-sm leading-relaxed text-[hsl(var(--paper)/0.6)]">
            {caption}
          </span>
        </div>
      </div>
    </section>
  );
}

export function Opening() {
  const rootRef = useRef<HTMLDivElement>(null);
  const { data: stats } = usePublicStats();

  useEffect(() => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>(".op-beat").forEach((beat, beatIndex) => {
        const chars = beat.querySelectorAll<HTMLElement>(".op-char");
        if (chars.length === 0) return;

        /*
         * ONE timeline per beat, not two triggers. The first half assembles,
         * the second disperses; splitting that across two ScrollTriggers means
         * both own the same targets and they fight at the hand-over, which
         * shows up as a jump exactly when the line is most readable.
         */
        const timeline = gsap.timeline({
          scrollTrigger: {
            trigger: beat,
            start: "top bottom",
            end: "bottom top",
            scrub: 0.8,
          },
        });

        const scatter = (phase: number) => ({
          xPercent: (i: number) => jitter(i + phase + beatIndex * 31) * 70,
          yPercent: (i: number) => jitter(i * 1.7 + phase + beatIndex * 17) * 90,
          rotate: (i: number) => jitter(i * 2.3 + phase) * 26,
          scale: (i: number) => 1 + Math.abs(jitter(i * 3.1 + phase)) * 0.5,
          // Never below 0.3: a stalled frame loop must leave the words dim,
          // not absent (§3.2).
          opacity: 0.32,
        });

        timeline
          .fromTo(
            chars,
            { ...scatter(0), ease: "none" },
            {
              xPercent: 0,
              yPercent: 0,
              rotate: 0,
              scale: 1,
              opacity: 1,
              ease: "power2.out",
              duration: 0.5,
            },
            0,
          )
          // Out the other side, scattered differently so it reads as continuing
          // rather than rewinding.
          .to(chars, { ...scatter(101), ease: "power2.in", duration: 0.5 }, 0.5);

        const figure = beat.querySelector(".op-figure");
        if (figure) {
          timeline
            .fromTo(
              figure,
              { opacity: 0.3, y: 28 },
              { opacity: 1, y: 0, ease: "none", duration: 0.35 },
              0.15,
            )
            .to(figure, { opacity: 0.3, y: -28, ease: "none", duration: 0.35 }, 0.65);
        }
      });
    }, root);

    return () => ctx.revert();
  }, [stats]);

  const currency = stats?.currency ?? "inr";

  return (
    <div
      ref={rootRef}
      /* Ink and paper: the theme-INDEPENDENT pair. The semantic tokens swap
         with the theme and would invert this whole opening in dark mode
         (HANDOFF §3.3). */
      className="relative bg-[hsl(var(--ink))] text-[hsl(var(--paper))]"
    >
      {/* Standing in for the removed hero's first screen: the site's name and
          its claim, before the beats begin. */}
      <div className="mx-auto flex min-h-[52svh] max-w-7xl flex-col justify-end px-6 pb-10 pt-28">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[hsl(var(--paper)/0.5)]">
          Verified nonprofits · transparent grants
        </p>
        <p className="mt-6 max-w-2xl font-display text-xl leading-snug text-[hsl(var(--paper)/0.75)] sm:text-2xl">
          Three things have to be true before a donation means anything.
        </p>
        <p className="mt-10 inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[hsl(var(--paper)/0.45)]">
          <ArrowDown className="h-3 w-3" />
          Scroll
        </p>
      </div>

      <Beat
        index="01 / 03"
        line="Money moves"
        highlight="moves"
        figure={
          stats ? formatMoneyCompact(stats.totalRaisedMinor, currency) : "—"
        }
        caption="given through the platform so far, summed from completed donations — not pledges, not intentions."
      />

      <Beat
        index="02 / 03"
        line="Someone signs for it"
        highlight="signs"
        figure={stats ? `${stats.verifiedOrganizations}/${stats.organizations}` : "—"}
        caption="organisations verified by a person who read their registration documents before the page went live."
      />

      <Beat
        index="03 / 03"
        line="You can check"
        highlight="check"
        figure={stats ? stats.openGrants : "—"}
        caption={`grants open right now, each with its rules, its deadline and its decisions on the record${
          stats && stats.states > 0 ? `, across ${stats.states} states` : ""
        }.`}
      />

      {/* The resolution. This is the page's h1 — the beats above are display
          type with `aria-label`, so the document still has exactly one title. */}
      <section className="relative flex min-h-[74svh] items-center border-t border-[hsl(var(--paper)/0.15)] py-16">
        <div className="mx-auto w-full max-w-7xl px-6">
          <h1 className="max-w-5xl">
            <span
              className="block font-grotesk uppercase leading-[0.86] tracking-[-0.04em] text-[hsl(var(--paper))]"
              style={{
                fontStretch: "70%",
                fontWeight: 900,
                fontSize: "clamp(2.75rem, 9vw, 8rem)",
              }}
            >
              Funding that
              <br />
              actually reaches
            </span>
            <span
              className="mt-2 block font-display font-semibold leading-[0.92] tracking-[-0.035em] text-accent"
              style={{
                fontVariationSettings: '"SOFT" 10',
                fontSize: "clamp(2.75rem, 9vw, 8rem)",
              }}
            >
              the ground.
            </span>
          </h1>

          <div className="mt-12 flex flex-wrap items-center gap-4">
            <Link
              to="/browse"
              className="group inline-flex h-12 items-center gap-2 rounded-lg bg-[hsl(var(--paper))] px-6 text-sm font-semibold text-[hsl(var(--ink))] transition-all duration-200 ease-out-soft active:scale-[0.97]"
            >
              Explore nonprofits
              <ArrowRight className="h-4 w-4 transition-transform duration-200 ease-out-soft group-hover:translate-x-0.5" />
            </Link>
            <Link
              to="/grants"
              className="text-sm font-semibold text-[hsl(var(--paper)/0.8)] underline-offset-8 transition-colors hover:text-[hsl(var(--paper))] hover:underline"
            >
              Browse grants
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

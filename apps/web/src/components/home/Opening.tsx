import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowRight } from "lucide-react";
import { formatMoneyCompact } from "@impactbridge/shared";
import { usePublicStats } from "@/api/stats";
import { prefersReducedMotion } from "@/lib/gsap";

/**
 * The landing opening: one sentence, as large as the screen allows, blown
 * apart slowly by scroll.
 *
 * ── The shape of it ────────────────────────────────────────────────────────
 *
 * One statement, not three. An earlier version ran three beats that each
 * assembled and dispersed; it read as a slideshow of headlines and none of them
 * got to be big. This gives the whole opening to a single sentence at display
 * scale, and spends the scroll on ONE idea: the line breaks apart, drifting
 * outward from the centre of the composition, and the platform's real figures
 * are revealed underneath as it clears.
 *
 * Radial, not random: every character moves along the vector from the centre of
 * the block through its own centre, measured after layout. Random scatter looks
 * like a bug; a shared origin looks like an explosion.
 *
 * ── Why it sticks rather than pins ─────────────────────────────────────────
 *
 * The panel is `position: sticky` — CSS, not `ScrollTrigger.pin`. The pin is
 * banned here and the ban was earned twice (HANDOFF §3.1): it moves the element
 * into a generated spacer at fixed position, where a margin or a full-bleed
 * breakout renders off-frame and leaves a blank band. Sticky keeps the element
 * in normal flow and cannot do that.
 *
 * The section is only ~1.7 screens tall, which is the slow-explode distance and
 * also the worst case if the script never runs: the resting DOM is the
 * headline, legible and still, with the figures beneath it. Never a blank.
 */

/**
 * The sentence, split to characters.
 *
 * `aria-label` carries the real line and the pieces are `aria-hidden`, because
 * a screen reader spelling out "F — U — N — D — I — N — G" is how kinetic type
 * usually fails the people least able to route around it.
 */
function SplitLine({ text, className }: { text: string; className?: string }) {
  return (
    <span className={className}>
      {text.split(" ").map((word, w) => (
        <span key={`${word}-${w}`} aria-hidden="true" className="inline-block whitespace-nowrap">
          {[...word].map((char, c) => (
            <span key={`${char}-${c}`} className="op-char inline-block will-change-transform">
              {char}
            </span>
          ))}
          {w < text.split(" ").length - 1 && <span className="inline-block">&nbsp;</span>}
        </span>
      ))}
    </span>
  );
}

export function Opening() {
  const rootRef = useRef<HTMLDivElement>(null);
  const { data: stats } = usePublicStats();

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const chars = Array.from(root.querySelectorAll<HTMLElement>(".op-char"));
    const headline = root.querySelector<HTMLElement>(".op-headline");
    if (!headline || chars.length === 0) return;

    /*
     * Measure once, before anything moves: each letter's direction is the
     * vector from the centre of the headline through its own centre. Written
     * onto the element as custom properties, so the scroll handler afterwards
     * only ever writes ONE value for the whole section and CSS does the rest.
     */
    const measure = () => {
      const box = headline.getBoundingClientRect();
      const centreX = box.left + box.width / 2;
      const centreY = box.top + box.height / 2;

      for (const char of chars) {
        const rect = char.getBoundingClientRect();
        const dx = rect.left + rect.width / 2 - centreX;
        const dy = rect.top + rect.height / 2 - centreY;
        const distance = Math.hypot(dx, dy) || 1;

        // Outermost letters travel furthest, so the line opens rather than
        // smearing uniformly.
        /*
         * Distances are generous on purpose: by the end of the travel the line
         * should be off the edges of the screen, not hovering politely near
         * where it started. The `Math.abs` terms scale with how far out the
         * letter already sits, so the composition opens from the middle
         * outward instead of sliding sideways as a block.
         */
        char.style.setProperty("--cx", String(Math.round((dx / distance) * (260 + Math.abs(dx) * 1.1))));
        char.style.setProperty("--cy", String(Math.round((dy / distance) * (210 + Math.abs(dy) * 2.6))));
        char.style.setProperty("--cr", String(Math.round((dx / distance) * 26)));
      }
    };

    /*
     * Reduced motion: measure nothing, add nothing. Without `.op-scrub` the
     * rules in index.css never apply and the resting DOM is the finished
     * state — a still headline, which is exactly right.
     */
    if (prefersReducedMotion()) return;

    measure();
    root.classList.add("op-scrub");

    let frame = 0;

    const update = () => {
      frame = 0;
      const rect = root.getBoundingClientRect();
      // Distance available for the explode: the section's height minus the one
      // viewport the sticky panel occupies.
      const travel = rect.height - window.innerHeight;
      const progress = travel > 0 ? -rect.top / travel : 0;
      root.style.setProperty("--op-p", Math.min(Math.max(progress, 0), 1).toFixed(4));
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };

    const onResize = () => {
      // Vectors are pixel distances measured at one layout; a resize changes
      // the type size and every one of them is then wrong.
      root.style.setProperty("--op-p", "0");
      measure();
      onScroll();
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    // Web fonts land after mount and change every glyph's width, so the first
    // measurement is taken against fallback metrics.
    document.fonts?.ready.then(onResize);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      root.classList.remove("op-scrub");
    };
  }, [stats]);

  const currency = stats?.currency ?? "inr";

  const figures = [
    {
      value: stats ? formatMoneyCompact(stats.totalRaisedMinor, currency) : "—",
      label: "given, and every rupee of it receipted",
    },
    {
      value: stats ? `${stats.verifiedOrganizations}/${stats.organizations}` : "—",
      label: "organisations checked by a person before they could take a rupee",
    },
    {
      value: stats ? String(stats.openGrants) : "—",
      label: "grants open right now, rules and deadline attached",
    },
  ];

  return (
    <div
      ref={rootRef}
      /* `--ink` / `--paper`: the theme-INDEPENDENT pair. The semantic tokens
         swap with the theme and would invert this whole panel in dark mode
         (HANDOFF §3.3). ~1.7 screens is the explode distance. */
      /* Two and a half screens of scroll for the explode. The F1 dashboard
         spends three on its car and the length is load-bearing there for the
         same reason it is here: too short and the thing never finishes coming
         apart before the next section arrives. */
      className="relative h-[250svh] bg-[hsl(var(--ink))] text-[hsl(var(--paper))]"
    >
      <div className="sticky top-0 flex h-svh flex-col justify-center overflow-hidden">
        <div className="mx-auto w-full max-w-[110rem] px-6">
          <p className="op-chrome text-[10px] font-semibold uppercase tracking-[0.24em] text-[hsl(var(--paper)/0.5)]">
            Verified nonprofits · transparent grants
          </p>

          <h1
            className="op-headline mt-8 font-grotesk uppercase leading-[0.8] tracking-[-0.05em]"
            style={{
              /*
               * Archivo's width axis at its narrow extreme. The face has
               * carried 62–125% all along and the site only ever used the
               * middle; at 62% and weight 900 it is effectively a different
               * typeface, for no extra download. Narrow is also what lets the
               * line be this large without wrapping into a wall.
               */
              fontStretch: "62%",
              fontWeight: 900,
              /*
               * Sized against the viewport's HEIGHT as well as its width.
               * `16vw` alone gave 205px a line — three lines plus the figures
               * and the buttons came to 935px inside a 900px panel, so the
               * call to action was clipped off the bottom of a `h-svh` box. A
               * headline that big is worth nothing if it pushes the button out
               * of the screen, and the shorter the window the worse it got.
               */
              fontSize: "clamp(2.75rem, min(15vw, 17svh), 13rem)",
            }}
          >
            <SplitLine text="Funding that" className="block" />
            <SplitLine text="actually reaches" className="block" />
            <SplitLine text="the ground." className="block text-accent" />
            {/* The whole sentence, once, for assistive technology. */}
            <span className="sr-only">
              Funding that actually reaches the ground.
            </span>
          </h1>

          {/*
            What the explosion uncovers. Every figure is read live from
            /stats/public, which serves only values derivable from a row count
            or a SUM — the reason this opening can put them at this size.
          */}
          <div className="op-figures mt-12 grid gap-x-10 gap-y-6 border-t border-[hsl(var(--paper)/0.15)] pt-7 sm:grid-cols-3">
            {figures.map((figure) => (
              <div key={figure.label}>
                <p
                  className="tnum font-grotesk text-3xl font-extrabold leading-none sm:text-4xl"
                  style={{ fontStretch: "84%" }}
                >
                  {figure.value}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-[hsl(var(--paper)/0.6)]">
                  {figure.label}
                </p>
              </div>
            ))}
          </div>

          <div className="op-chrome mt-10 flex flex-wrap items-center gap-4">
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
            <span className="ml-auto hidden items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[hsl(var(--paper)/0.45)] sm:inline-flex">
              <ArrowDown className="h-3 w-3" />
              Scroll
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

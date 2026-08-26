import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowRight } from "lucide-react";
import { formatMoneyCompact } from "@impactbridge/shared";
import { usePublicStats } from "@/api/stats";
import { prefersReducedMotion } from "@/lib/gsap";

/**
 * The landing opening: one sentence at display scale that explodes in the
 * BACKGROUND while the platform's real figures scroll over it.
 *
 * ── The structure, which is the whole trick ────────────────────────────────
 *
 *   zone (3.4 screens tall, ink)
 *   ├── background — `sticky top-0`, one screen: the headline, plus an ink
 *   │   wash that strengthens as you descend
 *   └── foreground — normal flow, pulled up over the background by a negative
 *       bottom margin on the sticky element, so the figures travel across a
 *       headline that is still coming apart behind them
 *
 * Taken from the F1 dashboard, which explodes a car across three viewports and
 * lets its editorial scenes ride over the wreckage at 60% ink. Same idea,
 * different subject: here the thing being taken apart is the claim, and what
 * scrolls over it is the evidence for the claim.
 *
 * ── Not pinned ─────────────────────────────────────────────────────────────
 *
 * `position: sticky`, never `ScrollTrigger.pin`. The pin is banned here and the
 * ban was earned twice (HANDOFF §3.1): it moves the element into a generated
 * spacer at fixed position, where a margin or a full-bleed breakout renders
 * off-frame and leaves a blank band.
 *
 * ── One variable, no animation library ─────────────────────────────────────
 *
 * A single rAF-throttled listener writes `--op-p` (0 → 1) onto the zone, and
 * every movement is a `calc()` off it in index.css — the F1 dashboard's
 * `--hero-p` method. Beyond being cheap, it is the only version of this that
 * can be TESTED: motion expressed as arithmetic on a variable can be driven by
 * hand and measured, which a timeline cannot.
 *
 * The rules are gated behind `.op-scrub`, added by that listener. Without it —
 * reduced motion, no JS, a script that threw — the letters sit at their natural
 * positions at full opacity and the page reads as a still headline. Never a
 * blank ink field (§3.2).
 */

/**
 * The sentence, split to characters so each can move independently.
 *
 * The pieces are `aria-hidden` and the real line is announced once from the
 * `sr-only` copy in the heading: a screen reader spelling out "F — U — N — D"
 * is how kinetic type usually fails the people least able to route around it.
 */
function SplitLine({ text, className }: { text: string; className?: string }) {
  const words = text.split(" ");

  return (
    <span className={className}>
      {words.map((word, w) => (
        <span key={`${word}-${w}`} aria-hidden="true" className="inline-block whitespace-nowrap">
          {[...word].map((char, c) => (
            <span key={`${char}-${c}`} className="op-char inline-block will-change-transform">
              {char}
            </span>
          ))}
          {w < words.length - 1 && <span className="inline-block">&nbsp;</span>}
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
     * vector from the centre of the headline through its own centre. Stored on
     * the element as custom properties, so the scroll handler afterwards writes
     * exactly ONE value for the whole zone and CSS does the rest.
     *
     * Radial, not random — a shared origin reads as an explosion, random
     * scatter reads as a bug.
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

        // Generous distances: by the end of the travel the line should be off
        // the edges of the screen, not hovering near where it started. The
        // `abs` terms scale with how far out a letter already sits, so the
        // composition opens from the middle rather than sliding as a block.
        char.style.setProperty("--cx", String(Math.round((dx / distance) * (260 + Math.abs(dx) * 1.1))));
        char.style.setProperty("--cy", String(Math.round((dy / distance) * (210 + Math.abs(dy) * 2.6))));
        char.style.setProperty("--cr", String(Math.round((dx / distance) * 26)));
      }
    };

    if (prefersReducedMotion()) return;

    measure();
    root.classList.add("op-scrub");

    let frame = 0;

    const update = () => {
      frame = 0;
      const rect = root.getBoundingClientRect();
      // The travel is the zone's height less the one viewport the sticky
      // background occupies.
      const travel = rect.height - window.innerHeight;
      const progress = travel > 0 ? -rect.top / travel : 0;
      root.style.setProperty("--op-p", Math.min(Math.max(progress, 0), 1).toFixed(4));
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };

    const onResize = () => {
      // Vectors are pixel distances taken at one layout; a resize changes the
      // type size and every one of them is then wrong.
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

  /** Each one scrolls over the exploding headline on a screen of its own. */
  const figures = [
    {
      value: stats ? formatMoneyCompact(stats.totalRaisedMinor, currency) : "—",
      label: "given so far",
      body: "Summed from completed donations — not pledges, not intentions. Every one of them has a receipt with a number on it.",
    },
    {
      value: stats ? `${stats.verifiedOrganizations}/${stats.organizations}` : "—",
      label: "organisations verified",
      body: "A person read their registration documents and signed off before the page went live. The date of that decision is printed on every profile.",
    },
    {
      value: stats ? String(stats.openGrants) : "—",
      label: "grants open right now",
      body: "Each publishes its eligibility rules, its deadline and the size of its fund up front — and every decision made on it is written to an audit log.",
    },
  ];

  return (
    <div
      ref={rootRef}
      /* `--ink` / `--paper`: the theme-INDEPENDENT pair. The semantic tokens
         swap with the theme and would invert this whole zone in dark mode
         (HANDOFF §3.3). 3.4 screens is the explode distance — the F1 dashboard
         spends three on its car, and the length is load-bearing for the same
         reason: too short and it never finishes coming apart. */
      className="relative h-[340svh] bg-[hsl(var(--ink))] text-[hsl(var(--paper))]"
    >
      {/* ── Background: the headline, exploding ─────────────────────────── */}
      {/*
        `-mb-[100svh]` is what pulls the foreground up over this layer. The
        sticky element still occupies its screen and sticks normally; the
        negative margin only stops it consuming a screen of the zone's height.
      */}
      <div className="sticky top-0 -mb-[100svh] flex h-svh items-center overflow-hidden">
        <div className="w-full px-6">
          <h1
            className="op-headline mx-auto max-w-[110rem] font-grotesk uppercase leading-[0.8] tracking-[-0.05em]"
            style={{
              /*
               * Archivo's width axis at its narrow extreme. The face has
               * carried 62–125% all along and this site only ever used the
               * middle of it; at 62% and weight 900 it is effectively a
               * different typeface, for no extra download. Narrow is also what
               * lets a line this large stay a line rather than a wall.
               */
              fontStretch: "62%",
              fontWeight: 900,
              /*
               * Sized against viewport HEIGHT as well as width. `16vw` alone
               * gave 205px a line, which put 935px of content into a 900px
               * panel and clipped the call to action off the bottom.
               */
              fontSize: "clamp(2.75rem, min(15vw, 17svh), 13rem)",
            }}
          >
            <SplitLine text="Funding that" className="block" />
            <SplitLine text="actually reaches" className="block" />
            <SplitLine text="the ground." className="block text-accent" />
            <span className="sr-only">
              Funding that actually reaches the ground.
            </span>
          </h1>
        </div>

        {/*
          The wash. Strengthens as you descend so the figures crossing in front
          stay legible against whatever the letters are doing behind them — the
          F1 dashboard rides its scenes over the exploded car the same way, at
          60% ink. Inert, above the type, below the foreground.
        */}
        <div aria-hidden="true" className="op-wash pointer-events-none absolute inset-0" />
      </div>

      {/* ── Foreground: what scrolls over it ────────────────────────────── */}
      <div className="relative z-10">
        {/* Screen one is deliberately almost empty: the headline gets the
            opening to itself before anything travels across it. */}
        <section className="flex h-svh flex-col justify-between px-6 py-10">
          <p className="op-chrome mx-auto w-full max-w-[110rem] text-[10px] font-semibold uppercase tracking-[0.24em] text-[hsl(var(--paper)/0.55)]">
            Verified nonprofits · transparent grants
          </p>
          <p className="op-chrome mx-auto inline-flex w-full max-w-[110rem] items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[hsl(var(--paper)/0.45)]">
            <ArrowDown className="h-3 w-3" />
            Keep scrolling
          </p>
        </section>

        {/*
          Every figure is read live from /stats/public, which serves only values
          derivable from a row count or a SUM — which is why this opening is
          allowed to put them at this size.
        */}
        {figures.map((figure) => (
          <section
            key={figure.label}
            className="flex min-h-[80svh] items-center px-6 py-16"
          >
            <div className="mx-auto w-full max-w-[110rem]">
              <div className="max-w-xl border-l-2 border-primary pl-6 sm:pl-8">
                <p
                  className="tnum font-grotesk font-extrabold leading-none text-[hsl(var(--paper))]"
                  style={{ fontStretch: "80%", fontSize: "clamp(3rem, 8vw, 7rem)" }}
                >
                  {figure.value}
                </p>
                <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
                  {figure.label}
                </p>
                <p className="mt-5 text-base leading-relaxed text-[hsl(var(--paper)/0.72)]">
                  {figure.body}
                </p>
              </div>
            </div>
          </section>
        ))}

        <section className="flex min-h-[60svh] items-center px-6 pb-20">
          <div className="mx-auto w-full max-w-[110rem]">
            <div className="flex flex-wrap items-center gap-4 border-t border-[hsl(var(--paper)/0.15)] pt-10">
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
    </div>
  );
}

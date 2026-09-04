import { useEffect, useRef } from "react";
import { details, editorial, loops, type MediaAsset } from "@/content/media";
import { prefersReducedMotion } from "@/lib/gsap";
import { SectionTheme } from "@/components/ui/SectionTheme";

/**
 * The six stages are the ones the backend actually models — the application
 * pipeline in `apps/api/src/services/grantWorkflow.ts` and the `FUNDS_RELEASED`
 * transition that opens a Project and its Reports. Nothing here is aspirational
 * copy; every step corresponds to a state the system can be in.
 *
 * Each carries a photograph from the library rather than an icon: the point of
 * the sequence is that money ends up somewhere real, and six abstract glyphs
 * would say the opposite.
 */
const STAGES: Array<{ label: string; body: string; media: MediaAsset }> = [
  {
    label: "Donor",
    body: "Someone gives to a nonprofit they can actually check — registration, documents and identity all verified before the page goes live.",
    media: editorial.children,
  },
  {
    label: "ImpactBridge",
    body: "The platform holds the record. Every decision that follows is logged, attributed and timestamped.",
    media: details.documents,
  },
  {
    label: "Grant",
    body: "A funder publishes an opportunity with real eligibility rules, a fixed pot and a deadline.",
    media: details.maps,
  },
  {
    label: "Nonprofit",
    body: "They apply. The application moves through review, interview and decision — each transition checked against who is allowed to make it.",
    media: editorial.ngoCommunity,
  },
  {
    label: "Project",
    body: "On approval the funds are released and a project opens. The award is checked against what remains in the pot.",
    media: details.planting,
  },
  {
    label: "Report",
    body: "The nonprofit reports back: milestones, updates, and what was actually spent.",
    media: details.writing,
  },
];

/**
 * ── A scene, not a list ────────────────────────────────────────────────────
 *
 * The section is a tall scroll region with a `position: sticky` stage inside
 * it, so the viewport holds still while the process moves through it. That is
 * the pinned feeling, built the way this codebase already builds it.
 *
 * `ScrollTrigger.pin` is deliberately NOT used. The ban was earned twice
 * (HANDOFF §3.1, and the note at the top of `Opening.tsx`): pinning relocates
 * the element into a generated spacer at fixed position, where a margin or a
 * full-bleed breakout renders off-frame and leaves a blank band. Sticky costs
 * nothing and cannot do that.
 *
 * ── One variable ───────────────────────────────────────────────────────────
 *
 * A single rAF-throttled listener writes `--fj-p` (0 → 1) onto the region and
 * every movement in the scene is a `calc()` off it in index.css — the same
 * method as the opening's `--op-p`. Beyond being cheap, it is the only version
 * of this that can be TESTED: the scene can be driven by hand to any point and
 * measured, which a timeline cannot.
 *
 * ── Without the script ─────────────────────────────────────────────────────
 *
 * Everything is gated behind `.fj-scrub`, added by that listener. Reduced
 * motion, no JS, or a script that threw leaves every stage at full opacity in
 * normal flow: the section reads as six stages of a process, stacked and
 * legible, which is the information it was carrying all along.
 */
export function FundingFlow() {
  const regionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const region = regionRef.current;
    if (!region || prefersReducedMotion()) return;

    region.classList.add("fj-scrub");

    let frame = 0;
    let regionTop = 0;
    let travel = 1;

    /*
     * Geometry in DOCUMENT space, measured on reflow rather than per frame.
     * Reading `getBoundingClientRect()` inside the scroll handler forces a
     * synchronous layout on every frame, interleaved with the other scroll
     * listeners on this page — the textbook thrash. Cached, the per-frame path
     * is pure arithmetic against `scrollY`.
     *
     * `travel` is the scroll distance over which the scene plays: the region's
     * height minus the one viewport the sticky stage occupies.
     */
    const measure = () => {
      const rect = region.getBoundingClientRect();
      regionTop = rect.top + window.scrollY;
      travel = Math.max(rect.height - window.innerHeight, 1);
    };

    const update = () => {
      frame = 0;
      const progress = (window.scrollY - regionTop) / travel;
      region.style.setProperty(
        "--fj-p",
        String(Math.min(Math.max(progress, 0), 1).toFixed(4)),
      );
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };

    const onResize = () => {
      measure();
      onScroll();
    };

    measure();
    update();

    // Fonts swapping and images landing both change document height without
    // firing a resize.
    const observer = new ResizeObserver(onResize);
    observer.observe(document.documentElement);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      observer.disconnect();
      region.classList.remove("fj-scrub");
    };
  }, []);

  return (
    <SectionTheme className="relative">
      {/*
        The scroll region. Roughly one viewport of travel per stage, plus one
        for the stage itself to sit in — enough that no step flashes past, and
        short enough that the page never feels stuck, which is the failure mode
        a long pinned scene invites.
      */}
      <div
        ref={regionRef}
        className="relative min-h-[560svh]"
        style={{ ["--fj-n" as string]: STAGES.length }}
      >
        <div className="sticky top-0 flex h-svh flex-col justify-center overflow-hidden">
          {/*
            Ambient bed. Deliberately dim and slow — it exists to stop the dark
            section reading as a flat black rectangle, not to be looked at.
            Muted and `playsInline` so iOS plays it without going fullscreen.
          */}
          <video
            aria-hidden="true"
            autoPlay
            muted
            loop
            playsInline
            preload="none"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.14] motion-reduce:hidden"
          >
            <source src={loops.water} type="video/mp4" />
          </video>

          {/* Per-stage photography, crossfading on the same term as the type. */}
          {STAGES.map((stage, i) => (
            <div
              key={`media-${stage.label}`}
              aria-hidden="true"
              className="fj-media pointer-events-none absolute inset-0 opacity-0 will-change-transform motion-reduce:hidden"
              style={{ ["--fj-i" as string]: i }}
            >
              <img
                src={stage.media.src}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover opacity-30"
              />
            </div>
          ))}

          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-b from-background via-background/60 to-background"
          />

          <div className="relative z-10 mx-auto w-full max-w-5xl px-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--paper)/0.55)]">
              How a rupee travels
            </p>

            <h2 className="mt-5 max-w-3xl">
              <span
                className="block font-grotesk text-3xl font-extrabold uppercase leading-[0.92] tracking-[-0.02em] text-foreground sm:text-5xl"
                style={{ fontStretch: "86%" }}
              >
                From a donation
              </span>
              <span
                className="mt-1 block font-display text-3xl font-semibold leading-[1] tracking-[-0.03em] text-primary sm:text-5xl"
                style={{ fontVariationSettings: '"SOFT" 12' }}
              >
                to a receipt for it.
              </span>
            </h2>

            {/*
              The stages share one grid cell so they cross-fade in place. Height
              is reserved by the tallest of them rather than by a fixed value,
              which is what `grid` + `col-start-1 row-start-1` buys here: no
              magic number to go stale when a body line rewraps.
            */}
            <div className="mt-12 grid">
              {STAGES.map((stage, i) => (
                <div
                  key={stage.label}
                  className="fj-stage col-start-1 row-start-1 will-change-transform"
                  style={{ ["--fj-i" as string]: i }}
                >
                  <p className="tnum font-grotesk text-[11px] font-extrabold uppercase tracking-[0.18em] text-primary">
                    {String(i + 1).padStart(2, "0")} / {String(STAGES.length).padStart(2, "0")}
                  </p>
                  <h3 className="mt-3 font-grotesk text-4xl font-extrabold uppercase leading-[0.95] tracking-[-0.02em] text-foreground sm:text-6xl">
                    {stage.label}
                  </h3>
                  <p className="mt-5 max-w-xl text-sm leading-relaxed text-[hsl(var(--paper)/0.7)] sm:text-base sm:leading-relaxed">
                    {stage.body}
                  </p>
                </div>
              ))}
            </div>

            {/* The rail, filling once across the whole scene. */}
            <div
              aria-hidden="true"
              className="relative mt-12 h-px w-full max-w-xl bg-[hsl(var(--paper)/0.18)]"
            >
              <div className="fj-fill absolute inset-y-0 left-0 w-full origin-left scale-x-0 bg-primary" />
            </div>
          </div>
        </div>
      </div>
    </SectionTheme>
  );
}

import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, MoveHorizontal } from "lucide-react";
import { impactStories, storyMaxWidth, type ImpactStory } from "@/content/media";
import { ScrollTrigger, gsap, prefersReducedMotion } from "@/lib/gsap";
import { cn } from "@/lib/utils";

/**
 * The impact stories, read sideways.
 *
 * This replaces the vertical photo-essay that used to sit here. Six stacked
 * plates ran to roughly three screens on a page that already asks for six, and
 * the section stopped being an argument and became a scroll tax. Held in one
 * band, all six are present at once and the eye travels instead of the page.
 *
 * ── How the motion works, and what it deliberately is NOT ──────────────────
 *
 * The usual way to build this is to PIN the section and convert vertical scroll
 * into horizontal travel. Pinning is banned here and the ban was earned twice
 * (see HANDOFF §3.1): a pin switches the element to fixed positioning inside a
 * generated spacer, and anything with a margin or a full-bleed breakout — both
 * true of this section — renders off-frame. What the visitor sees is a blank
 * band, which is the single worst failure this page can have.
 *
 * So: no pin, no spacer, no faked scrollbar. The rail is a REAL horizontal
 * scroll container. It can be swiped, dragged, wheel-scrolled and tabbed
 * through with no JavaScript at all, and vertical scroll merely *drives* its
 * `scrollLeft` while the section crosses the viewport. If the driver never runs
 * — reduced motion, a stalled frame loop, a script error — the section is a
 * perfectly ordinary carousel rather than an empty hole. The resting state is
 * always the readable state.
 */

interface StoryCopy {
  category: string;
  caption: string;
  wideAlt: string;
  portraitAlt: string;
}

/**
 * Deliberately sparse copy describing the CATEGORY of work only — no invented
 * names, beneficiary counts, quotes or organisations. These photographs carry
 * no records behind them, and this platform's whole argument is that a number
 * on screen can be traced to something real.
 */
const STORY_COPY: StoryCopy[] = [
  {
    category: "Education",
    caption: "A classroom is wherever people choose to teach.",
    wideAlt: "Students gathered for an open-air class",
    portraitAlt: "A student seated at an outdoor lesson",
  },
  {
    category: "Clean water",
    caption: "Distance to water shapes a family's whole day.",
    wideAlt: "A community water point in daily use",
    portraitAlt: "Someone drawing water at a village well",
  },
  {
    category: "Skills training",
    caption: "A trade learned is income that doesn't run out.",
    wideAlt: "A vocational training session in progress",
    portraitAlt: "A trainee practising a hands-on skill",
  },
  {
    category: "Women's collective",
    caption: "Collective work moves faster than solitary work.",
    wideAlt: "A women's collective meeting together",
    portraitAlt: "A member of a women's collective at work",
  },
  {
    category: "Maternal & child health",
    caption: "Early care is the cheapest care there is.",
    wideAlt: "A maternal and child health visit underway",
    portraitAlt: "A health worker attending to a mother and child",
  },
  {
    category: "Land restoration",
    caption: "Restored land keeps paying back, season after season.",
    wideAlt: "Land under active restoration and cultivation",
    portraitAlt: "Someone tending a plot of restored land",
  },
];

/**
 * NATIVE widths, with no headroom at all.
 *
 * These slices came off a contact sheet: the wide plates are 489px and the
 * portraits 222px. The section this replaced allowed ~1.1x, which rendered a
 * 489px photograph at 538px — a 10% upscale, inventing pixels for no gain. The
 * card is capped at exactly what the source can supply and the band is composed
 * around that limit rather than fighting it.
 */
const WIDE_MAX = storyMaxWidth.wide; // 489
const PORTRAIT_MAX = storyMaxWidth.portrait; // 222

/**
 * Where in the section's pass across the viewport the horizontal travel starts
 * and finishes. Starting at 0 would mean the rail is already moving before the
 * section is properly on screen, and ending at 1 would leave the last card
 * arriving as it exits. The dead margins at both ends are what makes the travel
 * feel like it belongs to the section rather than to the whole page.
 */
const TRAVEL_START = 0.06;
const TRAVEL_END = 0.94;

/**
 * How long a manual interaction owns the rail before scroll-driving resumes.
 * Without this, a visitor dragging the rail one way while the page moves the
 * other gets a fight they cannot win.
 */
const MANUAL_HOLD_MS = 1600;

function StoryCard({
  story,
  copy,
  index,
}: {
  story: ImpactStory;
  copy: StoryCopy;
  index: number;
}) {
  return (
    <article
      className="group shrink-0"
      style={{ width: `min(${WIDE_MAX}px, 78vw)` }}
    >
      <div className="relative">
        <div className="overflow-hidden bg-[hsl(var(--olive))]">
          <img
            src={story.wide}
            alt={copy.wideAlt}
            width={489}
            height={264}
            /* The first two are on screen the moment the section is reached;
               everything past them is genuinely below the fold of the rail. */
            loading={index < 2 ? "eager" : "lazy"}
            className="aspect-[489/264] w-full object-cover transition-transform duration-700 ease-out-soft group-hover:scale-[1.03]"
          />
        </div>

        {/* Portrait plate, overlapping the wide one's lower-right corner. The
            border is `--ink` rather than `--background` so it stays the ground
            colour of this section in both themes. */}
        <div
          className="absolute -bottom-6 right-4 w-[38%] overflow-hidden border-4 border-[hsl(var(--ink))] bg-[hsl(var(--olive))] shadow-lifted"
          style={{ maxWidth: PORTRAIT_MAX }}
        >
          <img
            src={story.portrait}
            alt={copy.portraitAlt}
            width={222}
            height={184}
            loading="lazy"
            className="aspect-[222/184] w-full object-cover"
          />
        </div>

        <span
          className="tnum pointer-events-none absolute left-3 top-1 font-grotesk text-6xl font-extrabold leading-none text-[hsl(var(--paper))] mix-blend-difference"
          style={{ fontStretch: "82%" }}
        >
          {String(index + 1).padStart(2, "0")}
        </span>
      </div>

      <p className="mt-10 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
        {copy.category}
      </p>
      <p
        className="mt-3 font-display text-xl leading-snug text-[hsl(var(--paper))] sm:text-2xl"
        style={{ fontVariationSettings: '"SOFT" 12' }}
      >
        {copy.caption}
      </p>
    </article>
  );
}

export function StoryRail() {
  const sectionRef = useRef<HTMLElement>(null);
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const rail = railRef.current;
    if (!section || !rail || prefersReducedMotion()) return;

    let manualUntil = 0;
    const holdManually = () => {
      manualUntil = performance.now() + MANUAL_HOLD_MS;
    };

    /*
     * `wheel` is deliberately NOT listened for. A vertical wheel event over the
     * rail is the ordinary way to scroll the page past this section, so
     * treating it as manual intent would disable the driver for anybody using
     * a mouse. Pointer, touch and keyboard are unambiguous.
     */
    rail.addEventListener("pointerdown", holdManually);
    rail.addEventListener("touchstart", holdManually, { passive: true });
    rail.addEventListener("keydown", holdManually);

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: section,
        start: "top bottom",
        end: "bottom top",
        /*
         * No `scrub`. Scrub smooths an ATTACHED animation's playhead; this
         * trigger has no animation, it writes `scrollLeft` itself, so scrub
         * would buy nothing and only obscure that. Writing the position
         * directly also means the rail tracks the page 1:1 — the travel is
         * proportional to the scroll that caused it, which is the whole
         * argument for driving it from scroll at all.
         */
        onUpdate: (self) => {
          if (performance.now() < manualUntil) return;

          // Below the breakpoint where cards overflow, there is nothing to
          // travel and `max` is 0 — writing scrollLeft would be a no-op, but
          // bailing keeps the intent obvious.
          const max = rail.scrollWidth - rail.clientWidth;
          if (max <= 0) return;

          const span = TRAVEL_END - TRAVEL_START;
          const t = gsap.utils.clamp(0, 1, (self.progress - TRAVEL_START) / span);
          rail.scrollLeft = max * t;
        },
      });
    }, section);

    return () => {
      rail.removeEventListener("pointerdown", holdManually);
      rail.removeEventListener("touchstart", holdManually);
      rail.removeEventListener("keydown", holdManually);
      ctx.revert();
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      /* Full-bleed breakout. `w-screen` includes the scrollbar, which is why
         `html, body { overflow-x: clip }` is set globally — see HANDOFF §3.4. */
      className="relative left-1/2 w-screen -translate-x-1/2 border-y border-[hsl(var(--paper)/0.12)] bg-[hsl(var(--ink))] py-20 text-[hsl(var(--paper))] sm:py-24"
    >
      {/* Above the page thread (z-5), which passes behind this column. */}
      <div className="relative z-10 mx-auto max-w-7xl px-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[hsl(var(--paper)/0.55)]">
          The work itself
        </p>

        {/* Hand-set rather than `DisplayStack`, which resolves to
            `text-foreground` — on this permanently-ink ground that inverts in
            dark mode into dark type on dark. HANDOFF §3.3. */}
        <h2 className="mt-7 max-w-3xl">
          <span
            className="block font-grotesk text-[13vw] font-extrabold uppercase leading-[0.86] tracking-[-0.04em] sm:text-[7vw]"
            style={{ fontStretch: "80%" }}
          >
            Impact isn&rsquo;t
          </span>
          <span
            className="mt-1 block font-display text-[13vw] font-semibold leading-[0.92] tracking-[-0.03em] text-[hsl(var(--paper)/0.62)] sm:text-[7vw]"
            style={{ fontVariationSettings: '"SOFT" 12' }}
          >
            a number. It&rsquo;s a place.
          </span>
        </h2>

        <div className="mt-8 flex flex-wrap items-end justify-between gap-6 border-t border-[hsl(var(--paper)/0.15)] pt-6">
          <p className="max-w-md text-sm leading-relaxed text-[hsl(var(--paper)/0.6)]">
            Six kinds of work this platform funds, held at the scale the
            photographs actually support — small, sharp, and side by side.
          </p>
          <p className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[hsl(var(--paper)/0.5)]">
            <MoveHorizontal className="h-3.5 w-3.5" />
            Scroll, or drag the rail
          </p>
        </div>
      </div>

      {/*
        The rail runs to the viewport edge on the right — a band that stops
        neatly inside a container reads as a finished list, and the whole point
        is that there is more of it than fits. Left padding matches the header's
        gutter so card 01 lines up with the headline above it.
      */}
      <div
        ref={railRef}
        role="region"
        aria-label="Impact stories"
        tabIndex={0}
        className={cn(
          /*
           * NO scroll-snap. `snap-mandatory` and a scroll-driven rail are
           * incompatible: the driver writes `scrollLeft` continuously, and
           * mandatory snapping re-targets the nearest snap point after every
           * write, so the rail resists the page and either sticks on a card or
           * jitters between two. Snapping is for a rail a thumb flicks; this
           * one is driven by the page scrollbar, which is already smooth.
           */
          "relative z-10 mt-14 flex gap-8 overflow-x-auto pb-6 sm:gap-12",
          // Matches `max-w-7xl` + `px-6` at wide viewports so the first card
          // sits under the headline rather than at the raw window edge.
          "pl-6 pr-6 [scrollbar-width:thin] xl:pl-[max(1.5rem,calc((100vw-80rem)/2+1.5rem))]",
        )}
      >
        {impactStories.map((story, i) => (
          <StoryCard
            key={story.id}
            story={story}
            copy={STORY_COPY[i]!}
            index={i}
          />
        ))}

        {/* The rail ends in a destination, not in whitespace. */}
        <div className="flex shrink-0 items-center pr-6" style={{ width: "min(320px, 70vw)" }}>
          <Link
            to="/browse"
            className="group inline-flex flex-col gap-3 text-[hsl(var(--paper))]"
          >
            <span
              className="font-grotesk text-3xl font-extrabold uppercase leading-[0.95] tracking-[-0.03em]"
              style={{ fontStretch: "82%" }}
            >
              See who
              <br />
              does this
              <br />
              <span className="text-primary">work.</span>
            </span>
            <span className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[hsl(var(--paper)/0.6)]">
              Browse organisations
              <ArrowRight className="h-3.5 w-3.5 text-accent transition-transform duration-200 ease-out-soft group-hover:translate-x-1" />
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}

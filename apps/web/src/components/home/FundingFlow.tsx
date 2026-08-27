import { useEffect, useRef, useState } from "react";
import { loops } from "@/content/media";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { SectionTheme } from "@/components/ui/SectionTheme";
import { cn } from "@/lib/utils";

/**
 * The six stages are the ones the backend actually models — the application
 * pipeline in `apps/api/src/services/grantWorkflow.ts` and the `FUNDS_RELEASED`
 * transition that opens a Project and its Reports. Nothing here is aspirational
 * copy; every step corresponds to a state the system can be in.
 */
const STAGES = [
  {
    label: "Donor",
    body: "Someone gives to a nonprofit they can actually check — registration, documents and identity all verified before the page goes live.",
  },
  {
    label: "ImpactBridge",
    body: "The platform holds the record. Every decision that follows is logged, attributed and timestamped.",
  },
  {
    label: "Grant",
    body: "A funder publishes an opportunity with real eligibility rules, a fixed pot and a deadline.",
  },
  {
    label: "Nonprofit",
    body: "They apply. The application moves through review, interview and decision — each transition checked against who is allowed to make it.",
  },
  {
    label: "Project",
    body: "On approval the funds are released and a project opens. The award is checked against what remains in the pot.",
  },
  {
    label: "Report",
    body: "The nonprofit reports back: milestones, updates, and what was actually spent.",
  },
] as const;

export function FundingFlow() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<SVGLineElement>(null);
  const [active, setActive] = useState(prefersReducedMotion() ? STAGES.length : 0);

  useEffect(() => {
    const section = sectionRef.current;
    const line = lineRef.current;
    if (!section || !line) return;

    // Reduced motion: the line is already drawn and every stage is already
    // active (see the useState initialiser), so there is nothing to set up.
    if (prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      const length = line.getTotalLength();
      gsap.set(line, { strokeDasharray: length, strokeDashoffset: length });

      /*
       * Not pinned. The section is already tall enough to give the sequence
       * real scroll distance, and every step of that scroll delivers another
       * stage of the process — so it never feels like the page is stuck, which
       * is the failure mode pinning invites.
       */
      gsap.to(line, {
        strokeDashoffset: 0,
        ease: "none",
        scrollTrigger: {
          trigger: section,
          start: "top 70%",
          end: "bottom 85%",
          scrub: 0.4,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            // One stage ahead of the line so a node lights up as the line
            // reaches it rather than just after.
            setActive(Math.round(self.progress * STAGES.length + 0.25));
          },
        },
      });
    }, section);

    return () => ctx.revert();
  }, []);

  return (
    <SectionTheme className="relative overflow-hidden">
      {/*
        Ambient bed. Deliberately dim and slow — it exists to stop the dark
        section reading as a flat black rectangle, not to be looked at. Muted
        and `playsInline` so iOS plays it without going fullscreen.
      */}
      <video
        aria-hidden="true"
        autoPlay
        muted
        loop
        playsInline
        preload="none"
        poster=""
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.18] motion-reduce:hidden"
      >
        <source src={loops.water} type="video/mp4" />
      </video>
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-background via-background/70 to-background"
      />

      {/* `z-10`: above the page thread, which passes behind this column. */}
      <div ref={sectionRef} className="relative z-10 mx-auto max-w-5xl px-6 py-20 sm:py-24">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          How a rupee travels
        </p>
        <h2 className="mt-6 max-w-3xl">
          <span
            className="block font-grotesk text-4xl font-extrabold uppercase leading-[0.92] tracking-[-0.02em] text-foreground sm:text-6xl"
            style={{ fontStretch: "86%" }}
          >
            From a donation
          </span>
          <span
            className="mt-1 block font-display text-4xl font-semibold leading-[1] tracking-[-0.03em] text-primary sm:text-6xl"
            style={{ fontVariationSettings: '"SOFT" 12' }}
          >
            to a receipt for it.
          </span>
        </h2>

        <div className="relative mt-14 pl-14 sm:pl-24">
          {/* The rail the stages hang from. */}
          <svg
            aria-hidden="true"
            className="absolute left-[13px] top-2 h-[calc(100%-1rem)] w-2 sm:left-[27px]"
            viewBox="0 0 2 100"
            preserveAspectRatio="none"
          >
            <line x1="1" y1="0" x2="1" y2="100" className="stroke-border" strokeWidth="2" />
            <line
              ref={lineRef}
              x1="1"
              y1="0"
              x2="1"
              y2="100"
              className="stroke-primary"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          <ol className="space-y-10 sm:space-y-12">
            {STAGES.map((stage, i) => {
              const on = i < active;
              return (
                <li key={stage.label} className="relative">
                  {/* Node marker, sitting on the rail. */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute -left-14 top-1.5 flex h-7 w-7 items-center justify-center rounded-full border-2 transition-all duration-500 ease-out-soft sm:-left-24",
                      on
                        ? "scale-100 border-primary bg-primary text-primary-foreground"
                        : "scale-90 border-border bg-background text-muted-foreground",
                    )}
                  >
                    <span className="tnum text-[10px] font-bold">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </span>

                  {/*
                    The active/inactive distinction is carried by the heading
                    colour and the node marker — NOT by dimming the body copy.
                    Fading the text to 40% measured 2.2:1 against the
                    background, well under the 4.5:1 minimum, and that is the
                    state every visitor sees before the scrub reaches a stage.
                    Unreadable-until-scrolled is not a legitimate design state.
                  */}
                  <h3
                    className={cn(
                      "font-grotesk text-2xl font-extrabold uppercase tracking-[-0.01em] transition-colors duration-500 sm:text-4xl",
                      on ? "text-foreground" : "text-muted-foreground",
                    )}
                    style={{ fontStretch: "88%" }}
                  >
                    {stage.label}
                  </h3>
                  <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                    {stage.body}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>

        <p className="mt-14 max-w-xl border-t border-border pt-6 text-sm leading-relaxed text-muted-foreground">
          Every stage above is a real state in the system, not a diagram. The
          transitions are enforced on the server and written to an append-only
          event log — which is what makes the last step possible at all.
        </p>
      </div>
    </SectionTheme>
  );
}

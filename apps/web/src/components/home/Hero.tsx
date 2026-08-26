import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { heroSequence } from "@/content/media";
import { gsap, prefersReducedMotion } from "@/lib/gsap";

/**
 * The hero.
 *
 * The photograph sits in the background and recedes as you scroll — fading and
 * drifting slightly behind the content that follows, so the transition into the
 * page is a dissolve rather than a cut.
 *
 * An earlier version scrubbed a 100-frame image sequence, so scrolling animated
 * the subject walking toward the camera. It was dropped: it spent a great deal
 * of scroll distance and 3.4 MB of frames on motion that communicated nothing,
 * and it read as the page being stuck. A quiet fade does more with far less.
 *
 * Type sits left throughout because the subject occupies the right of frame,
 * and the headline breaks across the composition so "the ground." lands low,
 * near the path she is walking on.
 */
export function Hero() {
  const sectionRef = useRef<HTMLElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      const timeline = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: "bottom top",
          scrub: 0.5,
          invalidateOnRefresh: true,
        },
      });

      // The photograph recedes: dimming and easing back, never fully gone
      // before the section leaves.
      timeline.to(
        imageRef.current,
        { opacity: 0.15, scale: 1.06, ease: "none" },
        0,
      );

      // Content leaves a little faster than the image, which reads as depth.
      timeline.to(
        contentRef.current,
        { opacity: 0, y: -60, ease: "none" },
        0,
      );
    }, section);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative flex h-[92svh] w-full items-stretch overflow-hidden bg-[hsl(200_36%_7%)]"
    >
      <div ref={imageRef} className="absolute inset-0 will-change-transform">
        <img
          src={heroSequence.poster}
          alt={heroSequence.alt}
          className="h-full w-full object-cover object-[60%_top]"
          {...{ fetchpriority: "high" }}
        />
      </div>

      {/*
        Directional scrim: dense on the left where the type sits, clearing to
        nothing on the right so the subject stays fully legible. A flat overlay
        would mute the whole photograph to protect text that only needs
        protecting on one side.
      */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-r from-[hsl(200_36%_7%/0.9)] via-[hsl(200_36%_7%/0.5)] to-transparent"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-[hsl(200_36%_7%)] via-[hsl(200_36%_7%/0.6)] to-transparent"
      />

      <div
        ref={contentRef}
        className="relative mx-auto flex w-full max-w-7xl flex-col justify-end px-6 pb-16 sm:pb-20"
      >
        <p className="animate-fade-up text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(40_24%_96%/0.7)] [animation-delay:120ms]">
          Verified nonprofits · transparent grants
        </p>

        <h1 className="mt-5 max-w-4xl text-[hsl(40_24%_96%)]">
          <span
            className="block animate-fade-up font-grotesk text-[11vw] font-extrabold uppercase leading-[0.88] tracking-[-0.03em] [animation-delay:220ms] sm:text-[6.4vw]"
            style={{ fontStretch: "84%" }}
          >
            Funding that
            <br />
            actually reaches
          </span>
          <span
            className="mt-1 block animate-fade-up font-display text-[11vw] font-semibold leading-[0.92] tracking-[-0.035em] text-[hsl(36_92%_62%)] [animation-delay:360ms] sm:text-[6.4vw]"
            style={{ fontVariationSettings: '"SOFT" 10' }}
          >
            the ground.
          </span>
        </h1>

        <div className="mt-8 flex animate-fade-up flex-wrap items-center gap-4 [animation-delay:480ms]">
          <Link
            to="/browse"
            className="group inline-flex h-12 items-center gap-2 rounded-lg bg-[hsl(40_24%_96%)] px-6 text-sm font-semibold text-[hsl(200_36%_7%)] transition-all duration-200 ease-out-soft active:scale-[0.97]"
          >
            Explore nonprofits
            <ArrowRight className="h-4 w-4 transition-transform duration-200 ease-out-soft group-hover:translate-x-0.5" />
          </Link>
          <Link
            to="/grants"
            className="text-sm font-semibold text-[hsl(40_24%_96%/0.8)] underline-offset-8 transition-colors hover:text-[hsl(40_24%_96%)] hover:underline"
          >
            Browse grants
          </Link>
        </div>
      </div>
    </section>
  );
}

import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { loops, posters } from "@/content/media";
import { gsap, prefersReducedMotion } from "@/lib/gsap";

/**
 * The hero.
 *
 * The backdrop recedes as you scroll — dimming and easing back behind the
 * content that follows, so entering the page is a dissolve rather than a cut.
 *
 * ── Why a canopy and not a person ──────────────────────────────────────────
 *
 * This opened on a still of a health worker walking, and it was the one part of
 * the landing page that read as off-brand: a stock-feeling portrait in front of
 * a site whose every other photograph is documentary. It also broke the rule
 * this project wrote for itself (HANDOFF §3.5) — a face behind a headline
 * always loses, because the eye goes to the face, the type then needs a heavy
 * scrim, and the scrim bleaches the photograph into a ghost. Texture reads as
 * depth at any opacity and never competes.
 *
 * Browse opens on the same canopy, deliberately graded the other way: bright
 * and open at half opacity. Here it is dark, tight and slow, so the two read as
 * the same world rather than the same shot.
 *
 * An even earlier version scrubbed a 100-frame sequence so scrolling animated
 * the subject walking toward camera. Dropped: it spent enormous scroll distance
 * and 3.4 MB on motion that communicated nothing, and read as the page being
 * stuck.
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
      /* `--ink`, not the old hard-coded blue-black. That literal was a leftover
         from the blue-grey palette this direction replaced, and it made the
         hero the one section on the site sitting on a colour from the previous
         design. */
      className="relative flex h-[92svh] w-full items-stretch overflow-hidden bg-[hsl(var(--ink))]"
    >
      <div ref={imageRef} className="absolute inset-0 will-change-transform">
        <video
          aria-hidden="true"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster={posters.tree}
          /* Scaled past the frame and pushed off-centre so it reads as a crop
             of a bigger scene rather than a clip playing in a box. Opacity is
             low: this is a texture the type sits on, not a picture to look at.
             `motion-reduce:hidden` leaves the poster behind it. */
          className="h-[112%] w-full scale-110 object-cover object-[38%_35%] opacity-[0.42] motion-reduce:hidden"
        >
          <source src={loops.tree} type="video/mp4" />
        </video>

        {/* What anyone with reduced motion — or a browser that refuses to
            autoplay — actually sees. Same crop, same grade. */}
        <img
          src={posters.tree}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 -z-10 h-full w-full scale-110 object-cover object-[38%_35%] opacity-[0.42]"
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
        className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--ink)/0.95)] via-[hsl(var(--ink)/0.6)] to-[hsl(var(--ink)/0.25)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-[hsl(var(--ink))] via-[hsl(var(--ink)/0.6)] to-transparent"
      />

      <div
        ref={contentRef}
        className="relative mx-auto flex w-full max-w-7xl flex-col justify-end px-6 pb-16 sm:pb-20"
      >
        <p className="animate-fade-up text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--paper)/0.7)] [animation-delay:120ms]">
          Verified nonprofits · transparent grants
        </p>

        <h1 className="mt-5 max-w-4xl text-[hsl(var(--paper))]">
          <span
            className="block animate-fade-up font-grotesk text-[11vw] font-extrabold uppercase leading-[0.88] tracking-[-0.03em] [animation-delay:220ms] sm:text-[6.4vw]"
            style={{ fontStretch: "84%" }}
          >
            Funding that
            <br />
            actually reaches
          </span>
          <span
            className="mt-1 block animate-fade-up font-display text-[11vw] font-semibold leading-[0.92] tracking-[-0.035em] text-accent [animation-delay:360ms] sm:text-[6.4vw]"
            style={{ fontVariationSettings: '"SOFT" 10' }}
          >
            the ground.
          </span>
        </h1>

        <div className="mt-8 flex animate-fade-up flex-wrap items-center gap-4 [animation-delay:480ms]">
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
  );
}

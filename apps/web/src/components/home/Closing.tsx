import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { loops, posters } from "@/content/media";

/**
 * The last thing before the footer.
 *
 * The page used to end on the FAQ and hand straight over to a row of nav
 * columns, which is an abrupt way to finish an argument: the reader arrives at
 * the end of the case and the next thing they see is a sitemap. A closing
 * statement gives the page somewhere to land.
 *
 * ── Why this line ──────────────────────────────────────────────────────────
 *
 * "Good funding leaves evidence" is the platform's actual claim, not a slogan
 * bolted on at the end. Everything above it — a verification record, a
 * transition log, a receipt for every completed payment, reports against
 * released funds — exists to produce evidence. Saying so plainly at the close
 * is the summary the page has already earned.
 *
 * ── The video ──────────────────────────────────────────────────────────────
 *
 * `people` rather than water or trees: this is the one moment on the page that
 * is about the reader deciding, so the bed should be human. It is dim, muted,
 * and behind a gradient — a moving ground for the type, not a clip to watch.
 * `preload="none"` because it sits at the bottom of a very long page and must
 * not compete with anything above it for bandwidth; `motion-reduce:hidden`
 * drops it entirely for anyone who has asked for less movement, falling back to
 * the poster still.
 */
export function Closing() {
  return (
    <section className="relative isolate overflow-hidden border-t border-border bg-[hsl(var(--ink))]">
      <img
        aria-hidden="true"
        src={posters.people}
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-25"
      />
      <video
        aria-hidden="true"
        autoPlay
        muted
        loop
        playsInline
        preload="none"
        poster={posters.people}
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-25 motion-reduce:hidden"
      >
        <source src={loops.people} type="video/mp4" />
      </video>

      {/* Ink wash, so the type holds whatever the footage is doing behind it. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-[hsl(var(--ink)/0.75)] via-[hsl(var(--ink)/0.6)] to-[hsl(var(--ink))]"
      />

      <div className="relative z-10 mx-auto max-w-[110rem] px-6 py-28 sm:py-36">
        <h2
          className="max-w-5xl font-grotesk font-extrabold uppercase leading-[0.86] tracking-[-0.035em] text-[hsl(var(--paper))]"
          style={{
            // The page's loudest voice, used once more at the close. Sized
            // against the viewport so the three lines hold their shape from a
            // phone to a wide desktop without rewrapping into four.
            fontSize: "clamp(2.5rem, 9vw, 8rem)",
            fontStretch: "72%",
          }}
        >
          Good funding
          <br />
          leaves
          <br />
          <span className="text-accent">evidence.</span>
        </h2>

        <div className="mt-14 flex flex-wrap items-center gap-x-8 gap-y-4">
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

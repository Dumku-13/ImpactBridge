import { SectionTheme } from "@/components/ui/SectionTheme";
import { Reveal } from "@/components/ui/Reveal";

/**
 * Who the platform is for, set as an editorial spread rather than three cards.
 *
 * ── Why the boxes went ─────────────────────────────────────────────────────
 *
 * This was three `rounded-xl` bordered cards with a tinted icon chip in each —
 * the most generic block on the page, and the one place the landing page still
 * looked like a template. A box earns its place when it groups things that
 * would otherwise run together; three columns separated by whitespace and a
 * rule do not need one. Removing the frames leaves the same information carried
 * by type, a number and a hairline, which is what makes editorial layout read
 * as expensive rather than assembled.
 *
 * ── Why it inverts ─────────────────────────────────────────────────────────
 *
 * The page runs ink → ivory → ink as it descends, and this sits between two
 * dark stretches. `SectionTheme` flips it against whatever the page theme is,
 * so the break survives the theme toggle instead of collapsing into a third
 * dark section in a row. It is the palate cleanser before the questions.
 *
 * Placement matters: `FundingFlow` is also inverted, so this deliberately sits
 * well below it with the stat band, story rail and causes in between. Two
 * inverted sections near each other would read as one long light stretch and
 * destroy the alternation they exist to create.
 */
const AUDIENCES = [
  {
    title: "For donors",
    body: "Find verified nonprofits working on causes you care about, give securely, and see exactly where your money goes.",
  },
  {
    title: "For nonprofits",
    body: "Build a credible public profile, receive donations, apply for grants, and report your impact in one place.",
  },
  {
    title: "For funders",
    body: "Publish grant opportunities, review and compare applicants side by side, and track how funds are used.",
  },
];

export function Audiences() {
  return (
    <SectionTheme className="border-t border-border bg-background">
      <div className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
        <Reveal>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Three sides of the same record
          </p>
        </Reveal>

        {/*
          `divide-x` at the large breakpoint is the whole structure: one hairline
          between columns instead of six borders around three boxes.
        */}
        <div className="mt-14 grid gap-12 lg:grid-cols-3 lg:gap-0 lg:divide-x lg:divide-border">
          {AUDIENCES.map(({ title, body }, i) => (
            <Reveal key={title} delay={i * 90}>
              <div className="lg:px-10 lg:first:pl-0 lg:last:pr-0">
                <p className="tnum font-grotesk text-[11px] font-extrabold uppercase tracking-[0.18em] text-primary">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <h2
                  className="mt-5 font-display text-2xl font-semibold tracking-[-0.01em] text-foreground sm:text-3xl"
                  style={{ fontVariationSettings: '"SOFT" 12' }}
                >
                  {title}
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base sm:leading-relaxed">
                  {body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </SectionTheme>
  );
}

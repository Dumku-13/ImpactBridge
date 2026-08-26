import { editorial } from "@/content/media";
import { Reveal } from "@/components/ui/Reveal";

/**
 * The premise, stated plainly before any product detail.
 *
 * This is the section that separates ImpactBridge from a donation page: the
 * hard part of funding usually isn't finding money, it's everything that has to
 * happen afterwards and stay accountable. Said once, in large type, with a
 * single photograph — no cards, no icons, no three-column feature grid.
 */
export function Premise() {
  return (
    <section className="relative bg-background py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            The premise
          </p>
        </Reveal>

        <div className="mt-8 grid gap-14 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <Reveal delay={80}>
            <h2>
              <span
                className="block font-grotesk text-4xl font-extrabold uppercase leading-[0.94] tracking-[-0.025em] text-foreground sm:text-6xl"
                style={{ fontStretch: "86%" }}
              >
                The problem with funding
              </span>
              <span
                className="mt-1 block font-display text-4xl font-semibold leading-[1.02] tracking-[-0.03em] text-muted-foreground sm:text-6xl"
                style={{ fontVariationSettings: '"SOFT" 12' }}
              >
                isn&rsquo;t always finding money.
              </span>
            </h2>

            <p className="mt-8 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              It&rsquo;s the months afterwards. Applications sitting unanswered.
              Decisions nobody can retrace. Money that moves without anyone
              being able to say where it landed, or what it did when it got
              there.
            </p>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-foreground sm:text-lg">
              ImpactBridge puts that entire lifecycle in one place — application
              to final report — and keeps a record of every step.
            </p>
          </Reveal>

          <Reveal delay={200}>
            {/*
              Capped at the asset's real width (1200px). The container is
              deliberately narrower than the text column so the photograph reads
              as a supporting plate rather than competing with the headline.
            */}
            <figure className="relative">
              <div className="aspect-[16/10] overflow-hidden rounded-sm bg-secondary">
                <img
                  src={editorial.ngoCommunity.src}
                  alt={editorial.ngoCommunity.alt}
                  width={1200}
                  height={658}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </div>
              <figcaption className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Fieldworkers meeting a community — the last mile that funding is
                supposed to reach.
              </figcaption>
            </figure>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

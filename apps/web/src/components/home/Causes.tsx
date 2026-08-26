import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { causes, type MediaAsset } from "@/content/media";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/utils";

/**
 * The causes this platform funds — six of them, at very different real
 * resolutions (1024px down to 480px). Rather than force a six-up grid of
 * equal cards, the layout leans into that spread: education and disaster
 * relief, the two large source photographs, get large panels; the other four
 * stay small, paired off as duos beside them. That asymmetry is the design,
 * not a compromise — see `@/content/media` for the resolution notes.
 *
 * Every image frame carries an explicit `maxWidth` cap taken straight from
 * the asset's real pixel width, so no panel can ever be asked to render
 * larger than its source supports, regardless of how the surrounding grid
 * happens to size at a given breakpoint.
 */

interface CauseDef {
  index: string;
  name: string;
  slug: string;
  line: string;
  asset: MediaAsset;
}

const CAUSE_LIST: CauseDef[] = [
  {
    index: "01",
    name: "Education",
    slug: "education",
    line: "A seat in a classroom, kept open.",
    asset: causes.education,
  },
  {
    index: "02",
    name: "Healthcare",
    slug: "healthcare",
    line: "Care that reaches people where they already are.",
    asset: causes.healthcare,
  },
  {
    index: "03",
    name: "Women Empowerment",
    slug: "women-empowerment",
    line: "Collective work, and the leadership it builds.",
    asset: causes.womenEmpowerment,
  },
  {
    index: "04",
    name: "Environment",
    slug: "environment",
    line: "Land and water, restored rather than depleted.",
    asset: causes.environment,
  },
  {
    index: "05",
    name: "Animals",
    slug: "animals",
    line: "Care for the animals a household depends on.",
    asset: causes.animals,
  },
  {
    index: "06",
    name: "Disaster Relief",
    slug: "disaster-relief",
    line: "Help that arrives before the news cycle moves on.",
    asset: causes.disasterRelief,
  },
];

const [EDUCATION, HEALTHCARE, WOMEN, ENVIRONMENT, ANIMALS, DISASTER] = CAUSE_LIST;

function CausePanel({
  cause,
  size,
  delay = 0,
  className,
}: {
  cause: CauseDef;
  size: "lg" | "sm";
  delay?: number;
  className?: string;
}) {
  const height = Math.round(cause.asset.maxWidth * (size === "lg" ? 1.25 : 1));

  return (
    <Reveal delay={delay} className={className}>
      <Link to={`/browse?category=${cause.slug}`} className="group block">
        <div
          className={cn(
            "overflow-hidden rounded-sm border border-border bg-card shadow-subtle transition-shadow duration-300 ease-out-soft group-hover:shadow-lifted",
            /*
             * Landscape, matching the source. These photographs are landscape
             * (education is 1024x684); forcing them into a 4:5 portrait frame
             * cropped them hard and made each panel ~880px tall, which is what
             * pushed this one section past four screens on its own.
             */
            size === "lg" ? "aspect-[3/2]" : "aspect-[4/3]",
          )}
          style={{ maxWidth: cause.asset.maxWidth }}
        >
          <img
            src={cause.asset.src}
            alt={cause.asset.alt}
            width={cause.asset.maxWidth}
            height={height}
            loading="lazy"
            style={
              cause.asset.focalPoint ? { objectPosition: cause.asset.focalPoint } : undefined
            }
            className="h-full w-full object-cover transition-transform duration-500 ease-out-soft group-hover:scale-[1.04]"
          />
        </div>

        <div
          className={cn(
            "flex items-baseline gap-3",
            size === "lg" ? "mt-5" : "mt-3 gap-2",
          )}
          style={{ maxWidth: cause.asset.maxWidth }}
        >
          <span
            className={cn(
              "font-grotesk font-bold text-primary",
              size === "lg" ? "text-sm" : "text-[11px]",
            )}
          >
            {cause.index}
          </span>
          <h3
            className={cn(
              "font-display font-semibold text-foreground transition-colors duration-200 group-hover:text-foreground",
              size === "lg" ? "text-2xl sm:text-3xl" : "text-base",
            )}
            style={{ fontVariationSettings: '"SOFT" 10' }}
          >
            {cause.name}
          </h3>
        </div>
        <p
          className={cn(
            "text-muted-foreground",
            size === "lg"
              ? "mt-2 max-w-sm text-base leading-relaxed sm:text-lg"
              : "mt-1.5 text-sm leading-snug",
          )}
          style={{ maxWidth: cause.asset.maxWidth }}
        >
          {cause.line}
        </p>
      </Link>
    </Reveal>
  );
}

export function Causes() {
  return (
    <section className="relative border-t border-border bg-background py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="max-w-2xl">
          <Reveal>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              The causes
            </p>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="mt-8">
              <span
                className="block font-grotesk text-4xl font-extrabold uppercase leading-[0.94] tracking-[-0.025em] text-foreground sm:text-6xl"
                style={{ fontStretch: "86%" }}
              >
                Work worth funding
              </span>
              <span
                className="mt-1 block font-display text-4xl font-semibold leading-[1.02] tracking-[-0.03em] text-muted-foreground sm:text-6xl"
                style={{ fontVariationSettings: '"SOFT" 12' }}
              >
                doesn&rsquo;t come in one size.
              </span>
            </h2>
          </Reveal>

          <Reveal delay={160}>
            <p className="mt-8 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Every organisation on ImpactBridge works under one of six
              causes. Some need a single grant to finish a project; others
              run on many small gifts, given steadily.
            </p>
          </Reveal>
        </div>

        <div className="mt-12 flex flex-col gap-16 sm:mt-14 sm:gap-20">
          {/* Row one: education carries the large panel; healthcare and
              women's empowerment sit beside it as a small duo. */}
          <div className="flex flex-col gap-10 lg:grid lg:grid-cols-12 lg:items-end lg:gap-8">
            <CausePanel cause={EDUCATION!} size="lg" delay={0} className="lg:col-span-7" />
            <div className="grid grid-cols-2 gap-6 lg:col-span-5">
              <CausePanel cause={HEALTHCARE!} size="sm" delay={120} />
              <CausePanel cause={WOMEN!} size="sm" delay={200} />
            </div>
          </div>

          {/* Row two: mirrored — environment and animals as the small duo,
              disaster relief carrying the second large panel. On mobile the
              large panel still reads first; the duo trades sides at lg. */}
          <div className="flex flex-col gap-10 lg:grid lg:grid-cols-12 lg:items-end lg:gap-8">
            <div className="order-2 grid grid-cols-2 gap-6 lg:order-1 lg:col-span-5">
              <CausePanel cause={ENVIRONMENT!} size="sm" delay={0} />
              <CausePanel cause={ANIMALS!} size="sm" delay={80} />
            </div>
            <CausePanel
              cause={DISASTER!}
              size="lg"
              delay={160}
              className="order-1 lg:order-2 lg:col-span-7"
            />
          </div>
        </div>

        <Reveal delay={80} className="mt-16 sm:mt-12">
          <Link
            to="/browse"
            className="group inline-flex items-center gap-2 text-sm font-semibold text-foreground transition-colors duration-200 hover:text-primary"
          >
            Browse every organisation working on these causes
            <ArrowRight className="h-4 w-4 text-accent transition-transform duration-200 ease-out-soft group-hover:translate-x-1" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

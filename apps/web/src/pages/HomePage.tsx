import { Link } from "react-router-dom";
import { ArrowRight, Building2, HandCoins, Heart } from "lucide-react";
import { ROLE_LABELS } from "@impactbridge/shared";
import { useAuth } from "@/auth/AuthContext";
import { homeForRole } from "@/auth/routes";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Hero } from "@/components/home/Hero";
import { Premise } from "@/components/home/Premise";
import { FundingFlow } from "@/components/home/FundingFlow";
import { StoryRail } from "@/components/home/StoryRail";
import { StatBand } from "@/components/home/StatBand";
import { Causes } from "@/components/home/Causes";
import { useScrollTriggerRefresh } from "@/lib/gsap";

const AUDIENCES = [
  {
    icon: Heart,
    title: "For donors",
    body: "Find verified nonprofits working on causes you care about, give securely, and see exactly where your money goes.",
  },
  {
    icon: Building2,
    title: "For nonprofits",
    body: "Build a credible public profile, receive donations, apply for grants, and report your impact in one place.",
  },
  {
    icon: HandCoins,
    title: "For funders",
    body: "Publish grant opportunities, review and compare applicants side by side, and track how funds are used.",
  },
];

export function HomePage() {
  const { user } = useAuth();

  // Triggers on this page are created before fonts and images settle; without
  // this their ranges are measured against the wrong document height.
  useScrollTriggerRefresh();

  return (
    <div className="grain min-h-screen bg-background">
      {/*
        Floats over the hero rather than sitting above it. A light sticky bar on
        top of a full-bleed dark photograph reads as a browser chrome accident;
        letting the image run to the very top edge is most of what makes the
        composition feel art-directed. Colours are hard-coded to the ivory/ink
        end of the palette because this bar always sits on dark imagery,
        regardless of the visitor's theme.
      */}
      <header className="absolute inset-x-0 top-0 z-30">
        <nav className="mx-auto flex h-20 max-w-7xl items-center px-6">
          <span
            className="font-grotesk text-lg font-extrabold uppercase tracking-[0.02em] text-[hsl(40_24%_96%)]"
            style={{ fontStretch: "88%" }}
          >
            Impact<span className="text-[hsl(36_92%_62%)]">Bridge</span>
          </span>

          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle className="text-[hsl(40_24%_96%/0.75)] hover:bg-[hsl(40_24%_96%/0.12)] hover:text-[hsl(40_24%_96%)]" />
            {user ? (
              <Link
                to={homeForRole(user.role)}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-[hsl(40_24%_96%)] px-4 text-sm font-semibold text-[hsl(200_36%_7%)] transition-all duration-200 ease-out-soft active:scale-[0.97]"
              >
                Go to {ROLE_LABELS[user.role].toLowerCase()} dashboard
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-semibold text-[hsl(40_24%_96%/0.85)] transition-colors hover:bg-[hsl(40_24%_96%/0.12)] hover:text-[hsl(40_24%_96%)]"
                >
                  Sign in
                </Link>
                <Link
                  to="/signup"
                  className="inline-flex h-10 items-center rounded-lg bg-[hsl(40_24%_96%)] px-4 text-sm font-semibold text-[hsl(200_36%_7%)] transition-all duration-200 ease-out-soft active:scale-[0.97]"
                >
                  Get started
                </Link>
              </>
            )}
          </div>
        </nav>
      </header>

      <main>
        <Hero />

        <Premise />

        <FundingFlow />

        <StatBand />

        <StoryRail />

        <Causes />


        <section className="border-t border-border bg-card/60">
          <div className="stagger mx-auto grid max-w-6xl gap-6 px-6 py-20 md:grid-cols-3">
            {AUDIENCES.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="group rounded-xl border border-border bg-card p-6 shadow-subtle transition-all duration-300 ease-out-soft hover:-translate-y-1 hover:border-primary/25 hover:shadow-lifted"
              >
                <div className="mb-5 inline-flex rounded-xl bg-primary/10 p-3 ring-1 ring-inset ring-primary/15 transition-colors duration-300 group-hover:bg-primary/15">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h2 className="font-display text-xl font-semibold text-foreground">
                  {title}
                </h2>
                <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <p className="text-sm text-muted-foreground">
            ImpactBridge — a demonstration platform. Payments run in test mode;
            no real money is processed.
          </p>
        </div>
      </footer>
    </div>
  );
}

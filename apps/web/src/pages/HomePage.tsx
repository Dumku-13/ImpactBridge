import { Link } from "react-router-dom";
import { ArrowRight, Building2, HandCoins, Heart } from "lucide-react";
import { ROLE_LABELS } from "@impactbridge/shared";
import { useAuth } from "@/auth/AuthContext";
import { homeForRole } from "@/auth/routes";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Opening } from "@/components/home/Opening";
import { ScrollSpine } from "@/components/home/ScrollSpine";
import { PageThread } from "@/components/home/PageThread";
import { Premise } from "@/components/home/Premise";
import { FundingFlow } from "@/components/home/FundingFlow";
import { StoryRail } from "@/components/home/StoryRail";
import { StatBand } from "@/components/home/StatBand";
import { Causes } from "@/components/home/Causes";
import { Faq } from "@/components/site/Faq";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { useScrollTriggerRefresh } from "@/lib/gsap";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

/**
 * What the scroll rail tracks. Ids are attached to wrappers below rather than
 * inside each section component, so the rail's contents are decided in one
 * place — where the page's order actually lives.
 */
const SPINE = [
  { id: "opening", label: "The claim" },
  { id: "premise", label: "The premise" },
  { id: "flow", label: "How a rupee travels" },
  { id: "numbers", label: "The numbers" },
  { id: "work", label: "The work" },
  { id: "causes", label: "The causes" },
  // The FAQ is a chapter of the page like any other; leaving it out meant the
  // rail emptied out and the last chapter stayed lit for the final screenful.
  { id: "questions", label: "Questions" },
] as const;

/*
 * A stable array, built once at module scope.
 *
 * `sections={[...SPINE]}` created a NEW array on every render of this page, and
 * `ScrollSpine`'s effect depends on that prop — so every render tore down its
 * scroll listener, re-queried the DOM for six section elements, and
 * re-subscribed. Identity matters when a prop is an effect dependency.
 */
const SPINE_SECTIONS: Array<{ id: string; label: string }> = [...SPINE];

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
  useDocumentTitle("ImpactBridge");
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
      {/* Same skip link as AppLayout — the landing page has its own shell, so
          it needs its own. See the note there. */}
      <a
        href="#main"
        className="skip-link rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
      >
        Skip to content
      </a>

      <header className="absolute inset-x-0 top-0 z-30">
        <nav className="mx-auto flex h-20 max-w-7xl items-center px-6">
          <span
            className="font-grotesk text-lg font-extrabold uppercase tracking-[0.02em] text-[hsl(var(--paper))]"
            style={{ fontStretch: "88%" }}
          >
            Impact<span className="text-accent">Bridge</span>
          </span>

          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle className="text-[hsl(40_24%_96%/0.75)] hover:bg-[hsl(40_24%_96%/0.12)] hover:text-[hsl(var(--paper))]" />
            {user ? (
              <Link
                to={homeForRole(user.role)}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-[hsl(var(--paper))] px-4 text-sm font-semibold text-[hsl(var(--ink))] transition-all duration-200 ease-out-soft active:scale-[0.97]"
              >
                Go to {ROLE_LABELS[user.role].toLowerCase()} dashboard
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-semibold text-[hsl(40_24%_96%/0.85)] transition-colors hover:bg-[hsl(40_24%_96%/0.12)] hover:text-[hsl(var(--paper))]"
                >
                  Sign in
                </Link>
                <Link
                  to="/signup"
                  className="inline-flex h-10 items-center rounded-lg bg-[hsl(var(--paper))] px-4 text-sm font-semibold text-[hsl(var(--ink))] transition-all duration-200 ease-out-soft active:scale-[0.97]"
                >
                  Get started
                </Link>
              </>
            )}
          </div>
        </nav>
      </header>

      <ScrollSpine sections={SPINE_SECTIONS} />

      {/*
        `relative` so the thread can span exactly this box — the whole run of
        sections — and nothing else. It is the thread's scroll region as well as
        its canvas, which is why it is measured from here rather than from the
        document: the footer should not be part of the draw.
      */}
      <main id="main" tabIndex={-1} className="relative focus:outline-none">
        <PageThread />

        <div id="opening">
          <Opening />
        </div>

        <div id="premise">
          <Premise />
        </div>

        <div id="flow">
          <FundingFlow />
        </div>

        <div id="numbers">
          <StatBand />
        </div>

        <div id="work">
          <StoryRail />
        </div>

        <div id="causes">
          <Causes />
        </div>


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

        {/*
          Last section before the footer, and deliberately so: by this point the
          page has made its claim, and the remaining reasons someone does not
          sign up are questions — is this real money, who sees my application,
          what does it cost. Answering them here is the last thing between
          reading and acting.

          Inside <main> rather than after it, because it is page content that a
          visitor may well want to print.
        */}
        <div id="questions" className="border-t border-border">
          <Faq />
        </div>
      </main>

      {/*
        The shared footer. It carries the same test-mode disclosure the inline
        footer here used to, so the promise a visitor reads on the landing page
        is the identical string they see inside the app.
      */}
      <SiteFooter />
    </div>
  );
}

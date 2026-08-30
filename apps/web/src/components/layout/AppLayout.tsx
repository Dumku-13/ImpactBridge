import { Suspense, type ReactNode } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { LogOut } from "lucide-react";
import { ROLE_LABELS } from "@impactbridge/shared";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/Button";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageFallback } from "@/components/PageFallback";
import { ThemeToggle } from "./ThemeToggle";
import { MobileNav } from "./MobileNav";
import { SiteFooter } from "./SiteFooter";
import { SiteSearchTrigger } from "@/components/site/SiteSearch";
import { ScrollProgress } from "./ScrollProgress";
import { NotificationBell } from "./NotificationBell";
import { cn } from "@/lib/utils";

/**
 * A nav link that grows an underline from the centre out.
 *
 * The underline is always rendered and animated with `scale-x`, so it moves on
 * the compositor — animating `width` would relayout the header on every hover.
 * Chosen over a filled pill because the header sits above serif headlines; a
 * rule under the word echoes the editorial type rather than fighting it.
 */
function NavItem({ to, children }: { to: string; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "group relative px-3 py-2 text-sm font-medium transition-colors duration-200",
          isActive
            ? "text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )
      }
    >
      {({ isActive }) => (
        <>
          {children}
          <span
            aria-hidden="true"
            className={cn(
              "absolute inset-x-2 -bottom-px h-0.5 origin-center rounded-full bg-primary transition-transform duration-300 ease-out-soft",
              isActive ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100",
            )}
          />
        </>
      )}
    </NavLink>
  );
}

/**
 * Shell for every signed-in page: top bar with identity + sign out, then the
 * routed page below. Navigation per role gets added as each dashboard grows.
 */
export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="grain min-h-screen bg-background">
      {/*
        Skip link. Every page here puts a header, a nav, a theme toggle and a
        notification bell before the content, so a keyboard or screen-reader
        user tabbed through all of it on EVERY navigation to reach what they
        came for.

        Visually hidden until focused, which is the whole trick: `sr-only`
        removes it from the layout, `focus:not-sr-only` puts it back the moment
        it is tabbed to. It must be the first focusable thing in the document,
        so it sits above everything else here.
      */}
      <a
        href="#main"
        className="skip-link rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
      >
        Skip to content
      </a>

      <ScrollProgress />
      {/*
        Opaque rather than translucent-with-`backdrop-blur`: a backdrop filter on
        a sticky element forces the browser to re-sample and re-blur everything
        underneath on every scroll frame, which is a well-known source of scroll
        jank on Windows. The visual difference is negligible; the cost isn't.
      */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/95">
        {/*
          `min-w-0` on the row and truncation on the wordmark: at 375px the
          wordmark, two nav links, theme toggle, notification bell and sign-out
          together overflowed the viewport and scrolled the whole page
          sideways. Nothing here is optional, so the wordmark yields first.
        */}
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-1 px-4 sm:gap-2 sm:px-6">
          <Link
            to="/"
            className="mr-1 shrink truncate font-display text-base font-semibold tracking-tight text-foreground transition-opacity hover:opacity-80 sm:mr-3 sm:text-lg"
          >
            Impact<span className="text-primary">Bridge</span>
          </Link>

          {/*
            Desktop only. Below `sm` these same destinations live in MobileNav's
            panel, so showing them twice would just re-create the 375px overflow
            this header already has a comment about.
          */}
          <nav className="hidden items-center sm:flex">
            <NavItem to="/browse">Browse</NavItem>
            <NavItem to="/grants">Grants</NavItem>
          </nav>

          {!user && (
            <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
              <SiteSearchTrigger />
              <ThemeToggle />
              {/* Hidden below `sm`: "Get started" leads to the same place, and
                  the mobile menu carries an explicit Sign in besides. */}
              <Link
                to="/login"
                className="hidden h-9 items-center rounded-lg px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary sm:inline-flex sm:px-4"
              >
                Sign in
              </Link>
              <Link
                to="/signup"
                className="inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:px-4"
              >
                Get started
              </Link>
              <MobileNav onSignOut={handleLogout} />
            </div>
          )}

          {user && (
            <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-3">
              <SiteSearchTrigger />
              <ThemeToggle />
              <NotificationBell signedIn={Boolean(user)} />

              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium leading-tight text-foreground">
                  {user.name}
                </p>
                <p className="text-xs leading-tight text-muted-foreground">
                  {ROLE_LABELS[user.role]}
                </p>
              </div>
              {/* The mobile panel carries its own sign-out next to the identity
                  block, so this one steps aside rather than sitting beside a
                  hamburger that offers the same action. */}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="hidden sm:inline-flex"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
              <MobileNav onSignOut={handleLogout} />
            </div>
          )}
        </div>
      </header>

      {/*
        Inside the layout rather than around it, so a page that throws loses
        only the page — the header stays put and the user can navigate away.
        Keyed on the pathname so leaving a broken route clears the error.
      */}
      {/*
        `key` on the pathname remounts this wrapper on every navigation, which
        replays the entrance animation — so each page fades up into place
        instead of appearing abruptly mid-scroll. It's the cheapest possible
        page transition: no router animation library, no exit animation to
        block the next route on.
      */}
      <main
        id="main"
        key={location.pathname}
        /* `tabIndex={-1}` so the skip link can move focus here, not just scroll
           the page — without it the viewport jumps but the tab order does not. */
        tabIndex={-1}
        className="mx-auto max-w-6xl animate-fade-up px-6 py-10 focus:outline-none"
      >
        <ErrorBoundary resetKey={location.pathname}>
          {/*
            A Suspense boundary here rather than only at the router root, so a
            lazily-loaded page swaps in below a header that never flickers.
          */}
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>

      <SiteFooter />
    </div>
  );
}

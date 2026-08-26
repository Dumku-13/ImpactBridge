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

          <NavItem to="/browse">Browse</NavItem>
          <NavItem to="/grants">Grants</NavItem>

          {!user && (
            <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
              <ThemeToggle />
              {/* Hidden on the narrowest screens — "Get started" leads to the
                  same place and sign-in is one tap from there. */}
              <Link
                to="/login"
                className="hidden h-9 items-center rounded-lg px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary xs:inline-flex sm:px-4"
              >
                Sign in
              </Link>
              <Link
                to="/signup"
                className="inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:px-4"
              >
                Get started
              </Link>
            </div>
          )}

          {user && (
            <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-3">
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
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
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
        key={location.pathname}
        className="mx-auto max-w-6xl animate-fade-up px-6 py-10"
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
    </div>
  );
}

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Bell,
  Building2,
  CornerDownLeft,
  FileText,
  Landmark,
  LayoutDashboard,
  Loader2,
  LogIn,
  Search,
  ShieldCheck,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { formatMoneyCompact, type Role } from "@impactbridge/shared";
import { useAuth } from "@/auth/AuthContext";
import { useOrganizations } from "@/api/organizations";
import { useGrants } from "@/api/grants";
import { useDebounce } from "@/hooks/useDebounce";
import { Dialog } from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

/**
 * Command-palette search across organisations, grants, and the app itself.
 *
 * ── On reusing Dialog ────────────────────────────────────────────────────────
 *
 * It is reused rather than forked, and it fits: portal, `role="dialog"`,
 * `aria-modal`, Escape, focus trap, scroll lock and focus restoration are all
 * behaviours a palette needs and none of them want a second implementation.
 * Two adjustments are made through `className` rather than by editing Dialog:
 * `self-start` with a top margin, because a palette belongs near the top of the
 * viewport where the eye already is rather than vertically centred, and `p-0`
 * because the input has to run edge to edge.
 *
 * The one thing that looks like a conflict is not one. Dialog focuses its panel
 * in a layout effect so the dialog's name is announced first; this component
 * then focuses the input in a passive effect. React runs a child's effects
 * before its parent's, and Dialog is the child here — so its layout effect has
 * already finished by the time ours runs, and the input reliably wins. That
 * ordering is load-bearing: focusing in a layout effect instead would race
 * Dialog and leave focus on the panel, where typing does nothing.
 */

/** Cosmetic only — the handler accepts both modifiers regardless of platform. */
const IS_APPLE = /mac|iphone|ipad|ipod/i.test(navigator.userAgent);

interface Destination {
  label: string;
  hint: string;
  to: string;
  /** Extra words this destination should match on, beyond its label. */
  keywords: string;
  icon: LucideIcon;
}

/**
 * The in-app destinations, filtered to what this visitor can actually open.
 *
 * Role-gated deliberately. Offering a donor the admin console produces a result
 * that looks like a feature and behaves like a bounce — ProtectedRoute redirects
 * them straight back out, and the search box has taught them the app is broken.
 */
function destinationsFor(role: Role | undefined): Destination[] {
  const shared: Destination[] = [
    {
      label: "Browse organisations",
      hint: "Discover verified nonprofits",
      to: "/browse",
      keywords: "ngo nonprofit charity causes discover donate",
      icon: Building2,
    },
    {
      label: "Grants",
      hint: "Open funding programmes",
      to: "/grants",
      keywords: "funding apply programme funder",
      icon: Landmark,
    },
  ];

  if (!role) {
    return [
      ...shared,
      {
        label: "Sign in",
        hint: "Access your dashboard",
        to: "/login",
        keywords: "login account",
        icon: LogIn,
      },
      {
        label: "Create an account",
        hint: "Donor, nonprofit or funder",
        to: "/signup",
        keywords: "register join signup",
        icon: UserPlus,
      },
    ];
  }

  const byRole: Record<Role, Destination[]> = {
    DONOR: [
      {
        label: "Donor dashboard",
        hint: "Your giving, receipts and bookmarks",
        to: "/donor",
        keywords: "my donations history receipts bookmarks",
        icon: LayoutDashboard,
      },
    ],
    NGO_ADMIN: [
      {
        label: "Nonprofit dashboard",
        hint: "Profile, documents and analytics",
        to: "/ngo",
        keywords: "my organisation profile documents impact",
        icon: LayoutDashboard,
      },
      {
        label: "My applications",
        hint: "Grants you have applied for",
        to: "/ngo/applications",
        keywords: "grant application status proposal",
        icon: FileText,
      },
    ],
    FUNDER: [
      {
        label: "Funder dashboard",
        hint: "Your grants and applicants",
        to: "/funder",
        keywords: "my grants applicants review programme",
        icon: LayoutDashboard,
      },
    ],
    PLATFORM_ADMIN: [
      {
        label: "Admin console",
        hint: "Verification, moderation and audit",
        to: "/admin",
        keywords: "verify moderate suspend audit logs",
        icon: ShieldCheck,
      },
    ],
  };

  return [
    ...shared,
    ...byRole[role],
    {
      label: "Notifications",
      hint: "Everything that happened while you were away",
      to: "/notifications",
      keywords: "alerts updates activity",
      icon: Bell,
    },
  ];
}

interface ResultItem {
  label: string;
  hint: string;
  to: string;
  icon: LucideIcon;
  /** Position in the flattened list — what the arrow keys actually move over. */
  index: number;
}

interface ResultGroup {
  heading: string;
  items: ResultItem[];
}

/**
 * The palette body.
 *
 * Split from `SiteSearch` so that it MOUNTS only when the palette is open.
 * Hooks cannot be skipped by an early return, so keeping the queries in a
 * component that renders `null` while closed would fire an organisations and a
 * grants request on every page load for a search box nobody opened.
 */
function SearchPalette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  // The existing hook, at the existing default. One request for a finished
  // word rather than one per keystroke — see useDebounce for the ordering bug
  // that motivates it.
  const debounced = useDebounce(query.trim(), 250);

  /*
   * Both use the EXISTING api clients, with the search parameters those
   * endpoints already accept — `q` for organisations, `search` for grants. No
   * new endpoint, and nothing on the server had to change for this to work.
   *
   * An empty query is not short-circuited on purpose: the endpoints then return
   * their normal first page, which gives a freshly-opened palette something
   * useful to show — the nearest deadlines and a handful of organisations —
   * instead of an empty box waiting to be typed into.
   */
  const orgsQuery = useOrganizations({ q: debounced, pageSize: 5 });
  const grantsQuery = useGrants({ search: debounced, pageSize: 5 });

  const isLoading = orgsQuery.isPending || grantsQuery.isPending;
  const isRefreshing = orgsQuery.isFetching || grantsQuery.isFetching;

  const { groups, flat } = useMemo(() => {
    const needle = debounced.toLowerCase();

    const destinations = destinationsFor(user?.role).filter(
      (destination) =>
        !needle ||
        `${destination.label} ${destination.hint} ${destination.keywords}`
          .toLowerCase()
          .includes(needle),
    );

    const raw: Array<{ heading: string; items: Omit<ResultItem, "index">[] }> = [
      {
        heading: "Go to",
        items: destinations.map((destination) => ({
          label: destination.label,
          hint: destination.hint,
          to: destination.to,
          icon: destination.icon,
        })),
      },
      {
        heading: "Organisations",
        items: (orgsQuery.data?.items ?? []).map((org) => ({
          label: org.name,
          hint: [org.city, org.verified ? "Verified" : null]
            .filter(Boolean)
            .join(" · "),
          to: `/ngo/${org.slug}`,
          icon: Building2,
        })),
      },
      {
        heading: "Grants",
        items: (grantsQuery.data?.items ?? []).map((grant) => ({
          label: grant.title,
          hint: `${grant.funder.name} · ${formatMoneyCompact(
            grant.amountMinor,
            grant.currency,
          )}`,
          to: `/grants/${grant.slug}`,
          icon: Landmark,
        })),
      },
    ];

    // Index across the whole flattened list rather than per group, so
    // `aria-activedescendant` and the arrow keys share one coordinate system
    // and cannot disagree about which row is highlighted.
    let cursor = 0;
    const built: ResultGroup[] = raw
      .filter((group) => group.items.length > 0)
      .map((group) => ({
        heading: group.heading,
        items: group.items.map((item) => ({ ...item, index: cursor++ })),
      }));

    return { groups: built, flat: built.flatMap((group) => group.items) };
  }, [debounced, user?.role, orgsQuery.data, grantsQuery.data]);

  /*
   * Focus the input on open. See the note at the top of this file for why a
   * passive effect is correct here and a layout effect would race Dialog.
   */
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // A new result set means the old highlight points at a different row, or at
  // nothing. Reset rather than let it dangle — pressing Enter on a stale index
  // navigates somewhere the user never looked at.
  useEffect(() => {
    setActiveIndex(0);
  }, [debounced]);

  useEffect(() => {
    if (activeIndex > flat.length - 1) setActiveIndex(0);
  }, [flat.length, activeIndex]);

  const listId = useId();
  const optionId = (index: number) => `${listId}-option-${index}`;
  const activeId = flat.length > 0 ? optionId(activeIndex) : undefined;

  // Keep the highlighted row on screen when the arrows walk past the fold.
  // `block: "nearest"` scrolls the list by the minimum needed instead of
  // yanking the row to the centre on every keypress.
  useEffect(() => {
    if (!activeId) return;
    listRef.current
      ?.querySelector(`#${CSS.escape(activeId)}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  function go(to: string) {
    onClose();
    navigate(to);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    // Escape is not handled here — Dialog owns it, on a document-level capture
    // listener, so it closes the palette from anywhere inside.
    if (flat.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % flat.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + flat.length) % flat.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(flat.length - 1);
    } else if (event.key === "Enter") {
      // Without preventDefault this also submits any form the palette is
      // rendered inside, and the page navigates twice.
      event.preventDefault();
      const target = flat[activeIndex];
      if (target) go(target.to);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Search ImpactBridge"
      showClose={false}
      className="max-w-2xl self-start overflow-hidden p-0 sm:mt-[8vh]"
    >
      <div className="flex items-center gap-3 border-b border-border px-4">
        <Search
          className="h-4 w-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search organisations, grants and pages…"
          aria-label="Search organisations, grants and pages"
          /*
           * The combobox contract. `aria-activedescendant` is what lets the
           * arrow keys move a screen reader's attention through the options
           * while DOM focus never leaves this input — the alternative, moving
           * real focus onto each row, takes focus out of the field and stops
           * the user typing.
           */
          role="combobox"
          aria-expanded={flat.length > 0}
          aria-controls={listId}
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          className="h-14 w-full bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/70"
        />
        {/* Only while a request is genuinely in flight, and only as a hint —
            the results below stay put rather than collapsing to skeletons on
            every keystroke. */}
        {isRefreshing && !isLoading && (
          <Loader2
            className="h-4 w-4 shrink-0 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
        )}
      </div>

      <div
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label="Search results"
        className="max-h-[min(60vh,26rem)] overflow-y-auto p-2"
      >
        {isLoading ? (
          <div className="space-y-1 p-1" aria-hidden="true">
            {[0, 1, 2, 3].map((row) => (
              <div key={row} className="flex items-center gap-3 px-2 py-2.5">
                <Skeleton className="h-8 w-8 shrink-0 rounded-md" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : flat.length === 0 ? (
          /*
           * A real empty state: it says what was searched, and offers the two
           * places the answer is most likely to be. "No results" alone is a
           * dead end that makes the user feel the app is missing something.
           */
          <div className="px-4 py-10 text-center">
            <p className="font-display text-base font-semibold text-foreground">
              Nothing matches &ldquo;{debounced}&rdquo;
            </p>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Try a shorter phrase, a city, or a cause like &ldquo;education&rdquo;.
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => go("/browse")}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Browse all
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => go("/grants")}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                All grants
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : (
          groups.map((group) => (
            /*
             * `role="group"` inside the listbox, labelled by its heading. This
             * is what keeps the headings meaningful to a screen reader — a
             * plain styled <p> between options is either announced as a stray
             * text node or, if hidden, drops the grouping entirely.
             */
            <div
              key={group.heading}
              role="group"
              aria-labelledby={`${listId}-${group.heading}`}
              className="mb-1 last:mb-0"
            >
              <p
                id={`${listId}-${group.heading}`}
                className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
              >
                {group.heading}
              </p>

              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = item.index === activeIndex;

                return (
                  <div
                    key={`${group.heading}-${item.to}`}
                    id={optionId(item.index)}
                    role="option"
                    aria-selected={isActive}
                    onClick={() => go(item.to)}
                    /*
                     * `mousemove`, not `mouseenter`. Scrolling the highlighted
                     * row into view slides rows under a stationary cursor,
                     * which fires mouseenter and snatches the highlight back —
                     * so arrowing down past the fold would stick. Mousemove
                     * only fires when the pointer actually moves.
                     */
                    onMouseMove={() => setActiveIndex(item.index)}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors",
                      isActive ? "bg-secondary" : "hover:bg-secondary/60",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "bg-secondary text-muted-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {item.label}
                      </span>
                      {item.hint && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {item.hint}
                        </span>
                      )}
                    </span>

                    {isActive && (
                      <CornerDownLeft
                        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      <div className="flex items-center gap-4 border-t border-border bg-secondary/40 px-4 py-2.5 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd>
          to navigate
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>↵</Kbd>
          to open
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <Kbd>esc</Kbd>
          to close
        </span>
      </div>
    </Dialog>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-card px-1 font-sans text-[10px] font-medium text-foreground">
      {children}
    </kbd>
  );
}

/**
 * The palette itself, for a caller that wants to own the open state.
 * Most callers want `SiteSearchTrigger` instead.
 */
export function SiteSearch({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return <SearchPalette onClose={onClose} />;
}

/**
 * The header control: a button that looks like a search field, plus the
 * Cmd/Ctrl-K shortcut and the palette it opens.
 *
 * Everything is bundled here so wiring the feature into a header is one import
 * and one tag. Note that the shortcut listener belongs to this component, so
 * mounting two triggers on the same page registers two listeners and the
 * palette would toggle twice per keypress — mount it once per shell.
 */
export function SiteSearchTrigger({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        // Firefox binds Ctrl-K to its own address-bar search, and Chrome will
        // hand it to the omnibox in some configurations. Without this the
        // palette opens behind a focused browser chrome the user then has to
        // escape out of.
        event.preventDefault();
        setOpen((current) => !current);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search ImpactBridge"
        aria-keyshortcuts={IS_APPLE ? "Meta+K" : "Control+K"}
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-lg text-muted-foreground transition-all duration-200 ease-out-soft",
          "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          /*
           * Icon-only on small screens, a fake input from `sm` up. The header
           * already drops a nav link between 375 and 400px to avoid scrolling
           * the page sideways — a 12rem search field there would undo that.
           */
          "w-9 justify-center active:scale-95",
          "sm:w-auto sm:justify-start sm:border sm:border-border sm:bg-card sm:px-3 sm:shadow-subtle sm:hover:border-primary/30 sm:hover:bg-secondary/60",
          className,
        )}
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="hidden text-sm sm:inline">Search</span>
        <span
          aria-hidden="true"
          className="ml-6 hidden rounded border border-border bg-background px-1.5 py-0.5 font-sans text-[10px] font-medium sm:inline"
        >
          {IS_APPLE ? "⌘" : "Ctrl"} K
        </span>
      </button>

      <SiteSearch open={open} onClose={() => setOpen(false)} />
    </>
  );
}

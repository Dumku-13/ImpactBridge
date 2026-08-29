import { useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Minus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { formatMoney, type GrantSort } from "@impactbridge/shared";
import { useGrants } from "@/api/grants";
import {
  useAiStatus,
  useGrantMatches,
  type GrantMatch,
  type MatchCheck,
} from "@/api/ai";
import { useAuth } from "@/auth/AuthContext";
import { useCategories } from "@/api/ngo";
import { GrantCard } from "@/components/grants/GrantCard";
import { GrantsOpening } from "@/components/grants/GrantsOpening";
import { CauseModes } from "@/components/grants/CauseModes";
import { useGrantRowReveal } from "@/components/grants/useGrantRowReveal";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { useDebounce } from "@/hooks/useDebounce";
import { Alert } from "@/components/ui/Alert";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

const SORTS: Array<{ value: GrantSort; label: string }> = [
  { value: "deadline", label: "Closing soonest" },
  { value: "newest", label: "Newest" },
  { value: "amount_desc", label: "Largest fund" },
];

export function GrantsPage() {
  useDocumentTitle("Open grants");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | undefined>();
  const [sort, setSort] = useState<GrantSort>("deadline");
  const [openOnly, setOpenOnly] = useState(true);
  const [page, setPage] = useState(1);

  // Debounced so typing doesn't fire a request per keystroke.
  const debouncedSearch = useDebounce(search, 300);

  const { data: categories } = useCategories();

  // Rows re-deal whenever the filter signature changes, so a filter click is
  // visibly acknowledged rather than swapping text in place.
  const rowsRef = useGrantRowReveal(
    `${category ?? "all"}-${sort}-${page}-${openOnly}`,
  );
  const { data, isPending, isError, error, refetch } = useGrants({
    search: debouncedSearch || undefined,
    category,
    sort,
    openOnly,
    page,
    pageSize: 24,
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 py-8">
      {data && data.items.length > 0 && (
        <GrantsOpening
          openCount={data.total}
          totalMinor={data.items.reduce((sum, g) => sum + g.amountMinor, 0)}
          currency={data.items[0]?.currency ?? "inr"}
        />
      )}

      <header className="pb-2 pt-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Open opportunities
        </p>
        {/* h2: `GrantsOpening` above carries this page's h1. Styling unchanged. */}
        <h2
          className="mt-4 font-display text-3xl font-semibold tracking-[-0.02em] text-foreground sm:text-4xl"
          style={{ fontVariationSettings: '"SOFT" 12' }}
        >
          Every grant, with its rules attached
        </h2>
      </header>

      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search grants…"
            className="pl-9"
            aria-label="Search grants"
          />
        </div>

        <CauseModes
          categories={categories ?? []}
          selected={category}
          onSelect={(slug) => {
            setCategory(slug);
            setPage(1);
          }}
        />

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {data ? `${data.total} grants` : "Filtering"}
          </span>

          <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={openOnly}
              onChange={(e) => {
              setOpenOnly(e.target.checked);
              setPage(1);
            }}
              className="h-3.5 w-3.5 rounded border-border"
            />
            Open only
          </label>

          <div className="ml-auto flex gap-1">
            {SORTS.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant={sort === option.value ? "secondary" : "ghost"}
                onClick={() => {
                  setSort(option.value);
                  setPage(1);
                }}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <GrantMatcher />

      {isPending && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-xl" />
          ))}
        </div>
      )}

      {/*
        Without this the page rendered its header and filters and then simply
        nothing — indistinguishable from "there are no grants" when the real
        problem is that the API is down.
      */}
      {isError && (
        <Alert variant="error">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {error instanceof ApiError
                ? error.message
                : "Couldn't reach the server to load grants."}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
            >
              Retry
            </Button>
          </div>
        </Alert>
      )}

      {data && data.items.length === 0 && (
        <p className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          No grants match those filters yet.
        </p>
      )}

      {data && data.items.length > 0 && (
        // `key` on the filter signature replays the stagger whenever the result
        // set actually changes, so switching cause or sort re-deals the cards
        // instead of silently swapping their text.
        <div
          ref={rowsRef}
          key={`${category ?? "all"}-${sort}-${page}-${openOnly}`}
          className="border-b border-border"
        >
          {data.items.map((grant) => (
            <GrantCard key={grant.id} grant={grant} />
          ))}
        </div>
      )}

      {/* Without this, any grant past the first page is simply unreachable —
          the API returns totalPages but nothing was rendering it. */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">
            Page {data.page} of {data.totalPages}
          </p>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * "Which of these should I actually apply for?"
 *
 * Only offered to NGO admins — matching is against THEIR organisation profile,
 * so it is meaningless for a donor or funder browsing the same page.
 */
function GrantMatcher() {
  const { user } = useAuth();
  const isNgo = user?.role === "NGO_ADMIN";
  const { data: status } = useAiStatus(isNgo);
  const matcher = useGrantMatches();
  const [matches, setMatches] = useState<GrantMatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isNgo || !status?.available) return null;

  async function run() {
    setError(null);

    try {
      const result = await matcher.mutateAsync();
      setMatches(result.matches);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't match grants.",
      );
    }
  }

  return (
    /*
     * Deliberately quiet. This is the one place on the page an "AI" feature
     * appears, and dressing it in sparkles and gradients is exactly what makes
     * a funding product look untrustworthy. It states what it compared and
     * shows its score; the model advises, it does not decide.
     */
    <section className="border-y border-border bg-secondary/30 px-5 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Recommended for your organisation
          </p>
          <h2
            className="mt-2 font-display text-xl font-semibold text-foreground"
            style={{ fontVariationSettings: '"SOFT" 12' }}
          >
            Matched on your causes, location and eligibility
          </h2>
          <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-muted-foreground">
            A suggestion, not a decision — every grant still lists its own rules,
            and you should read them.
          </p>
        </div>

        <Button type="button" disabled={matcher.isPending} onClick={() => void run()}>
          {matcher.isPending && (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          )}
          {matches ? "Refresh matches" : "Match my organisation"}
        </Button>
      </div>

      {error && (
        <Alert variant="error" className="mt-4">
          {error}
        </Alert>
      )}

      {matches?.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          Nothing open looks like a strong fit right now. Adding causes to your
          profile helps the match.
        </p>
      )}

      {matches && matches.length > 0 && (
        <ul className="mt-5 divide-y divide-border border-t border-border">
          {matches.map((match) => (
            <li key={match.grantId} className="py-3">
              <Link
                to={`/grants/${match.slug}`}
                className="flex items-start gap-4 transition-colors hover:bg-background/60"
              >
                <span className="tnum mt-0.5 shrink-0 font-grotesk text-sm font-extrabold text-primary">
                  {match.score}
                  <span className="text-[10px] font-bold text-muted-foreground">
                    /100
                  </span>
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium text-foreground">
                      {match.title}
                    </span>
                    {/*
                      Stated on the row, not buried in the checklist. The model
                      cheerfully recommends grants the API would reject on
                      submission — the score measures fit, not permission.
                    */}
                    {!match.eligible && (
                      <span className="rounded-sm bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-destructive">
                        You don&rsquo;t qualify yet
                      </span>
                    )}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {match.reason}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {formatMoney(match.amountMinor, "inr")} fund
                  </span>
                </span>
              </Link>

              <MatchChecklist checks={match.checks} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const CHECK_STYLES: Record<
  MatchCheck["status"],
  { icon: typeof Check; className: string }
> = {
  pass: { icon: Check, className: "text-primary" },
  fail: { icon: X, className: "text-destructive" },
  info: { icon: Minus, className: "text-muted-foreground" },
};

/**
 * What the score is actually made of.
 *
 * Every line here is computed by the server from the grant's stored eligibility
 * rules and this organisation's own record — the same three rules the API
 * enforces when an application is submitted. NONE of it comes from the model,
 * which returns only a score and a sentence.
 *
 * That distinction is the whole point. The obvious way to build this screen is
 * to ask the model for a breakdown, and it would happily produce one: fluent,
 * plausible, and unrelated to whether the submission will be accepted. A tick
 * next to "Location" has to mean the server agrees, or it should not be drawn.
 *
 * A `<details>` element rather than React state: it opens with no JavaScript,
 * is keyboard-operable for free, and screen readers announce its expanded
 * state without any ARIA of ours.
 */
function MatchChecklist({ checks }: { checks: MatchCheck[] }) {
  if (!checks?.length) return null;

  return (
    <details className="group mt-2 pl-[3.25rem]">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground">
        <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 group-open:rotate-90" />
        What this is based on
      </summary>

      <ul className="mt-3 space-y-2 border-l border-border pl-4">
        {checks.map((check) => {
          const { icon: Icon, className } = CHECK_STYLES[check.status];

          return (
            <li key={check.label} className="flex items-start gap-2.5">
              <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", className)} />
              <p className="text-sm leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">
                  {check.label}:
                </span>{" "}
                {check.detail}
              </p>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        These lines are checked against the grant&rsquo;s own rules and your
        organisation profile — they are not written by the AI. Only the score and
        the one-line reason are.
      </p>
    </details>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, SlidersHorizontal, X } from "lucide-react";
import type {
  OrganizationQuery,
  OrganizationSort,
} from "@impactbridge/shared";
import {
  useCategories,
  useCities,
  useOrganizations,
} from "@/api/organizations";
import {
  OrganizationCard,
  OrganizationCardSkeleton,
} from "@/components/organizations/OrganizationCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { useDebounce } from "@/hooks/useDebounce";
import { BrowseOpening } from "@/components/browse/BrowseOpening";
import { useScrollTriggerRefresh } from "@/lib/gsap";
import { cn } from "@/lib/utils";

const SORT_OPTIONS: Array<{ value: OrganizationSort; label: string }> = [
  { value: "relevance", label: "Most relevant" },
  { value: "most-funded", label: "Most funded" },
  { value: "least-funded", label: "Needs funding most" },
  // "top-rated" is deliberately absent: org ratings are never written at
  // runtime, so the sort ordered by seeded noise. The API still accepts it.
  { value: "newest", label: "Recently joined" },
];

/**
 * Browse & discover organisations.
 *
 * Filter state lives in the URL rather than in component state. That gives us
 * shareable links, a working browser back button, and a page that restores
 * correctly on refresh — all for free, and it's the behaviour users expect from
 * a search page.
 */
export function BrowsePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showFilters, setShowFilters] = useState(false);

  const { data: categories } = useCategories();
  const { data: cities } = useCities();

  // The input is local state so typing feels instant; the debounced value is
  // what actually gets written to the URL and triggers a fetch.
  const [searchInput, setSearchInput] = useState(searchParams.get("q") ?? "");
  const debouncedSearch = useDebounce(searchInput, 350);

  const query: Partial<OrganizationQuery> = useMemo(
    () => ({
      q: searchParams.get("q") ?? undefined,
      category: searchParams.getAll("category"),
      city: searchParams.get("city") ?? undefined,
      verifiedOnly: searchParams.get("verifiedOnly") === "true",
      minRating: searchParams.get("minRating")
        ? Number(searchParams.get("minRating"))
        : undefined,
      sort: (searchParams.get("sort") as OrganizationSort) ?? "relevance",
      page: Number(searchParams.get("page") ?? 1),
      pageSize: 12,
    }),
    [searchParams],
  );

  // Push the debounced search term into the URL.
  useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (debouncedSearch === current) return;

    const next = new URLSearchParams(searchParams);
    if (debouncedSearch) next.set("q", debouncedSearch);
    else next.delete("q");
    // Any change to the filters must reset pagination, or you can end up on
    // page 4 of a result set that now has one page.
    next.delete("page");
    setSearchParams(next, { replace: true });
  }, [debouncedSearch, searchParams, setSearchParams]);

  const { data, isPending, isError, error, isPlaceholderData } =
    useOrganizations(query);

  // The opening sequence pins; its measurements depend on images and fonts
  // having settled, so re-measure once they have.
  useScrollTriggerRefresh();

  function updateParam(key: string, value: string | null) {
    const next = new URLSearchParams(searchParams);
    if (value === null) next.delete(key);
    else next.set(key, value);

    // Changing a filter must reset pagination — otherwise you can be stranded
    // on page 4 of a result set that now has one page. But when the caller is
    // changing the page itself, clearing it would make paging a no-op.
    if (key !== "page") next.delete("page");

    setSearchParams(next);
  }

  function toggleCategory(slug: string) {
    const next = new URLSearchParams(searchParams);
    const current = next.getAll("category");
    next.delete("category");

    const updated = current.includes(slug)
      ? current.filter((c) => c !== slug)
      : [...current, slug];

    updated.forEach((c) => next.append("category", c));
    next.delete("page");
    setSearchParams(next);
  }

  function clearFilters() {
    setSearchInput("");
    setSearchParams(new URLSearchParams());
  }

  const activeCategories = searchParams.getAll("category");
  const activeFilterCount =
    activeCategories.length +
    (searchParams.get("city") ? 1 : 0) +
    (searchParams.get("verifiedOnly") === "true" ? 1 : 0) +
    (searchParams.get("minRating") ? 1 : 0);

  return (
    <div className="space-y-6">
      {/*
        The opening sequence, driven by the same records the grid below renders.
        Only mounted once data exists — a cinematic intro built on skeletons
        would be an animation with nothing to say.
      */}
      {data && data.items.length > 0 && (
        <BrowseOpening
          organizations={data.items}
          total={data.total}
          causes={categories?.length ?? 0}
          cities={cities?.length ?? 0}
        />
      )}

      <header className="pb-2 pt-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          The archive
        </p>
        <h1 className="mt-5">
          <span
            className="block font-grotesk text-4xl font-extrabold uppercase leading-[0.94] tracking-[-0.025em] text-foreground sm:text-6xl"
            style={{ fontStretch: "86%" }}
          >
            Every organisation
          </span>
          <span
            className="mt-1 block font-display text-4xl font-semibold leading-[1.02] tracking-[-0.03em] text-muted-foreground sm:text-6xl"
            style={{ fontVariationSettings: '"SOFT" 12' }}
          >
            search it yourself.
          </span>
        </h1>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground">
          Every organisation here has had its registration, documents and
          identity checked before it could take a rupee.
        </p>
      </header>

      {/* Search + sort */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name, mission, or keyword…"
            aria-label="Search organisations"
            className="pl-9"
          />
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            className="sm:hidden"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-1 rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </Button>

          <select
            value={query.sort}
            onChange={(e) => updateParam("sort", e.target.value)}
            aria-label="Sort results"
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap gap-2">
        {categories?.map((category) => {
          const active = activeCategories.includes(category.slug);
          return (
            <button
              key={category.id}
              type="button"
              onClick={() => toggleCategory(category.slug)}
              aria-pressed={active}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:bg-secondary",
              )}
            >
              {category.name}
            </button>
          );
        })}
      </div>

      {/* Secondary filters */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3",
          !showFilters && "hidden sm:flex",
        )}
      >
        <select
          value={searchParams.get("city") ?? ""}
          onChange={(e) => updateParam("city", e.target.value || null)}
          aria-label="Filter by city"
          className="h-9 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">All locations</option>
          {cities?.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </select>

        {/*
          The minimum-rating filter is gone with the ratings themselves — it
          silently excluded every organisation that wasn't seeded with a score.
        */}

        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={searchParams.get("verifiedOnly") === "true"}
            onChange={(e) =>
              updateParam("verifiedOnly", e.target.checked ? "true" : null)
            }
            className="h-4 w-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
          />
          Verified only
        </label>

        {(activeFilterCount > 0 || searchParams.get("q")) && (
          <button
            type="button"
            onClick={clearFilters}
            className="ml-auto inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
            Clear all
          </button>
        )}
      </div>

      {/* Results */}
      {isError && (
        <Alert variant="error">
          {error instanceof Error
            ? error.message
            : "Couldn't load organisations."}
        </Alert>
      )}

      {!isError && (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {isPending
              ? "Searching…"
              : `${data?.total ?? 0} organisation${data?.total === 1 ? "" : "s"} found`}
          </p>

          <div
            className={cn(
              "grid gap-5 sm:grid-cols-2 lg:grid-cols-3",
              // Dim slightly while a new page loads, so it's clear something
              // is happening without tearing the content away.
              isPlaceholderData && "opacity-60 transition-opacity",
            )}
          >
            {isPending
              ? Array.from({ length: 6 }).map((_, i) => (
                  <OrganizationCardSkeleton key={i} />
                ))
              : data?.items.map((org) => (
                  <OrganizationCard key={org.id} org={org} />
                ))}
          </div>

          {!isPending && data?.items.length === 0 && (
            <div className="rounded-xl border border-dashed border-border py-16 text-center">
              <p className="font-medium text-foreground">
                No organisations match those filters
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Try removing a filter or searching for something broader.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={clearFilters}
              >
                Clear filters
              </Button>
            </div>
          )}

          {data && data.totalPages > 1 && (
            <nav
              className="flex items-center justify-center gap-2 pt-2"
              aria-label="Pagination"
            >
              <Button
                variant="outline"
                size="sm"
                disabled={query.page === 1}
                onClick={() => updateParam("page", String((query.page ?? 1) - 1))}
              >
                Previous
              </Button>
              <span className="px-3 text-sm text-muted-foreground">
                Page {data.page} of {data.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={query.page === data.totalPages}
                onClick={() => updateParam("page", String((query.page ?? 1) + 1))}
              >
                Next
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import type {
  Category,
  OrganizationCard,
  OrganizationDetail,
  OrganizationListResponse,
  OrganizationQuery,
} from "@impactbridge/shared";
import { apiFetch, apiPost } from "@/lib/api";

/**
 * Query keys are declared in one place so cache invalidation is reliable.
 * Getting a key subtly wrong is the classic React Query bug: the mutation
 * succeeds, but the list never refreshes because it invalidated a key nothing
 * is subscribed to.
 */
export const orgKeys = {
  all: ["organizations"] as const,
  list: (query: Partial<OrganizationQuery>) =>
    [...orgKeys.all, "list", query] as const,
  detail: (slug: string) => [...orgKeys.all, "detail", slug] as const,
  categories: () => [...orgKeys.all, "categories"] as const,
  cities: () => [...orgKeys.all, "cities"] as const,
  bookmarks: () => [...orgKeys.all, "bookmarks"] as const,
};

function buildQueryString(query: Partial<OrganizationQuery>): string {
  const params = new URLSearchParams();

  if (query.q) params.set("q", query.q);
  // Repeated `category` params — the server's schema normalises one-or-many
  // into an array, so a single selection works identically to several.
  query.category?.forEach((c) => params.append("category", c));
  if (query.city) params.set("city", query.city);
  if (query.verifiedOnly) params.set("verifiedOnly", "true");
  if (query.minRating) params.set("minRating", String(query.minRating));
  if (query.sort) params.set("sort", query.sort);
  if (query.page && query.page > 1) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));

  return params.toString();
}

export function useOrganizations(query: Partial<OrganizationQuery>) {
  return useQuery({
    queryKey: orgKeys.list(query),
    queryFn: () =>
      apiFetch<OrganizationListResponse>(
        `/organizations?${buildQueryString(query)}`,
      ),
    /*
     * Keep showing the previous page's results while the next one loads.
     * Without this, changing a filter blanks the grid to skeletons on every
     * keystroke, which feels broken. With it, the content stays put and simply
     * updates — the difference between a cheap-feeling app and a polished one.
     */
    placeholderData: keepPreviousData,
  });
}

export function useOrganization(slug: string) {
  return useQuery({
    queryKey: orgKeys.detail(slug),
    queryFn: () => apiFetch<OrganizationDetail>(`/organizations/${slug}`),
    enabled: Boolean(slug),
  });
}

export function useCategories() {
  return useQuery({
    queryKey: orgKeys.categories(),
    queryFn: async () =>
      (await apiFetch<{ items: Category[] }>("/organizations/categories"))
        .items,
    // The taxonomy effectively never changes during a session.
    staleTime: 60 * 60 * 1000,
  });
}

export function useCities() {
  return useQuery({
    queryKey: orgKeys.cities(),
    queryFn: async () =>
      (await apiFetch<{ items: string[] }>("/organizations/cities")).items,
    staleTime: 60 * 60 * 1000,
  });
}

export function useBookmarkedOrganizations() {
  return useQuery({
    queryKey: orgKeys.bookmarks(),
    queryFn: async () =>
      (await apiFetch<{ items: OrganizationCard[] }>("/organizations/bookmarks"))
        .items,
  });
}

/**
 * The org caches that actually carry per-viewer flags.
 *
 * Deliberately NOT `orgKeys.all`: that prefix also covers the categories and
 * cities taxonomies, which are given a one-hour staleTime precisely because
 * they never change. `invalidateQueries` refetches ACTIVE queries regardless of
 * staleTime, so casting the wide net meant every heart click re-downloaded the
 * cause list and the city list too.
 */
const viewerScopedFilters: Array<{ queryKey: QueryKey }> = [
  { queryKey: [...orgKeys.all, "list"] },
  { queryKey: [...orgKeys.all, "detail"] },
  { queryKey: orgKeys.bookmarks() },
];

/**
 * Write the expected state into every viewer-scoped cache and hand back a
 * snapshot, so a failed request can be rolled back exactly.
 */
async function flipOptimistically(
  queryClient: QueryClient,
  organizationId: string,
  flag: "isBookmarked" | "isFollowing",
) {
  await Promise.all(
    viewerScopedFilters.map((filter) => queryClient.cancelQueries(filter)),
  );

  const previous = viewerScopedFilters.flatMap((filter) =>
    queryClient.getQueriesData(filter),
  );

  viewerScopedFilters.forEach((filter) =>
    queryClient.setQueriesData(filter, (old: unknown) =>
      flipFlag(old, organizationId, flag),
    ),
  );

  return { previous };
}

function invalidateViewerScoped(queryClient: QueryClient) {
  viewerScopedFilters.forEach((filter) => {
    void queryClient.invalidateQueries(filter);
  });
}

/**
 * Toggle a bookmark with an OPTIMISTIC update.
 *
 * The heart fills the instant it's clicked rather than after a network round
 * trip. `onMutate` writes the expected state into the cache and returns a
 * snapshot; if the request then fails, `onError` restores that snapshot so the
 * UI never lies about what was saved.
 */
export function useToggleBookmark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (organizationId: string) =>
      apiPost<{ isBookmarked: boolean }>(
        `/organizations/${organizationId}/bookmark`,
      ),

    onMutate: (organizationId) =>
      flipOptimistically(queryClient, organizationId, "isBookmarked"),

    onError: (_err, _id, context) => {
      context?.previous.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
    },

    // Refetch afterwards so the cache converges on server truth either way.
    onSettled: () => invalidateViewerScoped(queryClient),
  });
}

export function useToggleFollow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (organizationId: string) =>
      apiPost<{ isFollowing: boolean }>(
        `/organizations/${organizationId}/follow`,
      ),

    onMutate: (organizationId) =>
      flipOptimistically(queryClient, organizationId, "isFollowing"),

    onError: (_err, _id, context) => {
      context?.previous.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
    },

    onSettled: () => invalidateViewerScoped(queryClient),
  });
}

/**
 * Flip a boolean flag on whichever organisation matches, handling both cache
 * shapes we store: a paginated list ({ items: [...] }) and a single detail
 * object. Written once so the two mutations above stay short.
 */
function flipFlag(
  cached: unknown,
  organizationId: string,
  flag: "isBookmarked" | "isFollowing",
): unknown {
  if (!cached || typeof cached !== "object") return cached;

  // Paginated list
  if ("items" in cached && Array.isArray((cached as { items: unknown }).items)) {
    const list = cached as { items: OrganizationCard[] };
    return {
      ...list,
      items: list.items.map((item) =>
        item.id === organizationId ? { ...item, [flag]: !item[flag] } : item,
      ),
    };
  }

  // Single organisation
  if ("id" in cached && (cached as OrganizationCard).id === organizationId) {
    const org = cached as OrganizationCard;
    return { ...org, [flag]: !org[flag] };
  }

  return cached;
}

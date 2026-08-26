import { useQuery } from "@tanstack/react-query";
import type { PublicStats } from "@impactbridge/shared";
import { apiFetch } from "@/lib/api";

export const statsKeys = {
  public: ["stats", "public"] as const,
};

/**
 * Platform totals for the landing page.
 *
 * Long `staleTime` because the server already caches for a minute and these
 * numbers move slowly — refetching on every mount would just add a request to
 * the most-visited route for a figure that hasn't changed.
 */
export function usePublicStats() {
  return useQuery({
    queryKey: statsKeys.public,
    queryFn: () => apiFetch<PublicStats>("/stats/public"),
    staleTime: 5 * 60_000,
  });
}

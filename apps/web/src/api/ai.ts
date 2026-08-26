import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface AiInsight {
  content: string;
  cached: boolean;
  generatedAt: string;
}

/**
 * One line of the fit checklist against a recommended grant.
 *
 * Computed on the server from the grant's stored eligibility rules and the
 * organisation's own record — NOT asked of the model. `fail` means the API
 * would reject an application on that ground today; `info` is context that
 * cannot block anything.
 */
export interface MatchCheck {
  label: string;
  status: "pass" | "fail" | "info";
  detail: string;
}

export interface GrantMatch {
  grantId: string;
  /** Resolved server-side from the database, never from the model's reply. */
  slug: string;
  title: string;
  amountMinor: number;
  deadline: string;
  score: number;
  reason: string;
  /** Deterministic, server-computed. See `MatchCheck`. */
  checks: MatchCheck[];
  /** False when at least one enforced rule currently fails. */
  eligible: boolean;
}

export interface GrantMatchResult {
  matches: GrantMatch[];
  cached: boolean;
  generatedAt: string;
}

export const aiKeys = {
  all: ["ai"] as const,
  status: () => [...aiKeys.all, "status"] as const,
};

/**
 * Whether the server has AI configured at all.
 *
 * The UI hides every AI control when this is false, rather than showing buttons
 * that can only fail. Cached indefinitely — it can't change without a server
 * restart.
 */
export function useAiStatus(enabled: boolean) {
  return useQuery({
    queryKey: aiKeys.status(),
    queryFn: () =>
      apiFetch<{ available: boolean; provider: string }>("/ai/status"),
    enabled,
    staleTime: Infinity,
    retry: false,
  });
}

/*
 * These are mutations rather than queries even though they only read.
 *
 * Generation is slow and quota-limited, so it must happen when the user asks
 * for it — never automatically on mount, and never re-fired by a background
 * refetch. The server caches the result, so asking again is cheap.
 */

export function useSummariseApplication() {
  return useMutation({
    mutationFn: (applicationId: string) =>
      apiFetch<AiInsight>(`/ai/applications/${applicationId}/summary`, {
        method: "POST",
      }),
  });
}

export function useReviewOwnApplication() {
  return useMutation({
    mutationFn: (applicationId: string) =>
      apiFetch<AiInsight>(`/ai/applications/${applicationId}/review`, {
        method: "POST",
      }),
  });
}

export function useGrantMatches() {
  return useMutation({
    mutationFn: () =>
      apiFetch<GrantMatchResult>("/ai/grant-matches", { method: "POST" }),
  });
}

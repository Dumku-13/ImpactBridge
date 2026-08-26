import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  GrantCard,
  GrantDetail,
  GrantListResponse,
  GrantQuery,
  UpsertGrantInput,
} from "@impactbridge/shared";
import { apiFetch } from "@/lib/api";

export const grantKeys = {
  all: ["grants"] as const,
  list: (query: Partial<GrantQuery>) => [...grantKeys.all, "list", query] as const,
  detail: (slug: string) => [...grantKeys.all, "detail", slug] as const,
  mine: () => [...grantKeys.all, "mine"] as const,
};

/** Turn the filter object into a query string, dropping empty values. */
function toSearchParams(query: Partial<GrantQuery>): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === "" || value === null) continue;
    params.set(key, String(value));
  }

  return params.toString();
}

export function useGrants(query: Partial<GrantQuery>) {
  return useQuery({
    queryKey: grantKeys.list(query),
    queryFn: () =>
      apiFetch<GrantListResponse>(`/grants?${toSearchParams(query)}`),
    placeholderData: (prev) => prev,
  });
}

export function useGrant(slug: string) {
  return useQuery({
    queryKey: grantKeys.detail(slug),
    queryFn: () => apiFetch<GrantDetail>(`/grants/${slug}`),
    enabled: Boolean(slug),
  });
}

/** The signed-in funder's own grants, drafts included. */
export function useMyGrants() {
  return useQuery({
    queryKey: grantKeys.mine(),
    queryFn: async () =>
      (await apiFetch<{ items: GrantCard[] }>("/grants/mine")).items,
  });
}

/**
 * Every grant mutation invalidates the funder's own list AND the public browse
 * list, because publishing or closing a grant changes both.
 */
function useGrantMutation<TArgs, TResult>(
  mutationFn: (args: TArgs) => Promise<TResult>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: grantKeys.all });
    },
  });
}

export function useCreateGrant() {
  return useGrantMutation((input: UpsertGrantInput) =>
    apiFetch<GrantCard>("/grants", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );
}

export function useUpdateGrant() {
  return useGrantMutation(
    ({ id, input }: { id: string; input: UpsertGrantInput }) =>
      apiFetch<GrantCard>(`/grants/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
  );
}

export function useSetGrantStatus() {
  return useGrantMutation(
    ({
      id,
      status,
    }: {
      id: string;
      /** COMPLETED is terminal and the server checks it is earned. */
      status: "OPEN" | "CLOSED" | "DRAFT" | "COMPLETED";
    }) =>
      apiFetch<GrantCard>(`/grants/${id}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      }),
  );
}

export function useDeleteGrant() {
  return useGrantMutation((id: string) =>
    apiFetch<{ deleted: boolean }>(`/grants/${id}`, { method: "DELETE" }),
  );
}

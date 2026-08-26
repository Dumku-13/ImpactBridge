import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ApplicationCard,
  ApplicationDetail,
  Comment,
  CreateCommentInput,
  CreateReportInput,
  Report,
  Review,
  TransitionInput,
  UpsertApplicationInput,
  UpsertReviewInput,
} from "@impactbridge/shared";
import { apiFetch } from "@/lib/api";
import { grantKeys } from "./grants";

export const applicationKeys = {
  all: ["applications"] as const,
  mine: () => [...applicationKeys.all, "mine"] as const,
  reviewers: () => [...applicationKeys.all, "reviewers"] as const,
  forGrant: (grantId: string) =>
    [...applicationKeys.all, "for-grant", grantId] as const,
  detail: (id: string) => [...applicationKeys.all, "detail", id] as const,
};

export function useMyApplications() {
  return useQuery({
    queryKey: applicationKeys.mine(),
    queryFn: async () =>
      (await apiFetch<{ items: ApplicationCard[] }>("/applications/mine"))
        .items,
  });
}

export interface Reviewer {
  id: string;
  name: string;
  role: "FUNDER" | "PLATFORM_ADMIN";
}

/**
 * People this funder can assign a review to.
 *
 * `enabled` because the list is only needed on the one screen where a reviewer
 * is actually being chosen, and it is a (narrow) user directory — no reason to
 * fetch it for an NGO or a donor viewing the same page.
 */
export function useReviewers(enabled: boolean) {
  return useQuery({
    queryKey: applicationKeys.reviewers(),
    queryFn: async () =>
      (await apiFetch<{ items: Reviewer[] }>("/applications/reviewers")).items,
    enabled,
    // The set of funder accounts changes about as often as never.
    staleTime: 10 * 60_000,
  });
}

export function useGrantApplications(grantId: string) {
  return useQuery({
    queryKey: applicationKeys.forGrant(grantId),
    queryFn: async () =>
      (
        await apiFetch<{ items: ApplicationCard[] }>(
          `/applications/for-grant/${grantId}`,
        )
      ).items,
    enabled: Boolean(grantId),
  });
}

export function useApplication(id: string) {
  return useQuery({
    queryKey: applicationKeys.detail(id),
    queryFn: () => apiFetch<ApplicationDetail>(`/applications/${id}`),
    enabled: Boolean(id),
  });
}

/**
 * Any application mutation invalidates everything application-shaped plus the
 * grant lists, because applicant counts and statuses appear in both.
 */
function useApplicationMutation<TArgs, TResult>(
  mutationFn: (args: TArgs) => Promise<TResult>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: applicationKeys.all });
      void queryClient.invalidateQueries({ queryKey: grantKeys.all });
    },
  });
}

export function useCreateApplication() {
  return useApplicationMutation(
    ({ grantId, input }: { grantId: string; input: UpsertApplicationInput }) =>
      apiFetch<ApplicationCard>(`/applications/grant/${grantId}`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
  );
}

export function useUpdateApplication() {
  return useApplicationMutation(
    ({ id, input }: { id: string; input: UpsertApplicationInput }) =>
      apiFetch<ApplicationCard>(`/applications/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
  );
}

/** The only way a status changes — mirrors the server's single choke point. */
export function useTransitionApplication() {
  return useApplicationMutation(
    ({ id, input }: { id: string; input: TransitionInput }) =>
      apiFetch<ApplicationCard>(`/applications/${id}/transition`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
  );
}

export function useUpsertReview() {
  return useApplicationMutation(
    ({ id, input }: { id: string; input: UpsertReviewInput }) =>
      apiFetch<Review>(`/applications/${id}/review`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
  );
}

export function useAddComment() {
  return useApplicationMutation(
    ({ id, input }: { id: string; input: CreateCommentInput }) =>
      apiFetch<Comment>(`/applications/${id}/comments`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
  );
}

export function useCreateReport() {
  return useApplicationMutation(
    ({ projectId, input }: { projectId: string; input: CreateReportInput }) =>
      apiFetch<Report>(`/applications/projects/${projectId}/reports`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
  );
}

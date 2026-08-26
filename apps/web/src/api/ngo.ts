import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Category,
  DocumentListResponse,
  ImpactMetric,
  ImpactMetricDetail,
  OrganizationDocument,
  OrganizationImageKind,
  TeamMember,
  UpdateOrganizationInput,
  UploadDocumentInput,
  UpsertImpactMetricInput,
  UpsertTeamMemberInput,
} from "@impactbridge/shared";
import { apiFetch, apiUpload, getAccessToken } from "@/lib/api";
import { orgKeys } from "./organizations";

/** The NGO's own organisation, including fields the public API doesn't expose. */
export interface MyOrganization {
  id: string;
  slug: string;
  name: string;
  mission: string;
  description: string | null;
  city: string | null;
  state: string | null;
  country: string;
  website: string | null;
  contactEmail: string | null;
  phone: string | null;
  foundedYear: number | null;
  fundingGoalMinor: number;
  totalRaisedMinor: number;
  donorCount: number;
  logoUrl: string | null;
  coverUrl: string | null;
  verified: boolean;
  verifiedAt: string | null;
  rating: number;
  ratingCount: number;
  categories: Category[];
  impactMetrics: ImpactMetric[];
  createdAt: string;
  updatedAt: string;
}

export const ngoKeys = {
  all: ["ngo"] as const,
  organization: () => [...ngoKeys.all, "organization"] as const,
  documents: () => [...ngoKeys.all, "documents"] as const,
  metrics: () => [...ngoKeys.all, "metrics"] as const,
  team: () => [...ngoKeys.all, "team"] as const,
  donations: () => [...ngoKeys.all, "donations"] as const,
  analytics: () => [...ngoKeys.all, "analytics"] as const,
};

export function useMyOrganization() {
  return useQuery({
    queryKey: ngoKeys.organization(),
    queryFn: () => apiFetch<MyOrganization>("/ngo/organization"),
    // A missing profile is a real answer, not a transient failure.
    retry: false,
  });
}

export function useUpdateOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateOrganizationInput) =>
      apiFetch<MyOrganization>("/ngo/organization", {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(ngoKeys.organization(), data);
      // The public profile and browse cards show the same fields.
      queryClient.invalidateQueries({ queryKey: orgKeys.all });
    },
  });
}

export function useUploadOrganizationImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      kind,
      file,
    }: {
      kind: OrganizationImageKind;
      file: File;
    }) => {
      const body = new FormData();
      body.append("file", file);
      return apiUpload<{ logoUrl: string | null; coverUrl: string | null }>(
        `/ngo/organization/image/${kind}`,
        body,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ngoKeys.organization() });
      queryClient.invalidateQueries({ queryKey: orgKeys.all });
    },
  });
}

export function useMyDocuments() {
  return useQuery({
    queryKey: ngoKeys.documents(),
    queryFn: () => apiFetch<DocumentListResponse>("/ngo/documents"),
  });
}

export function useUploadDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      file,
      ...meta
    }: UploadDocumentInput & { file: File }) => {
      const body = new FormData();
      body.append("file", file);
      body.append("type", meta.type);
      body.append("title", meta.title);
      return apiUpload<OrganizationDocument>("/ngo/documents", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ngoKeys.documents() });
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ deleted: boolean }>(`/ngo/documents/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ngoKeys.documents() });
    },
  });
}

/**
 * Cause taxonomy, reused from the browse filters.
 *
 * Re-exported rather than redeclared: this file used to define its own
 * `useCategories` under the SAME React Query key as the one in
 * `organizations.ts`, but unwrapped differently — one resolved to `Category[]`,
 * the other to `{ items: Category[] }`. React Query caches by key alone, so
 * whichever page loaded first decided the shape, and the other one then read
 * `.items` off an array (or `.map` off an object) and threw mid-render. There
 * must only ever be one hook per key.
 */
export { useCategories } from "./organizations";

export { getAccessToken };

/* ── Impact metrics ───────────────────────────────────────────────────────── */

export function useImpactMetrics() {
  return useQuery({
    queryKey: ngoKeys.metrics(),
    queryFn: async () =>
      (await apiFetch<{ items: ImpactMetricDetail[] }>("/ngo/metrics")).items,
  });
}

/**
 * Metrics and team members all invalidate the same two things: their own list,
 * and the public profile that renders them. Wrapping that in one helper keeps
 * every mutation below consistent — a forgotten invalidation is the usual cause
 * of "I saved it but the page still shows the old value".
 */
function useNgoListMutation<TArgs, TResult>(
  mutationFn: (args: TArgs) => Promise<TResult>,
  listKey: readonly unknown[],
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: listKey });
      void queryClient.invalidateQueries({ queryKey: ngoKeys.organization() });
      void queryClient.invalidateQueries({ queryKey: orgKeys.all });
    },
  });
}

export function useCreateImpactMetric() {
  return useNgoListMutation(
    (input: UpsertImpactMetricInput) =>
      apiFetch<ImpactMetricDetail>("/ngo/metrics", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ngoKeys.metrics(),
  );
}

export function useUpdateImpactMetric() {
  return useNgoListMutation(
    ({ id, input }: { id: string; input: UpsertImpactMetricInput }) =>
      apiFetch<ImpactMetricDetail>(`/ngo/metrics/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    ngoKeys.metrics(),
  );
}

export function useDeleteImpactMetric() {
  return useNgoListMutation(
    (id: string) =>
      apiFetch<{ deleted: boolean }>(`/ngo/metrics/${id}`, {
        method: "DELETE",
      }),
    ngoKeys.metrics(),
  );
}

/* ── Team members ─────────────────────────────────────────────────────────── */

export function useTeamMembers() {
  return useQuery({
    queryKey: ngoKeys.team(),
    queryFn: async () =>
      (await apiFetch<{ items: TeamMember[] }>("/ngo/team")).items,
  });
}

export function useCreateTeamMember() {
  return useNgoListMutation(
    (input: UpsertTeamMemberInput) =>
      apiFetch<TeamMember>("/ngo/team", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ngoKeys.team(),
  );
}

export function useUpdateTeamMember() {
  return useNgoListMutation(
    ({ id, input }: { id: string; input: UpsertTeamMemberInput }) =>
      apiFetch<TeamMember>(`/ngo/team/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    ngoKeys.team(),
  );
}

export function useUploadTeamMemberPhoto() {
  return useNgoListMutation(
    ({ id, file }: { id: string; file: File }) => {
      const body = new FormData();
      body.append("file", file);
      return apiUpload<TeamMember>(`/ngo/team/${id}/photo`, body);
    },
    ngoKeys.team(),
  );
}

export function useDeleteTeamMember() {
  return useNgoListMutation(
    (id: string) =>
      apiFetch<{ deleted: boolean }>(`/ngo/team/${id}`, { method: "DELETE" }),
    ngoKeys.team(),
  );
}

/* ── Donations received & analytics ───────────────────────────────────────── */

export interface ReceivedDonation {
  id: string;
  amountMinor: number;
  currency: string;
  message: string | null;
  anonymous: boolean;
  receiptNumber: string | null;
  completedAt: string | null;
  /** Null when the donor chose to stay anonymous — the API never sends a name. */
  donorName: string | null;
}

export interface ReceivedDonationsResponse {
  items: ReceivedDonation[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface OrganizationAnalytics {
  totalRaisedMinor: number;
  donationCount: number;
  averageDonationMinor: number;
  currency: string;
  monthly: Array<{ month: string; totalMinor: number; count: number }>;
  topDonors: Array<{ name: string; totalMinor: number; count: number }>;
  anonymous: { totalMinor: number; count: number };
}

export function useReceivedDonations(page = 1) {
  return useQuery({
    queryKey: [...ngoKeys.donations(), page],
    queryFn: () =>
      apiFetch<ReceivedDonationsResponse>(
        `/ngo/donations?page=${page}&pageSize=20`,
      ),
    // Keep the previous page visible while the next one loads, so the table
    // doesn't collapse to a spinner on every page change.
    placeholderData: (prev) => prev,
  });
}

export function useOrganizationAnalytics() {
  return useQuery({
    queryKey: ngoKeys.analytics(),
    queryFn: () => apiFetch<OrganizationAnalytics>("/ngo/analytics"),
  });
}

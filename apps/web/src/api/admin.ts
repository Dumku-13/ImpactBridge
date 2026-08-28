import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface PlatformStats {
  users: {
    total: number;
    donors: number;
    ngoAdmins: number;
    funders: number;
    admins: number;
  };
  organizations: {
    total: number;
    verified: number;
    pending: number;
    suspended: number;
  };
  donations: { totalMinor: number; count: number };
  grants: {
    committedMinor: number;
    count: number;
    applicationCount: number;
    releasedMinor: number;
    releasedCount: number;
  };
  monthly: Array<{ month: string; totalMinor: number; count: number }>;
  currency: string;
}

export interface AdminOrganization {
  id: string;
  slug: string;
  name: string;
  mission: string;
  city: string | null;
  state: string | null;
  verified: boolean;
  verifiedAt: string | null;
  status: string;
  totalRaisedMinor: number;
  donorCount: number;
  createdAt: string;
  owner: { id: string; name: string; email: string };
  documentCount: number;
  donationCount: number;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  emailVerified: boolean;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  targetName: string | null;
  reason: string | null;
  actorName: string;
  createdAt: string;
}

interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  totalPages: number;
}

const adminKeys = {
  all: ["admin"] as const,
  stats: () => [...adminKeys.all, "stats"] as const,
  organizations: (filter: string) =>
    [...adminKeys.all, "organizations", filter] as const,
  users: (search: string, role: string) =>
    [...adminKeys.all, "users", search, role] as const,
  audit: () => [...adminKeys.all, "audit"] as const,
};

export function usePlatformStats() {
  return useQuery({
    queryKey: adminKeys.stats(),
    queryFn: () => apiFetch<PlatformStats>("/admin/stats"),
  });
}

export function useAdminOrganizations(filter: string) {
  return useQuery({
    queryKey: adminKeys.organizations(filter),
    queryFn: () =>
      apiFetch<Paged<AdminOrganization>>(
        `/admin/organizations?filter=${filter}`,
      ),
  });
}

export function useAdminUsers(search: string, role: string) {
  return useQuery({
    queryKey: adminKeys.users(search, role),
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (role) params.set("role", role);
      return apiFetch<Paged<AdminUser>>(`/admin/users?${params}`);
    },
  });
}

export function useAuditLog() {
  return useQuery({
    queryKey: adminKeys.audit(),
    queryFn: () => apiFetch<Paged<AuditEntry>>("/admin/audit"),
  });
}

/**
 * Admin actions invalidate EVERYTHING under the admin key plus the public
 * organisation lists — verifying an NGO changes what donors see too.
 */
function useAdminMutation<TArgs, TResult>(
  mutationFn: (args: TArgs) => Promise<TResult>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.all });
      void queryClient.invalidateQueries({ queryKey: ["organizations"] });
    },
  });
}

export function useVerifyOrganization() {
  return useAdminMutation(
    ({
      id,
      verified,
      reason,
    }: {
      id: string;
      verified: boolean;
      reason?: string;
    }) =>
      apiFetch(`/admin/organizations/${id}/verify`, {
        method: "POST",
        body: JSON.stringify({ verified, reason }),
      }),
  );
}

export function useSuspendOrganization() {
  return useAdminMutation(
    ({
      id,
      suspended,
      reason,
    }: {
      id: string;
      suspended: boolean;
      reason?: string;
    }) =>
      apiFetch(`/admin/organizations/${id}/suspend`, {
        method: "POST",
        body: JSON.stringify({ suspended, reason }),
      }),
  );
}

export function useSuspendUser() {
  return useAdminMutation(
    ({
      id,
      suspended,
      reason,
    }: {
      id: string;
      suspended: boolean;
      reason?: string;
    }) =>
      apiFetch(`/admin/users/${id}/suspend`, {
        method: "POST",
        body: JSON.stringify({ suspended, reason }),
      }),
  );
}

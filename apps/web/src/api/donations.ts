import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateDonationInput,
  CreateOrderResponse,
  Donation,
  DonationListResponse,
  DonorStats,
  VerifyPaymentInput,
  VerifyPaymentResponse,
} from "@impactbridge/shared";
import { apiFetch, apiPost } from "@/lib/api";
import { orgKeys } from "./organizations";

export const donationKeys = {
  all: ["donations"] as const,
  list: (page: number) => [...donationKeys.all, "list", page] as const,
  stats: () => [...donationKeys.all, "stats"] as const,
  byOrder: (orderId: string) =>
    [...donationKeys.all, "order", orderId] as const,
};

export function useDonations(page = 1) {
  return useQuery({
    queryKey: donationKeys.list(page),
    queryFn: () =>
      apiFetch<DonationListResponse>(`/donations?page=${page}&pageSize=10`),
  });
}

export function useDonorStats() {
  return useQuery({
    queryKey: donationKeys.stats(),
    queryFn: () => apiFetch<DonorStats>("/donations/stats"),
  });
}

/**
 * Poll a donation until the server confirms it.
 *
 * Confirmation can arrive by two independent paths — the browser callback we
 * POST to /donations/verify, and the gateway's webhook — with no guaranteed
 * order. Rather than pretend the donation is complete (which is exactly how
 * integrations end up showing success for payments that never landed), the
 * success page polls this until the server itself reports a terminal status.
 */
export function useDonationByOrder(orderId: string | null) {
  return useQuery({
    queryKey: donationKeys.byOrder(orderId ?? ""),
    queryFn: () => apiFetch<Donation>(`/donations/by-order/${orderId}`),
    enabled: Boolean(orderId),
    refetchInterval: (query) => {
      /*
       * Stop on error. Without this the poll never ends: a failing request
       * leaves `data` undefined, so the terminal-status check below can never
       * fire and the page hammers the server every 1.5s (×3 retries) forever.
       */
      if (query.state.status === "error") return false;

      // Also cap the wait. If it hasn't settled in ~2 minutes it isn't going to
      // resolve by polling, and the donor dashboard reconciles it later anyway.
      if (query.state.dataUpdateCount > 80) return false;

      const status = query.state.data?.status;
      // Stop polling once we reach a terminal state.
      if (status && status !== "PENDING") return false;
      return 1500;
    },
    // Give up after a few failures rather than hammering forever.
    retry: 3,
  });
}

export function useCreateCheckout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateDonationInput) =>
      apiPost<CreateOrderResponse>("/donations/checkout", input),
    onSuccess: () => {
      // The organisation's totals will change once payment completes.
      queryClient.invalidateQueries({ queryKey: orgKeys.all });
    },
  });
}

/** Hand the gateway's signed result to the server for verification. */
export function useVerifyPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: VerifyPaymentInput) =>
      apiPost<VerifyPaymentResponse>("/donations/verify", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: donationKeys.all });
      queryClient.invalidateQueries({ queryKey: orgKeys.all });
    },
  });
}

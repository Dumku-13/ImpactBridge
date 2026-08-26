import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { connectSocket, disconnectSocket } from "@/lib/socket";

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

interface NotificationsResponse {
  items: AppNotification[];
  unreadCount: number;
}

export const notificationKeys = {
  all: ["notifications"] as const,
};

export function useNotifications(enabled: boolean) {
  return useQuery({
    queryKey: notificationKeys.all,
    queryFn: () => apiFetch<NotificationsResponse>("/notifications"),
    enabled,
    /*
     * A slow poll as a safety net. The socket delivers instantly when it's
     * connected; this catches anything missed while the tab was asleep or the
     * connection was down, without hammering the API.
     */
    refetchInterval: 60_000,
  });
}

/**
 * Keep the notification cache live over the socket.
 *
 * On an incoming event we invalidate rather than splice the payload into the
 * cache: the server is the source of truth for ordering and the unread count,
 * and a refetch is cheap. Merging by hand is where duplicate and out-of-order
 * items creep in.
 */
export function useNotificationSocket(enabled: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) {
      disconnectSocket();
      return;
    }

    const socket = connectSocket();
    if (!socket) return;

    const onNotification = () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    };

    socket.on("notification", onNotification);

    return () => {
      socket.off("notification", onNotification);
    };
  }, [enabled, queryClient]);
}

/**
 * Mark a single notification read.
 *
 * The endpoint existed server-side with no client hook, so opening a
 * notification navigated to the target and left it sitting unread — the badge
 * only ever cleared via "Mark all read". Fired on click alongside navigation.
 */
export function useMarkRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: true }>(`/notifications/${id}/read`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiFetch<{ marked: number }>("/notifications/read-all", {
        method: "POST",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

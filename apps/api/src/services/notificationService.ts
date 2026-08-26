import type { NotificationType, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { emitToUser } from "../lib/realtime.js";

/**
 * In-app notifications.
 *
 * Every notification is PERSISTED first, then pushed over the socket. Doing it
 * in that order means a user who was offline — or whose socket dropped — still
 * finds the notification waiting when they return. Push-only delivery silently
 * loses anything that happens while a tab is closed, which is most of the time.
 */
export async function notify(
  params: {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    link?: string;
  },
  tx: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> {
  const notification = await tx.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      title: params.title,
      body: params.body,
      link: params.link ?? null,
    },
  });

  /*
   * Fire-and-forget: a socket problem must never fail the action that triggered
   * the notification. The row is already safely written, so the worst case is
   * the user sees it on their next page load instead of instantly.
   */
  emitToUser(params.userId, "notification", {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    link: notification.link,
    readAt: null,
    createdAt: notification.createdAt.toISOString(),
  });
}

/** Notify several users without N round trips for the socket push. */
export async function notifyMany(
  userIds: string[],
  params: {
    type: NotificationType;
    title: string;
    body: string;
    link?: string;
  },
): Promise<void> {
  if (userIds.length === 0) return;

  await prisma.notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      type: params.type,
      title: params.title,
      body: params.body,
      link: params.link ?? null,
    })),
  });

  for (const userId of userIds) {
    emitToUser(userId, "notification", {
      id: `pending-${userId}`,
      type: params.type,
      title: params.title,
      body: params.body,
      link: params.link ?? null,
      readAt: null,
      createdAt: new Date().toISOString(),
    });
  }
}

export async function listNotifications(userId: string, limit = 20) {
  const [rows, unreadCount] = await prisma.$transaction([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      link: row.link,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
    unreadCount,
  };
}

export async function markAllRead(userId: string) {
  // Scoped by userId AND unread, so it can only ever touch this user's rows.
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });

  return { marked: result.count };
}

export async function markRead(userId: string, notificationId: string) {
  await prisma.notification.updateMany({
    where: { id: notificationId, userId, readAt: null },
    data: { readAt: new Date() },
  });

  return { ok: true };
}

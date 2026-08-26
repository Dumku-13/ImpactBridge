import type { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

/**
 * Append-only audit trail for privileged actions.
 *
 * `recordAudit` accepts an optional transaction client so a log entry can be
 * written in the SAME transaction as the action it describes. That matters: an
 * action that committed without its audit row, or an audit row for an action
 * that rolled back, would both make the trail untrustworthy — and a trail you
 * can't trust is worse than none, because it looks authoritative.
 */
export async function recordAudit(
  params: {
    actorId: string | null;
    action: AuditAction;
    targetType: string;
    targetId: string;
    targetName?: string | null;
    reason?: string | null;
    metadata?: Prisma.InputJsonValue;
  },
  tx: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: params.actorId,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      targetName: params.targetName ?? null,
      reason: params.reason ?? null,
      metadata: params.metadata,
    },
  });
}

export async function listAuditLogs(page = 1, pageSize = 30) {
  const [rows, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { actor: { select: { name: true, email: true } } },
    }),
    prisma.auditLog.count(),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      targetName: row.targetName,
      reason: row.reason,
      actorName: row.actor?.name ?? "System",
      createdAt: row.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

import "server-only"

import { db } from "@/backend/db"

export async function logAdminAction(input: {
  userId: string
  action: string
  entityType: string
  entityId: string
  oldValues?: Record<string, unknown>
  newValues?: Record<string, unknown>
}): Promise<void> {
  await db.auditLog.create({
    data: {
      userId: input.userId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      oldValues: input.oldValues as object | undefined,
      newValues: input.newValues as object | undefined,
    },
  })
}

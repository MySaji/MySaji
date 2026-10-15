"use server"

import type { NotificationType } from "@prisma/client"

export type NotifyInput = {
  userId: string
  title: string
  message: string
  type: NotificationType
  relatedType?: string
  relatedId?: string
  actionUrl?: string
}

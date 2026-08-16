"use client"

import { NotificationsList } from "@/components/notifications/notifications-list"

// Auth/role gating already happens in app/admin/layout.tsx (redirects before
// this page's children ever render) — a second copy of the same check here
// just added a redundant loading gate on top of NotificationsList's own.
export default function AdminNotificationsPage() {
  return <NotificationsList detailBasePath="/admin/notifications" />
}

"use client"

import { useParams } from "next/navigation"
import { NotificationDetail } from "@/frontend/components/notifications/notification-detail"

// Auth/role gating already happens in app/admin/layout.tsx (redirects before
// this page's children ever render) — a second copy of the same check here
// just added a redundant loading gate on top of NotificationDetail's own.
export default function AdminNotificationDetailPage() {
  const params = useParams<{ id: string }>()
  return <NotificationDetail id={params.id} listHref="/admin/notifications" />
}

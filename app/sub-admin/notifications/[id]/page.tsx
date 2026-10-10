"use client"

import { useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { useAuthContext } from "@/frontend/lib/auth-context"
import { LoadingScreen } from "@/frontend/components/loading-screen"
import { NotificationDetail } from "@/frontend/components/notifications/notification-detail"

export default function SubAdminNotificationDetailPage() {
  const { isAuthenticated, isLoading, user } = useAuthContext()
  const router = useRouter()
  const params = useParams<{ id: string }>()

  useEffect(() => {
    if (!isLoading && (!isAuthenticated || user?.role !== "sub-admin")) {
      router.push("/")
    }
  }, [isAuthenticated, isLoading, user, router])

  if (isLoading || !isAuthenticated || user?.role !== "sub-admin") {
    return <LoadingScreen />
  }

  return <NotificationDetail id={params.id} listHref="/sub-admin/notifications" />
}

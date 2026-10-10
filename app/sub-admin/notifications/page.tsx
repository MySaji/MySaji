"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuthContext } from "@/frontend/lib/auth-context"
import { LoadingScreen } from "@/frontend/components/loading-screen"
import { NotificationsList } from "@/frontend/components/notifications/notifications-list"

export default function SubAdminNotificationsPage() {
  const { isAuthenticated, isLoading, user } = useAuthContext()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && (!isAuthenticated || user?.role !== "sub-admin")) {
      router.push("/")
    }
  }, [isAuthenticated, isLoading, user, router])

  if (isLoading || !isAuthenticated || user?.role !== "sub-admin") {
    return <LoadingScreen />
  }

  return <NotificationsList detailBasePath="/sub-admin/notifications" />
}

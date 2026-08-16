"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuthContext } from "@/lib/auth-context"
import { LoadingScreen } from "@/components/loading-screen"
import { NotificationsList } from "@/components/notifications/notifications-list"

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

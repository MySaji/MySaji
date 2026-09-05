"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuthContext } from "@/lib/auth-context"
import { LoadingScreen } from "@/components/loading-screen"
import { NotificationsList } from "@/components/notifications/notifications-list"

export default function ProviderNotificationsPage() {
  const { isAuthenticated, isLoading, user } = useAuthContext()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && (!isAuthenticated || user?.role !== "provider")) {
      router.push("/")
    }
  }, [isAuthenticated, isLoading, user, router])

  if (isLoading || !isAuthenticated || user?.role !== "provider") {
    return <LoadingScreen />
  }

  return <NotificationsList detailBasePath="/provider/notifications" />
}

"use client"

import { useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { useAuthContext } from "@/frontend/lib/auth-context"
import { LoadingScreen } from "@/frontend/components/loading-screen"
import { NotificationDetail } from "@/frontend/components/notifications/notification-detail"

export default function DistributorNotificationDetailPage() {
  const { isAuthenticated, isLoading, user } = useAuthContext()
  const router = useRouter()
  const params = useParams<{ id: string }>()

  useEffect(() => {
    if (!isLoading && (!isAuthenticated || user?.role !== "distributor")) {
      router.push("/")
    }
  }, [isAuthenticated, isLoading, user, router])

  if (isLoading || !isAuthenticated || user?.role !== "distributor") {
    return <LoadingScreen />
  }

  return <NotificationDetail id={params.id} listHref="/distributor/notifications" />
}

"use client"

import { useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { useAuthContext } from "@/frontend/lib/auth-context"
import { LoadingScreen } from "@/frontend/components/loading-screen"
import { NotificationDetail } from "@/frontend/components/notifications/notification-detail"

export default function ShopkeeperNotificationDetailPage() {
  const { isAuthenticated, isLoading, user } = useAuthContext()
  const router = useRouter()
  const params = useParams<{ id: string }>()

  useEffect(() => {
    if (!isLoading && (!isAuthenticated || user?.role !== "shopkeeper")) {
      router.push("/")
    }
  }, [isAuthenticated, isLoading, user, router])

  if (isLoading || !isAuthenticated || user?.role !== "shopkeeper") {
    return <LoadingScreen />
  }

  return <NotificationDetail id={params.id} listHref="/shopkeeper/notifications" />
}

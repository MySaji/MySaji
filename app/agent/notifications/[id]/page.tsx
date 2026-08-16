"use client"

import { useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { useAuthContext } from "@/lib/auth-context"
import { LoadingScreen } from "@/components/loading-screen"
import { NotificationDetail } from "@/components/notifications/notification-detail"

export default function AgentNotificationDetailPage() {
  const { isAuthenticated, isLoading, user } = useAuthContext()
  const router = useRouter()
  const params = useParams<{ id: string }>()

  useEffect(() => {
    if (!isLoading && (!isAuthenticated || user?.role !== "agent")) {
      router.push("/")
    }
  }, [isAuthenticated, isLoading, user, router])

  if (isLoading || !isAuthenticated || user?.role !== "agent") {
    return <LoadingScreen />
  }

  return <NotificationDetail id={params.id} listHref="/agent/notifications" />
}

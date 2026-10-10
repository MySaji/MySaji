"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuthContext } from "@/frontend/lib/auth-context"
import { LoadingScreen } from "@/frontend/components/loading-screen"
import { CustomerSettingsPage } from "@/frontend/components/pages/customer-settings-page"

export default function SettingsPage() {
  const { isAuthenticated, isLoading, user } = useAuthContext()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/")
    }
    if (!isLoading && user && user.role !== "customer") {
      router.push("/")
    }
  }, [isAuthenticated, isLoading, user, router])

  if (isLoading || !isAuthenticated) {
    return <LoadingScreen />
  }

  return <CustomerSettingsPage />
}

"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuthContext } from "@/frontend/lib/auth-context"
import { LoadingScreen } from "@/frontend/components/loading-screen"
import { CustomerRequestsPage } from "@/frontend/components/pages/customer-requests-page"

export default function RequestsPage() {
  const { isAuthenticated, isLoading, user } = useAuthContext()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push("/")
    if (!isLoading && user && user.role !== "customer") router.push("/")
  }, [isAuthenticated, isLoading, user, router])

  if (isLoading || !isAuthenticated) return <LoadingScreen />
  return <CustomerRequestsPage />
}

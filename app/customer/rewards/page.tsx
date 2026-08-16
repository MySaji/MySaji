"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuthContext } from "@/lib/auth-context"
import { LoadingScreen } from "@/components/loading-screen"
import { CustomerRewardsPage } from "@/components/pages/customer-rewards-page"

export default function RewardsPage() {
  const { isAuthenticated, isLoading, user } = useAuthContext()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push("/")
    if (!isLoading && user && user.role !== "customer") router.push("/")
  }, [isAuthenticated, isLoading, user, router])

  if (isLoading || !isAuthenticated) return <LoadingScreen />
  return <CustomerRewardsPage />
}

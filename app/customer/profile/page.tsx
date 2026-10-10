"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuthContext } from "@/frontend/lib/auth-context"
import { LoadingScreen } from "@/frontend/components/loading-screen"
import { CustomerProfilePage } from "@/frontend/components/pages/customer-profile-page"

export default function ProfilePage() {
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

  return <CustomerProfilePage />
}

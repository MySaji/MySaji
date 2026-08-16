"use client"

import { Suspense, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuthContext } from "@/lib/auth-context"
import { LoadingScreen } from "@/components/loading-screen"
import { CustomerSearchPage } from "@/components/pages/customer-search-page"

export default function SearchPage() {
  const { isAuthenticated, isLoading, user } = useAuthContext()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push("/")
    if (!isLoading && user && user.role !== "customer") router.push("/")
  }, [isAuthenticated, isLoading, user, router])

  if (isLoading || !isAuthenticated) return <LoadingScreen />
  return (
    <Suspense>
      <CustomerSearchPage />
    </Suspense>
  )
}

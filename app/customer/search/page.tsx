"use client"

import { Suspense, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuthContext } from "@/frontend/lib/auth-context"
import { LoadingScreen } from "@/frontend/components/loading-screen"
import { CustomerSearchPage } from "@/frontend/components/pages/customer-search-page"

export default function SearchPage() {
  const { isLoading, user } = useAuthContext()
  const router = useRouter()

  // Search is open to everyone, signed in or not — see the matching note in
  // app/customer/services/page.tsx. A signed-in non-customer still goes to
  // their own portal.
  useEffect(() => {
    if (!isLoading && user && user.role !== "customer") router.push("/")
  }, [isLoading, user, router])

  if (isLoading) return <LoadingScreen />
  return (
    <Suspense>
      <CustomerSearchPage />
    </Suspense>
  )
}

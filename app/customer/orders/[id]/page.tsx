"use client"

import { useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { useAuthContext } from "@/frontend/lib/auth-context"
import { LoadingScreen } from "@/frontend/components/loading-screen"
import { CustomerOrderDetailPage } from "@/frontend/components/pages/customer-order-detail-page"

export default function OrderDetailPage() {
  const { isAuthenticated, isLoading, user } = useAuthContext()
  const router = useRouter()
  const params = useParams<{ id: string }>()

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

  return <CustomerOrderDetailPage orderId={params.id} />
}

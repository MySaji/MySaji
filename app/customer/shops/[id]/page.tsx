"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuthContext } from "@/lib/auth-context"
import { LoadingScreen } from "@/components/loading-screen"
import { CustomerShopPage } from "@/components/pages/customer-shop-page"

export default function ShopPage() {
  const { isLoading, user } = useAuthContext()
  const router = useRouter()

  // Browsing is open to everyone, signed in or not: the marketplace has to be
  // explorable before anyone will sign up for it. Only the actions behind it
  // require an account, and those refuse themselves individually. A signed-in
  // non-customer is still sent to their own portal, which is unchanged.
  useEffect(() => {
    if (!isLoading && user && user.role !== "customer") {
      router.push("/")
    }
  }, [isLoading, user, router])

  if (isLoading) {
    return <LoadingScreen />
  }

  return <CustomerShopPage />
}

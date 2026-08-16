"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuthContext } from "@/lib/auth-context"
import { LoadingScreen } from "@/components/loading-screen"
import { Footer } from "@/components/footer"
import { LandingPage } from "@/components/pages/landing-page"
import { ROLE_HOME_PATH } from "@/lib/role-map"

export default function Home() {
  const { isAuthenticated, isLoading, user } = useAuthContext()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!isLoading && mounted && isAuthenticated && user) {
      router.push(ROLE_HOME_PATH[user.role])
    }
  }, [isAuthenticated, isLoading, user, router, mounted])

  if (isLoading) {
    return <LoadingScreen />
  }

  if (!mounted) {
    return null
  }

  return (
    <div className="min-h-screen bg-background">
      <main>
        <LandingPage />
      </main>
      <Footer />
    </div>
  )
}

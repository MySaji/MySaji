import type React from "react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Authentication - SAJI",
  description: "Sign in or create your SAJI account",
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <div className="min-h-screen bg-background">{children}</div>
}

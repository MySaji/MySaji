"use client"

import type React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuthContext } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Mail, Lock, AlertCircle, Eye, EyeOff, Shield, Users, KeyRound } from "lucide-react"
import { ROLE_HOME_PATH } from "@/lib/role-map"
import type { UserRole } from "@/lib/types"
import { BrandLogo } from "@/components/brand-logo"

const TEAM_ROLES: UserRole[] = ["sub-admin", "secretary", "agent"]

export default function TeamLoginPage() {
  const router = useRouter()
  const { login } = useAuthContext()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    const result = await login(email, password)
    setLoading(false)

    if (!result.success) {
      setError("Invalid email or password. Please check your credentials or contact your Admin for help.")
      return
    }

    if (!TEAM_ROLES.includes(result.role)) {
      setError("This portal is for team accounts only. Please use the main sign-in page.")
      return
    }

    router.push(ROLE_HOME_PATH[result.role])
  }

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left Panel */}
      <div className="hidden lg:flex lg:w-[480px] xl:w-[520px] flex-col justify-between relative overflow-hidden bg-primary text-primary-foreground p-10">
        <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-white/5 blur-3xl" />
        <div className="absolute -bottom-32 -left-20 w-96 h-96 rounded-full bg-white/5 blur-3xl" />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-16">
            <BrandLogo size="large" variant="translucent" />
            <span className="text-xl font-bold tracking-tight">SAJI</span>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-xs font-medium mb-6">
            <Shield className="w-3.5 h-3.5" />
            Team Portal
          </div>
          <h1 className="text-3xl font-bold leading-tight mb-3">Team Access</h1>
          <p className="text-white/70 text-sm leading-relaxed max-w-xs">Sign in with the credentials provided by your administrator to access your team dashboard.</p>
        </div>

        <div className="relative z-10 space-y-5">
          {[
            { icon: KeyRound, title: "Admin-issued Credentials", desc: "Use the login details from your admin" },
            { icon: Users, title: "Role-based Access", desc: "Sub-Admin, Secretary, or Agent portals" },
            { icon: Shield, title: "Secure Portal", desc: "Enterprise-grade access control" },
          ].map((item) => (
            <div key={item.title} className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                <item.icon className="w-4 h-4" />
              </div>
              <div>
                <p className="font-semibold text-sm">{item.title}</p>
                <p className="text-white/60 text-xs">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="relative z-10 text-white/40 text-xs">&copy; {new Date().getFullYear()} SAJI. All rights reserved.</p>
      </div>

      {/* Right Panel */}
      <div className="flex-1 flex items-center justify-center px-4 py-8 sm:px-8">
        <div className="w-full max-w-[420px]">
          {/* Mobile logo */}
          <div className="flex items-center gap-2.5 mb-8 lg:hidden">
            <BrandLogo />
            <span className="text-lg font-bold text-foreground">SAJI</span>
          </div>

          {/* Team badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium mb-4">
            <Shield className="w-3.5 h-3.5" />
            Team Portal
          </div>

          <h2 className="text-2xl font-bold text-foreground mb-1">Team Sign In</h2>
          <p className="text-sm text-muted-foreground mb-6">Use the credentials provided by your administrator</p>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-destructive/10 border border-destructive/20 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="text-sm font-medium text-foreground mb-1.5 block">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your.email@example.com"
                  className="pl-9 h-10 rounded-xl border-border bg-card"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="text-sm font-medium text-foreground mb-1.5 block">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="pl-9 pr-9 h-10 rounded-xl border-border bg-card"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" disabled={loading} className="w-full h-10 rounded-xl font-semibold">
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          {/* Info card */}
          <div className="mt-6 p-4 rounded-xl bg-muted/50 border border-border">
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground">Need access?</span> Contact your administrator to get your team credentials. Team roles include Sub-Admin, Secretary, and Agent.
            </p>
          </div>

          {/* Footer */}
          <p className="text-center text-sm text-muted-foreground mt-6">
            Not a team member?{" "}
            <button onClick={() => router.push("/")} className="font-medium text-primary hover:underline">
              Go to homepage
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}

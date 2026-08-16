import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { isMaintenanceModeActive } from "@/lib/actions/admin-settings"

// Paths that must keep working even while maintenance mode is on: the login
// page itself (so an admin can sign in to turn it back off), NextAuth's own
// routes, and the maintenance page (avoid redirect loops). All /api/* routes
// are exempt too — webhooks, health checks, and NextAuth callbacks shouldn't
// go down just because the front-end is in maintenance mode.
const EXEMPT_PATHS = ["/auth", "/maintenance"]

export default auth(async (req) => {
  const { pathname } = req.nextUrl

  if (pathname.startsWith("/api/") || EXEMPT_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next()
  }

  // Only the admin role bypasses maintenance mode — they're the one who can
  // turn it back off from Admin Settings.
  if (req.auth?.user?.role === "admin") return NextResponse.next()

  if (await isMaintenanceModeActive()) {
    const url = req.nextUrl.clone()
    url.pathname = "/maintenance"
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)).*)"],
  runtime: "nodejs",
}

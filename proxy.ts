import { NextResponse } from "next/server"
import type { NextRequest, NextFetchEvent } from "next/server"
import { isBusinessHost, tenantFromHost, websiteRoute } from "@/backend/domain/pos-website"
import { auth } from "@/backend/auth"
import { isMaintenanceModeActive } from "@/backend/actions/admin-settings"

// Paths that must keep working even while maintenance mode is on: the login
// page itself (so an admin can sign in to turn it back off), NextAuth's own
// routes, and the maintenance page (avoid redirect loops). All /api/* routes
// are exempt too — webhooks, health checks, and NextAuth callbacks shouldn't
// go down just because the front-end is in maintenance mode.
const EXEMPT_PATHS = ["/auth", "/maintenance"]

const platformProxy = auth(async (req) => {
  const { pathname } = req.nextUrl

  if (pathname === "/sitemap.xml" || pathname === "/robots.txt") return NextResponse.next()

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

export default function proxy(req: NextRequest, event: NextFetchEvent) {
  const host = req.headers.get("host") ?? ""
  if (isBusinessHost(host)) {
    const tenant = tenantFromHost(host)
    const path = websiteRoute(req.nextUrl.pathname)
    // Tenant origins serve public website pages only. No account APIs, server
    // actions or POS portals are reachable, even with forged cookies/headers.
    if (!tenant || path === null || !["GET", "HEAD"].includes(req.method)) return new NextResponse("Page not found", { status: 404 })
    const target = req.nextUrl.clone()
    target.pathname = `/business/${tenant}${path}`
    target.search = "" // Public hosts can never request owner draft previews.
    return NextResponse.rewrite(target)
  }
  return platformProxy(req, event)
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)).*)"],
}

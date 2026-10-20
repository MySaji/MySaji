import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/backend/auth"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const shop = request.nextUrl.searchParams.get("shop")
  const slug = shop && /^[a-z0-9-]{1,40}$/.test(shop) ? shop : null
  const session = await auth()
  const destination = request.nextUrl.searchParams.get("install") === "1" && session?.user?.id
    ? "/pos/get"
    : session?.user?.id ? "/pos/home" : slug && request.nextUrl.searchParams.get("signin") !== "1" ? `/pos/welcome/${slug}` : "/pos/login"
  const response = NextResponse.redirect(new URL(destination, request.url))
  response.headers.set("Cache-Control", "private, no-store")
  if (slug) response.cookies.set("saji-till-shop", slug, { httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", path: "/", maxAge: 31_536_000 })
  return response
}

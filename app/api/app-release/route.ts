import { getAppRelease } from "@/backend/services/app-release"

export const dynamic = "force-dynamic"

export async function GET() {
  const release = await getAppRelease()
  return Response.json({ release }, { headers: {
    "Cache-Control": "no-store, max-age=0",
    "CDN-Cache-Control": "no-store",
    "X-Robots-Tag": "noindex",
  } })
}

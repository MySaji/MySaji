import type { Metadata } from "next"
import { getPosWebsiteEditor } from "@/backend/actions/pos-website"
import { BusinessWebsiteEditor } from "@/frontend/components/business-website/editor"

export const metadata: Metadata = { title: "Business website | Saji Till", robots: { index: false, follow: false } }
export const dynamic = "force-dynamic"
export default async function WebsiteEditorPage() {
  const result = await getPosWebsiteEditor()
  if (!result.success) return <div role="alert" className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-semibold">Business website</h1><p className="mt-4 leading-7">{result.error}</p><a href="/pos/home" className="mt-6 inline-block underline">Return to Till home</a></div>
  return <BusinessWebsiteEditor initial={result.data} />
}

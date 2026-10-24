import { getBusinessPulse } from "@/backend/actions/pos-pulse"
import { PulseWorkspace } from "@/frontend/components/pos/pulse-workspace"
export const metadata = { title: "Business pulse | Saji Till", robots: { index: false, follow: false } }
export const dynamic = "force-dynamic"
export default async function PulsePage() {
  try {
    const result = await getBusinessPulse()
    if (!result.success) return <div role="alert" className="p-8">{result.error}</div>
    return <PulseWorkspace initial={result.data} />
  } catch {
    return <div role="alert" className="p-8">Business pulse could not load. Check your connection and refresh this page.</div>
  }
}

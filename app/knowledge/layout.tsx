import type { ReactNode } from "react"
import { PublicHeader } from "@/frontend/components/public-header"
import { Footer } from "@/frontend/components/footer"

export default function KnowledgeLayout({ children }: { children: ReactNode }) {
  return <div className="bg-white text-slate-900"><PublicHeader />{children}<Footer /></div>
}

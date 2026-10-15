import { PublicNavigation } from "@/frontend/components/public-navigation"
import { Footer } from "@/frontend/components/footer"

export default function KnowledgeLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-50 text-slate-900"><PublicNavigation />{children}<Footer /></div>
}

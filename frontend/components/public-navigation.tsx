import Link from "next/link"
import { BrandLogo } from "@/frontend/components/brand-logo"

export function PublicNavigation() {
  return <header className="border-b border-slate-200 bg-white text-slate-900"><nav aria-label="Main navigation" className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8"><Link href="/" className="flex items-center gap-2 font-bold tracking-tight"><BrandLogo size="small" /><span>SAJI<span className="ml-2 text-xs font-normal tracking-normal text-slate-500">Made for everyday business</span></span></Link><div className="flex flex-wrap items-center gap-5 text-sm font-medium"><Link href="/knowledge" className="hover:text-blue-600">Knowledge base</Link><Link href="/knowledge/pos-guide" className="hover:text-blue-600">Saji Till</Link><Link href="/knowledge/support" className="hover:text-blue-600">Help</Link><Link href="/auth/login" className="hover:text-blue-600">Sign in</Link><Link href="/auth/signup" className="rounded-full bg-blue-600 px-5 py-2.5 text-white hover:bg-blue-700">Get started</Link></div></nav></header>
}

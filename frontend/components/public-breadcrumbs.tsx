import Link from "next/link"
import { breadcrumbStructuredData, serializeJsonLd } from "@/frontend/lib/seo"

export function PublicBreadcrumbs({ items }: { items: { label: string; href: string }[] }) {
  return <>
    <nav aria-label="Breadcrumb" className="mb-7 text-sm leading-6 text-slate-600"><ol className="flex flex-wrap items-center gap-x-2 gap-y-1">{items.map((item, index) => <li key={item.href} className="flex items-center gap-2">{index > 0 && <span aria-hidden="true">/</span>}{index === items.length - 1 ? <span aria-current="page">{item.label}</span> : <Link href={item.href} className="text-blue-800 underline-offset-4 hover:underline">{item.label}</Link>}</li>)}</ol></nav>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbStructuredData(items)) }} />
  </>
}

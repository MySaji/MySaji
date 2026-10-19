import Link from "next/link"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { publicTillBrand } from "@/backend/services/pos-install-brand"
import { BusinessInstallButton } from "@/frontend/components/pos/business-install-button"

type Props = { params: Promise<{ slug: string }> }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const brand = await publicTillBrand((await params).slug)
  if (!brand) return { title: "Till not found", robots: { index: false, follow: false } }
  return { title: `${brand.name} · Saji Till`, manifest: `/pos/brand/${brand.slug}/manifest.webmanifest`, robots: { index: false, follow: false },
    appleWebApp: { capable: true, title: brand.name }, icons: { apple: brand.logo ? `/pos/brand/${brand.slug}/icon/512?v=${brand.revision}` : "/pos/icon-512.png" } }
}
export default async function BusinessTillWelcome({ params }: Props) {
  const brand = await publicTillBrand((await params).slug)
  if (!brand) notFound()
  return <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-5 py-12"><section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-sm sm:p-10">
    <img src={brand.logo ? `/pos/brand/${brand.slug}/icon/192?v=${brand.revision}` : "/pos/icon-192.png"} width={96} height={96} alt={`${brand.name} logo`} className="mx-auto rounded-2xl border border-slate-100" />
    <p className="mt-6 text-xs font-semibold uppercase tracking-widest text-blue-700">Powered by Saji Till</p><h1 className="mt-3 text-2xl font-semibold text-slate-900">{brand.name}</h1><p className="mt-3 text-sm leading-6 text-slate-600">Your shop’s counter workspace. Owners and employees sign in with their own accounts and the access assigned to them.</p>
    <a href={`/pos/open?shop=${brand.slug}&signin=1`} className="mt-7 flex min-h-12 items-center justify-center rounded-xl bg-blue-700 px-5 text-sm font-semibold text-white">Open or sign in to Till</a>
    <BusinessInstallButton />
    <p className="mt-6 text-xs leading-6 text-slate-500">Installing this app adds this shop’s name and saved logo to a supported device. Installation does not grant access to the business.</p><Link href="/pos" className="mt-5 inline-block text-xs font-semibold text-blue-700">About Saji Till</Link>
  </section></main>
}

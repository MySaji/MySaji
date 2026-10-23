import type { Metadata } from "next"
export const metadata: Metadata = { title: "Salon management | Saji Till", robots: { index: false, follow: false } }
export default function SalonLayout({ children }: { children: React.ReactNode }) { return children }

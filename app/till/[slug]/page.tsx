import { redirect } from "next/navigation"

// Keep existing printed addresses and QR codes inside the standalone Till flow.
export default async function LegacyTillAddress({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  redirect(`/pos/welcome/${encodeURIComponent(slug)}`)
}

"use client"

import { useEffect, useState } from "react"
import { getPublicSiteSettings } from "@/lib/actions/admin-settings"
import { LogoMark } from "@/components/logo"

const SIZE_MAP = {
  small: { box: "w-8 h-8", text: "text-sm" },
  default: { box: "w-9 h-9", text: "text-base" },
  large: { box: "w-10 h-10", text: "text-lg" },
  xlarge: { box: "w-14 h-14", text: "text-2xl" },
} as const

const MARK_SIZE: Record<keyof typeof SIZE_MAP, number> = { small: 32, default: 36, large: 40, xlarge: 56 }

/** Renders the admin-configured logo image when one is set, falling back to
 * the app's standard "S" mark otherwise — used everywhere the brand mark
 * appears so an admin-uploaded logo shows up consistently. `variant`
 * controls the fallback mark's styling for the two real backgrounds it sits
 * on: a plain card/nav background ("solid") or a colored/gradient panel
 * ("translucent", e.g. the auth pages' hero side). `shape` matches whichever
 * container shape the surrounding design already used. */
export function BrandLogo({
  size = "default",
  variant = "solid",
  shape = "square",
}: {
  size?: keyof typeof SIZE_MAP
  variant?: "solid" | "translucent"
  shape?: "square" | "circle"
}) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getPublicSiteSettings().then((s) => {
      if (!cancelled) setLogoUrl(s.logoUrl)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const { box } = SIZE_MAP[size]
  const roundedClass = shape === "circle" ? "rounded-full" : "rounded-lg"

  if (logoUrl) {
    return <img src={logoUrl} alt="SAJI" className={`${box} ${roundedClass} object-cover flex-shrink-0`} />
  }

  // Real SAJI logo image (same one used for the browser/app icon) — it
  // already bakes in its own white card, so it's just clipped to the
  // container shape here, the same treatment as the logoUrl branch above.
  return (
    <div className={`${box} ${roundedClass} overflow-hidden flex-shrink-0`}>
      <LogoMark size={MARK_SIZE[size]} className="w-full h-full object-cover" />
    </div>
  )
}

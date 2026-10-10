import { LogoMark } from "@/frontend/components/logo"

/**
 * The "PRO" pill that sits beside the wordmark throughout the Saji Pro portal.
 *
 * This is the portal's identity, not a subscription indicator — every provider
 * and merchant working inside Saji Pro sees it, paid or not. That is a
 * deliberate product decision: the paid tier (ProviderSubscription) is still a
 * real thing and still gates its own features, but it is advertised on the
 * Saji Pro page rather than by withholding the badge, so the portal reads as
 * one place with one name rather than two visual tiers of the same screen.
 */
export function SajiProBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-md bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide text-white ${className}`}
    >
      Pro
    </span>
  )
}

/**
 * Wordmark + badge, as the two appear together in the Saji Pro header and
 * sidebar. Kept as one component so the spacing between them cannot drift
 * between the places it is used.
 */
export function SajiProLogo({
  size = "sm",
  showText = true,
}: {
  size?: "sm" | "md" | "lg" | "xl"
  showText?: boolean
}) {
  const iconPx = { sm: 24, md: 32, lg: 40, xl: 56 }[size]
  const textSize = { sm: "text-lg", md: "text-xl", lg: "text-2xl", xl: "text-3xl" }[size]

  return (
    <span className="flex flex-shrink-0 items-center gap-1.5">
      <LogoMark size={iconPx} />
      {showText && (
        <>
          {/* The wordmark steps aside below 640px. The header there also
              carries a menu button, the location control and three actions,
              and something has to give for the location to have any room at
              320px — the mark and the PRO pill still say whose portal this
              is, which the wordmark was only repeating. */}
          <span
            className={`hidden bg-gradient-to-r from-blue-500 via-blue-800 to-orange-500 bg-clip-text font-bold text-transparent sm:inline ${textSize}`}
          >
            SAJI
          </span>
          <SajiProBadge />
        </>
      )}
    </span>
  )
}

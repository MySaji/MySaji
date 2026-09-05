import { Logo } from "@/components/logo"

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
  return (
    <span className="flex items-center gap-1.5">
      <Logo size={size} showText={showText} />
      {/* Hidden alongside a collapsed, icon-only sidebar, where there is no
          wordmark for it to qualify. */}
      {showText && <SajiProBadge />}
    </span>
  )
}

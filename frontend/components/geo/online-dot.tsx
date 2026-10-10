/**
 * The SAJI live presence indicator.
 *
 * One component so the green dot means exactly one thing wherever it
 * appears: the server says this provider's device is currently checking in
 * (see lib/provider-presence.ts). It is never driven by local UI state — a
 * dot that can be green without the backend agreeing is decoration, and
 * customers would quickly learn to distrust it.
 *
 * The pulse animates a halo ring behind a solid dot rather than the dot
 * itself, so the indicator never changes size and cannot nudge the text
 * beside it as it beats. Suppressed for anyone who has asked their system
 * for reduced motion.
 */
export function OnlineDot({ online, className }: { online: boolean; className?: string }) {
  return (
    <span className={`relative inline-flex h-2 w-2 flex-shrink-0 ${className ?? ""}`} aria-hidden="true">
      {online && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75 motion-reduce:hidden" />
      )}
      <span
        className={`relative inline-flex h-2 w-2 rounded-full ${
          online ? "bg-emerald-500" : "border border-muted-foreground/50 bg-transparent"
        }`}
      />
    </span>
  )
}

/**
 * Dot plus label. `labels` stays with the caller because "Online" suits a
 * person and "Open" suits a shop, while the indicator itself is identical.
 */
export function PresenceBadge({
  online, labels, className,
}: {
  online: boolean
  labels: { on: string; off: string }
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-medium ${
        online ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
      } ${className ?? ""}`}
    >
      <OnlineDot online={online} />
      {online ? labels.on : labels.off}
    </span>
  )
}

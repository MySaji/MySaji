/**
 * The SAJI live presence indicator.
 *
 * One component so the green dot means exactly one thing everywhere it
 * appears: the server says this provider's device is currently checking in
 * (see lib/provider-presence.ts). It is never driven by local UI state —
 * a dot that can be green without the backend agreeing is decoration, and
 * customers would learn to distrust it.
 *
 * The pulse is a halo ring behind a solid dot rather than the dot itself
 * animating, so the indicator never changes size and cannot nudge
 * neighbouring text around as it animates. It is suppressed for anyone who
 * has asked for reduced motion.
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
 * Dot plus label. `labels` keeps the wording with the caller, because
 * "Online/Offline" suits a person and "Open/Closed" suits a shop while the
 * indicator itself is identical.
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

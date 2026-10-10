"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { MapPin, ChevronDown, Check, Plus } from "lucide-react"
import { getAddresses, setDefaultAddress, type AddressItem } from "@/backend/actions/addresses"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"

/**
 * The header's location control — the "Westlands, Nairobi" in the design.
 *
 * Reads the account's saved addresses and shows the default one; picking
 * another makes it the default, which is a real preference the rest of the
 * app already respects (checkout and delivery both start from the default
 * address) rather than a display-only setting invented for this control.
 *
 * Deliberately built on the existing getAddresses/setDefaultAddress actions
 * rather than new ones: a newly added server action does not resolve for
 * client callers in this environment, so reusing actions that already work is
 * the difference between this rendering and it sitting empty forever.
 *
 * It does not yet scope search or listings to the chosen location — that is a
 * larger change across discovery, and this control does not pretend to it.
 */
export function LocationSelector({ manageHref }: { manageHref: string }) {
  const { t } = useLocalization()
  const [addresses, setAddresses] = useState<AddressItem[]>([])
  const [open, setOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    getAddresses()
      .then((rows) => {
        if (!cancelled) setAddresses(rows)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [])

  const current = addresses.find((a) => a.isDefault) ?? addresses[0] ?? null
  const label = current ? [current.address, current.city].filter(Boolean).join(", ") : t("location.setLocation")
  // At 320px the header already carries a menu button, the wordmark and three
  // actions; the full "Westlands, Nairobi" has nowhere to go and squeezes
  // down to nothing. The town alone still tells the user where they are.
  const shortLabel = current ? current.city || current.address : t("location.setLocation")

  const choose = async (id: string) => {
    setIsSaving(true)
    // Optimistic: the menu closes straight away and the header updates, then
    // the list is re-read so a failed write corrects itself rather than
    // leaving the header claiming a location that was never saved.
    setAddresses((prev) => prev.map((a) => ({ ...a, isDefault: a.id === id })))
    setOpen(false)
    await setDefaultAddress({ id }).catch(() => {})
    await getAddresses()
      .then(setAddresses)
      .catch(() => {})
    setIsSaving(false)
  }

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isSaving}
        aria-label={t("location.changeLocation")}
        aria-expanded={open}
        className="flex w-full min-w-0 items-center gap-1 rounded-lg px-1.5 py-1 text-xs text-foreground transition-colors hover:bg-muted disabled:opacity-60"
      >
        <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        {/* The label is the flexible part: it takes whatever width the
            header has left and truncates into it. A fixed cap here was the
            bug — below about 360px the button's own content was wider than
            the space it had, so it ran under the icons beside it instead of
            shrinking. min-w-0 is what lets a flex child shrink past its
            content at all. */}
        <span className="min-w-0 flex-1 truncate text-left sm:hidden">{shortLabel}</span>
        <span className="hidden min-w-0 flex-1 truncate text-left sm:block">{label}</span>
        <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-card py-1.5 shadow-xl">
          {addresses.length === 0 && (
            <p className="px-3 py-2 text-[11px] text-muted-foreground">{t("location.noSavedAddresses")}</p>
          )}
          {addresses.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => choose(a.id)}
              className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-muted"
            >
              <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-semibold text-foreground">{a.label}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {[a.address, a.city].filter(Boolean).join(", ")}
                </span>
              </span>
              {a.isDefault && <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />}
            </button>
          ))}
          <Link
            href={manageHref}
            onClick={() => setOpen(false)}
            className="mt-1 flex items-center gap-2 border-t border-border px-3 py-2 text-[11px] font-semibold text-primary transition-colors hover:bg-muted"
          >
            <Plus className="h-3.5 w-3.5 flex-shrink-0" />
            {t("location.manageAddresses")}
          </Link>
        </div>
      )}
    </div>
  )
}

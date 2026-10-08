"use client"

import { useCallback, useState } from "react"
import { LocateFixed, Loader2, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import { RADIUS_OPTIONS_KM, type Coordinates } from "@/lib/geo"
import { useLocalization } from "@/lib/hooks/useLocalization"

export type RadiusSelection = {
  /** Null means "any distance" — the caller must fall back to its normal
   *  unfiltered ordering rather than returning nothing. */
  radiusKm: number | null
  /** The browser's own position, once the customer has shared it. Null means
   *  the server should measure from their saved default address instead. */
  origin: Coordinates | null
}

/**
 * The "near me" control shared by the shops and find-specialists listings.
 *
 * Two things make this more than a dropdown. First, it owns the
 * navigator.geolocation prompt, because a device position is both more
 * accurate than a saved address and the only origin a customer without a
 * saved address has — the previous find-specialists page asked for GPS and
 * then discarded the coordinates, labelling itself "Near you" while filtering
 * nothing. Second, it reports origin and radius together, so a caller never
 * has to guess which of the two changed.
 *
 * `hasSavedOrigin` tells the control whether the server could measure from a
 * saved address if the customer declines the GPS prompt. When neither exists,
 * the radius chips stay disabled and say so, rather than silently returning
 * an empty list.
 */
export function RadiusFilter({
  value,
  onChange,
  hasSavedOrigin,
  className,
}: {
  value: RadiusSelection
  onChange: (next: RadiusSelection) => void
  hasSavedOrigin: boolean
  className?: string
}) {
  const { t } = useLocalization()
  const [isLocating, setIsLocating] = useState(false)
  const [geoError, setGeoError] = useState("")

  const canFilter = hasSavedOrigin || value.origin != null

  const requestDeviceLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoError(t("nearby.geoUnsupported"))
      return
    }
    setIsLocating(true)
    setGeoError("")
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false)
        // Turning on a radius at the same time as the position arrives: the
        // customer tapped this to search nearby, so landing them back on
        // "any distance" would waste the permission they just granted.
        onChange({
          origin: { latitude: position.coords.latitude, longitude: position.coords.longitude },
          radiusKm: value.radiusKm,
        })
      },
      () => {
        setIsLocating(false)
        setGeoError(t("nearby.geoDenied"))
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
    )
  }, [onChange, t, value.radiusKm])

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <MapPin className="w-3.5 h-3.5 text-primary" />
          {t("nearby.title")}
        </span>

        <div className="flex flex-wrap items-center gap-1.5">
          <RadiusChip
            label={t("nearby.off")}
            active={value.radiusKm == null}
            disabled={false}
            onClick={() => onChange({ ...value, radiusKm: null })}
          />
          {RADIUS_OPTIONS_KM.map((km) => (
            <RadiusChip
              key={km}
              label={`${km} km`}
              active={value.radiusKm === km}
              disabled={!canFilter}
              onClick={() => onChange({ ...value, radiusKm: km })}
            />
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={requestDeviceLocation}
          disabled={isLocating}
          className="gap-1.5 bg-transparent h-8 text-xs"
        >
          {isLocating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LocateFixed className="w-3.5 h-3.5" />}
          {isLocating ? t("nearby.locating") : t("nearby.useMyLocation")}
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground mt-1.5">
        {geoError
          ? geoError
          : value.origin
            ? t("nearby.locatedPrecise")
            : hasSavedOrigin
              ? t("nearby.locatedSaved")
              : t("nearby.noOrigin")}
      </p>
    </div>
  )
}

function RadiusChip({
  label, active, disabled, onClick,
}: {
  label: string
  active: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-transparent text-muted-foreground border-border hover:border-primary/50"
      } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
    >
      {label}
    </button>
  )
}

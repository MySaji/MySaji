"use client"

import { useRef } from "react"
import { useJsApiLoader, Autocomplete } from "@react-google-maps/api"
import { Input } from "@/components/ui/input"
import { GOOGLE_MAPS_LIBRARIES, GOOGLE_MAPS_LOADER_ID, isGoogleMapsConfigured } from "@/lib/google-maps"

export type PlaceResult = { address: string; city: string | null; latitude: number; longitude: number }

/** Google Places Autocomplete wrapping the app's normal <Input> — falls back
 * to a plain text input with no autocomplete when no Maps key is configured,
 * exactly like this project's other optional integrations degrade. Scoped
 * to Kenya since SAJI is a Kenya-focused marketplace. */
export function AddressAutocompleteInput({
  value, onChange, onPlaceSelected, placeholder, className, disabled,
}: {
  value: string
  onChange: (value: string) => void
  onPlaceSelected?: (place: PlaceResult) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}) {
  const configured = isGoogleMapsConfigured()
  const { isLoaded } = useJsApiLoader({
    id: GOOGLE_MAPS_LOADER_ID,
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
    libraries: GOOGLE_MAPS_LIBRARIES,
  })
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null)

  const handlePlaceChanged = () => {
    const place = autocompleteRef.current?.getPlace()
    if (!place?.geometry?.location) return
    const formatted = place.formatted_address ?? value
    const cityComponent = place.address_components?.find((c) => c.types.includes("locality"))
    onChange(formatted)
    onPlaceSelected?.({
      address: formatted,
      city: cityComponent?.long_name ?? null,
      latitude: place.geometry.location.lat(),
      longitude: place.geometry.location.lng(),
    })
  }

  if (!configured || !isLoaded) {
    return (
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={className}
        disabled={disabled}
      />
    )
  }

  return (
    <Autocomplete
      onLoad={(ac) => { autocompleteRef.current = ac }}
      onPlaceChanged={handlePlaceChanged}
      options={{ componentRestrictions: { country: "ke" } }}
    >
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={className}
        disabled={disabled}
      />
    </Autocomplete>
  )
}

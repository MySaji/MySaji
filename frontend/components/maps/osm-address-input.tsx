"use client"

import { useEffect, useRef, useState } from "react"
import { Input } from "@/frontend/components/ui/input"
import { OsmMap, type OsmHandle, type OsmPoint } from "./osm-map"
import { useMapSettings, reverseMapLocation, type MapPlace } from "@/frontend/lib/maps-provider"
import { validCoordinates } from "@/backend/domain/map-provider"

export function OsmAddressInput({ value, onChange, onPlaceSelected, placeholder, className, disabled, ariaLabel }: {
  value: string; onChange: (value: string) => void; onPlaceSelected?: (place: MapPlace) => void
  placeholder?: string; className?: string; disabled?: boolean; ariaLabel?: string
}) {
  const { data: config } = useMapSettings()
  const [results, setResults] = useState<MapPlace[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [pin, setPin] = useState<OsmPoint | null>(null)
  const [latitude, setLatitude] = useState("")
  const [longitude, setLongitude] = useState("")
  const request = useRef(0)
  const handle = useRef<OsmHandle | null>(null)
  useEffect(() => () => { request.current++ }, [])
  const choose = (place: MapPlace) => {
    request.current++;setBusy(false);setError("");setResults([])
    onChange(place.address);onPlaceSelected?.(place)
    setPin(place);setLatitude(String(place.latitude));setLongitude(String(place.longitude));handle.current?.focus(place,15)
  }
  const pick = async (point: OsmPoint) => {
    if (disabled) return
    choose({ ...point, address:`${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`, city:null })
    if (!config?.osmSearchConfigured) return
    const id = ++request.current
    try { const place = await reverseMapLocation("OPENSTREETMAP",point.latitude,point.longitude); if (id===request.current && place) choose(place) } catch { /* Keep selected coordinates and allow manual address entry. */ }
  }
  const search = async () => {
    if (disabled || !config?.osmSearchConfigured || value.trim().length<3) return
    const id=++request.current;setBusy(true);setError("")
    try {
      const response=await fetch(`/api/maps/geocode?q=${encodeURIComponent(value.trim())}`,{cache:"no-store"})
      const body=await response.json()
      if(id!==request.current)return
      if(!response.ok)throw new Error(body.error||"Address search failed.")
      setResults(body.places??[])
      if(!body.places?.length)setError("No matching places. Enter your address and select a map pin instead.")
    }catch(error){if(id===request.current)setError(error instanceof Error?error.message:"Address search failed.")}
    finally{if(id===request.current)setBusy(false)}
  }
  const locate = () => {
    if(!navigator.geolocation){setError("Location detection is unavailable on this device.");return}
    const id=++request.current;setBusy(true);setError("")
    navigator.geolocation.getCurrentPosition(position=>{if(id!==request.current)return;void pick(position.coords);setBusy(false)},()=>{if(id===request.current){setBusy(false);setError("Location could not be detected. Select a pin or enter coordinates.")}},{enableHighAccuracy:true,timeout:10000})
  }
  const action="min-h-10 rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-50"
  return <div className="min-w-0 space-y-2">
    <Input aria-label={ariaLabel} value={value} onChange={event=>{request.current++;setBusy(false);setResults([]);setError("");onChange(event.target.value)}} onKeyDown={event=>{if(event.key==="Enter"&&config?.osmSearchConfigured){event.preventDefault();void search()}}} placeholder={placeholder} className={className} disabled={disabled}/>
    <div className="flex flex-wrap gap-2">{config?.osmSearchConfigured&&<button type="button" className={action} disabled={disabled||busy||value.trim().length<3} onClick={()=>void search()}>{busy?"Searching...":"Search places"}</button>}<button type="button" className={action} disabled={disabled} aria-expanded={open} onClick={()=>setOpen(!open)}>{open?"Hide location picker":"Choose map pin / coordinates"}</button></div>
    {results.length>0&&<ul aria-label="Address search results" className="max-h-56 space-y-1 overflow-auto rounded-lg border p-2">{results.map((place,index)=><li key={index}><button type="button" disabled={disabled} className="w-full rounded p-2 text-left text-sm hover:bg-muted" onClick={()=>choose(place)}>{place.address}</button></li>)}</ul>}
    {open&&<div className="space-y-3 rounded-xl border p-3"><p className="text-xs leading-5 text-muted-foreground">Tap the map to choose your position. Confirm the building, street and landmark in the address field before saving.</p><button type="button" className={action} disabled={disabled||busy} onClick={locate}>Use device location</button><OsmMap className="h-64 w-full rounded-lg" handleRef={handle} center={{latitude:-1.2864,longitude:36.8172}} zoom={12} pins={pin?[{...pin,id:"selected",label:"Selected location",color:"#10b981"}]:[]} onPick={disabled?undefined:point=>void pick(point)}/><div className="grid grid-cols-2 gap-2"><label className="text-xs">Latitude<Input type="number" step="any" min={-90} max={90} value={latitude} disabled={disabled} onChange={event=>setLatitude(event.target.value)}/></label><label className="text-xs">Longitude<Input type="number" step="any" min={-180} max={180} value={longitude} disabled={disabled} onChange={event=>setLongitude(event.target.value)}/></label></div><button type="button" className={action} disabled={disabled||!latitude.trim()||!longitude.trim()||!validCoordinates(Number(latitude),Number(longitude))} onClick={()=>void pick({latitude:Number(latitude),longitude:Number(longitude)})}>Use coordinates</button></div>}
    {!config?.osmSearchConfigured&&<p className="text-xs leading-5 text-muted-foreground">Enter your address manually. Use the map pin or device location for accurate coordinates.</p>}
    {error&&<p role="status" className="text-xs text-destructive">{error}</p>}
  </div>
}

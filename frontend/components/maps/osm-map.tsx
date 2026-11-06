"use client"

import { useEffect, useRef, useState, type RefObject } from "react"
import type * as Leaflet from "leaflet"
import "leaflet/dist/leaflet.css"
import { validCoordinates } from "@/backend/domain/map-provider"
import { useMapSettings } from "@/frontend/lib/maps-provider"

export type OsmPoint = { latitude: number; longitude: number }
export type OsmPin = OsmPoint & { id: string; label: string; color?: string; href?: string; count?: number }
export type OsmHandle = { fit: (points: OsmPoint[]) => void; focus: (point: OsmPoint, zoom?: number) => void }
export type OsmMapProps = {
  pins: OsmPin[]; className?: string; center?: OsmPoint; zoom?: number; staticPreview?: boolean
  circles?: (OsmPoint & { radius: number; color?: string })[]
  line?: OsmPoint[]; onSelect?: (id: string) => void; onPick?: (point: OsmPoint) => void
  onViewport?: (value: { north: number; south: number; east: number; west: number; zoom: number }) => void
  handleRef?: RefObject<OsmHandle | null>; tileUrl?: string; attribution?: string
}
const KENYA = { latitude: -0.0236, longitude: 37.9062 }
export function OsmMap(props: OsmMapProps) {
  const { data } = useMapSettings()
  const tileUrl = props.tileUrl ?? data?.osmTileUrl
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Leaflet.Map | null>(null)
  const latest = useRef(props)
  latest.current = props
  const [runtime, setRuntime] = useState<typeof Leaflet | null>(null)
  const [error, setError] = useState("")
  const fitted = useRef(false)
  const centerLat = props.center?.latitude, centerLng = props.center?.longitude
  const color = (value?: string) => value && /^#[0-9a-f]{3,8}$/i.test(value) ? value : "#0647b5"
  useEffect(() => {
    if (!container.current || !tileUrl) return
    let cancelled = false
    let observer: ResizeObserver | undefined
    import("leaflet").then(L => {
      if (cancelled || !container.current) return
      const initial = latest.current, centre = initial.center ?? KENYA
      const map = L.map(container.current, { zoomControl: false, dragging: !initial.staticPreview, scrollWheelZoom: false, touchZoom: !initial.staticPreview, doubleClickZoom: !initial.staticPreview, keyboard: !initial.staticPreview, minZoom: 2, maxZoom: 19, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false }).setView([centre.latitude, centre.longitude], initial.zoom ?? 6)
      if (!initial.staticPreview) L.control.zoom({ position:"bottomleft" }).addTo(map)
      mapRef.current = map
      const layer = L.tileLayer(tileUrl, { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>' }).addTo(map)
      let tileErrors = 0
      layer.on("tileerror", () => { if (++tileErrors >= 3 && !cancelled) setError("Map tiles could not load. Your location details are still available.") })
      layer.on("tileload", () => { tileErrors = 0; if (!cancelled) setError("") })
      const handle: OsmHandle = {
        fit: points => { const valid = points.filter(p => validCoordinates(p.latitude,p.longitude)); if (valid.length) map.fitBounds(L.latLngBounds(valid.map(p => [p.latitude,p.longitude])), { padding: [40,40], animate: false, maxZoom: valid.length === 1 ? 15 : 16 }) },
        focus: (point, zoom) => { if (validCoordinates(point.latitude,point.longitude)) map.setView([point.latitude,point.longitude], zoom ?? map.getZoom(), { animate:false }) },
      }
      if (initial.handleRef) initial.handleRef.current = handle
      fitted.current = false
      const viewport = () => { const bounds = map.getBounds(); latest.current.onViewport?.({ north:bounds.getNorth(),south:bounds.getSouth(),east:bounds.getEast(),west:bounds.getWest(),zoom:map.getZoom() }) }
      map.on("moveend zoomend", viewport)
      map.on("click", (event: Leaflet.LeafletMouseEvent) => latest.current.onPick?.({latitude:event.latlng.lat,longitude:event.latlng.lng}))
      observer = new ResizeObserver(() => { if (!cancelled && mapRef.current === map) map.invalidateSize({ animate: false }) })
      observer.observe(container.current)
      setRuntime(L)
      viewport()
    }).catch(() => { if (!cancelled) setError("The map could not load. Please retry.") })
    return () => { cancelled = true; observer?.disconnect(); mapRef.current?.stop(); mapRef.current?.remove(); mapRef.current = null; if (latest.current.handleRef) latest.current.handleRef.current = null }
  }, [tileUrl])
  useEffect(() => {
    const map = mapRef.current, L = runtime
    if (!map || !L) return
    const group = L.layerGroup().addTo(map)
    for (const pin of props.pins.filter(p => validCoordinates(p.latitude,p.longitude))) {
      const marker = L.circleMarker([pin.latitude,pin.longitude], { radius: pin.count ? 18 : 9, color: "#fff", weight: 2, fillColor: color(pin.color), fillOpacity: .95, bubblingMouseEvents: false }).addTo(group)
      const label = document.createElement("span"); label.textContent = pin.count ? `${pin.count} locations` : pin.label
      marker.bindTooltip(label)
      const element = marker.getElement(); if (element && !props.staticPreview) { element.setAttribute("tabindex","0"); element.setAttribute("role","button"); element.setAttribute("aria-label",pin.label); element.addEventListener("keydown",event=>{const key=(event as KeyboardEvent).key;if(key==="Enter"||key===" "){event.preventDefault();marker.fire("click")}}) }
      if (pin.count) { const count = document.createElement("strong"); count.textContent = String(pin.count); marker.bindTooltip(count, { permanent:true,direction:"center",className:"saji-osm-count" }) }
      if (props.onSelect) marker.on("click", () => latest.current.onSelect?.(pin.id))
      else {
        const content = document.createElement("div"); content.textContent = pin.label
        if (pin.href?.startsWith("/") && !pin.href.startsWith("//")) { const link = document.createElement("a"); link.href = pin.href; link.textContent = " View details"; content.appendChild(link) }
        marker.bindPopup(content)
      }
    }
    for (const circle of props.circles ?? []) if (validCoordinates(circle.latitude,circle.longitude)) L.circle([circle.latitude,circle.longitude], { radius:circle.radius,color:color(circle.color),weight:1,fillOpacity:.08,interactive:false }).addTo(group)
    const line = (props.line ?? []).filter(p => validCoordinates(p.latitude,p.longitude))
    if (line.length > 1) L.polyline(line.map(p=>[p.latitude,p.longitude]),{color:"#0647b5",weight:3}).addTo(group)
    if (!fitted.current && !props.staticPreview && props.pins.length) { const valid=props.pins.filter(p=>validCoordinates(p.latitude,p.longitude)); if(valid.length){map.fitBounds(L.latLngBounds(valid.map(p=>[p.latitude,p.longitude])),{padding:[40,40],animate:false,maxZoom:valid.length===1?15:16});fitted.current=true} }
    return () => { if (mapRef.current === map) group.remove() }
  }, [runtime, props.pins, props.circles, props.line, props.onSelect, props.staticPreview])
  useEffect(() => {
    if (props.staticPreview && centerLat !== undefined && centerLng !== undefined && validCoordinates(centerLat,centerLng)) mapRef.current?.setView([centerLat,centerLng],props.zoom??15)
  }, [runtime,props.staticPreview,centerLat,centerLng,props.zoom])
  return <div className={`relative isolate z-0 min-h-40 ${props.className ?? "h-64 w-full"}`}><div ref={container} role="region" aria-label="OpenStreetMap" className="h-full min-h-[inherit] w-full rounded-[inherit]" />{(props.attribution || data?.osmAttribution) && <span className="absolute bottom-5 right-1 z-[1000] bg-white/95 px-1 text-[10px] text-black">{props.attribution || data?.osmAttribution}</span>}{error && <p role="status" className="absolute left-2 top-2 z-[1000] max-w-[85%] rounded bg-white p-2 text-xs text-red-800 shadow">{error}</p>}</div>
}

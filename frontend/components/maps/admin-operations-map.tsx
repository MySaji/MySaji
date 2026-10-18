"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import useSWRInfinite from "swr/infinite"
import { GoogleMap, OverlayViewF, CircleF, TrafficLayerF, useJsApiLoader } from "@react-google-maps/api"
import { MapPin, Search, RefreshCw, Maximize2, Minimize2, Layers, LocateFixed, Crosshair, X, Store, Wrench, Warehouse, ListFilter, Loader2, ArrowUpRight } from "lucide-react"
import { useAuthContext } from "@/frontend/lib/auth-context"
import { getAdminOperationsMap, type OperationsMapPage, type OperationsMapCursor } from "@/backend/actions/admin-operations-map"
import { clusterOperationsLocations, insideMapBounds, locationDistanceKm, type MapBounds, type OperationsLocation } from "@/backend/domain/admin-operations-map"
import { GOOGLE_MAPS_LIBRARIES, GOOGLE_MAPS_LOADER_ID, isGoogleMapsConfigured } from "@/backend/services/google-maps"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import { MAP_STYLE_LIGHT } from "@/frontend/components/geo/map-style"
import styles from "./admin-operations-map.module.css"

const TYPES = { pos: { label: "POS branches", color: "#ff7900", icon: Store }, shop: { label: "Marketplace shops", color: "#0647b5", icon: Store }, provider: { label: "Provider base areas", color: "#7c3aed", icon: Wrench }, distributor: { label: "Distributor locations", color: "#0f766e", icon: Warehouse } }
const KENYA = { lat: -0.0236, lng: 37.9062 }

export default function AdminOperationsMap() {
  const { user } = useAuthContext()
  const [query, setQuery] = useState("")
  const [kinds, setKinds] = useState<string[]>(Object.keys(TYPES))
  const [status, setStatus] = useState("all")
  const [locationFilter, setLocationFilter] = useState("all")
  const [verifiedOnly, setVerifiedOnly] = useState(false)
  const [refreshing, setRefreshing] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(6)
  const [mapType, setMapType] = useState("roadmap")
  const [traffic, setTraffic] = useState(false)
  const [density, setDensity] = useState(false)
  const [viewportOnly, setViewportOnly] = useState(false)
  const [bounds, setBounds] = useState<MapBounds | null>(null)
  const [radius, setRadius] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [groupIds, setGroupIds] = useState<string[] | null>(null)
  const [notice, setNotice] = useState("")
  const [listPage, setListPage] = useState(1)
  const mapRef = useRef<google.maps.Map | null>(null)
  const regionRef = useRef<HTMLElement>(null)
  const originalFocus = useRef<HTMLElement | null>(null)
  const configured = isGoogleMapsConfigured()
  const { isLoaded, loadError } = useJsApiLoader({ id: GOOGLE_MAPS_LOADER_ID, googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "", libraries: GOOGLE_MAPS_LIBRARIES })
  const [slowMap, setSlowMap] = useState(false)
  const [mapAuthError, setMapAuthError] = useState(false)
  const mapReady = configured && isLoaded && !loadError && !mapAuthError
  useEffect(() => {
    const browser = window as Window & { gm_authFailure?: () => void }
    const previous = browser.gm_authFailure
    const handler = () => { setMapAuthError(true); previous?.() }
    browser.gm_authFailure = handler
    return () => { if (browser.gm_authFailure === handler) browser.gm_authFailure = previous }
  }, [])
  useEffect(() => {
    if (!configured || isLoaded || loadError) return
    const timer = window.setTimeout(() => setSlowMap(true), 12_000)
    return () => window.clearTimeout(timer)
  }, [configured, isLoaded, loadError])
  const { data, error, isLoading, isValidating, size, setSize, mutate } = useSWRInfinite<OperationsMapPage>(
    (index, previous) => !user || user.role !== "admin" || (index > 0 && !previous?.next) ? null : ["admin-operations-map", user.id, index === 0 ? undefined : previous.next],
    async ([, , cursor]: [string, string, OperationsMapCursor | undefined]) => {
      const result = await getAdminOperationsMap(cursor)
      if (!result) throw new Error("Administrator access is required for the operations map.")
      return result
    }, { refreshInterval: refreshing ? 60_000 : 0, refreshWhenHidden: false, revalidateOnFocus: true, dedupingInterval: 10_000, persistSize: false },
  )
  const locations = useMemo(() => [...new Map((data ?? []).flatMap(page => page.locations).map(point => [point.id, point])).values()], [data])
  const selected = locations.find(point => point.id === selectedId) ?? null
  const hasCoordinates = (point: OperationsLocation) => point.latitude != null && point.longitude != null
  const mapped = locations.filter(hasCoordinates).length
  const total = data?.[0] ? data[0].totals.shops + data[0].totals.providers + data[0].totals.distributors : 0
  const hasMore = !!data?.at(-1)?.next
  const filtered = useMemo(() => locations.filter(point => {
    if (!kinds.includes(point.kind) || (status !== "all" && point.active !== (status === "active")) || (verifiedOnly && !point.verified)) return false
    if (locationFilter === "mapped" && !hasCoordinates(point) || locationFilter === "missing" && hasCoordinates(point)) return false
    if (query.trim() && !`${point.name} ${point.ownerName} ${point.area ?? ""} ${point.detail ?? ""} ${point.recordId}`.toLowerCase().includes(query.trim().toLowerCase())) return false
    if (viewportOnly && bounds && !insideMapBounds(point, bounds)) return false
    if (groupIds && !groupIds.includes(point.id)) return false
    if (radius > 0 && selected && hasCoordinates(selected)) {
      if (!hasCoordinates(point)) return false
      return locationDistanceKm(selected as { latitude: number; longitude: number }, point as { latitude: number; longitude: number }) <= radius
    }
    return true
  }), [locations, kinds, status, verifiedOnly, locationFilter, query, viewportOnly, bounds, groupIds, radius, selected])
  const pins = useMemo(() => filtered.filter(hasCoordinates), [filtered])
  const clusters = useMemo(() => clusterOperationsLocations(pins, zoom), [pins, zoom])
  const fit = useCallback((points: OperationsLocation[]) => {
    const map = mapRef.current
    const available = points.filter(point => point.latitude != null && point.longitude != null)
    if (!map || !available.length) return
    const box = new google.maps.LatLngBounds()
    available.forEach(point => box.extend({ lat: point.latitude!, lng: point.longitude! }))
    map.fitBounds(box, 60)
    if (available.length === 1) map.setZoom(13)
  }, [])
  const initialiseMap = useCallback((map: google.maps.Map) => { mapRef.current = map; fit(locations) }, [fit, locations])
  const readViewport = () => {
    const map = mapRef.current, box = map?.getBounds()
    if (map?.getZoom()) setZoom(map.getZoom()!)
    if (box) {
      const next = { north: box.getNorthEast().lat(), south: box.getSouthWest().lat(), east: box.getNorthEast().lng(), west: box.getSouthWest().lng() }
      setBounds(current => current && current.north === next.north && current.south === next.south && current.east === next.east && current.west === next.west ? current : next)
    }
  }
  const selectPoint = (point: OperationsLocation) => {
    setSelectedId(point.id); setNotice("")
    if (hasCoordinates(point) && mapRef.current) { mapRef.current.panTo({ lat: point.latitude!, lng: point.longitude! }); mapRef.current.setZoom(Math.max(13, mapRef.current.getZoom() ?? 6)) }
    else if (!hasCoordinates(point)) setNotice("This record has no mapped business location. Ask the owner to set it in their business profile.")
  }
  useEffect(() => { setListPage(1) }, [query, kinds, status, verifiedOnly, locationFilter, viewportOnly, groupIds, radius])
  useEffect(() => { setListPage(page => Math.min(page, Math.max(1, Math.ceil(filtered.length / 30)))) }, [filtered.length])
  const mapOptions = useMemo<google.maps.MapOptions>(() => ({mapTypeId:mapType,styles:mapType === "roadmap" ? MAP_STYLE_LIGHT : undefined,streetViewControl:false,fullscreenControl:true,mapTypeControl:false,gestureHandling:"cooperative",minZoom:2,maxZoom:19}), [mapType])
  useEffect(() => {
    if (!expanded) return
    originalFocus.current = document.activeElement as HTMLElement
    regionRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setExpanded(false) }
      if (event.key === "Tab") {
        const controls = [...(regionRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input,select,[tabindex="0"]') ?? [])].filter(node => node.getClientRects().length)
        const first = controls[0], last = controls.at(-1)
        if (event.shiftKey && (document.activeElement === first || document.activeElement === regionRef.current)) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener("keydown", key)
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", key); originalFocus.current?.focus() }
  }, [expanded])

  return <section ref={regionRef} tabIndex={-1} aria-labelledby="operations-map-title" role={expanded ? "dialog" : undefined} aria-modal={expanded || undefined} className={`${styles.shell} ${expanded ? styles.expanded : ""}`}>
    <header className={styles.heading}><div><p className={styles.eyebrow}><span className={refreshing ? styles.pulse : styles.paused} />Business location intelligence</p><h2 id="operations-map-title">MySaji operations map</h2><p>Explore POS branches, providers and distribution coverage. Business locations refresh every minute when enabled.</p></div><div className={styles.actions}><Button variant="outline" disabled={isValidating} onClick={() => void mutate()} aria-label="Refresh operations map"><RefreshCw size={16} className={isValidating ? "animate-spin" : ""} />Refresh</Button><Button variant="outline" onClick={() => setExpanded(value => !value)} aria-label={expanded ? "Close expanded map" : "Expand operations map"}>{expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}{expanded ? "Close" : "Expand"}</Button></div></header>
    <div className={styles.metrics}>{[{label:"Registered business locations",value:total},{label:"POS branches",value:data?.[0]?.totals.pos ?? 0},{label:"Mapped in loaded records",value:mapped},{label:"Need a location / remote",value:locations.length - mapped}].map(metric => <div key={metric.label}><strong>{metric.value.toLocaleString()}</strong><span>{metric.label}</span></div>)}</div>
    <div className={styles.filters}><div className={styles.search}><Search size={17} /><Input aria-label="Search operations locations" placeholder="Business, owner, area or record ID" value={query} onChange={event => setQuery(event.target.value)} /></div><label>Status<select aria-label="Status" value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option><option value="active">Active accounts / branches</option><option value="inactive">Inactive accounts / branches</option></select></label><label>Location data<select aria-label="Location data" value={locationFilter} onChange={event => setLocationFilter(event.target.value)}><option value="all">All records</option><option value="mapped">Mapped only</option><option value="missing">Missing location / remote</option></select></label></div>
    <div className={styles.layerbar}><span><Layers size={16} />Layers</span>{Object.entries(TYPES).map(([kind, type]) => <button key={kind} aria-pressed={kinds.includes(kind)} onClick={() => {setKinds(current => current.includes(kind) ? current.filter(value => value !== kind) : [...current, kind]);setGroupIds(null)}}><i style={{backgroundColor:type.color}} />{type.label}<b>{locations.filter(point => point.kind === kind).length}</b></button>)}<label><input type="checkbox" checked={verifiedOnly} onChange={event => setVerifiedOnly(event.target.checked)} />Verified records only</label></div>
    <div className={styles.tools}><div className={styles.actions}><Button variant="outline" onClick={() => fit(pins)} disabled={!mapReady || !pins.length}><LocateFixed size={16} />Fit results</Button><Button variant="outline" onClick={() => {setViewportOnly(false);setGroupIds(null);mapRef.current?.setCenter(KENYA);mapRef.current?.setZoom(6)}} disabled={!mapReady}>Kenya view</Button><label>Base map<select aria-label="Map base layer" value={mapType} onChange={event => setMapType(event.target.value)}><option value="roadmap">Road map</option><option value="satellite">Satellite</option><option value="hybrid">Satellite + labels</option><option value="terrain">Terrain</option></select></label></div><div className={styles.checks}><label><input type="checkbox" checked={traffic} disabled={!mapReady} onChange={event => setTraffic(event.target.checked)} />Traffic</label><label><input type="checkbox" checked={density} onChange={event => setDensity(event.target.checked)} />Density circles</label><label><input type="checkbox" checked={viewportOnly} disabled={!mapReady} onChange={event => setViewportOnly(event.target.checked)} />In map view only</label><label><input type="checkbox" checked={refreshing} onChange={event => setRefreshing(event.target.checked)} />Auto-refresh</label></div></div>
    {error && <div role="alert" className={styles.error}>The map records could not be refreshed. Check your connection and administrator access. Existing results may be out of date.<Button variant="outline" onClick={() => void mutate()}>Retry records</Button></div>}
    {isLoading && <p role="status" className={styles.message}><Loader2 size={18} className="animate-spin" />Loading registered business locations...</p>}
    <div className={styles.workspace}>
      <div className={styles.map} aria-label="Interactive business location map">
        {mapReady ? <GoogleMap mapContainerStyle={{width:"100%",height:"100%"}} center={KENYA} zoom={6} onLoad={initialiseMap} onUnmount={() => {mapRef.current=null}} onIdle={readViewport} options={mapOptions}>
          {traffic && <TrafficLayerF />}
          {clusters.map(cluster => cluster.members.length === 1 ? <OverlayViewF key={cluster.members[0].id} position={{lat:cluster.latitude,lng:cluster.longitude}} mapPaneName="overlayMouseTarget" getPixelPositionOffset={() => ({x:-20,y:-20})}><button className={`${styles.pin} ${selectedId === cluster.members[0].id ? styles.selectedPin : ""}`} style={{backgroundColor:TYPES[cluster.members[0].kind].color}} aria-label={`Locate ${cluster.members[0].name}`} onClick={() => selectPoint(cluster.members[0])}>{cluster.members[0].kind === "provider" ? <Wrench size={17} /> : cluster.members[0].kind === "distributor" ? <Warehouse size={17} /> : <Store size={17} />}</button></OverlayViewF> : <OverlayViewF key={cluster.key} position={{lat:cluster.latitude,lng:cluster.longitude}} mapPaneName="overlayMouseTarget" getPixelPositionOffset={() => ({x:-24,y:-24})}><button className={styles.cluster} aria-label={`Explore cluster of ${cluster.members.length} business locations`} onClick={() => {setGroupIds(cluster.members.map(point => point.id));setNotice(`${cluster.members.length} records in this area. Choose one from the results list.`);fit(cluster.members)}}>{cluster.members.length}</button></OverlayViewF>)}
          {density && clusters.map(cluster => <CircleF key={`density-${cluster.key}`} center={{lat:cluster.latitude,lng:cluster.longitude}} radius={Math.max(200,Math.min(20_000,350_000 / 2 ** (zoom / 2)))} options={{fillColor:"#ff7900",fillOpacity:Math.min(.1 + cluster.members.length * .035,.5),strokeOpacity:0,clickable:false}} />)}
          {selected && hasCoordinates(selected) && radius > 0 && <CircleF center={{lat:selected.latitude!,lng:selected.longitude!}} radius={radius*1000} options={{fillColor:"#0647b5",fillOpacity:.08,strokeColor:"#0647b5",strokeWeight:2,clickable:false}} />}
        </GoogleMap> : <div className={styles.fallback}><MapPin size={42} /><h3>{mapAuthError ? "Google Maps authorisation needs attention" : loadError ? "Map tiles could not load" : !configured ? "Map setup is required" : slowMap ? "Map service is taking longer than expected" : "Loading map..."}</h3><p>{mapAuthError || loadError || !configured || slowMap ? "Business records are still available in the results list. Check Maps JavaScript API access, Google Cloud billing and the allowed website domains to enable the basemap." : "Preparing the interactive map. You can already search the loaded business records."}</p></div>}
        <div className={styles.mapBadge}>{pins.length} matching mapped records · {clusters.length} map groups</div>
      </div>
      <aside className={styles.results} aria-label="Business location results"><div className={styles.resultHeading}><h3><ListFilter size={17} />Results <span>{filtered.length}</span></h3>{groupIds && <button onClick={() => setGroupIds(null)}>Leave cluster</button>}</div><div className={styles.resultList}>{filtered.length === 0 && !isLoading && <p className={styles.message}>No records match these filters. Try another layer, clear the search or load more records.</p>}{filtered.slice((listPage-1)*30,listPage*30).map(point => {const Icon=TYPES[point.kind].icon;return <button key={point.id} aria-pressed={point.id === selectedId} className={styles.result} onClick={() => selectPoint(point)}><Icon size={18} style={{color:TYPES[point.kind].color}} /><span><strong>{point.name}</strong><small>{TYPES[point.kind].label} · {point.active ? "Active" : "Inactive"}</small><small>{point.area || point.detail || point.ownerName}</small><em>{hasCoordinates(point) ? point.approximate ? "Approximate base area" : "Registered business pin" : point.detail === "Remote provider" ? "Remote service" : "Location not set"}</em></span></button>})}</div><div className={styles.pagination}><Button variant="outline" disabled={listPage<=1} onClick={() => setListPage(page => page-1)}>Previous</Button><span>{listPage} / {Math.max(1,Math.ceil(filtered.length/30))}</span><Button variant="outline" disabled={listPage*30>=filtered.length} onClick={() => setListPage(page => page+1)}>Next</Button></div></aside>
    </div>
    {selected && <section className={styles.detail} aria-label="Selected business location"><div><p className={styles.eyebrow}>{TYPES[selected.kind].label}</p><h3>{selected.name}</h3><p>{selected.ownerName} · {selected.active ? "Active" : "Inactive"}{selected.verified ? " · Verified" : ""}</p><p>{selected.area || selected.detail || "No additional area information"}</p><small>{hasCoordinates(selected) ? `${selected.approximate ? "Approximate base area" : "Registered business coordinates"}: ${selected.latitude!.toFixed(selected.approximate?2:5)}, ${selected.longitude!.toFixed(selected.approximate?2:5)}` : "No mapped coordinates"}. Profile updated {new Date(selected.updatedAt).toLocaleString()}.</small><small>Record ID: {selected.recordId}</small></div><div className={styles.detailActions}><label><Crosshair size={16} />Nearby businesses<select aria-label="Search radius around selected business" disabled={!hasCoordinates(selected)} value={radius} onChange={event => {setGroupIds(null);setRadius(Number(event.target.value))}}><option value={0}>No radius filter</option><option value={2}>Within 2 km</option><option value={5}>Within 5 km</option><option value={10}>Within 10 km</option><option value={25}>Within 25 km</option></select></label><Link href={selected.kind === "pos" ? `/admin/pos?search=${encodeURIComponent((selected.directoryQuery || selected.name).slice(0,80))}` : `/admin/users?search=${encodeURIComponent(selected.ownerName)}`} className={styles.recordLink}>Open {selected.kind === "pos" ? "POS management" : "owner directory"}<ArrowUpRight size={15} /></Link><Button variant="ghost" onClick={() => {setSelectedId(null);setRadius(0)}}><X size={16} />Clear selection</Button></div></section>}
    {notice && <p role="status" className={styles.message}>{notice}</p>}
    <footer className={styles.footer}><div><p>{locations.length.toLocaleString()} of {total.toLocaleString()} registered business records loaded.{data?.[0]?.fetchedAt && ` Refreshed ${new Date(data[0].fetchedAt).toLocaleTimeString()}.`}</p><p>Provider bases are approximate. Profile updates are not live GPS observations. Customer homes, employee movements and private device locations are not included. Radius distances are straight-line estimates.</p></div>{hasMore && <Button variant="outline" disabled={isValidating} onClick={() => void setSize(size+1)}>{isValidating ? "Loading..." : "Load more locations"}</Button>}</footer>
  </section>
}

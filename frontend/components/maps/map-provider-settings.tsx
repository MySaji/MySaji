"use client"

import { useCallback, useEffect, useState } from "react"
import { GoogleMap, MarkerF } from "@react-google-maps/api"
import { useSWRConfig } from "swr"
import { getAdminMapSettings, updateAdminMapSettings } from "@/backend/actions/admin-maps"
import type { MapProvider, PublicMapConfig } from "@/backend/domain/map-provider"
import { MAP_CONFIG_KEY, loadSelectedGoogleMaps } from "@/frontend/lib/maps-provider"
import { OsmMap } from "./osm-map"

function GooglePreview() {
  const [ready,setReady]=useState(false),[error,setError]=useState("")
  useEffect(()=>{let active=true;loadSelectedGoogleMaps().then(()=>{if(active)setReady(true)}).catch(()=>{if(active)setError("Google Maps could not load. Check the API key, allowed domains and Google Cloud billing.")});return()=>{active=false}},[])
  if(!ready)return <p role="status" className="p-6 text-sm">{error||"Loading Google Maps preview..."}</p>
  return <GoogleMap mapContainerClassName="h-64 w-full rounded-xl" center={{lat:-1.2864,lng:36.8172}} zoom={13} options={{streetViewControl:false,mapTypeControl:false}}><MarkerF position={{lat:-1.2864,lng:36.8172}} title="Preview: Nairobi"/></GoogleMap>
}
export function MapProviderSettings() {
  const { mutate }=useSWRConfig()
  const [settings,setSettings]=useState<PublicMapConfig|null>(null)
  const [selected,setSelected]=useState<MapProvider>("GOOGLE")
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("")
  const [preview,setPreview]=useState(false)
  const load=useCallback(async()=>{setLoading(true);setError("");try{const result=await getAdminMapSettings();if(result.success){setSettings(result.data);setSelected(result.data.provider)}else setError(result.error)}catch{setError("Map settings could not be loaded.")}finally{setLoading(false)}},[])
  useEffect(()=>{void load()},[load])
  const save=async()=>{
    setSaving(true);setError("");setMessage("")
    try{const result=await updateAdminMapSettings({provider:selected});if(!result.success){setError(result.error);return}setSettings(result.data);await mutate(MAP_CONFIG_KEY,result.data,false);setMessage("Map provider saved. Other open screens update on focus or within one minute.")}
    catch{setError("Map settings could not be saved. Reload to check the current provider before retrying.")}
    finally{setSaving(false)}
  }
  const action="min-h-11 rounded-xl border px-4 py-2 text-sm font-medium disabled:opacity-50"
  return <section aria-labelledby="map-provider-title" className="max-w-3xl space-y-5 rounded-2xl border bg-card p-5 sm:p-6">
    <div><h2 id="map-provider-title" className="text-lg font-semibold">Platform maps</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Choose the map used across customer, Saji Pro, team and admin screens. Saved latitude and longitude stay the same when you switch providers.</p></div>
    {loading&&<p role="status">Loading map settings...</p>}
    {!loading&&settings&&<><p className="text-xs font-medium">Currently active: {settings.provider==="GOOGLE"?"Google Maps":"OpenStreetMap"}</p><fieldset disabled={saving} className="grid gap-3 sm:grid-cols-2"><legend className="mb-3 text-sm font-medium">Map provider</legend>{(["GOOGLE","OPENSTREETMAP"] as const).map(provider=><label key={provider} className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${selected===provider?"border-primary bg-primary/5":"border-border"}`}><input type="radio" name="map-provider" value={provider} checked={selected===provider} disabled={provider==="GOOGLE"&&!settings.googleConfigured} onChange={()=>{setSelected(provider);setPreview(false);setMessage("")}} className="mt-1"/><span><strong className="block text-sm">{provider==="GOOGLE"?"Google Maps":"OpenStreetMap / Leaflet"}</strong><span className="mt-2 block text-xs leading-5 text-muted-foreground">{provider==="GOOGLE"?(settings.googleConfigured?"Browser key configured. Supports Google Places, traffic and satellite layers where available.":"Google browser key is missing. Configure it to enable this option."):"Map pins, nearby businesses, tracking positions, clusters and location selection. Traffic and satellite layers remain Google-only."}</span></span></label>)}</fieldset>
    {selected==="OPENSTREETMAP"&&<div className="rounded-xl bg-muted p-4 text-xs leading-6"><p><strong>Address search:</strong> {settings.osmSearchConfigured?"A separate geocoding service is configured.":"Manual addresses, map pins and device location are available. Configure a self-hosted or contracted Nominatim-compatible service to enable place search and address lookup."}</p><p>Public OpenStreetMap tiles have usage limits and no uptime guarantee. Keep attribution visible; bulk and offline tile downloads are not enabled. Use suitable tile hosting as traffic grows. <a className="underline" href="https://operations.osmfoundation.org/policies/tiles/" target="_blank" rel="noopener noreferrer">Read the tile usage policy</a>.</p></div>}
    <div className="flex flex-wrap gap-3"><button type="button" className={action} disabled={saving||selected==="GOOGLE"&&!settings.googleConfigured} onClick={()=>setPreview(!preview)}>{preview?"Hide preview":"Preview selected map"}</button><button type="button" className={`${action} bg-primary text-primary-foreground`} disabled={saving||selected===settings.provider||selected==="GOOGLE"&&!settings.googleConfigured} onClick={()=>void save()}>{saving?"Saving...":"Save map provider"}</button></div>
    {preview&&<div aria-label="Map provider preview">{selected==="GOOGLE"?<GooglePreview/>:<OsmMap className="h-64 w-full rounded-xl" tileUrl={settings.osmTileUrl} attribution={settings.osmAttribution} center={{latitude:-1.2864,longitude:36.8172}} zoom={13} pins={[{id:"preview",latitude:-1.2864,longitude:36.8172,label:"Preview: Nairobi"}]}/>}</div>}</>}
    {error&&<div role="alert" className="space-y-3 text-sm text-destructive"><p>{error}</p><button type="button" className={action} disabled={loading||saving} onClick={()=>void load()}>Reload map settings</button></div>}
    {message&&<p role="status" className="text-sm text-green-700 dark:text-green-400">{message}</p>}
  </section>
}

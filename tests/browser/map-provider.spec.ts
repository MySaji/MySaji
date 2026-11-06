import { test, expect, type Page } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
import ts from "typescript"
import postcss from "postcss"
import tailwind from "@tailwindcss/postcss"
const compile=(file:string)=>ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText
const pkg=(name:string,file:string)=>fs.readFileSync(path.join(path.dirname(require.resolve(`${name}/package.json`)),"cjs",file),"utf8")
let css:Promise<string>
async function mount(page:Page,component:"static"|"settings"|"address"|"admin",provider="OPENSTREETMAP") {
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.stack??e.message))
 const config={provider,googleConfigured:true,osmTileUrl:"https://maps.test/tiles/{z}/{x}/{y}.png",osmAttribution:"Test tile host",osmSearchConfigured:false}
 const modules={
  react:pkg("react","react.development.js"),"react/jsx-runtime":pkg("react","react-jsx-runtime.development.js"),"react-dom":pkg("react-dom","react-dom.development.js"),"react-dom/client":pkg("react-dom","react-dom-client.development.js"),scheduler:pkg("scheduler","scheduler.development.js"),
  "next/link":'module.exports=p=>require("react").createElement("a",p)',
  swr:`const R=require('react'),subscribers=new Set();let current;module.exports=function(key,fetcher){const[data,setData]=R.useState(current);R.useEffect(()=>{subscribers.add(setData);if(!current)fetcher(key).then(value=>{current=value;subscribers.forEach(fn=>fn(value))});return()=>subscribers.delete(setData)},[]);return{data}};module.exports.useSWRConfig=()=>({mutate:async(key,data)=>{current=data;subscribers.forEach(fn=>fn(data))}})`,
  "swr/infinite":`module.exports=()=>({data:[{locations:[{id:'shop:one',kind:'pos',recordId:'one',name:'Test salon',ownerName:'Owner',active:true,verified:true,latitude:-1.28,longitude:36.81,approximate:false,updatedAt:'2026-11-05T00:00:00.000Z'}],totals:{shops:1,providers:0,distributors:0}}],size:1,setSize:()=>{},mutate:async()=>{}})`,
  "@/frontend/lib/auth-context":'exports.useAuthContext=()=>({user:{id:"admin",role:"admin"}})',
  "@googlemaps/js-api-loader":`exports.Loader=class{load(){window.googleLoads++;return Promise.resolve(window.google)}}`,
  "@react-google-maps/api":'exports.GoogleMap=p=>require("react").createElement("div",{"data-testid":"google-map",className:p.mapContainerClassName},p.children);exports.MarkerF=()=>null;exports.OverlayViewF=p=>require("react").createElement("div",null,p.children);exports.CircleF=()=>null;exports.TrafficLayerF=()=>null',
  "leaflet":fs.readFileSync(path.join(path.dirname(require.resolve('leaflet/package.json')),'dist/leaflet-src.js'),'utf8'),
  "leaflet/dist/leaflet.css":'',
  "@/backend/services/google-maps":compile('backend/services/google-maps.ts'),
  "@/backend/domain/map-provider":compile('backend/domain/map-provider.ts'),
  "@/frontend/lib/maps-provider":compile('frontend/lib/maps-provider.ts'),
  "@/frontend/components/maps/osm-map":compile('frontend/components/maps/osm-map.tsx'),
  "./osm-map":compile('frontend/components/maps/osm-map.tsx'),
  "@/frontend/components/maps/osm-address-input":compile('frontend/components/maps/osm-address-input.tsx'),
  "@/frontend/components/ui/input":'exports.Input=p=>require("react").createElement("input",{...p,className:"min-w-0 w-full rounded border p-2 "+(p.className||"")})',
  "@/frontend/components/ui/button":'exports.Button=p=>require("react").createElement("button",p)',
  "lucide-react":'module.exports=new Proxy({},{get:(_,key)=>key==="__esModule"?false:()=>null})',
  "@/backend/actions/admin-maps":'exports.getAdminMapSettings=async()=>({success:true,data:window.config});exports.updateAdminMapSettings=async p=>{window.savedProvider=p.provider;window.config={...window.config,...p};return{success:true,data:window.config}}',
  "@/backend/actions/admin-operations-map":'exports.getAdminOperationsMap=async()=>null',
  "@/backend/domain/admin-operations-map":compile('backend/domain/admin-operations-map.ts'),
  "@/frontend/components/geo/map-style":compile('frontend/components/geo/map-style.ts'),
  "./admin-operations-map.module.css":'module.exports=new Proxy({},{get:(_,key)=>key==="__esModule"?false:String(key)})',
  component:compile(component==="static"?'frontend/components/maps/static-location-map.tsx':component==="settings"?'frontend/components/maps/map-provider-settings.tsx':component==="admin"?'frontend/components/maps/admin-operations-map.tsx':'frontend/components/maps/address-autocomplete-input.tsx'),
 }
 await page.route('https://maps.test/**',async route=>{
  const url=route.request().url()
  if(url.includes('/api/maps/config')){await new Promise(resolve=>setTimeout(resolve,150));return route.fulfill({json:config})}
  if(url.includes('/tiles/'))return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')})
  return route.fulfill({contentType:'text/html',body:'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>'})
 })
 await page.goto('https://maps.test/test')
 css??=postcss([tailwind({base:process.cwd()})]).process('@import "tailwindcss";body{margin:0;font-family:Arial}',{from:path.resolve('.artifacts/maps-fixture.css')}).then(r=>r.css)
 await page.addStyleTag({content:await css})
 await page.addStyleTag({content:fs.readFileSync(path.join(path.dirname(require.resolve('leaflet/package.json')),'dist/leaflet.css'),'utf8')})
 if(component==='admin')await page.addStyleTag({content:fs.readFileSync('frontend/components/maps/admin-operations-map.module.css','utf8')})
 const name=component==='static'?'StaticLocationMap':component==='settings'?'MapProviderSettings':component==='admin'?'default':'AddressAutocompleteInput'
 await page.addScriptTag({content:`var process={env:{NEXT_PUBLIC_GOOGLE_MAPS_API_KEY:'test-key'}},sources=${JSON.stringify(modules)},cache={};function require(id){if(cache[id])return cache[id].exports;if(!(id in sources))throw Error('Missing '+id);const m={exports:{}};cache[id]=m;new Function('module','exports','require',sources[id])(m,m.exports,require);return m.exports}window.config=${JSON.stringify(config)};window.googleLoads=0;window.google={maps:{}};function App(){const R=require('react');const[value,setValue]=R.useState('');return R.createElement(require('component').${name},${component==='static'?"{latitude:-1.28,longitude:36.81,label:'Our salon'}":component==='address'?"{value,onChange:setValue,onPlaceSelected:p=>window.chosenPlace=p,ariaLabel:'Address'}":"{}"})}require('react-dom/client').createRoot(document.getElementById('root')).render(require('react').createElement(App));`})
 return errors
}
for(const width of [390,1280]){
 test(`selected map gates Google SDK and renders Leaflet with attribution at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:844});const errors=await mount(page,'static')
  expect(await page.evaluate('window.googleLoads')).toBe(0)
  await expect(page.locator('.leaflet-container')).toBeVisible()
  await expect(page.getByRole('link',{name:'OpenStreetMap contributors'})).toBeVisible()
  expect(await page.evaluate('window.googleLoads')).toBe(0);expect(errors).toEqual([])
  await mount(page,'static','GOOGLE');await expect(page.getByTestId('google-map')).toBeVisible();expect(await page.evaluate('window.googleLoads')).toBe(1);await expect(page.locator('.leaflet-container')).toHaveCount(0)
 })
 test(`admin saves either provider and can preview before saving at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:844});const errors=await mount(page,'settings')
  await expect(page.getByText('Currently active: OpenStreetMap',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Preview selected map'}).click();await expect(page.locator('.leaflet-container')).toBeVisible();expect(await page.evaluate('window.googleLoads')).toBe(0)
  await page.getByRole('radio',{name:/Google Maps/}).check();await expect(page.locator('.leaflet-container')).toHaveCount(0)
  await page.getByRole('button',{name:'Save map provider'}).click();await expect(page.getByText('Currently active: Google Maps',{exact:true})).toBeVisible();expect(await page.evaluate('window.savedProvider')).toBe('GOOGLE')
  await page.getByRole('radio',{name:/OpenStreetMap/}).check();await page.getByRole('button',{name:'Save map provider'}).click();await expect(page.getByText('Currently active: OpenStreetMap',{exact:true})).toBeVisible();expect(errors).toEqual([])
 })
 test(`OSM address picker confirms coordinates without Google or address-search setup at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:844});const errors=await mount(page,'address')
  await page.getByRole('button',{name:'Choose map pin / coordinates'}).click();await expect(page.locator('.leaflet-container')).toBeVisible()
  await page.getByLabel('Latitude',{exact:true}).fill('-1.28');await page.getByLabel('Longitude',{exact:true}).fill('36.81');await page.getByRole('button',{name:'Use coordinates'}).click()
  await expect(page.getByLabel('Address',{exact:true})).toHaveValue('-1.28000, 36.81000');expect(await page.evaluate('window.chosenPlace')).toMatchObject({latitude:-1.28,longitude:36.81})
  expect(await page.evaluate('window.googleLoads')).toBe(0);expect(errors).toEqual([])
 })
 test(`admin retains results, filters and OSM canvas at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:844});const errors=await mount(page,'admin')
  await expect(page.locator('.leaflet-container')).toBeVisible();await expect(page.getByRole('complementary',{name:'Business location results'}).getByRole('button',{name:/Test salon/})).toBeVisible()
  await expect(page.getByLabel('Map base layer')).toBeDisabled();await expect(page.getByLabel('Traffic',{exact:true})).toBeDisabled()
  await expect(page.locator('.leaflet-control-zoom-in')).toBeVisible();await page.locator('.leaflet-control-zoom-in').click()
  await page.getByRole('button',{name:'Fit results'}).click();expect(await page.evaluate('window.googleLoads')).toBe(0);expect(errors).toEqual([])
  await page.evaluate("require('swr').useSWRConfig().mutate('/api/maps/config',{...window.config,provider:'GOOGLE'})")
  await expect(page.getByLabel('Map base layer')).toBeEnabled();await page.getByLabel('Map base layer').selectOption('satellite');await page.getByLabel('Traffic',{exact:true}).check()
  await page.evaluate("require('swr').useSWRConfig().mutate('/api/maps/config',{...window.config,provider:'OPENSTREETMAP'})")
  await expect(page.getByLabel('Map base layer')).toHaveValue('roadmap');await expect(page.getByLabel('Traffic',{exact:true})).not.toBeChecked();await expect(page.locator('.leaflet-container')).toBeVisible()
  expect(errors).toEqual([])
 })
}

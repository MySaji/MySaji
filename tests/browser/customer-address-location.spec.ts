import { test, expect, type Page } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
import ts from "typescript"

// Mount the real form with explicit browser/Maps/action fixtures. No account,
// external geocoding request, or database write is needed for these regressions.
async function mountForm(page: Page, configured = true) {
  const packageFile = (pkg: string, file: string) => fs.readFileSync(path.join(path.dirname(require.resolve(`${pkg}/package.json`)), "cjs", file), "utf8")
  const div = 'module.exports=new Proxy({},{get:()=>props=>require("react").createElement("div",props)})'
  const modules = {
    react: packageFile("react", "react.development.js"),
    "react/jsx-runtime": packageFile("react", "react-jsx-runtime.development.js"),
    "react-dom": packageFile("react-dom", "react-dom.development.js"),
    "react-dom/client": packageFile("react-dom", "react-dom-client.development.js"),
    scheduler: packageFile("scheduler", "scheduler.development.js"),
    "@react-google-maps/api": 'exports.useJsApiLoader=()=>({isLoaded:true})',
    "@/backend/services/google-maps": `exports.isGoogleMapsConfigured=()=>${configured};exports.GOOGLE_MAPS_LIBRARIES=[]`,
    "@/frontend/components/ui/button": 'exports.Button=props=>require("react").createElement("button",props)',
    "@/frontend/components/ui/input": 'exports.Input=props=>require("react").createElement("input",props)',
    "@/frontend/components/ui/card": div,
    "@/frontend/components/ui/dialog": 'exports.Dialog=props=>props.open?require("react").createElement("div",null,props.children):null;for(const key of ["DialogContent","DialogHeader","DialogTitle"])exports[key]=props=>require("react").createElement("div",null,props.children)',
    "lucide-react": 'module.exports=new Proxy({},{get:(_,key)=>key==="__esModule"?false:()=>null})',
    "@/frontend/lib/hooks/useLocalization": 'exports.useLocalization=()=>({t:key=>key})',
    "@/frontend/components/maps/address-autocomplete-input": 'exports.AddressAutocompleteInput=p=>require("react").createElement("input",{value:p.value,"aria-label":p.ariaLabel,onChange:e=>p.onChange(e.target.value)})',
    "@/frontend/components/maps/static-location-map": 'exports.StaticLocationMap=()=>null',
    "@/backend/actions/addresses": 'exports.getAddresses=async()=>[];exports.createAddress=async input=>{window.savedAddress=input;return {success:true}}',
    component: ts.transpileModule(fs.readFileSync("frontend/components/pages/customer-saved-addresses-page.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText,
  }
  await page.setContent('<html><body><div id="root"></div></body></html>')
  await page.addScriptTag({ content: `
    var process={env:{}};var sources=${JSON.stringify(modules)},cache={};
    function require(id){if(cache[id])return cache[id].exports;var m={exports:{}};cache[id]=m;new Function('module','exports','require',sources[id])(m,m.exports,require);return m.exports}
    Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition:(success,error)=>{window.gpsSuccess=success;window.gpsError=error}},configurable:true});
    window.google={maps:{Geocoder:class{geocode(request,callback){if(window.throwGeocoder)throw Error('Maps unavailable');window.geocodeResult=callback}}}};
    require('react-dom/client').createRoot(document.getElementById('root')).render(require('react').createElement(require('component').CustomerSavedAddressesPage));
  ` })
  await page.getByRole("button", { name: "customer.savedAddresses.addNew", exact: true }).click()
}
const addressField = (page: Page) => page.getByRole("textbox", { name: "customer.savedAddresses.fullAddress", exact: true })
async function locate(page: Page) {
  await page.getByRole("button", { name: "customer.savedAddresses.useCurrentLocation", exact: true }).click()
  await page.evaluate('window.gpsSuccess({coords:{latitude:-1.286389,longitude:36.817223}})')
  await expect(addressField(page)).toHaveValue("-1.28639, 36.81722")
}

for (const status of ["REQUEST_DENIED", "ZERO_RESULTS", "OVER_QUERY_LIMIT"]) {
  test(`detected location stays usable when geocoding returns ${status}`, async ({ page }) => {
    await mountForm(page); await locate(page)
    await page.evaluate(`window.geocodeResult(null,${JSON.stringify(status)})`)
    await expect(addressField(page)).toHaveValue("-1.28639, 36.81722")
    await page.getByPlaceholder("customer.savedAddresses.labelPlaceholder").fill("Home")
    await page.getByRole("button", { name: "common.save", exact: true }).click()
    expect(await page.evaluate('window.savedAddress')).toMatchObject({ address: "-1.28639, 36.81722", latitude: -1.286389, longitude: 36.817223 })
  })
}
test("successful lookup fills the address, but late lookups cannot replace manual edits", async ({ page }) => {
  await mountForm(page); await locate(page)
  await page.evaluate('window.geocodeResult([{formatted_address:"Kenyatta Avenue, Nairobi",address_components:[{types:["locality"],long_name:"Nairobi"}]}],"OK")')
  await expect(addressField(page)).toHaveValue("Kenyatta Avenue, Nairobi")
  await locate(page); await addressField(page).fill("My building, entrance B")
  await page.evaluate('window.geocodeResult([{formatted_address:"Old lookup",address_components:[]}],"OK")')
  await expect(addressField(page)).toHaveValue("My building, entrance B")
})
test("location works without Maps and when Maps throws", async ({ page }) => {
  await mountForm(page, false); await locate(page)
  await mountForm(page); await page.evaluate('window.throwGeocoder=true'); await locate(page)
})
test("closing and reopening the form ignores old GPS results; GPS denial stays retryable", async ({ page }) => {
  await mountForm(page)
  await page.getByRole("button", { name: "customer.savedAddresses.useCurrentLocation", exact: true }).click()
  await page.getByRole("button", { name: "common.cancel", exact: true }).click()
  await page.getByRole("button", { name: "customer.savedAddresses.addNew", exact: true }).click()
  await page.evaluate('window.gpsSuccess({coords:{latitude:0,longitude:0}})')
  await expect(addressField(page)).toHaveValue("")
  await page.getByRole("button", { name: "customer.savedAddresses.useCurrentLocation", exact: true }).click()
  await page.evaluate('window.gpsError({code:1})')
  await expect(page.getByRole("alert")).toHaveText("customer.savedAddresses.geoError")
  await expect(page.getByRole("button", { name: "customer.savedAddresses.useCurrentLocation", exact: true })).toBeEnabled()
})

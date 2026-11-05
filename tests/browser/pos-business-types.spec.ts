import { test, expect, type Page } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
import ts from "typescript"
import postcss from "postcss"
import tailwind from "@tailwindcss/postcss"
const { features } = require("../pos-feature-fixture.cjs")
const { POS_PERMISSIONS } = require("../load-service.cjs").loadService("backend/domain/pos-permissions.ts")
let css: Promise<string>
const compile = (file: string) => ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
const pkg = (name: string, file: string) => fs.readFileSync(path.join(path.dirname(require.resolve(`${name}/package.json`)), "cjs", file), "utf8")
async function mount(page: Page, profile: string, component: "navigation" | "catalogue", tableService?: boolean) {
  const errors: string[] = []
  page.on("pageerror", error => errors.push(error.message))
  const business = features.posBusinessFeatures({ posProfileKey: profile, posConfig: { tableService } })
  const row = { id: "item", name: profile === "SALON" ? "Braiding" : "Classic shirt", sku: "ITEM", barcode: null, image: null, unit: "piece", price: 1000, costPrice: 500, margin: 500, marginPercent: 50, stock: 0, lowStockThreshold: 2, status: "selling", categoryId: null, categoryName: null, ageRestricted: false, isActive: true, tracksBatches: false, tracksSerials: false, hasVariants: false, isService: profile === "SALON", expiresOn: null, soldAllTime: 0, createdAt: new Date().toISOString() }
  const modules: Record<string, string> = {
    react: pkg("react", "react.development.js"), "react/jsx-runtime": pkg("react", "react-jsx-runtime.development.js"), "react-dom": pkg("react-dom", "react-dom.development.js"), "react-dom/client": pkg("react-dom", "react-dom-client.development.js"), scheduler: pkg("scheduler", "scheduler.development.js"),
    "next/link": 'module.exports=p=>require("react").createElement("a",p)', "next/navigation": 'exports.usePathname=()=>"/pos/products"',
    "lucide-react": 'module.exports=new Proxy({},{get:(_,key)=>key==="__esModule"?false:()=>null})',
    "@/backend/domain/pos-traits": compile("backend/domain/pos-traits.ts"), "./pos-traits": compile("backend/domain/pos-traits.ts"), "@/backend/domain/pos-profiles": compile("backend/domain/pos-profiles.ts"), "./pos-profiles": compile("backend/domain/pos-profiles.ts"), "@/backend/domain/pos-business-features": compile("backend/domain/pos-business-features.ts"), "./pos-business-features": compile("backend/domain/pos-business-features.ts"),
    "@/frontend/lib/pos-navigation": compile("frontend/lib/pos-navigation.ts"), "@/backend/domain/pos-workspace": compile("backend/domain/pos-workspace.ts"),
    "./logout-button": 'exports.PosLogoutButton=()=>null',
    "@/frontend/components/pos/logout-button": 'exports.PosLogoutButton=()=>null',
    "@/frontend/components/ui/button": 'exports.Button=({asChild,children,...p})=>asChild?children:require("react").createElement("button",p,children)',
    "@/frontend/components/ui/input": 'exports.Input=p=>require("react").createElement("input",{...p,className:"min-w-0 w-full rounded border p-2 "+(p.className||"")})',
    "@/frontend/components/ui/dialog": 'const R=require("react");exports.Dialog=p=>p.open?R.createElement("div",{role:"dialog"},p.children):null;exports.DialogContent=p=>R.createElement("div",{className:p.className},p.children);exports.DialogTitle=p=>R.createElement("h2",p);exports.DialogDescription=p=>R.createElement("p",p)',
    "@/frontend/components/pos/workspace-ui": 'const R=require("react");exports.PosCard=p=>R.createElement("div",p);exports.WorkspaceHeading=p=>R.createElement("header",null,p.children)',
    "@/frontend/components/pos/row-actions": 'exports.RowActions=p=>require("react").createElement("div",null,p.children)',
    "@/frontend/components/pos/management-table": 'exports.ManagementTable=p=>p.children',
    "@/frontend/components/pos/product-photo-field": 'exports.ProductPhotoField=()=>null',
    "@/frontend/components/pos/barcode-scanner": 'exports.ScanButton=()=>null',
    "@/backend/actions/pos-products": `exports.getCatalogue=async()=>({features:window.business,rows:[window.row],summary:{products:1,selling:1,paused:0,low:0,out:0,stockValue:0,retailValue:0,missingCost:0},categories:[],listedOnMarketplace:false,defaultUnit:'piece',canEdit:true,canCreate:true,canPrice:true});exports.saveProduct=async p=>{window.createdProduct=p;return{success:true,productId:'new'}};exports.getCatalogueHistory=async()=>[]`,
    "@/backend/actions/pos-product-setup": `exports.getProductBusinessSetup=async()=>({success:true,data:{...window.row,updatedAt:'2026-11-05T09:00:00.000Z',features:window.business,canEdit:true,canPrice:true,canManageSalon:true,canAdjustStock:true,variants:[],fitsWith:[],bulkUnit:null,unitsPerBulk:null,durationMinutes:60,commissionBps:4000}});exports.saveProductBusinessSetup=async p=>{window.savedSetup=p;return {success:true}}`,
    "@/frontend/components/pos/product-business-setup": compile("frontend/components/pos/product-business-setup.tsx"),
    component: compile(component === "navigation" ? "frontend/components/pos/register-workspace.tsx" : "app/(pos)/pos/products/page.tsx"),
  }
  css ??= postcss([tailwind({ base: process.cwd() })]).process('@import "tailwindcss";body{margin:0;font-family:Arial}:root{--color-border:#ddd;--color-background:#fff;--color-muted-foreground:#64748b}', { from: path.resolve(".artifacts/business-fixture.css") }).then(result => result.css)
  await page.route("https://business.test/**", route => route.fulfill({ contentType: "text/html", body: '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>' }))
  await page.goto("https://business.test/pos/products")
  await page.addStyleTag({ content: await css })
  const actor = { permissions: POS_PERMISSIONS, features: business, profileKey: profile, isOwner: true }
  await page.addScriptTag({ content: `var process={env:{NODE_ENV:'development'}},sources=${JSON.stringify(modules)},cache={};function require(id){if(cache[id])return cache[id].exports;if(!sources[id])throw Error('Missing '+id);const m={exports:{}};cache[id]=m;new Function('module','exports','require',sources[id])(m,m.exports,require);return m.exports}window.business=${JSON.stringify(business)};window.row=${JSON.stringify(row)};require('react-dom/client').createRoot(document.getElementById('root')).render(require('react').createElement(${component === "navigation" ? "require('component').RegisterNavigation" : "require('component').default"},${JSON.stringify(component === "navigation" ? { actor } : {})}));` })
  await page.waitForTimeout(100)
  expect(errors).toEqual([])
}

for (const width of [390, 1280]) {
  test(`business navigation and owner overrides stay distinct at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    for (const profile of ["CLOTHES", "SUPERMARKET", "SALON", "RESTAURANT"]) {
      await mount(page, profile, "navigation")
      const nav = page.getByRole("navigation", { name: "Register navigation" })
      await expect(nav.getByRole("link", { name: "Register", exact: true })).toBeVisible()
      await expect(nav.getByRole("link", { name: "Tables", exact: true })).toHaveCount(profile === "RESTAURANT" ? 1 : 0)
      await expect(nav.getByRole("link", { name: "Kitchen", exact: true })).toHaveCount(profile === "RESTAURANT" ? 1 : 0)
      await expect(nav.getByRole("link", { name: "Salon", exact: true })).toHaveCount(profile === "SALON" ? 1 : 0)
      await expect(nav.getByRole("link", { name: "Jobs", exact: true })).toHaveCount(0)
    }
    await mount(page, "CLOTHES", "navigation", true)
    await expect(page.getByRole("link", { name: "Tables", exact: true })).toBeVisible()
  })
  test(`clothing catalogue configures sellable options at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await mount(page, "CLOTHES", "catalogue")
    await page.getByRole("button", { name: "Business setup", exact: true }).click()
    await expect(page.getByText("Sizes, colours and sellable options", { exact: true })).toBeVisible()
    await expect(page.getByText("Salon service rules", { exact: true })).toHaveCount(0)
    await expect(page.getByText("Track batches and expiry", { exact: true })).toHaveCount(0)
    await page.getByRole("button", { name: "Add option", exact: true }).click()
    await page.getByRole("textbox", { name: "Option 1 label", exact: true }).fill("Blue / M")
    await page.getByRole("textbox", { name: "Option 1 barcode", exact: true }).fill("123456")
    await page.getByRole("spinbutton", { name: "Option 1 opening quantity", exact: true }).fill("5")
    await page.getByRole("button", { name: "Save business setup", exact: true }).click()
    expect(await page.evaluate("window.savedSetup")).toMatchObject({ hasVariants: true, variants: [{ label: "Blue / M", barcode: "123456", openingStock: 5 }] })
  })
  test(`new clothing items proceed straight to option stock setup at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await mount(page, "CLOTHES", "catalogue")
    await page.getByRole("button", { name: "Add product", exact: true }).click()
    await expect(page.getByRole("combobox", { name: "Item type", exact: true })).toHaveCount(0)
    await expect(page.getByRole("checkbox", { name: /Set up sizes, colours or packs next/ })).toBeChecked()
    await expect(page.getByLabel(/On the shelf right now/)).toHaveCount(0)
    await page.getByRole("textbox", { name: "What is it called?", exact: true }).fill("Linen shirt")
    await page.getByLabel("You sell it for (KSh)", { exact: true }).fill("1200")
    await page.getByRole("button", { name: "Add it to the catalogue", exact: true }).click()
    await expect(page.getByRole("textbox", { name: "Option 1 label", exact: true })).toBeVisible()
    expect(await page.evaluate("window.createdProduct?.isActive")).toBe(false)
    await page.getByRole("textbox", { name: "Option 1 label", exact: true }).fill("White / L")
    await page.getByRole("spinbutton", { name: "Option 1 opening quantity", exact: true }).fill("3")
    await page.getByRole("button", { name: "Save business setup", exact: true }).click()
    expect(await page.evaluate("window.savedSetup")).toMatchObject({ productId: "new", hasVariants: true, activateWhenReady: true, variants: [{ label: "White / L", openingStock: 3 }] })
  })
  test(`salon catalogue adds a real service and exposes its duration and commission at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await mount(page, "SALON", "catalogue")
    await page.getByRole("button", { name: "Add product", exact: true }).click()
    await page.getByRole("combobox", { name: "Item type", exact: true }).selectOption("service")
    await page.getByRole("textbox", { name: "What is it called?", exact: true }).fill("Hair treatment")
    await page.getByLabel("You sell it for (KSh)", { exact: true }).fill("1500")
    await expect(page.getByLabel(/On the shelf right now/)).toHaveCount(0)
    await page.getByRole("button", { name: "Add it to the catalogue", exact: true }).click()
    await expect.poll(() => page.evaluate("window.createdProduct?.isService")).toBe(true)
    await page.getByRole("button", { name: "Business setup", exact: true }).click()
    await page.getByRole("spinbutton", { name: "Service duration in minutes", exact: true }).fill("45")
    await page.getByRole("spinbutton", { name: "Stylist commission percentage", exact: true }).fill("35")
    await page.getByRole("button", { name: "Save business setup", exact: true }).click()
    expect(await page.evaluate("window.savedSetup")).toMatchObject({ durationMinutes: 45, commissionBps: 3500 })
  })
}

import { test, expect, type Page } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
import ts from "typescript"
import postcss from "postcss"
import tailwind from "@tailwindcss/postcss"
const compile = (file: string) => ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
const pkg = (name: string, file: string) => fs.readFileSync(path.join(path.dirname(require.resolve(`${name}/package.json`)), "cjs", file), "utf8")
let css: Promise<string>
async function mount(page: Page, canCash = true, deposit = false, failure = false) {
  const errors: string[] = []
  page.on("pageerror", e => errors.push(e.message))
  const appointment = { id:"visit",version:1,status:"COMPLETED",stylistId:"staff",stylistName:"Mary",serviceName:"Braiding",customerName:"Jane",customerPhone:"0712345678",startsAt:new Date().toISOString(),endsAt:new Date(Date.now()+3600000).toISOString(),quotedPrice:1500,commission:null,paymentState:"Not matched",saleNumber:null,depositAmount:deposit?300:0,depositState:"NONE",depositReceipt:null,depositApplied:false }
  const workspace = { canBook:true,canTeamView:true,canService:true,canManage:false,canFinancial:false,canMatch:true,canCash,links:{},services:[],staff:[],appointments:[appointment] }
  const modules = {
    react:pkg("react","react.development.js"),"react/jsx-runtime":pkg("react","react-jsx-runtime.development.js"),"react-dom":pkg("react-dom","react-dom.development.js"),"react-dom/client":pkg("react-dom","react-dom-client.development.js"),scheduler:pkg("scheduler","scheduler.development.js"),
    "next/link":'module.exports=p=>require("react").createElement("a",p)',
    "lucide-react":'module.exports=new Proxy({},{get:(_,key)=>key==="__esModule"?false:()=>null})',
    "@/backend/domain/pos-salon":compile("backend/domain/pos-salon.ts"),
    "@/backend/actions/pos-salon":'exports.getSalonWorkspace=async()=>({success:true,data:window.workspace})',
    "@/backend/actions/pos-sales":`exports.recordSalonCashPayment=async p=>{window.cashRequest=p;if(${failure})return{success:false,error:'Open a shift before starting a sale.'};window.workspace.appointments[0]={...window.workspace.appointments[0],version:2,saleNumber:'000001',paymentState:'Receipt matched'};return{success:true,data:{saleNumber:'000001'}}}`,
    "@/frontend/components/pos/till-receipt":'exports.TillReceipt=p=>require("react").createElement("div",null,"Receipt #"+p.receipt.saleNumber)',
    component:compile("app/(pos)/pos/salon/page.tsx"),
  }
  css ??= postcss([tailwind({ base:process.cwd() })]).process('@import "tailwindcss";body{margin:0;font-family:Arial}',{from:path.resolve('.artifacts/salon-cash-fixture.css')}).then(r=>r.css)
  await page.route('https://salon.test/**',r=>r.fulfill({contentType:'text/html',body:'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>'}))
  await page.goto('https://salon.test/pos/salon')
  await page.addStyleTag({content:await css})
  await page.addScriptTag({content:`var process={env:{NODE_ENV:'development'}},sources=${JSON.stringify(modules)},cache={};function require(id){if(cache[id])return cache[id].exports;if(!sources[id])throw Error('Missing '+id);const m={exports:{}};cache[id]=m;new Function('module','exports','require',sources[id])(m,m.exports,require);return m.exports}window.workspace=${JSON.stringify(workspace)};require('react-dom/client').createRoot(document.getElementById('root')).render(require('react').createElement(require('component').default));`})
  await expect(page.getByRole('heading',{name:'Jane',exact:true})).toBeVisible()
  expect(errors).toEqual([])
}
for (const width of [390,1280]) {
  test(`salon cash links receipt and preserves manual matching at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:844});await mount(page)
    await expect(page.getByRole('button',{name:'Match paid receipt'})).toBeVisible()
    await page.getByRole('button',{name:'Client paid cash',exact:true}).click()
    await expect(page.getByRole('button',{name:'Confirm cash & create receipt'})).toBeDisabled()
    await page.getByLabel('Cash received (KSh)').fill('2000')
    await page.getByRole('button',{name:'Confirm cash & create receipt'}).click()
    await expect(page.getByRole('region',{name:'Salon cash receipt'})).toContainText('Receipt #000001')
    await expect(page.getByRole('button',{name:'Client paid cash',exact:true})).toHaveCount(0)
    expect(await page.evaluate(()=> (window as unknown as {cashRequest:unknown}).cashRequest)).toEqual({id:'visit',version:1,cashReceived:2000})
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
  })
  test(`salon cash respects access, deposits and failed checkout at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:844});await mount(page,false)
    await expect(page.getByRole('button',{name:'Client paid cash',exact:true})).toHaveCount(0)
    await mount(page,true,true);await page.getByRole('button',{name:'Client paid cash',exact:true}).click()
    await expect(page.getByText('This visit has a booking deposit. Use Register to settle the balance and match its receipt.',{exact:true})).toBeVisible()
    await expect(page.getByLabel('Cash received (KSh)')).toHaveCount(0)
    await mount(page,true,false,true);await page.getByRole('button',{name:'Client paid cash',exact:true}).click()
    await page.getByLabel('Cash received (KSh)').fill('2000');await page.getByRole('button',{name:'Confirm cash & create receipt'}).click()
    await expect(page.getByRole('alert')).toContainText('Open a shift')
    await expect(page.getByRole('region',{name:'Salon cash receipt'})).toHaveCount(0)
  })
}

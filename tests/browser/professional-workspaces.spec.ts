import {test,expect,type Page} from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
import ts from "typescript"
import postcss from "postcss"
import tailwind from "@tailwindcss/postcss"
const compile=(file:string)=>ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText
const pkg=(name:string,file:string)=>fs.readFileSync(path.join(path.dirname(require.resolve(`${name}/package.json`)),"cjs",file),"utf8")
let css:Promise<string>
async function mount(page:Page,role="provider",activity=false){
 const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message))
 const modules={
  react:pkg("react","react.development.js"),"react/jsx-runtime":pkg("react","react-jsx-runtime.development.js"),"react-dom":pkg("react-dom","react-dom.development.js"),"react-dom/client":pkg("react-dom","react-dom-client.development.js"),scheduler:pkg("scheduler","scheduler.development.js"),
  "next/link":'module.exports=p=>require("react").createElement("a",p)',
  "next/navigation":'exports.usePathname=()=>window.pathname',
  "lucide-react":'module.exports=new Proxy({},{get:(_,key)=>key==="__esModule"?false:()=>null})',
  "@/frontend/lib/auth-context":'exports.useAuthContext=()=>({user:window.user})',
  "@/backend/domain/workspace-personalization":compile("backend/domain/workspace-personalization.ts"),
  "@/frontend/components/ui/input":'exports.Input=p=>require("react").createElement("input",{...p,className:"w-full min-h-11 min-w-0 rounded-lg border p-2 "+(p.className||"")})',
  "@/frontend/components/ui/button":'exports.Button=({variant,...p})=>require("react").createElement("button",{...p,className:"min-h-11 rounded-lg border p-2 "+(p.className||"")})',
  "@/frontend/components/ui/dialog":'const R=require("react");exports.Dialog=p=>p.open?R.createElement("div",null,p.children):null;exports.DialogContent=p=>R.createElement("div",{...p,role:"dialog",className:"fixed inset-4 z-50 mx-auto max-w-2xl overflow-y-auto rounded-2xl border bg-white p-5 shadow-xl "+(p.className||"")});exports.DialogTitle=p=>R.createElement("h2",p);exports.DialogDescription=p=>R.createElement("p",p)',
  "swr/infinite":`const R=require('react');module.exports=function(getKey,fetcher){const first=getKey(0,null),id=JSON.stringify(first),[size,setSize]=R.useState(1),[state,set]=R.useState({}),[error,setError]=R.useState(null);const load=async()=>{try{const rows=[];for(let i=0;i<size;i++){const key=getKey(i,rows[i-1]);if(!key)break;rows.push(await fetcher(key))}set({id,data:rows});setError(null)}catch(e){setError(e)}};R.useEffect(()=>{if(first)void load()},[id,size]);return{data:state.id===id?state.data:undefined,error,isLoading:!!first&&state.id!==id&&!error,isValidating:false,mutate:load,size,setSize}}`,
  "@/backend/actions/admin-team-activity":`exports.getAdminTeamActivity=async input=>{window.activityRequests.push(input);if(input.from>input.to)return{success:false,error:'Choose valid dates.'};return{success:true,data:{member:{id:input.userId,name:'Mary',role:'AGENT',jobTitle:'Support agent',department:'Care'},total:1,entries:[{id:'one',action:'dispute.resolve',entityType:'Dispute',createdAt:'2026-11-05T10:00:00.000Z'}],next:null}}}`,
  frame:compile("frontend/components/workspaces/professional-frame.tsx"),priority:compile("frontend/components/workspaces/priority-desk.tsx"),activity:compile("frontend/components/workspaces/team-activity-dialog.tsx"),
 }
 await page.route("https://workspace.test/**",route=>route.fulfill({contentType:"text/html",body:'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div data-workspace="pro"><aside data-workspace-navigation></aside><main id="root"></main></div></body></html>'}))
 await page.goto("https://workspace.test/"+role)
 css??=postcss([tailwind({base:process.cwd()})]).process('@import "tailwindcss";@theme inline{--color-primary:var(--primary);--color-primary-foreground:var(--primary-foreground);--color-muted:var(--muted);--color-muted-foreground:var(--muted-foreground);--color-background:var(--background);--color-card:var(--card);--color-border:var(--border)}:root{--primary:#0647b5;--primary-foreground:#fff;--muted:#f1f4f8;--muted-foreground:#617086;--card:#fff;--background:#f8fafc;--border:#dfe5ee;--foreground:#172b4d}body{margin:0;font-family:Arial}aside{display:none}',{from:path.resolve('.artifacts/pro-fixture.css')}).then(r=>r.css)
 await page.addStyleTag({content:await css});await page.addStyleTag({content:fs.readFileSync("frontend/components/workspaces/professional-workspace.css","utf8")})
 await page.addScriptTag({content:`var process={env:{}},sources=${JSON.stringify(modules)},cache={};function require(id){if(cache[id])return cache[id].exports;if(!(id in sources))throw Error('Missing '+id);const m={exports:{}};cache[id]=m;new Function('module','exports','require',sources[id])(m,m.exports,require);return m.exports}window.user={id:'one',role:${JSON.stringify(role)}};window.pathname='/'+window.user.role+'/orders';window.activityRequests=[];const R=require('react'),root=require('react-dom/client').createRoot(document.getElementById('root'));window.nav=()=>{document.querySelector('aside').innerHTML=['orders','profile','wallet'].map(p=>'<a href="/'+window.user.role+'/'+p+'">'+p+'</a>').join('')};window.render=()=>{const prefix='/'+window.user.role;root.render(${activity?`R.createElement(require('activity').TeamActivityDialog,{member:{id:'mary',name:'Mary'},onClose:()=>{}})`:`R.createElement(require('frame').ProfessionalFrame,null,R.createElement('div',{className:'p-4'},R.createElement('h1',null,'Your business overview'),R.createElement(require('priority').PriorityDesk,{items:[{id:'orders',title:'Orders to review',count:3,href:prefix+'/orders',description:'Review records before taking action.'},{id:'empty',title:'Completed queue',count:0,href:prefix+'/profile',description:'No items currently waiting.'},{id:'blocked',title:'Restricted admin records',count:20,href:'/admin/wallet',description:'Must not appear'}]})))`})};window.nav();window.render();`})
 return errors
}
for(const width of [390,1280]){
 test(`workbench pins, tasks, permissions and account reset at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});const errors=await mount(page)
  await expect(page.getByRole('heading',{name:'Work priorities'})).toBeVisible();await expect(page.getByRole('link',{name:/Restricted/})).toHaveCount(0)
  await page.getByRole('button',{name:'Show all queues'}).click();await expect(page.getByRole('heading',{name:'Completed queue'})).toBeVisible()
  await page.getByRole('button',{name:'Pin page',exact:true}).click();await expect(page.getByRole('navigation',{name:'Pinned workspace pages'})).toContainText('orders')
  await page.getByRole('button',{name:'My workspace',exact:true}).click();await page.getByRole('button',{name:'Pin profile',exact:true}).click();await expect(page.getByRole('button',{name:'Pin profile'})).toHaveAttribute('aria-pressed','true')
  await page.getByRole('button',{name:'Work plan',exact:true}).click();await page.getByLabel('Personal task title').fill('Review unpaid records');await page.getByLabel('Personal task due date').fill('2026-01-01');await page.getByRole('button',{name:'Add task',exact:true}).click()
  await page.getByRole('button',{name:'Overdue',exact:true}).click();await expect(page.getByText('Review unpaid records',{exact:true})).toBeVisible()
  await page.getByRole('checkbox',{name:'Complete Review unpaid records'}).click();await page.getByRole('button',{name:'Done',exact:true}).click();await expect(page.getByText('Review unpaid records',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Clear completed',exact:true}).click();await expect(page.getByText('Review unpaid records',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Remove completed tasks',exact:true}).click();await expect(page.getByText('Review unpaid records',{exact:true})).toHaveCount(0)
  await page.getByRole('button',{name:'Comfortable spacing',exact:true}).click();await expect(page.locator('[data-density]')).toHaveAttribute('data-density','compact')
  await page.screenshot({path:'.artifacts/pro-workbench-'+width+'.png'})
  await page.evaluate("document.querySelector('aside').innerHTML='<a href=\"/provider/profile\">profile</a>'");await expect(page.getByRole('navigation',{name:'Pinned workspace pages'})).not.toContainText('orders')
  await page.getByLabel('Personal task title').fill('Private draft');await page.evaluate("window.user={id:'two',role:'provider'};window.render()")
  await page.getByRole('button',{name:'My work plan',exact:true}).click();await expect(page.getByLabel('Personal task title')).toHaveValue('');expect(errors).toEqual([])
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
 })
 test(`all role frames keep scoped navigation and messages layout at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});const errors=await mount(page,'admin')
  for(const role of ['admin','sub-admin','secretary','agent','distributor','provider','shopkeeper']){
   await page.evaluate(role=>{(window as any).user={id:role,role};(window as any).pathname='/'+role+'/orders';(window as any).nav();(window as any).render()},role)
   await expect(page.getByRole('button',{name:'My workspace',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),role).toBe(true)
  }
  await page.evaluate("window.pathname='/shopkeeper/messages';window.render()");await expect(page.getByRole('button',{name:'My workspace',exact:true})).toHaveCount(0)
  await page.evaluate("window.pathname='/shopkeeper/orders';window.render()");await page.getByRole('button',{name:'My workspace',exact:true}).click();await expect(page.getByRole('link',{name:'profile',exact:true})).toBeVisible();expect(errors).toEqual([])
 })
 test(`admin staff history filters inclusive dates at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});const errors=await mount(page,'admin',true)
  await expect(page.getByText('dispute resolve',{exact:true})).toBeVisible();await expect(page.getByText('Support agent',{exact:true})).toBeVisible()
  await page.getByLabel('Activity from date').fill('2026-10-01');await page.getByLabel('Activity to date').fill('2026-10-31');await page.getByRole('button',{name:'Apply dates',exact:true}).click()
  await expect.poll(()=>page.evaluate('(window.activityRequests.at(-1)||{}).from')).toBe('2026-10-01');await expect.poll(()=>page.evaluate('window.activityRequests.at(-1).to')).toBe('2026-10-31');expect(errors).toEqual([])
 })
}

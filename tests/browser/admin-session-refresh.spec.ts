import { test, expect, type Page } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
import ts from "typescript"

// Run the real auth hook/provider, idle guard and admin layout against the
// Auth.js loading/update lifecycle using an explicit provider fixture.
// No real account, external request or database write is involved.
async function mountAdmin(page: Page) {
  const pkg = (name: string, file: string) => fs.readFileSync(path.join(path.dirname(require.resolve(`${name}/package.json`)), "cjs", file), "utf8")
  const compile = (file: string) => ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
  const modules: Record<string, string> = {
    react: pkg("react", "react.development.js"), "react/jsx-runtime": pkg("react", "react-jsx-runtime.development.js"),
    "react-dom": pkg("react-dom", "react-dom.development.js"), "react-dom/client": pkg("react-dom", "react-dom-client.development.js"), scheduler: pkg("scheduler", "scheduler.development.js"),
    "next/navigation": 'const router={push:url=>window.redirects.push(url)};exports.useRouter=()=>router',
    "next-auth/react": `const R=require('react'),Context=R.createContext(null);
      exports.Provider=({children})=>{const [session,setSession]=R.useState({user:{id:'admin',role:'admin',name:'Admin',isActive:true}}),[loading,setLoading]=R.useState(false);
        const value=R.useMemo(()=>({data:session,status:loading?'loading':session?'authenticated':'unauthenticated',async update(){if(loading)return;window.syncs++;setLoading(true);await new Promise(resolve=>setTimeout(resolve,80));const fresh=session?{...session,user:{...session.user}}:null;setSession(fresh);setLoading(false);return fresh}}),[session,loading]);
        window.backgroundRefresh=()=>value.update();window.expire=()=>setSession(null);
        return R.createElement(Context.Provider,{value},children)};
      exports.useSession=()=>R.useContext(Context);exports.signOut=async()=>{window.signOutCalls++};`,
    "@/frontend/lib/hooks/useAuth": compile("frontend/lib/hooks/useAuth.ts"),
    "@/frontend/lib/auth-context": compile("frontend/lib/auth-context.tsx"),
    "@/frontend/components/session-guard": compile("frontend/components/session-guard.tsx"),
    "@/backend/domain/session-policy": compile("backend/domain/session-policy.ts"),
    "@/frontend/lib/session-heartbeat": compile("frontend/lib/session-heartbeat.ts"),
    "@/frontend/lib/pos-offline-scope": 'exports.suspendOfflineScope=()=>{}',
    "@/frontend/lib/device-push": 'exports.clearDevicePushSession=async()=>{}',
    "@/frontend/components/ui/dialog": 'const R=require("react");exports.Dialog=p=>R.createElement("div",{role:"dialog"},p.children);for(const k of ["DialogContent","DialogTitle","DialogDescription"])exports[k]=p=>R.createElement("div",null,p.children)',
    "@/frontend/components/loading-screen": 'exports.LoadingScreen=()=>require("react").createElement("div",{role:"status"},"Loading portal")',
    admin: compile("app/admin/layout.tsx"),
    fixture: `const R=require('react');function Form(){R.useEffect(()=>{window.mounts++},[]);const [count,setCount]=R.useState(0);return R.createElement('section',null,R.createElement('input',{'aria-label':'Unsaved setting',defaultValue:''}),R.createElement('button',{onClick:()=>setCount(n=>n+1)},'Action '+count))};exports.App=()=>R.createElement(require('next-auth/react').Provider,null,R.createElement(require('@/frontend/lib/auth-context').AuthProvider,null,R.createElement(require('admin').default,null,R.createElement(Form))))`,
  }
  for (const [file, name] of [["workspace-tools", "WorkspaceTools"], ["admin-sidebar", "AdminSidebar"], ["admin-header", "AdminHeader"], ["admin-mobile-nav", "AdminMobileNav"]]) modules[`@/frontend/components/${file}`] = `exports.${name}=()=>null`
  await page.route("https://session.test/**", route => route.fulfill({ contentType: "text/html", body: '<html><body><div id="root"></div></body></html>' }))
  await page.goto("https://session.test/admin")
  await page.addScriptTag({ content: `var process={env:{NODE_ENV:'development'}},sources=${JSON.stringify(modules)},cache={};function require(id){if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;new Function('module','exports','require',sources[id])(m,m.exports,require);return m.exports}window.clock=Date.now();Date.now=()=>window.clock;window.syncs=0;window.mounts=0;window.redirects=[];window.signOutCalls=0;localStorage.clear();require('react-dom/client').createRoot(document.getElementById('root')).render(require('react').createElement(require('fixture').App));` })
  await expect(page.getByRole("textbox", { name: "Unsaved setting" })).toBeVisible()
}

for (const width of [390, 1280]) test(`admin clicks preserve forms and throttle background session refresh at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 })
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message))
  await mountAdmin(page)
  await page.evaluate('window.clock += 3000')
  await page.getByRole("textbox", { name: "Unsaved setting" }).fill("Keep this unsaved value")
  await page.getByRole("button", { name: "Action 0", exact: true }).click()
  await expect.poll(() => page.evaluate('window.syncs')).toBe(1)
  await page.waitForTimeout(150)
  for (let i = 1; i <= 5; i++) {
    await page.evaluate('window.clock += 3000')
    await page.getByRole("button", { name: `Action ${i}`, exact: true }).click()
  }
  expect(await page.evaluate('window.syncs')).toBe(1)
  expect(await page.evaluate('window.mounts')).toBe(1)
  await expect(page.getByRole("textbox", { name: "Unsaved setting" })).toHaveValue("Keep this unsaved value")
  await expect(page.getByRole("status")).toHaveCount(0)
  await page.evaluate('window.clock += 61000')
  await page.getByRole("button", { name: "Action 6", exact: true }).click()
  await expect.poll(() => page.evaluate('window.syncs')).toBe(2)
  await page.waitForTimeout(150)
  expect(await page.evaluate('window.mounts')).toBe(1)
  expect(await page.evaluate('window.redirects')).toEqual([])
  expect(await page.evaluate('window.signOutCalls')).toBe(0)
  // A genuine sign-out must still remove the protected form and redirect.
  await page.evaluate('window.expire()')
  await expect(page.getByRole("textbox", { name: "Unsaved setting" })).toHaveCount(0)
  await expect.poll(() => page.evaluate('window.redirects')).toEqual(["/"])
  expect(errors).toEqual([])
})

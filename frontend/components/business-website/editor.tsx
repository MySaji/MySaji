"use client"

import { useEffect, useState } from "react"
import { ExternalLink, Globe, Loader2, Plus, Save, Sparkles, Trash2 } from "lucide-react"
import { savePosWebsite, unpublishPosWebsite, suggestPosWebsiteCopy, searchPosWebsiteProducts, type PosWebsiteEditor, type PosWebsiteDraft } from "@/backend/actions/pos-website"

const input = "mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
const secondary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium disabled:opacity-50"
const primary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
function Field({ label, value, onChange, maxLength, multiline = false, type = "text" }: { label: string; value: string; onChange: (value: string) => void; maxLength: number; multiline?: boolean; type?: string }) {
  return <label className="block text-sm font-medium">{label}{multiline ? <textarea rows={4} maxLength={maxLength} className={input} value={value} onChange={event => onChange(event.target.value)} /> : <input type={type} maxLength={maxLength} className={input} value={value} onChange={event => onChange(event.target.value)} />}</label>
}
export function BusinessWebsiteEditor({ initial }: { initial: PosWebsiteEditor }) {
  const [draft, setDraft] = useState(initial.draft)
  const [saved, setSaved] = useState(initial.draft)
  const [version, setVersion] = useState(initial.version)
  const [published, setPublished] = useState(initial.publishedAt)
  const [reviewed, setReviewed] = useState(false)
  const [busy, setBusy] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [tab, setTab] = useState("Business")
  const [search, setSearch] = useState("")
  const [products, setProducts] = useState(initial.products)
  const [copy, setCopy] = useState<{ headline: string; introduction: string; about: string; suggestions: string[] } | null>(null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  function change<K extends keyof PosWebsiteDraft>(key: K, value: PosWebsiteDraft[K]) { setDraft(previous => ({ ...previous, [key]: value })); setReviewed(false); setMessage("") }
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = "" }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])
  async function run(kind: string) {
    setBusy(kind); setError(""); setMessage("")
    try {
      if (kind === "suggest") {
        const result = await suggestPosWebsiteCopy(draft)
        if (!result.success) setError(result.error)
        else { setCopy(result.data); setMessage("Suggestions are ready to review. Your draft has not changed.") }
      } else if (kind === "search") {
        const result = await searchPosWebsiteProducts(search)
        if (!result.success) setError(result.error)
        else setProducts(previous => [...new Map([...previous.filter(p => draft.productIds.includes(p.id)), ...result.products].map(p => [p.id, p])).values()])
      } else {
        const result = kind === "unpublish" ? await unpublishPosWebsite({ version }) : await savePosWebsite({ content: draft, version, publish: kind === "publish", reviewed })
        if (!result.success) setError(result.error)
        else {
          setVersion(result.version)
          if (kind === "unpublish") setPublished(null)
          else { setSaved(draft); if (kind === "publish") setPublished(new Date().toISOString()) }
          setMessage(kind === "publish" ? "Website published. Your public website is available at its address once domain setup is active." : kind === "unpublish" ? "Website unpublished. Your draft is kept." : "Draft saved. Open the saved preview to review it.")
        }
      }
    } catch { setError("This action could not be completed. Check your connection and try again.") }
    finally { setBusy("") }
  }
  const tabs = ["Business", "Services & FAQs", "Catalogue", "Contact", "Publish"]
  return <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
    <header className="flex flex-wrap justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-primary">Your business, online</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Business website</h1><p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">Tell your story, showcase your work and help customers reach you. You choose what becomes public.</p></div><div className="flex flex-wrap items-start gap-2"><a href={`/business/${initial.subdomain}?preview=1`} target="_blank" rel="noopener noreferrer" className={secondary}><ExternalLink size={16} />Saved preview</a><button disabled={!!busy} onClick={() => void run("save")} className={primary}><Save size={16} />Save draft</button></div></header>
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-background p-5"><div className="flex min-w-0 items-center gap-3"><Globe size={24} className="shrink-0 text-primary" /><div className="min-w-0"><p className="break-all text-sm font-semibold">{initial.url}</p><p className="mt-1 text-xs text-muted-foreground">{published ? "Published" : "Private draft"} · {dirty ? "Unsaved changes" : "Draft saved"}</p></div></div>{published && <a href={initial.url} target="_blank" rel="noopener noreferrer" className={secondary}>Open public website <ExternalLink size={15} /></a>}</section>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    {message && <p role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">{message}</p>}
    {busy && <p role="status" className="flex items-center gap-2 text-sm"><Loader2 size={16} className="animate-spin" />Working…</p>}
    <nav aria-label="Website editor sections" className="flex gap-2 overflow-x-auto pb-1">{tabs.map(label => <button key={label} disabled={!!busy} aria-current={tab === label ? "page" : undefined} onClick={() => setTab(label)} className={`${secondary} shrink-0 ${tab === label ? "border-primary text-primary" : ""}`}>{label}</button>)}</nav>
    <fieldset disabled={!!busy} className="min-w-0 space-y-5 rounded-2xl border border-border bg-background p-5 md:p-7"><legend className="px-2 text-lg font-semibold">{tab}</legend>
      {tab === "Business" && <><div className="grid gap-5 md:grid-cols-2"><Field label="Business name" value={draft.name} maxLength={100} onChange={v => change("name", v)} /><Field label="Business category" value={draft.category} maxLength={80} onChange={v => change("category", v)} /></div><Field label="Homepage headline" value={draft.headline} maxLength={120} onChange={v => change("headline", v)} /><Field label="Short introduction" value={draft.introduction} multiline maxLength={500} onChange={v => change("introduction", v)} /><Field label="About your business" value={draft.about} multiline maxLength={4000} onChange={v => change("about", v)} /><Field label="Website colour" value={draft.accent} type="color" maxLength={7} onChange={v => change("accent", v)} /><p className="text-xs leading-6 text-muted-foreground">Your saved Till business logo is also used on the website. Change it in Settings → Till appearance.</p><button disabled={!initial.aiAvailable || !!busy} onClick={() => void run("suggest")} className={secondary}><Sparkles size={16} />Suggest website copy with AI</button><p className="text-xs leading-6 text-muted-foreground">AI uses the business name, category, introduction, about text and service descriptions entered here. Review every suggestion. AI does not save or publish automatically.{!initial.aiAvailable && " AI is not configured on this installation; all manual editing remains available."}</p>
        {copy && <aside aria-label="AI copy suggestions" className="space-y-4 rounded-xl border border-blue-200 bg-blue-50 p-5 text-slate-900"><h2 className="font-semibold">Review suggested copy</h2><h3 className="font-semibold">{copy.headline}</h3><p className="whitespace-pre-wrap text-sm leading-6">{copy.introduction}</p><p className="whitespace-pre-wrap text-sm leading-6">{copy.about}</p>{copy.suggestions.length > 0 && <ul className="list-disc space-y-2 pl-5 text-sm">{copy.suggestions.map((tip, i) => <li key={i}>{tip}</li>)}</ul>}<div className="flex flex-wrap gap-2"><button className={primary} onClick={() => { setDraft(previous => ({ ...previous, headline: copy.headline, introduction: copy.introduction, about: copy.about })); setReviewed(false); setCopy(null) }}>Apply to draft</button><button className={secondary} onClick={() => setCopy(null)}>Discard suggestions</button></div></aside>}</>}
      {tab === "Services & FAQs" && <><div className="flex flex-wrap justify-between gap-3"><h2 className="font-semibold">Services you offer</h2><button className={secondary} disabled={draft.services.length >= 12} onClick={() => change("services", [...draft.services, { title: "", description: "" }])}><Plus size={16} />Add service</button></div>{draft.services.map((service, i) => <div key={i} className="space-y-3 rounded-xl border border-border p-4"><Field label={`Service ${i + 1} title`} value={service.title} maxLength={100} onChange={v => change("services", draft.services.map((s, n) => n === i ? { ...s, title: v } : s))} /><Field label={`Service ${i + 1} description`} value={service.description} multiline maxLength={700} onChange={v => change("services", draft.services.map((s, n) => n === i ? { ...s, description: v } : s))} /><button className={secondary} onClick={() => change("services", draft.services.filter((_, n) => n !== i))}><Trash2 size={15} />Remove service {i + 1}</button></div>)}<div className="flex flex-wrap justify-between gap-3"><h2 className="font-semibold">Frequently asked questions</h2><button className={secondary} disabled={draft.faqs.length >= 8} onClick={() => change("faqs", [...draft.faqs, { question: "", answer: "" }])}><Plus size={16} />Add question</button></div>{draft.faqs.map((faq, i) => <div key={i} className="space-y-3 rounded-xl border border-border p-4"><Field label={`Question ${i + 1}`} value={faq.question} maxLength={160} onChange={v => change("faqs", draft.faqs.map((f, n) => n === i ? { ...f, question: v } : f))} /><Field label={`Answer ${i + 1}`} value={faq.answer} multiline maxLength={800} onChange={v => change("faqs", draft.faqs.map((f, n) => n === i ? { ...f, answer: v } : f))} /><button className={secondary} onClick={() => change("faqs", draft.faqs.filter((_, n) => n !== i))}>Remove question {i + 1}</button></div>)}</>}
      {tab === "Catalogue" && <><p className="text-sm leading-6 text-muted-foreground">Choose up to 24 active products or services from your own Till catalogue. Customers can enquire directly; this website does not take online payments.</p><div className="flex flex-wrap items-end gap-3"><div className="min-w-0 flex-1"><Field label="Search catalogue" value={search} maxLength={100} onChange={setSearch} /></div><button className={secondary} onClick={() => void run("search")}>Search products</button></div><p className="text-sm font-semibold">{draft.productIds.length} / 24 selected</p><div className="grid gap-3 sm:grid-cols-2">{products.map(product => <label key={product.id} className="flex items-center gap-3 rounded-xl border border-border p-4 text-sm"><input type="checkbox" checked={draft.productIds.includes(product.id)} disabled={!draft.productIds.includes(product.id) && draft.productIds.length >= 24} onChange={event => change("productIds", event.target.checked ? [...draft.productIds, product.id] : draft.productIds.filter(id => id !== product.id))} /><span className="min-w-0 break-words">{product.name}<small className="ml-2 text-muted-foreground">{product.isService ? "Service" : "Product"}</small></span></label>)}</div>{!products.length && <p className="text-sm text-muted-foreground">No matching catalogue items. Add products in Catalogue, then search again.</p>}</>}
      {tab === "Contact" && <><p className="text-sm leading-6 text-muted-foreground">Only publish contact details you want customers to use. Account email addresses and tax information are never copied automatically.</p><button className={secondary} onClick={() => { setDraft(previous => ({ ...previous, phone: initial.suggestedContact.phone, address: initial.suggestedContact.address })); setReviewed(false) }}>Use business setup phone & address</button><div className="grid gap-5 md:grid-cols-2">{([ ["phone", "Public phone number", 30], ["email", "Public email", 160], ["whatsapp", "WhatsApp (international number)", 20], ["address", "Business address", 240] ] as const).map(([key, label, max]) => <Field key={key} label={label} value={draft[key]} maxLength={max} onChange={v => change(key, v)} />)}</div><Field label="Opening hours" value={draft.hours} multiline maxLength={400} onChange={v => change("hours", v)} />{(["facebook", "instagram", "website"] as const).map(key => <Field key={key} label={`${key === "website" ? "Other website" : key} URL (https://)`} value={draft.socialLinks[key]} maxLength={500} onChange={v => change("socialLinks", { ...draft.socialLinks, [key]: v })} />)}</>}
      {tab === "Publish" && <><h2 className="text-xl font-semibold">Ready for customers?</h2><p className="max-w-2xl text-sm leading-7 text-muted-foreground">Save your draft and open the saved preview. Check the business story, services, selected products, prices and contact details. Publishing replaces the public website; later draft edits remain private until you publish again.</p><label className="flex items-start gap-3 rounded-xl border border-border p-4 text-sm leading-6"><input className="mt-1" type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} /><span>I have reviewed this content, confirmed it is accurate and authorised these business details to be public.</span></label><div className="flex flex-wrap gap-3"><button className={primary} disabled={!reviewed || !!busy} onClick={() => void run("publish")}>Publish website</button>{published && <button className={secondary} onClick={() => { if (window.confirm("Take the website offline? Your draft will be kept.")) void run("unpublish") }}>Unpublish website</button>}</div><p className="text-xs leading-6 text-muted-foreground">Your address is reserved. Public subdomains also require MySaji’s domain and secure hosting setup to be active. Unpublishing stops serving the site, though search engines and external caches may retain older information temporarily.</p></>}
    </fieldset>
  </div>
}

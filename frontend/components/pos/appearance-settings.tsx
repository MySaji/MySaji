"use client"

import { useEffect, useState } from "react"
import { Check, Loader2, Palette, Save, ShieldCheck, ShoppingCart } from "lucide-react"
import { updatePosConfig } from "@/backend/actions/pos"
import { DEFAULT_TILL_COLOR, isTillColor, TILL_COLOR_PRESETS } from "@/backend/domain/pos-theme"
import { useTillTheme } from "@/frontend/components/pos/theme-provider"

export function AppearanceSettings({ active }: { active: boolean }) {
  const theme = useTillTheme()
  const { preview, canCustomize } = theme
  const [draft, setDraft] = useState(theme.color)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)
  const valid = isTillColor(draft)
  const dirty = draft.toLowerCase() !== theme.color.toLowerCase()
  useEffect(() => { setDraft(theme.color) }, [theme.color, theme.scope])
  useEffect(() => {
    preview(active && valid && canCustomize ? draft : null)
    return () => preview(null)
  }, [active, valid, draft, canCustomize, preview])
  const change = (color: string) => { setDraft(color); setSaved(false); setError("") }
  const save = async () => {
    if (!valid || !theme.canCustomize) return
    setBusy(true); setError("")
    try {
      const result = await updatePosConfig({ primaryColor: draft.toLowerCase() })
      if (!result.success) { setError(result.error); return }
      await theme.refresh()
      setSaved(true)
    } catch { setError("Could not finish updating the theme. Check your connection and retry.") }
    finally { setBusy(false) }
  }
  return <section aria-label="Till appearance" className="space-y-5">
    <div><h2 className="text-lg font-semibold tracking-tight">Make Till your own</h2><p className="mt-1 text-xs text-muted-foreground">Your primary colour carries across navigation, buttons, selected items and charts for this store.</p></div>
    {!theme.canCustomize && <p className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0" />Only the POS owner can change the theme colour. Employees use the saved store theme.</p>}
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="rounded-2xl border border-border bg-background p-5"><h3 className="flex items-center gap-2 text-sm font-semibold"><Palette className="h-4 w-4 text-primary" />Primary colour</h3><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Choose a palette or enter your brand’s hex colour. Changes preview immediately; save to apply them to this store and its employees.</p><div className="mt-5 grid grid-cols-4 gap-3">{TILL_COLOR_PRESETS.map(preset => <button key={preset.color} type="button" disabled={!theme.canCustomize || busy} onClick={() => change(preset.color)} aria-label={`Choose ${preset.name}`} aria-pressed={draft.toLowerCase() === preset.color} className="rounded-xl border border-border p-2 disabled:opacity-50"><span style={{ background: preset.color }} className="flex h-10 items-center justify-center rounded-lg">{draft.toLowerCase() === preset.color && <Check className="h-4 w-4 text-white" />}</span><span className="mt-2 block text-[10px] text-muted-foreground">{preset.name}</span></button>)}</div><div className="mt-5 flex items-end gap-3"><label className="text-xs font-medium">Custom colour<input aria-label="Pick primary colour" type="color" value={valid ? draft : theme.color} disabled={!theme.canCustomize || busy} onChange={event => change(event.target.value)} className="mt-2 block h-11 w-16 cursor-pointer rounded-lg border border-border bg-background p-1" /></label><label className="min-w-0 flex-1 text-xs font-medium">Hex code<input aria-label="Primary colour hex code" value={draft} maxLength={7} disabled={!theme.canCustomize || busy} onChange={event => change(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 font-mono text-sm" /></label></div>{!valid && <p role="alert" className="mt-2 text-xs text-rose-600">Enter # followed by six hexadecimal digits.</p>}<div className="mt-5 flex flex-wrap gap-2"><button onClick={() => void save()} disabled={!theme.canCustomize || !valid || !dirty || busy} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save theme</button><button disabled={!theme.canCustomize || busy} onClick={() => change(theme.color)} className="rounded-xl border border-border px-4 text-xs font-medium disabled:opacity-50">Discard preview</button><button disabled={!theme.canCustomize || busy} onClick={() => change(DEFAULT_TILL_COLOR)} className="px-2 text-[11px] text-muted-foreground disabled:opacity-50">Default blue</button></div>{error && <p role="alert" className="mt-3 text-xs text-rose-600">{error}</p>}{saved && <p role="status" className="mt-3 text-xs text-emerald-600">Theme saved for this store.</p>}</div>
      <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-sm"><div className="flex items-center justify-between border-b border-border px-5 py-4"><p className="text-xs font-semibold">Live preview</p><span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] text-primary">{dirty ? "Unsaved preview" : "Saved theme"}</span></div><div className="grid min-h-72 grid-cols-[64px_minmax(0,1fr)]"><div className="flex flex-col items-center gap-4 border-r border-border bg-muted/20 py-5"><span className="rounded-xl bg-primary p-3 text-primary-foreground"><ShoppingCart className="h-5 w-5" /></span><span className="h-6 w-7 rounded-lg bg-primary/15" /><span className="h-6 w-7 rounded-lg bg-muted" /></div><div className="p-5"><p className="text-[10px] font-semibold uppercase tracking-widest text-primary">Your store</p><h3 className="mt-2 text-lg font-semibold">Ready for business</h3><p className="mt-2 text-xs text-muted-foreground">A consistent identity on every Till screen.</p><div className="mt-5 grid grid-cols-2 gap-2"><div className="rounded-xl border border-primary bg-primary/5 p-3"><span className="text-[10px] text-muted-foreground">Selected item</span><p className="mt-2 text-sm font-semibold">KSh 450</p></div><div className="flex items-end gap-1 rounded-xl bg-muted/30 p-3">{[40, 70, 55, 90, 65].map((height, index) => <span key={index} style={{ height }} className="w-full rounded-t bg-primary/70" />)}</div></div><button type="button" tabIndex={-1} className="mt-4 w-full rounded-xl bg-primary px-4 py-3 text-xs font-semibold text-primary-foreground">Take payment</button></div></div><p className="border-t border-border px-5 py-3 text-[10px] text-muted-foreground">Text contrast adapts automatically. Stock warnings keep their amber/red colours.</p></div>
    </div>
  </section>
}

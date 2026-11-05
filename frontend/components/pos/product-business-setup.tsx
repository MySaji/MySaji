"use client"

import { useEffect, useState } from "react"
import { getProductBusinessSetup, saveProductBusinessSetup } from "@/backend/actions/pos-product-setup"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/frontend/components/ui/dialog"
import { Input } from "@/frontend/components/ui/input"
import { Button } from "@/frontend/components/ui/button"

type Setup = Extract<Awaited<ReturnType<typeof getProductBusinessSetup>>, { success: true }>["data"]
type Option = { id?: string; label: string; sku: string; barcode: string; price: string; isActive: boolean; openingStock: string; stock?: number }

export function ProductBusinessSetup({ productId, name, startWithOptions = false, onClose, onSaved }: { productId: string; name: string; startWithOptions?: boolean; onClose: () => void; onSaved: () => void }) {
  const [data, setData] = useState<Setup | null>(null)
  const [options, setOptions] = useState<Option[]>([])
  const [flags, setFlags] = useState({ hasVariants: false, tracksBatches: false, tracksSerials: false, controlled: false, madeToOrder: false })
  const [duration, setDuration] = useState("60"), [commission, setCommission] = useState("0")
  const [fitment, setFitment] = useState(""), [bulkUnit, setBulkUnit] = useState(""), [units, setUnits] = useState("")
  const [error, setError] = useState(""), [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    getProductBusinessSetup(productId).then(result => {
      if (!active) return
      if (!result.success) { setError(result.error); return }
      const next = result.data
      setData(next); setFlags({ hasVariants: next.hasVariants || (startWithOptions && next.features.variants), tracksBatches: next.tracksBatches, tracksSerials: next.tracksSerials, controlled: next.controlled, madeToOrder: next.madeToOrder })
      setOptions(next.variants.length ? next.variants.map(v => ({ ...v, price: v.price === null ? "" : String(v.price), openingStock: "" })) : startWithOptions && next.features.variants ? [{ label: "", sku: "", barcode: "", price: "", isActive: true, openingStock: "" }] : [])
      setDuration(String(next.durationMinutes)); setCommission(String((next.commissionBps ?? 0) / 100)); setFitment(next.fitsWith.join("\n")); setBulkUnit(next.bulkUnit ?? ""); setUnits(next.unitsPerBulk === null ? "" : String(next.unitsPerBulk))
    }).catch(() => { if (active) setError("Could not load item setup. Close and try again.") })
    return () => { active = false }
  }, [productId, startWithOptions])
  const updateOption = (index: number, patch: Partial<Option>) => setOptions(current => current.map((value, at) => at === index ? { ...value, ...patch } : value))
  const save = async () => {
    if (!data || busy) return
    if (data.features.salon && data.isService && data.canManageSalon && !/^\d+(\.\d{1,2})?$/.test(commission.trim())) { setError("Enter a commission percentage with up to two decimal places; use 0 for none."); return }
    setBusy(true); setError("")
    try {
      const result = await saveProductBusinessSetup({ productId, version: data.updatedAt, activateWhenReady: startWithOptions, ...flags, fitsWith: fitment.split("\n").map(v => v.trim()).filter(Boolean), bulkUnit, unitsPerBulk: units.trim() ? Number(units) : null,
        ...(data.features.salon && data.isService && data.canManageSalon ? { durationMinutes: Number(duration), commissionBps: Math.round(Number(commission) * 100) } : {}),
        variants: options.map(v => ({ ...(v.id ? { id: v.id } : {}), label: v.label, sku: v.sku, barcode: v.barcode, price: v.price.trim() ? Number(v.price) : null, isActive: v.isActive, openingStock: v.openingStock.trim() ? Number(v.openingStock) : 0 })),
      })
      if (!result.success) { setError(result.error); return }
      onSaved()
    } catch { setError("Could not confirm the save. Close and reopen setup before trying again.") }
    finally { setBusy(false) }
  }
  const addOption = () => { setFlags(current => ({ ...current, hasVariants: true })); setOptions(current => [...current, { label: "", sku: "", barcode: "", price: "", isActive: true, openingStock: "" }]) }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}><DialogContent className="sm:max-w-3xl" showCloseButton={!busy} onPointerDownOutside={event => { if (busy) event.preventDefault() }} onEscapeKeyDown={event => { if (busy) event.preventDefault() }}><DialogTitle>Business setup: {name}</DialogTitle><DialogDescription>Configure the options and tracking this business needs. Existing stock and transaction history are protected.{startWithOptions && " This new item stays paused until you save its options."}</DialogDescription>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {!data && !error && <p role="status">Loading business setup...</p>}
    {data && <fieldset disabled={busy || !data.canEdit} className="min-w-0 space-y-6">
      <section className="space-y-3 rounded-xl border p-4"><h3 className="font-semibold">Selling and stock tracking</h3><div className="grid gap-3 sm:grid-cols-2">
        {([
          ["hasVariants", "Sizes, colours and options", data.features.variants || data.hasVariants],
          ["tracksBatches", "Track batches and expiry", !data.isService && (data.features.batches || data.tracksBatches)],
          ["tracksSerials", "Track serial numbers / IMEIs", !data.isService && (data.features.serials || data.tracksSerials)],
          ["controlled", "Controlled goods register", !data.isService && (data.features.traits.includes("CONTROLLED") || data.controlled)],
          ["madeToOrder", "Made to order / deposit eligible", data.features.deposits || data.madeToOrder],
        ] as const).filter(([, , show]) => show).map(([key, label]) => <label key={key} className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={flags[key]} disabled={["hasVariants", "tracksBatches", "tracksSerials"].includes(key) && data[key]} onChange={event => setFlags(current => ({ ...current, [key]: event.target.checked }))} />{label}</label>)}
      </div><p className="text-xs leading-5 text-muted-foreground">Enable additional selling features in Settings. Tracking changes require zero existing stock. Once enabled, stock tracking stays attached to the item; pause individual options instead. Receive batch and serial stock through their stock intake workflows.</p></section>
      {(data.features.variants || data.hasVariants) && <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Sizes, colours and sellable options</h3><Button type="button" variant="outline" disabled={!data.features.variants || options.length >= 100} onClick={addOption}>Add option</Button></div>
        {options.map((option, index) => <div key={option.id ?? `new-${index}`} className="grid min-w-0 gap-3 rounded-xl border p-4 sm:grid-cols-2"><label className="text-sm">Option label<Input aria-label={`Option ${index + 1} label`} value={option.label} maxLength={120} placeholder="Red / M, size 42, 500 ml" onChange={event => updateOption(index, { label: event.target.value })} /></label><label className="text-sm">Price override<Input aria-label={`Option ${index + 1} price`} type="number" min="0" step="0.01" disabled={!data.canPrice} placeholder="Use product price" value={option.price} onChange={event => updateOption(index, { price: event.target.value })} /></label><label className="text-sm">SKU / option code<Input aria-label={`Option ${index + 1} code`} value={option.sku} maxLength={40} onChange={event => updateOption(index, { sku: event.target.value })} /></label><label className="text-sm">Barcode<Input aria-label={`Option ${index + 1} barcode`} value={option.barcode} maxLength={60} onChange={event => updateOption(index, { barcode: event.target.value })} /></label>{!option.id && data.canAdjustStock && !data.isService && !flags.tracksBatches && !flags.tracksSerials && <label className="text-sm">Opening quantity<Input aria-label={`Option ${index + 1} opening quantity`} type="number" min="0" step="0.001" value={option.openingStock} onChange={event => updateOption(index, { openingStock: event.target.value })} /></label>}{option.id && <p className="text-sm text-muted-foreground">Recorded stock: {option.stock}. Adjust through Inventory.</p>}<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={option.isActive} onChange={event => updateOption(index, { isActive: event.target.checked })} />Available for sale</label>{!option.id && <Button type="button" variant="outline" onClick={() => setOptions(current => current.filter((_, at) => at !== index))}>Remove unsaved option</Button>}</div>)}
        {!options.length && <p className="text-sm text-muted-foreground">Add each size, colour or pack as its own option. Stock and barcodes remain separate.</p>}
      </section>}
      {data.features.salon && data.isService && data.canManageSalon && <section className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2"><h3 className="font-semibold sm:col-span-2">Salon service rules</h3><label className="text-sm">Duration in minutes<Input aria-label="Service duration in minutes" type="number" min="5" max="720" step="1" value={duration} onChange={event => setDuration(event.target.value)} /></label><label className="text-sm">Stylist commission (%)<Input aria-label="Stylist commission percentage" type="number" min="0" max="100" step="0.01" value={commission} onChange={event => setCommission(event.target.value)} /></label><p className="text-xs text-muted-foreground sm:col-span-2">New appointments use these rules. Completed work and existing appointment quotes remain unchanged.</p></section>}
      {(data.features.traits.includes("FITMENT") || data.fitsWith.length > 0) && <label className="block text-sm">Compatible models (one per line)<textarea aria-label="Compatible models" rows={3} value={fitment} onChange={event => setFitment(event.target.value)} className="mt-1 w-full rounded-lg border bg-background p-3" /></label>}
      {(data.features.traits.includes("BULK_BREAK") || data.bulkUnit) && <section className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Bulk purchase unit<Input aria-label="Bulk purchase unit" value={bulkUnit} placeholder="bale, carton, drum" onChange={event => setBulkUnit(event.target.value)} /></label><label className="text-sm">Selling units per bulk pack<Input aria-label="Selling units per bulk pack" type="number" min="0.001" step="0.001" value={units} onChange={event => setUnits(event.target.value)} /></label></section>}
      <div className="flex flex-wrap justify-end gap-3"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="button" disabled={busy} onClick={() => void save()}>{busy ? "Saving setup..." : "Save business setup"}</Button></div>
    </fieldset>}
  </DialogContent></Dialog>
}

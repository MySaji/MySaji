"use client"

import { useEffect, useState } from "react"
import type { PosConfig } from "@/backend/domain/pos-config"
import { PosCard } from "@/frontend/components/pos/workspace-ui"

export function VatSettings({ config, busy, onSave }: { config: PosConfig; busy: boolean; onSave: (patch: Record<string, unknown>) => void }) {
  const [rate, setRate] = useState(String(config.taxRate))
  const [inclusive, setInclusive] = useState(config.taxInclusive)
  const [pin, setPin] = useState(config.taxPin ?? "")
  useEffect(() => { setRate(String(config.taxRate)); setInclusive(config.taxInclusive); setPin(config.taxPin ?? "") }, [config.taxRate, config.taxInclusive, config.taxPin])
  const valid = rate.trim() !== "" && Number.isFinite(Number(rate)) && Number(rate) >= 0 && Number(rate) <= 100
  const dirty = Number(rate) !== config.taxRate || inclusive !== config.taxInclusive || pin.trim() !== (config.taxPin ?? "")
  return <PosCard className="space-y-4 p-5"><div><h2 className="text-sm font-semibold">VAT & receipt details</h2><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Set the VAT rate that applies to this Till. Zero leaves VAT off the receipt. New receipts retain the rate and points balance recorded at sale.</p></div><div className="grid gap-4 sm:grid-cols-2"><label className="text-xs font-medium">VAT rate (%)<input aria-label="VAT rate" type="number" min="0" max="100" step="0.01" value={rate} onChange={event => setRate(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3" /></label><label className="text-xs font-medium">Business tax PIN (optional)<input aria-label="Business tax PIN" maxLength={30} value={pin} onChange={event => setPin(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3" /></label></div><label className="flex items-start gap-3 text-xs"><input type="checkbox" checked={inclusive} onChange={event => setInclusive(event.target.checked)} className="mt-0.5" /><span>Prices already include VAT<span className="mt-1 block text-[11px] text-muted-foreground">When unchecked, VAT is added to the basket before payment. The receipt shows the amount excluding VAT, VAT amount and final total.</span></span></label><p className="text-[11px] text-muted-foreground">Use eTIMS settings to configure signed tax invoices.</p><button disabled={busy || !valid || !dirty} onClick={() => onSave({ taxRate: Number(rate), taxInclusive: inclusive, taxPin: pin.trim() })} className="h-10 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Saving..." : "Save VAT settings"}</button></PosCard>
}

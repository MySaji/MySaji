"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import {
  ArrowLeft, Loader2, Plus, X, Mic, MicOff, Sparkles, Star, ShieldCheck,
  FileText, Upload, CheckCircle2, AlertTriangle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Card } from "@/components/ui/card"
import {
  saveOfferStep, getOfferDraft, extractOfferFromDescription, checkOfferLicenseRequirement,
  getOfferCategoryOptions, getOfferAttributeFields, publishOffer,
  suggestOfferCopy, getOfferPriceBand, getOfferDemandSignal, getOfferImageGuidance,
  type OfferCategoryOption, type OfferDraftDetail, type OfferLicenseCheck,
} from "@/lib/actions/offers"
import type { PriceBand, DemandSignal } from "@/lib/ai/offer-enhancement"
import type { ImageGuidance } from "@/lib/offer-image-guidance"
import { getMyCertifications, getMySkills, type ProviderCertification } from "@/lib/actions/provider-credentials"
import { getProviderAvailability } from "@/lib/actions/provider-availability"
import {
  OFFER_ACTION_LABEL, OFFER_PRICING_LABEL, OFFER_PRICING_MODELS, PRICELESS_PRICING_MODELS,
  OFFER_AVAILABILITY_LABEL, OFFER_AVAILABILITY_STATUSES, OFFER_FULFILMENT_LABEL, OFFER_FULFILMENT_METHODS,
  type OfferActionType, type OfferPricingModel, type OfferAvailabilityStatus, type OfferFulfilmentMethod, type OfferDocument,
} from "@/lib/offer-constants"
import type { OfferAttributeFieldDef } from "@/lib/offer-attribute-schema"
import { useLocalization } from "@/lib/hooks/useLocalization"

const TOTAL_STEPS = 10
const STEP_TITLES = [
  "Describe Your Offer", "SAJI Understands", "Offer Details", "Price & Availability", "Location & Fulfilment",
  "What's Included", "Customer Actions", "Add Proof", "Preview Offer", "Publish Offer",
]
const ACTION_TYPES: OfferActionType[] = ["BOOK", "HIRE", "BUY", "QUOTE", "REQUEST", "RENT"]

type WizardData = {
  id: string | null
  title: string
  description: string
  images: string[]
  categoryId: string
  actionType: OfferActionType
  attributes: Record<string, string | number | string[]>
  minimumOrder: string
  price: string
  pricingModel: OfferPricingModel
  unitLabel: string
  bulkPricingNote: string
  availabilityStatus: OfferAvailabilityStatus
  fulfilmentMethods: OfferFulfilmentMethod[]
  serviceArea: string
  radiusKm: string
  depositAmount: string
  includedItems: string[]
  excludedItems: string[]
  documents: OfferDocument[]
}

const EMPTY_DATA: WizardData = {
  id: null, title: "", description: "", images: [], categoryId: "", actionType: "BOOK",
  attributes: {}, minimumOrder: "", price: "", pricingModel: "FIXED", unitLabel: "", bulkPricingNote: "",
  availabilityStatus: "IN_STOCK", fulfilmentMethods: [], serviceArea: "", radiusKm: "", depositAmount: "", includedItems: [], excludedItems: [], documents: [],
}

type SpeechRecognitionLike = {
  lang: string; continuous: boolean; interimResults: boolean
  onresult: ((event: any) => void) | null; onerror: ((event: any) => void) | null; onend: (() => void) | null
  start: () => void; stop: () => void
}
function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null
}

function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })
}

// Enforced here so the provider gets an immediate, specific error instead
// of a silent failure or (worse) a multi-MB upload that only gets rejected
// after the round-trip to saveOfferStep's own server-side size cap — this
// is a UX check, not the real enforcement point (that's server-side, since
// a client check alone is trivially bypassable by calling the action
// directly).
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]
const ALLOWED_DOCUMENT_TYPES = ["application/pdf", ...ALLOWED_IMAGE_TYPES]

function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(0)}MB`
}

function TagList({ items, onChange, placeholder }: { items: string[]; onChange: (items: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState("")
  const add = () => {
    const v = draft.trim()
    if (!v) return
    onChange([...items, v])
    setDraft("")
  }
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add() } }} placeholder={placeholder} className="rounded-xl" />
        <Button type="button" variant="outline" className="rounded-xl bg-transparent flex-shrink-0" onClick={add}><Plus className="h-4 w-4" /></Button>
      </div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item, i) => (
            <span key={`${item}-${i}`} className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
              {item}
              <button type="button" onClick={() => onChange(items.filter((_, idx) => idx !== i))} aria-label={`Remove ${item}`}><X className="h-3 w-3 text-muted-foreground" /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/** The real customer-facing card shape (mirrors MixedFeedCard/toOfferCard's
 * visual language), fed by the wizard's in-progress state — reused both as
 * Step 9's actual preview and, on desktop where there's real room for it,
 * as a live sidebar so the provider sees their offer take shape while
 * filling in every earlier step too, instead of that space sitting empty. */
function OfferPreviewCard({ data, selectedCategory, formatMoney }: { data: WizardData; selectedCategory: OfferCategoryOption | null; formatMoney: (n: number) => string }) {
  return (
    <Card className="overflow-hidden border border-border/70 shadow-sm">
      <div className="relative aspect-[16/10] bg-muted/30">
        {data.images[0] && <Image src={data.images[0]} alt={data.title ? `Photo for ${data.title}` : "Offer photo"} fill className="object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        <span className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-2.5 py-1 text-[11px] font-semibold text-white">
          <ShieldCheck className="h-3 w-3" /> Saji Pro
        </span>
      </div>
      <div className="p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-foreground">{data.title || "Untitled offer"}</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">{selectedCategory?.name ?? "No category"}</p>
          </div>
          {data.price && (
            <div className="rounded-full bg-primary/10 px-2.5 py-1 text-sm font-semibold text-primary">
              {formatMoney(Number(data.price))}{data.actionType === "RENT" ? <span className="font-normal">/day</span> : null}
            </div>
          )}
        </div>
        {data.actionType === "RENT" && Number(data.depositAmount) > 0 && (
          <p className="mb-2 text-xs text-muted-foreground">Plus a refundable {formatMoney(Number(data.depositAmount))} deposit</p>
        )}
        {(data.attributes.youOffer as string[] | undefined)?.length ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {(data.attributes.youOffer as string[]).map((t) => <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{t}</span>)}
          </div>
        ) : null}
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> New listing</span>
          {data.fulfilmentMethods.length > 0 && <span>{data.fulfilmentMethods.map((m) => OFFER_FULFILMENT_LABEL[m]).join(" · ")}</span>}
        </div>
        <p className="text-xs font-medium text-muted-foreground">{OFFER_AVAILABILITY_LABEL[data.availabilityStatus]}</p>
        <Button size="sm" className="mt-3 w-full rounded-lg" tabIndex={-1}>{OFFER_ACTION_LABEL[data.actionType]}</Button>
      </div>
    </Card>
  )
}

/** Mobile stays a single centered column (the sticky header/footer never
 * change width); lg: and up gains a second column with a live preview so
 * the extra desktop width is actually doing something, not just a wider
 * empty margin around the same phone-shaped form. `preview` is omitted on
 * Step 9 itself, since the main content there already IS the preview. */
function StepChrome({ step, title, onBack, children, footer, preview }: { step: number; title: string; onBack: () => void; children: React.ReactNode; footer: React.ReactNode; preview?: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background pb-36 lg:pb-28">
      <div className="sticky top-0 z-30 bg-card border-b border-border px-4 py-3">
        <div className={`mx-auto flex items-center gap-3 max-w-xl ${preview ? "lg:max-w-4xl" : ""}`}>
          <button onClick={onBack} aria-label="Back" className="rounded-lg p-1.5 hover:bg-muted flex-shrink-0"><ArrowLeft className="h-5 w-5" /></button>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-muted-foreground">STEP {step}</p>
            <h1 className="truncate text-base font-bold text-foreground">{title}</h1>
          </div>
          <span className="flex-shrink-0 text-xs font-semibold text-primary">{step}/{TOTAL_STEPS}</span>
        </div>
        <div className={`mx-auto mt-2 max-w-xl ${preview ? "lg:max-w-4xl" : ""}`}>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={TOTAL_STEPS} aria-label={`Step ${step} of ${TOTAL_STEPS}`}>
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(step / TOTAL_STEPS) * 100}%` }} />
          </div>
        </div>
      </div>

      {preview ? (
        <div className="mx-auto max-w-xl px-4 py-5 lg:grid lg:max-w-4xl lg:grid-cols-[1fr_340px] lg:gap-8">
          <div>{children}</div>
          <div className="hidden lg:block">
            <div className="sticky top-24 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Live Preview</p>
              {preview}
            </div>
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-xl px-4 py-5">{children}</div>
      )}

      {/* The provider portal's mobile bottom nav (components/provider-sidebar.tsx)
          is a persistent `fixed bottom-0 ... z-40` bar on every provider page.
          Docking this footer at bottom-0 too put the Continue button directly
          underneath it — same screen region, lower z-index, so it was never
          actually visible on mobile even though it rendered fine. Sits above
          the nav bar's ~64px height on mobile; reverts to flush bottom-0 on
          desktop (lg:) where that nav bar is hidden. */}
      <div className="fixed inset-x-0 bottom-16 z-50 border-t border-border bg-card px-4 py-3 lg:bottom-0">
        <div className={`mx-auto max-w-xl ${preview ? "lg:max-w-4xl" : ""}`}>{footer}</div>
      </div>
    </div>
  )
}

function CreateOfferWizard() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { formatMoney } = useLocalization()
  const draftId = searchParams.get("id")
  // "New Rental" on the Rental Bookings page links here with
  // ?actionType=RENT so a fresh draft starts pre-set to Rent instead of
  // making the provider remember to pick it manually all the way down in
  // Step 7 — only applied to a brand-new draft, never overrides a resumed
  // one's real saved actionType.
  const seedActionType = searchParams.get("actionType")

  const [step, setStep] = useState(1)
  const [data, setData] = useState<WizardData>(EMPTY_DATA)
  const [categories, setCategories] = useState<OfferCategoryOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState("")

  // Step 2 AI state
  const [aiState, setAiState] = useState<"idle" | "loading" | "simulated" | "failed" | "done">("idle")
  const [aiTags, setAiTags] = useState<{ youOffer: string[]; youServe: string[]; location: string | null }>({ youOffer: [], youServe: [], location: null })

  // Copy polish (Step 2) and the market signals shown on the pricing step.
  // All three are advisory: the provider keeps whatever they typed unless they
  // explicitly accept a suggestion, and every one of them degrades to hidden
  // rather than blocking if the call fails or the API key is unset.
  const [polishState, setPolishState] = useState<"idle" | "loading" | "done" | "unavailable">("idle")
  const [polishedTitle, setPolishedTitle] = useState<string | null>(null)
  const [priceBand, setPriceBand] = useState<PriceBand | null>(null)
  const [demand, setDemand] = useState<DemandSignal | null>(null)
  const [shots, setShots] = useState<ImageGuidance | null>(null)

  // Step 8 verification state
  const [licenseCheck, setLicenseCheck] = useState<OfferLicenseCheck>({ required: false })
  const [certifications, setCertifications] = useState<ProviderCertification[]>([])

  // Step 5 — the provider's profile defaults, used to prefill serviceArea/
  // radiusKm the first time a fresh draft reaches this step; once the
  // provider has their own value (typed or resumed from a draft) this is
  // just shown as a hint, never overwrites what's already there.
  const [providerDefaults, setProviderDefaults] = useState<{ workArea: string | null; radiusKm: number | null } | null>(null)

  // Step 3 — real admin-managed fields for the selected category.
  const [attributeFields, setAttributeFields] = useState<OfferAttributeFieldDef[]>([])
  const [attributeFieldsLoading, setAttributeFieldsLoading] = useState(false)

  const [isListening, setIsListening] = useState(false)
  const [voiceSupported, setVoiceSupported] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const [isPublishing, setIsPublishing] = useState(false)

  useEffect(() => {
    setVoiceSupported(getSpeechRecognitionCtor() !== null)
    return () => recognitionRef.current?.stop()
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const cats = await getOfferCategoryOptions()
      if (cancelled) return
      setCategories(cats)

      if (draftId) {
        const draft = await getOfferDraft(draftId)
        if (draft && !cancelled) {
          setData({
            id: draft.id, title: draft.title, description: draft.description, images: draft.images,
            categoryId: draft.categoryId ?? "", actionType: draft.actionType, attributes: draft.attributes,
            minimumOrder: draft.minimumOrder ?? "", price: draft.price != null ? String(draft.price) : "",
            pricingModel: draft.pricingModel, unitLabel: draft.unitLabel ?? "", bulkPricingNote: draft.bulkPricingNote ?? "",
            availabilityStatus: draft.availabilityStatus, fulfilmentMethods: draft.fulfilmentMethods,
            serviceArea: draft.serviceArea ?? "", radiusKm: draft.radiusKm != null ? String(draft.radiusKm) : "",
            depositAmount: draft.depositAmount ? String(draft.depositAmount) : "",
            includedItems: draft.includedItems, excludedItems: draft.excludedItems, documents: draft.documents,
          })
          setStep(Math.min(draft.wizardStep, TOTAL_STEPS))
          if (draft.title) setAiState("done")
        }
      } else if (seedActionType === "RENT") {
        setData((p) => ({ ...p, actionType: "RENT" }))
      }
      setIsLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [draftId])

  const selectedCategory = categories.find((c) => c.id === data.categoryId) ?? null

  const toggleVoice = () => {
    if (isListening) { recognitionRef.current?.stop(); return }
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) return
    const recognition = new Ctor()
    recognition.lang = "en-US"
    recognition.continuous = false
    recognition.interimResults = false
    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript as string | undefined
      if (transcript) setData((p) => ({ ...p, description: p.description ? `${p.description} ${transcript}` : transcript }))
    }
    recognition.onerror = () => setIsListening(false)
    recognition.onend = () => setIsListening(false)
    recognitionRef.current = recognition
    setIsListening(true)
    recognition.start()
  }

  const handleAddImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, 10 - data.images.length)
    e.target.value = ""
    if (files.length === 0) return

    const valid: File[] = []
    const rejected: string[] = []
    for (const file of files) {
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) rejected.push(`${file.name} (unsupported file type)`)
      else if (file.size > MAX_IMAGE_BYTES) rejected.push(`${file.name} (over ${formatMB(MAX_IMAGE_BYTES)})`)
      else valid.push(file)
    }
    if (rejected.length > 0) setError(`Couldn't add: ${rejected.join(", ")}`)
    else setError("")
    if (valid.length === 0) return

    const uris = await Promise.all(valid.map(fileToDataUri))
    setData((p) => ({ ...p, images: [...p.images, ...uris] }))
  }

  const handleAddDocument = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return

    if (!ALLOWED_DOCUMENT_TYPES.includes(file.type)) { setError(`Couldn't add ${file.name} — only PDF or image files are supported.`); return }
    if (file.size > MAX_DOCUMENT_BYTES) { setError(`Couldn't add ${file.name} — files must be under ${formatMB(MAX_DOCUMENT_BYTES)}.`); return }
    setError("")

    const url = await fileToDataUri(file)
    setData((p) => ({ ...p, documents: [...p.documents, { name: file.name, url }] }))
  }

  const runExtraction = async () => {
    setAiState("loading")
    const result = await extractOfferFromDescription(data.description)
    if (result.simulated) { setAiState("simulated"); return }
    if (!result.data) { setAiState("failed"); return }
    const d = result.data
    setData((p) => ({
      ...p,
      title: p.title || d.title || "",
      categoryId: p.categoryId || (d.categoryName ? (categories.find((c) => c.name === d.categoryName)?.id ?? "") : ""),
      fulfilmentMethods: p.fulfilmentMethods.length > 0 ? p.fulfilmentMethods : d.fulfilment,
    }))
    setAiTags({ youOffer: d.youOffer, youServe: d.youServe, location: d.location })
    setAiState("done")
  }

  useEffect(() => {
    if (step === 2 && aiState === "idle" && data.description) runExtraction()
    // Market signals are real counts over live rows, so they are cheap and
    // always safe to show — no model involved. Loaded when the pricing step
    // opens rather than up front, since they need a chosen category.
    if (step === 8 && data.categoryId && shots === null) {
      getOfferImageGuidance(data.categoryId).then(setShots).catch(() => {})
    }
    if (step === 4 && data.categoryId && priceBand === null) {
      getOfferPriceBand(data.categoryId).then(setPriceBand).catch(() => {})
      getOfferDemandSignal(data.categoryId).then(setDemand).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  useEffect(() => {
    let cancelled = false
    Promise.all([getMySkills(), getProviderAvailability()]).then(([skills, avail]) => {
      if (cancelled) return
      setProviderDefaults({ workArea: skills?.workAreas[0] ?? null, radiusKm: avail?.travelRadiusKm ?? null })
    })
    return () => { cancelled = true }
  }, [])

  // Prefill serviceArea/radiusKm from the provider's profile defaults the
  // first time they're available, but only while the fields are still
  // genuinely blank — a resumed draft's real saved values (set in the load
  // effect above) must never be clobbered by this.
  useEffect(() => {
    if (!providerDefaults) return
    setData((p) => ({
      ...p,
      serviceArea: p.serviceArea || providerDefaults.workArea || p.serviceArea,
      radiusKm: p.radiusKm || (providerDefaults.radiusKm != null ? String(providerDefaults.radiusKm) : p.radiusKm),
    }))
  }, [providerDefaults])

  useEffect(() => {
    if (step !== 3 || !data.categoryId) return
    let cancelled = false
    setAttributeFieldsLoading(true)
    getOfferAttributeFields(data.categoryId).then((fields) => {
      if (!cancelled) { setAttributeFields(fields); setAttributeFieldsLoading(false) }
    })
    return () => { cancelled = true }
  }, [step, data.categoryId])

  useEffect(() => {
    if (step === 8 && data.categoryId) {
      checkOfferLicenseRequirement(data.categoryId).then(setLicenseCheck)
      getMyCertifications().then(setCertifications)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, data.categoryId])

  useEffect(() => {
    if (step === 10 && data.categoryId) checkOfferLicenseRequirement(data.categoryId).then(setLicenseCheck)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  const save = async (fields: Record<string, unknown>): Promise<boolean> => {
    setIsSaving(true)
    setError("")
    const result = await saveOfferStep({ id: data.id ?? undefined, step, ...fields })
    setIsSaving(false)
    if (!result.success) { setError(result.error); return false }
    if (!data.id) setData((p) => ({ ...p, id: result.id }))
    return true
  }

  const goBack = () => { if (step > 1) setStep((s) => s - 1); else router.push("/provider/offers") }
  const goNext = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS))

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  }

  const ContinueButton = ({ onClick, disabled, label = "Continue" }: { onClick: () => void; disabled?: boolean; label?: string }) => (
    <Button className="h-12 w-full rounded-xl text-base" disabled={disabled || isSaving} onClick={onClick}>
      {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : label}
    </Button>
  )

  // ============================= STEP 1 =============================
  if (step === 1) {
    return (
      <StepChrome step={1} title="Describe Your Offer" onBack={goBack} preview={<OfferPreviewCard data={data} selectedCategory={selectedCategory} formatMoney={formatMoney} />} footer={
        <ContinueButton disabled={!data.description.trim()} onClick={async () => { if (await save({ description: data.description, images: data.images })) goNext() }} />
      }>
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-bold text-foreground">What are you offering?</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Describe what you sell, provide, teach, or do.</p>
          </div>
          <div>
            <Textarea
              value={data.description}
              onChange={(e) => setData((p) => ({ ...p, description: e.target.value.slice(0, 500) }))}
              placeholder='I supply cement and steel to contractors and deliver around Nairobi.'
              className="min-h-[140px] rounded-xl"
            />
            <p className="mt-1 text-right text-xs text-muted-foreground">{data.description.length}/500</p>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-foreground">Add Photos</p>
            <div className="flex flex-wrap gap-2">
              {data.images.map((img, i) => (
                <div key={i} className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl bg-muted">
                  <Image src={img} alt={`Offer photo ${i + 1}`} fill className="object-cover" />
                  <button onClick={() => setData((p) => ({ ...p, images: p.images.filter((_, idx) => idx !== i) }))} aria-label={`Remove photo ${i + 1}`} className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5"><X className="h-3 w-3 text-white" /></button>
                </div>
              ))}
              {data.images.length < 10 && (
                <label className="flex h-20 w-20 flex-shrink-0 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-border text-muted-foreground hover:border-primary/40">
                  <Plus className="h-6 w-6" />
                  <input type="file" accept={ALLOWED_IMAGE_TYPES.join(",")} multiple className="hidden" onChange={handleAddImages} aria-label="Add photos" />
                </label>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">JPG, PNG, WebP or GIF, up to {formatMB(MAX_IMAGE_BYTES)} each.</p>
          </div>

          {voiceSupported && (
            <button type="button" onClick={toggleVoice} className={`flex w-full items-center gap-3 rounded-xl border p-3 transition-colors ${isListening ? "border-red-300 bg-red-50 dark:bg-red-900/10" : "border-border bg-muted/40"}`}>
              <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${isListening ? "bg-red-500" : "bg-emerald-600"} text-white`}>
                {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </span>
              <span className="text-left">
                <span className="block text-sm font-medium text-foreground">{isListening ? "Listening…" : "Speak instead"}</span>
                <span className="block text-xs text-muted-foreground">Press to record</span>
              </span>
            </button>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </StepChrome>
    )
  }

  // ============================= STEP 2 =============================
  if (step === 2) {
    return (
      <StepChrome step={2} title="SAJI Understands" onBack={goBack} preview={<OfferPreviewCard data={data} selectedCategory={selectedCategory} formatMoney={formatMoney} />} footer={
        <ContinueButton disabled={!data.title.trim() || !data.categoryId} label="Looks Right" onClick={async () => { if (await save({ title: data.title, categoryId: data.categoryId, attributes: { ...data.attributes, youOffer: aiTags.youOffer, youServe: aiTags.youServe } })) goNext() }} />
      }>
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-bold text-foreground">We understood your offer</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Please confirm or edit the details below.</p>
          </div>

          {aiState === "loading" && (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Reading your description…
            </div>
          )}
          {aiState === "simulated" && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-300">
              AI assistance isn't configured for this account yet — fill these in yourself below.
            </div>
          )}
          {aiState === "failed" && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-300">
              Couldn't analyze that automatically — fill these in yourself below.
            </div>
          )}

          <Card className="space-y-4 border-0 p-4 shadow-sm">
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="block text-xs font-medium text-muted-foreground">Offer Title</label>
                {data.title.trim() && polishState !== "unavailable" && (
                  <button
                    type="button"
                    disabled={polishState === "loading"}
                    onClick={async () => {
                      setPolishState("loading")
                      const result = await suggestOfferCopy({
                        title: data.title,
                        description: data.description,
                        categoryId: data.categoryId,
                        youOffer: aiTags.youOffer,
                      })
                      // "simulated" means no API key configured; a null payload
                      // means the call failed. Either way the control retires
                      // itself rather than showing an error the provider can do
                      // nothing about.
                      if (result.simulated || !result.data) { setPolishState("unavailable"); return }
                      setPolishedTitle(result.data.title)
                      setPolishState("done")
                    }}
                    className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                  >
                    {polishState === "loading" ? "Thinking…" : "Suggest a sharper title"}
                  </button>
                )}
              </div>
              <Input value={data.title} onChange={(e) => setData((p) => ({ ...p, title: e.target.value }))} placeholder="e.g. Cement & Steel Supply" className="rounded-xl" />

              {polishState === "done" && polishedTitle && polishedTitle !== data.title && (
                <div className="mt-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
                  <p className="text-xs text-muted-foreground">Suggested</p>
                  <p className="mt-0.5 text-sm font-medium text-foreground">{polishedTitle}</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setData((p) => ({ ...p, title: polishedTitle })); setPolishedTitle(null) }}
                      className="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                    >
                      Use this
                    </button>
                    <button
                      type="button"
                      onClick={() => setPolishedTitle(null)}
                      className="rounded-lg border border-border px-3 py-1 text-xs font-medium text-muted-foreground"
                    >
                      Keep mine
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Category</label>
              <select value={data.categoryId} onChange={(e) => setData((p) => ({ ...p, categoryId: e.target.value }))} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm">
                <option value="">Select a category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            {(aiTags.youOffer.length > 0 || aiTags.youServe.length > 0) && (
              <div className="grid grid-cols-2 gap-3 text-sm">
                {aiTags.youOffer.length > 0 && (
                  <div><p className="text-xs font-medium text-muted-foreground">You Offer</p><p className="text-foreground">{aiTags.youOffer.join(", ")}</p></div>
                )}
                {aiTags.youServe.length > 0 && (
                  <div><p className="text-xs font-medium text-muted-foreground">You Serve</p><p className="text-foreground">{aiTags.youServe.join(", ")}</p></div>
                )}
              </div>
            )}
          </Card>
          {aiState !== "loading" && aiState !== "idle" && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" /> {aiState === "done" ? "Saji used AI to help organize your offer." : "You can edit anything above before continuing."}
            </p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </StepChrome>
    )
  }

  // ============================= STEP 3 =============================
  if (step === 3) {
    const setAttr = (key: string, value: string | number | string[]) => setData((p) => ({ ...p, attributes: { ...p.attributes, [key]: value } }))
    return (
      <StepChrome step={3} title="Offer Details" onBack={goBack} preview={<OfferPreviewCard data={data} selectedCategory={selectedCategory} formatMoney={formatMoney} />} footer={
        <ContinueButton onClick={async () => { if (await save({ attributes: data.attributes, minimumOrder: data.minimumOrder })) goNext() }} />
      }>
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-bold text-foreground">Offer Details</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Tell us more about what you offer.</p>
          </div>

          {attributeFieldsLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading fields for this category…</div>
          )}

          {!attributeFieldsLoading && attributeFields.map((f) => (
            <div key={f.key}>
              <label className="mb-1.5 block text-sm font-medium text-foreground">{f.label}</label>
              {f.type === "select" && (
                <select value={String(data.attributes[f.key] ?? "")} onChange={(e) => setAttr(f.key, e.target.value)} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm">
                  <option value="">Select…</option>
                  {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              )}
              {f.type === "tags" && (
                <TagList items={(data.attributes[f.key] as string[]) ?? []} onChange={(v) => setAttr(f.key, v)} placeholder={f.placeholder ?? "Type and press Enter"} />
              )}
              {f.type === "number" && (
                <Input type="number" value={String(data.attributes[f.key] ?? "")} onChange={(e) => setAttr(f.key, e.target.value)} placeholder={f.placeholder} className="rounded-xl" />
              )}
              {(f.type === "text" || f.type === "textarea") && (
                <Input value={String(data.attributes[f.key] ?? "")} onChange={(e) => setAttr(f.key, e.target.value)} placeholder={f.placeholder} className="rounded-xl" />
              )}
              {f.type === "tags" && f.options && f.options.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {f.options.map((o) => (
                    <button key={o} type="button" onClick={() => { const cur = (data.attributes[f.key] as string[]) ?? []; if (!cur.includes(o)) setAttr(f.key, [...cur, o]) }} className="rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground hover:border-primary/40">+ {o}</button>
                  ))}
                </div>
              )}
            </div>
          ))}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Minimum order <span className="font-normal text-muted-foreground">(optional)</span></label>
            <Input value={data.minimumOrder} onChange={(e) => setData((p) => ({ ...p, minimumOrder: e.target.value }))} placeholder="e.g. 50 bags or 1 ton" className="rounded-xl" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </StepChrome>
    )
  }

  // ============================= STEP 4 =============================
  if (step === 4) {
    const isRental = data.actionType === "RENT"
    const isPriceless = !isRental && PRICELESS_PRICING_MODELS.includes(data.pricingModel)
    return (
      <StepChrome step={4} title="Price & Availability" onBack={goBack} preview={<OfferPreviewCard data={data} selectedCategory={selectedCategory} formatMoney={formatMoney} />} footer={
        <ContinueButton
          disabled={!isPriceless && !data.price}
          onClick={async () => { if (await save({ pricingModel: data.pricingModel, price: data.price ? Number(data.price) : undefined, unitLabel: data.unitLabel, bulkPricingNote: data.bulkPricingNote, availabilityStatus: data.availabilityStatus, depositAmount: isRental && data.depositAmount ? Number(data.depositAmount) : undefined })) goNext() }}
        />
      }>
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-bold text-foreground">Price & Availability</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{isRental ? "Set your daily rate and refundable deposit." : "Set how you price and when you are available."}</p>
          </div>

          {/* What comparable providers actually charge, and how much demand
              there is. Both are counts over real rows — no model is asked to
              guess a price. The band is withheld entirely when too few
              comparable offers exist for it to mean anything. */}
          {priceBand?.available && (
            <div className="rounded-xl border border-border bg-muted/40 p-3">
              <p className="text-sm font-medium text-foreground">
                Similar offers charge {formatMoney(priceBand.low)}–{formatMoney(priceBand.high)}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Typical is {formatMoney(priceBand.median)}, across {priceBand.comparables} live offers in this category. A guide, not a rule.
              </p>
            </div>
          )}

          {demand && demand.openRequests > 0 && (
            <p className="text-xs text-muted-foreground">
              {demand.openRequests} customer{demand.openRequests === 1 ? " is" : "s are"} currently requesting this category
              {demand.liveOffers > 0 ? `, against ${demand.liveOffers} live offer${demand.liveOffers === 1 ? "" : "s"}.` : "."}
            </p>
          )}

          {isRental ? (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Price per day (KES)</label>
              <Input type="number" value={data.price} onChange={(e) => setData((p) => ({ ...p, price: e.target.value, pricingModel: "PER_UNIT", unitLabel: "day" }))} placeholder="0" className="rounded-xl" />
            </div>
          ) : (
            <div>
              <p className="mb-2 text-sm font-medium text-foreground">Pricing Model</p>
              <div className="space-y-2">
                {OFFER_PRICING_MODELS.map((m) => (
                  <label key={m} className="flex items-center gap-3 rounded-xl border border-border p-3 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                    <input type="radio" name="pricingModel" checked={data.pricingModel === m} onChange={() => setData((p) => ({ ...p, pricingModel: m }))} className="h-4 w-4 accent-primary" />
                    <span className="text-sm text-foreground">{OFFER_PRICING_LABEL[m]}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {isRental && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Refundable deposit (KES) <span className="font-normal text-muted-foreground">(optional)</span></label>
              <Input type="number" value={data.depositAmount} onChange={(e) => setData((p) => ({ ...p, depositAmount: e.target.value }))} placeholder="0" className="rounded-xl" />
              <p className="mt-1 text-xs text-muted-foreground">Collected upfront with the rental fee, refunded to the customer's Wallet when you mark the item returned.</p>
            </div>
          )}

          {!isRental && !isPriceless && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Price (KES)</label>
              <Input type="number" value={data.price} onChange={(e) => setData((p) => ({ ...p, price: e.target.value }))} placeholder="0" className="rounded-xl" />
            </div>
          )}
          {!isRental && data.pricingModel === "PER_UNIT" && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Unit label</label>
              <Input value={data.unitLabel} onChange={(e) => setData((p) => ({ ...p, unitLabel: e.target.value }))} placeholder="e.g. per bag, per hour" className="rounded-xl" />
            </div>
          )}
          {data.pricingModel === "BULK" && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Bulk pricing</label>
              <Textarea value={data.bulkPricingNote} onChange={(e) => setData((p) => ({ ...p, bulkPricingNote: e.target.value }))} placeholder="Discounts available for large orders." className="rounded-xl" />
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-medium text-foreground">Availability</p>
            <select value={data.availabilityStatus} onChange={(e) => setData((p) => ({ ...p, availabilityStatus: e.target.value as OfferAvailabilityStatus }))} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm">
              {OFFER_AVAILABILITY_STATUSES.map((s) => <option key={s} value={s}>{OFFER_AVAILABILITY_LABEL[s]}</option>)}
            </select>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </StepChrome>
    )
  }

  // ============================= STEP 5 =============================
  if (step === 5) {
    const toggleFulfilment = (m: OfferFulfilmentMethod) => setData((p) => ({ ...p, fulfilmentMethods: p.fulfilmentMethods.includes(m) ? p.fulfilmentMethods.filter((x) => x !== m) : [...p.fulfilmentMethods, m] }))
    return (
      <StepChrome step={5} title="Location & Fulfilment" onBack={goBack} preview={<OfferPreviewCard data={data} selectedCategory={selectedCategory} formatMoney={formatMoney} />} footer={
        <ContinueButton disabled={data.fulfilmentMethods.length === 0} onClick={async () => { if (await save({ fulfilmentMethods: data.fulfilmentMethods, serviceArea: data.serviceArea, radiusKm: data.radiusKm ? Number(data.radiusKm) : undefined })) goNext() }} />
      }>
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-bold text-foreground">Location & Fulfilment</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Where do you operate and how do you deliver?</p>
          </div>

          <Card className="space-y-3 border-0 p-4 shadow-sm">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Service Area</label>
              <Input value={data.serviceArea} onChange={(e) => setData((p) => ({ ...p, serviceArea: e.target.value }))} placeholder="e.g. Nairobi" className="rounded-xl" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Radius</label>
              <Input type="number" value={data.radiusKm} onChange={(e) => setData((p) => ({ ...p, radiusKm: e.target.value }))} placeholder="e.g. 30" className="rounded-xl" />
              <p className="mt-1 text-xs text-muted-foreground">
                Defaults to your profile ({providerDefaults?.workArea ?? "no area set"}{providerDefaults?.radiusKm != null ? `, +${providerDefaults.radiusKm} km` : ""}) — override just for this offer, or <Link href="/provider/profile" className="font-medium text-primary">edit your profile default</Link>.
              </p>
            </div>
          </Card>

          <div>
            <p className="mb-2 text-sm font-medium text-foreground">How do customers receive your offer?</p>
            <div className="space-y-2">
              {OFFER_FULFILMENT_METHODS.map((m) => (
                <label key={m} className="flex items-center gap-3 rounded-xl border border-border p-3 cursor-pointer">
                  <Checkbox checked={data.fulfilmentMethods.includes(m)} onCheckedChange={() => toggleFulfilment(m)} />
                  <span className="text-sm text-foreground">{OFFER_FULFILMENT_LABEL[m]}</span>
                </label>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </StepChrome>
    )
  }

  // ============================= STEP 6 =============================
  if (step === 6) {
    return (
      <StepChrome step={6} title="What's Included" onBack={goBack} preview={<OfferPreviewCard data={data} selectedCategory={selectedCategory} formatMoney={formatMoney} />} footer={
        <ContinueButton onClick={async () => { if (await save({ includedItems: data.includedItems, excludedItems: data.excludedItems })) goNext() }} />
      }>
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-bold text-foreground">What's Included</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Help customers know what to expect.</p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">What's included?</label>
            <TagList items={data.includedItems} onChange={(v) => setData((p) => ({ ...p, includedItems: v }))} placeholder="e.g. Delivery to site" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">What's not included? <span className="font-normal text-muted-foreground">(optional)</span></label>
            <TagList items={data.excludedItems} onChange={(v) => setData((p) => ({ ...p, excludedItems: v }))} placeholder="e.g. Unloading" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </StepChrome>
    )
  }

  // ============================= STEP 7 =============================
  if (step === 7) {
    return (
      <StepChrome step={7} title="Customer Actions" onBack={goBack} preview={<OfferPreviewCard data={data} selectedCategory={selectedCategory} formatMoney={formatMoney} />} footer={
        <ContinueButton onClick={async () => { if (await save({ actionType: data.actionType })) goNext() }} />
      }>
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-bold text-foreground">Customer Actions</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Choose how customers can engage with you.</p>
          </div>
          <div className="space-y-2">
            {ACTION_TYPES.map((a) => (
              <label key={a} className="flex items-center gap-3 rounded-xl border border-border p-3 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <input type="radio" name="actionType" checked={data.actionType === a} onChange={() => setData((p) => ({ ...p, actionType: a }))} className="h-4 w-4 accent-primary" />
                <span className="text-sm text-foreground">{OFFER_ACTION_LABEL[a]}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {data.actionType === "RENT"
              ? "Customers pick dates, pay the rental fee plus deposit through Saji, and you manage pickup/return from Rental Bookings."
              : ["BOOK", "HIRE", "BUY"].includes(data.actionType)
                ? "Customers pay through Saji and a Job is created automatically."
                : "Customers send you a message instead of paying up front."}
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </StepChrome>
    )
  }

  // ============================= STEP 8 =============================
  if (step === 8) {
    return (
      <StepChrome step={8} title="Add Proof" onBack={goBack} preview={<OfferPreviewCard data={data} selectedCategory={selectedCategory} formatMoney={formatMoney} />} footer={
        <ContinueButton onClick={async () => { if (await save({ images: data.images, documents: data.documents })) goNext() }} />
      }>
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-bold text-foreground">Add Proof</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Build trust by showing your work.</p>
          </div>

          {/* What to photograph for this kind of offer. SAJI never supplies
              the images — a customer reads every listing photo as the
              provider's own work. */}
          {shots && shots.shots.length > 0 && (
            <div className="rounded-xl border border-border bg-muted/40 p-3">
              <p className="text-sm font-medium text-foreground">Photos that work well here</p>
              <ul className="mt-1.5 space-y-1">
                {shots.shots.map((s) => (
                  <li key={s} className="flex gap-2 text-xs text-muted-foreground"><span aria-hidden="true">·</span>{s}</li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-medium text-foreground">Photos</p>
            <div className="flex flex-wrap gap-2">
              {data.images.map((img, i) => (
                <div key={i} className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl bg-muted">
                  <Image src={img} alt={`Offer photo ${i + 1}`} fill className="object-cover" />
                  <button onClick={() => setData((p) => ({ ...p, images: p.images.filter((_, idx) => idx !== i) }))} aria-label={`Remove photo ${i + 1}`} className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5"><X className="h-3 w-3 text-white" /></button>
                </div>
              ))}
              {data.images.length < 10 && (
                <label className="flex h-20 w-20 flex-shrink-0 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-border text-muted-foreground hover:border-primary/40">
                  <Plus className="h-6 w-6" />
                  <input type="file" accept={ALLOWED_IMAGE_TYPES.join(",")} multiple className="hidden" onChange={handleAddImages} aria-label="Add photos" />
                </label>
              )}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-foreground">Documents <span className="font-normal text-muted-foreground">(optional)</span></p>
            <p className="mb-2 text-xs text-muted-foreground">PDF or image, up to {formatMB(MAX_DOCUMENT_BYTES)}.</p>
            <div className="space-y-2">
              {data.documents.map((doc, i) => (
                <div key={i} className="flex items-center gap-2 rounded-xl border border-border p-2.5">
                  <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate text-sm text-foreground">{doc.name}</span>
                  <button onClick={() => setData((p) => ({ ...p, documents: p.documents.filter((_, idx) => idx !== i) }))} aria-label={`Remove ${doc.name}`}><X className="h-4 w-4 text-muted-foreground" /></button>
                </div>
              ))}
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border p-3 text-sm text-muted-foreground hover:border-primary/40">
                <Upload className="h-4 w-4" /> Add document
                <input type="file" accept={ALLOWED_DOCUMENT_TYPES.join(",")} className="hidden" onChange={handleAddDocument} aria-label="Add document" />
              </label>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-foreground">Certifications / Licenses</p>
            {licenseCheck.required && (
              <div className={`mb-2 rounded-xl border p-3 text-xs ${licenseCheck.satisfied ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-900/10 dark:text-emerald-300" : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-300"}`}>
                {licenseCheck.satisfied
                  ? `Your approved ${licenseCheck.licenseName} covers this offer.`
                  : `This category requires a verified ${licenseCheck.licenseName} before it can go live.`}
              </div>
            )}
            {certifications.length > 0 ? (
              <div className="space-y-1.5">
                {certifications.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded-xl border border-border p-2.5 text-sm">
                    <span className="text-foreground">{c.name}</span>
                    <span className={`text-xs font-medium ${c.status === "approved" ? "text-emerald-600" : c.status === "pending" ? "text-amber-600" : "text-red-600"}`}>{c.status}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No certifications on file yet.</p>
            )}
            <Link href="/provider/profile/certifications" className="mt-2 inline-block text-xs font-medium text-primary">+ Add certificate</Link>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </StepChrome>
    )
  }

  // ============================= STEP 9 — PREVIEW =============================
  if (step === 9) {
    return (
      <StepChrome step={9} title="Preview Offer" onBack={goBack} footer={
        <ContinueButton label="Looks Good" onClick={async () => { if (await save({})) goNext() }} />
      }>
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-bold text-foreground">Preview Your Offer</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">This is how customers will see your offer.</p>
          </div>

          <OfferPreviewCard data={data} selectedCategory={selectedCategory} formatMoney={formatMoney} />
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </StepChrome>
    )
  }

  // ============================= STEP 10 — PUBLISH =============================
  const handlePublish = async () => {
    if (!data.id) return
    setIsPublishing(true)
    setError("")
    const result = await publishOffer({ id: data.id })
    setIsPublishing(false)
    if (!result.success) { setError(result.error); return }
    router.push("/provider/offers")
  }

  return (
    <StepChrome step={10} title="Publish Offer" onBack={goBack} preview={<OfferPreviewCard data={data} selectedCategory={selectedCategory} formatMoney={formatMoney} />} footer={
      <div className="space-y-2">
        <Button className="h-12 w-full rounded-xl text-base" disabled={isPublishing} onClick={handlePublish}>
          {isPublishing ? <Loader2 className="h-4 w-4 animate-spin" /> : (licenseCheck.required ? "Submit for Verification" : "Publish Offer")}
        </Button>
        <Button variant="outline" className="h-10 w-full rounded-xl bg-transparent" onClick={() => router.push("/provider/offers")}>Save as Draft</Button>
      </div>
    }>
      <div className="space-y-5">
        <div>
          <h2 className="text-lg font-bold text-foreground">Publish Your Offer</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Review and publish your offer.</p>
        </div>

        <Card className="space-y-3 border-0 p-4 shadow-sm">
          <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Offer Title</span><span className="text-sm font-medium text-foreground">{data.title}</span></div>
          <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Category</span><span className="text-sm font-medium text-foreground">{selectedCategory?.name ?? "—"}</span></div>
          <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Pricing</span><span className="text-sm font-medium text-foreground">{OFFER_PRICING_LABEL[data.pricingModel]}{data.price ? ` — ${formatMoney(Number(data.price))}` : ""}</span></div>
          <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Availability</span><span className="text-sm font-medium text-foreground">{OFFER_AVAILABILITY_LABEL[data.availabilityStatus]}</span></div>
          <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Customer Action</span><span className="text-sm font-medium text-foreground">{OFFER_ACTION_LABEL[data.actionType]}</span></div>
        </Card>

        {licenseCheck.required && (
          <Card className={`flex items-start gap-3 border-0 p-4 shadow-sm ${licenseCheck.satisfied ? "bg-emerald-50 dark:bg-emerald-900/10" : "bg-amber-50 dark:bg-amber-900/10"}`}>
            {licenseCheck.satisfied ? <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-600" /> : <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-600" />}
            <div>
              <p className={`text-sm font-semibold ${licenseCheck.satisfied ? "text-emerald-800 dark:text-emerald-300" : "text-amber-800 dark:text-amber-300"}`}>Verification Required</p>
              <p className={`mt-0.5 text-xs ${licenseCheck.satisfied ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}>
                {licenseCheck.satisfied
                  ? `We've verified your ${licenseCheck.licenseName} — you're clear to publish.`
                  : `We need to verify your ${licenseCheck.licenseName} before this offer can go live. Add it from Profile > Certifications and wait for admin approval.`}
              </p>
            </div>
          </Card>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </StepChrome>
  )
}

export default function CreateOfferWizardPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <CreateOfferWizard />
    </Suspense>
  )
}

"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { getTillLogoSettings, saveTillLogo } from "@/backend/actions/pos-install-logo"

type Settings = NonNullable<Awaited<ReturnType<typeof getTillLogoSettings>>>
export function BusinessLogoSettings() {
  const router = useRouter()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)
  const chooser = useRef(0)
  const cancelChoice = useCallback(() => { chooser.current++ }, [])
  useEffect(() => { let current = true; getTillLogoSettings().then(value => { if (current) { setSettings(value); setPreview(value?.logo ?? null) } }).catch(() => { if (current) setError("Could not load the business logo. Reload settings to try again.") }); return () => { current = false; cancelChoice() } }, [cancelChoice])
  async function select(file?: File) {
    if (!file) return
    const request = ++chooser.current
    setError(""); setSaved(false)
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 2_000_000) { setError("Choose a PNG, JPEG or WebP image smaller than 2 MB."); return }
    const url = URL.createObjectURL(file)
    try {
      const image = new Image(); image.src = url; await image.decode()
      if (image.naturalWidth > 8192 || image.naturalHeight > 8192) throw Error("Image is too large")
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = 512
      const context = canvas.getContext("2d"); if (!context) throw Error("Preview unavailable")
      context.fillStyle = "#ffffff"; context.fillRect(0, 0, 512, 512)
      const scale = 384 / Math.max(image.naturalWidth, image.naturalHeight)
      const width = image.naturalWidth * scale, height = image.naturalHeight * scale
      context.drawImage(image, (512 - width) / 2, (512 - height) / 2, width, height)
      if (request === chooser.current) setPreview(canvas.toDataURL("image/png"))
    } catch { if (request === chooser.current) setError("This picture could not be prepared. Choose another logo.") }
    finally { URL.revokeObjectURL(url) }
  }
  async function save() {
    setBusy(true); setError(""); setSaved(false)
    try {
      const result = await saveTillLogo(preview)
      if (!result.success) { setError(result.error); return }
      setSettings(current => current ? { ...current, logo: result.logo, slug: result.slug } : current)
      setPreview(result.logo); setSaved(true); router.refresh()
    } catch { setError("Could not save the logo. Check your connection and try again.") }
    finally { setBusy(false) }
  }
  return <section className="rounded-2xl border border-border bg-background p-5" aria-label="Business installation logo"><h3 className="font-semibold">Your business logo on the installed Till</h3><p className="mt-2 max-w-2xl text-xs leading-6 text-muted-foreground">Upload your logo before installation. We fit it into a square white icon without stretching or cutting it. This logo is public on your shop’s installation page.</p>
    <div className="mt-5 flex flex-wrap items-center gap-5"><img src={preview ?? "/pos/icon-192.png"} alt="Till installation icon preview" width={96} height={96} className="rounded-2xl border border-border bg-white" /><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{settings?.name ?? "Saji Till"}</p><label className="mt-3 block text-xs font-medium">Select business logo<input type="file" accept="image/png,image/jpeg,image/webp" disabled={!settings?.canChange || busy} onChange={event => { void select(event.target.files?.[0]); event.target.value = "" }} className="mt-2 block w-full max-w-sm text-xs disabled:opacity-50" /></label></div></div>
    <div className="mt-5 flex flex-wrap gap-3"><button disabled={!settings?.canChange || busy || preview === settings.logo} onClick={() => void save()} className="min-h-11 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Saving…" : "Save logo"}</button><button disabled={!settings?.canChange || busy || !preview} onClick={() => { chooser.current++; setPreview(null); setSaved(false) }} className="min-h-11 rounded-xl border border-border px-4 text-xs disabled:opacity-50">Use Saji Till icon</button>{settings?.slug && <a href={`/pos/open?shop=${settings.slug}&install=1`} className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-xs font-semibold text-primary">Prepare branded installation</a>}</div>
    {settings && !settings.canChange && <p className="mt-3 text-xs text-muted-foreground">Only the business owner can change the logo.</p>}{error && <p role="alert" className="mt-3 text-xs text-red-600">{error}</p>}{saved && <p role="status" className="mt-3 text-xs text-green-700">Business logo saved. Open the branded installation page before installing.</p>}<p className="mt-4 text-xs leading-6 text-muted-foreground">Existing installed icons update according to the browser. If an old icon remains, install again from your branded page. Sync pending sales first and keep site data if your browser asks. Your business account stays available.</p>
  </section>
}

"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { WorkspaceHeading, PosCard as Card } from "@/frontend/components/pos/workspace-ui"
import {
  ArrowLeft, AlertTriangle, Check, Copy, Loader2, MonitorDown, Pencil, Share,
  Plus, Smartphone, Printer,
} from "lucide-react"
import { useTillInstall } from "@/frontend/components/pos/install-provider"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import { getTillAddress, setTillSlug, type TillAddress } from "@/backend/actions/pos-install"

/**
 * Getting the till onto the machine at the counter.
 *
 * Three ways to prepare the counter device:
 *   - install it here, on the machine being read on;
 *   - send the address to the phone that will actually be the till;
 *   - write the address down, because the tablet is not here yet.
 *
 * Till installs as a standalone web app with its own manifest and icon.
 */

export default function GetTillPage() {
  const [address, setAddress] = useState<TillAddress | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")

  const { available, standalone, isIos, secure, error: installError, install: doInstall } = useTillInstall()
  const qrRef = useRef<HTMLCanvasElement | null>(null)
  const [qrImage, setQrImage] = useState("")

  useEffect(() => {
    getTillAddress().then(setAddress).finally(() => setLoading(false))

  }, [])

  // The QR code is the whole point of the page on a shop floor: the owner
  // reads it on their laptop, the assistant points the counter phone at it.
  useEffect(() => {
    if (!address || !qrRef.current) return
    setQrImage("")
    let cancelled = false
    import("qrcode")
      .then((QR) => {
        if (cancelled || !qrRef.current) return
        return QR.toCanvas(qrRef.current, address.url, { width: 600, margin: 4 })
          .then(() => {
            if (!cancelled && qrRef.current) setQrImage(qrRef.current.toDataURL("image/png"))
          })
      })
      .catch(() => { /* the address is printed underneath it either way */ })
    return () => { cancelled = true }
  }, [address])

  const copy = async () => {
    if (!address) return
    try {
      await navigator.clipboard.writeText(address.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError("Could not copy. Write it down from below instead.")
    }
  }

  const share = async () => {
    if (!address) return
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> }
    if (!nav.share) { void copy(); return }
    try {
      await nav.share({ title: address.shopName + " till", text: "Open the till for " + address.shopName, url: address.url })
    } catch { /* dismissed, which is not an error */ }
  }

  const saveSlug = async () => {
    setBusy(true); setError("")
    const r = await setTillSlug({ slug: draft })
    setBusy(false)
    if (!r.success) { setError(r.error); return }
    setAddress(r.address)
    setEditing(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!address) {
    return (
      <div className="p-4 w-full min-w-0">
        <Card className="p-6 text-center rounded-2xl">
          <MonitorDown className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600" />
          <h1 className="mt-3 text-lg font-bold text-gray-900 dark:text-white">No till on this account</h1>
          <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            Set up your POS business first, then return here to install your till.
          </p>
          <Link href="/pos/setup">
            <Button className="mt-4 h-11 rounded-xl">Set up your POS</Button>
          </Link>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 xl:p-8 w-full min-w-0 space-y-5 pb-12">
      {qrImage && createPortal(
        <div id="till-qr-print" style={{ display: "none" }}>
          <style>{`
            @media print {
              body > :not(#till-qr-print) { display: none !important; }
              #till-qr-print { display: block !important; }
              #till-qr-print img { display: block; width: 50mm; height: 50mm; }
            }
          `}</style>
          <img src={qrImage} alt="Till QR code" width={600} height={600} />
        </div>, document.body,
      )}
      <div className="flex items-center gap-2">
        <Link
          href="/pos/sell"
          className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white inline-flex items-center gap-1 h-9 -ml-1 px-1 rounded-lg active:scale-95 transition-transform"
        >
          <ArrowLeft className="w-4 h-4" /> Till
        </Link>
      </div>
      <div>
        <WorkspaceHeading title="Get your till" />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
          Install Saji Till for {address.shopName} as its own app, separate from MySaji, with a dedicated icon and window.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2.5 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-red-700 dark:text-red-300 leading-snug">{error}</p>
        </div>
      )}

      {/* --- 1. this machine --------------------------------------------- */}
      <Card className="p-4 rounded-2xl">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white">Install Saji Till on this machine</h2>
        {address && <a href={`/pos/open?shop=${address.slug}&install=1`} className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-xs font-semibold text-primary">Prepare {address.shopName}’s branded installation</a>}
        <p className="mt-2 text-xs leading-6 text-muted-foreground">Set the business logo in Settings → Till appearance before installing. Branded installation uses your shop’s name and saved icon.</p>
        {installError && <p role="alert" className="mt-2 text-xs text-red-600">{installError}</p>}
        {standalone ? (
          <div className="mt-2 flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" strokeWidth={3} />
            <p className="text-xs text-gray-600 dark:text-gray-300 leading-snug">
              Already installed &mdash; you are reading this inside it.
            </p>
          </div>
        ) : available ? (
          <>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              Adds a Till icon in its own window. On launch, signed-in users open their workspace; signed-out users can sign in safely.
            </p>
            <Button onClick={doInstall} className="mt-3 w-full h-12 rounded-xl gap-1.5">
              <MonitorDown className="w-4 h-4" /> Install the till here
            </Button>
          </>
        ) : isIos ? (
          <div className="mt-2 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
            <p className="text-xs font-semibold text-gray-900 dark:text-white">On iPhone or iPad</p>
            <ol className="mt-1.5 space-y-1.5 text-[11px] text-gray-600 dark:text-gray-300 leading-snug">
              <li className="flex items-start gap-1.5">
                <Share className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> Tap Share at the bottom of Safari
              </li>
              <li className="flex items-start gap-1.5">
                <Plus className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> Choose &ldquo;Add to Home Screen&rdquo;
              </li>
            </ol>
            <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500 leading-snug">
              In the Share menu, select Add to Home Screen and keep Open as Web App enabled if shown.
            </p>
          </div>
        ) : (
          <div className="mt-3 space-y-3 text-xs text-muted-foreground leading-relaxed">
            {!secure ? <p role="alert">Installation needs a secure connection. Open this POS address using HTTPS, or use localhost when testing on this machine. An HTTP network address cannot install Till.</p> : <>
              <p>Install <strong>Saji Till</strong> from your browser menu. It gets its own app icon and opens in a dedicated POS window, separate from MySaji.</p>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong>Chrome:</strong> open the menu, then Cast, save and share ? Install page as app (or Install Saji Till).</li>
                <li><strong>Edge:</strong> open the menu ? Apps ? Install this site as an app.</li>
                <li><strong>Android:</strong> open the browser menu ? Install app or Add to Home screen.</li>
                <li><strong>Safari on Mac:</strong> choose File ? Add to Dock.</li>
              </ul>
              <p>If MySaji is already installed, open this POS address in a regular browser window first, then install Saji Till here.</p>
            </>}
          </div>
        )}
      </Card>

      {/* --- 2. another machine ------------------------------------------ */}
      <Card className="p-4 rounded-2xl">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white">On the counter phone or tablet</h2>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
          Point its camera at this, or type the address in. Then install it there the same way.
        </p>

        <div className="mt-3 flex flex-col items-center gap-2">
          <div className="rounded-xl bg-white p-2.5 border border-gray-200">
            <canvas ref={qrRef} width={180} height={180} className="!w-[180px] !h-[180px]" aria-label={"QR code for " + address.display} />
          </div>
          <p className="text-xs font-mono text-gray-700 dark:text-gray-300 text-center break-all px-2">
            {address.display}
          </p>
        </div>

        <div className="mt-3 flex gap-2">
          <Button onClick={share} variant="outline" className="flex-1 h-11 rounded-xl text-xs gap-1.5">
            <Smartphone className="w-3.5 h-3.5" /> Send it
          </Button>
          <Button onClick={copy} variant="outline" className="flex-1 h-11 rounded-xl text-xs gap-1.5">
            {copied ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied" : "Copy link"}
          </Button>
          <Button onClick={() => window.print()} disabled={!qrImage} variant="outline" className="h-11 w-11 rounded-xl p-0" aria-label="Print QR code">
            <Printer className="w-4 h-4" />
          </Button>
        </div>

        {/* The address is readable, so it should be sayable too. */}
        {editing ? (
          <div className="mt-3 flex gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="mwangi-butchery"
              className="h-11 rounded-xl text-sm"
            />
            <Button onClick={saveSlug} disabled={busy || draft.trim().length < 3} className="h-11 rounded-xl text-xs">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
            </Button>
            <button
              onClick={() => { setEditing(false); setError("") }}
              className="h-11 px-3 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-500 active:scale-95"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => { setDraft(address.slug); setEditing(true); setError("") }}
            className="mt-2 h-9 inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400 active:scale-95"
          >
            <Pencil className="w-3 h-3" /> Change this address
          </button>
        )}
      </Card>

      {/* --- 3. what it actually is --------------------------------------- */}
      <Card className="p-4 rounded-2xl">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white">What you are installing</h2>
        <ul className="mt-2 space-y-1.5 text-[11px] text-gray-600 dark:text-gray-300 leading-snug">
          <li>
            <span className="font-semibold text-gray-900 dark:text-white">An icon that opens the register.</span>{" "}
            Its own window, no address bar, nothing else around it.
          </li>
          <li>
            <span className="font-semibold text-gray-900 dark:text-white">It keeps selling if the line drops.</span>{" "}
            Sales are saved on the device and go through on their own when the connection is back.
          </li>
          <li>
            <span className="font-semibold text-gray-900 dark:text-white">A separate Saji Till app.</span>{" "}
            Install it alongside MySaji with its own icon and POS window. Updates arrive automatically; no installer file is needed.
          </li>
          <li>
            <span className="font-semibold text-gray-900 dark:text-white">Opening the address signs nobody in.</span>{" "}
            Whoever sets it up still has to log in, and your staff use their own PINs after that.
          </li>
        </ul>
        <div className="mt-3 flex gap-2">
          <Link href="/pos/people" className="flex-1">
            <Button variant="outline" className="w-full h-11 rounded-xl text-xs">Set up who works the till</Button>
          </Link>
          <Link href="/pos/sell" className="flex-1">
            <Button className="w-full h-11 rounded-xl text-xs">Open the till</Button>
          </Link>
        </div>
      </Card>
    </div>
  )
}

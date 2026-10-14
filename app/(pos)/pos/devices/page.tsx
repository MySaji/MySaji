"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft, AlertTriangle, Check, Loader2, Monitor, Smartphone, Tablet, Ban, RotateCcw, Pencil,
} from "lucide-react"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import {
  getTillDevices, registerTillDevice, renameTillDevice, setTillDeviceRevoked, type DeviceRow,
} from "@/backend/actions/pos-devices"
import { getDeviceSecret } from "@/frontend/lib/pos-device"

/**
 * The counters that ring up sales.
 *
 * Two things a shopkeeper cannot otherwise find out: which phone a sale came
 * from, and whether a phone has stopped checking in — because a phone that
 * has stopped checking in may be holding sales nobody has seen.
 *
 * The device being read on is marked, so revoking the wrong one is harder.
 */
export default function TillDevicesPage() {
  const [rows, setRows] = useState<DeviceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState("")
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draftName, setDraftName] = useState("")
  /** This browser's own row, so it can be labelled rather than guessed at. */
  const [mine, setMine] = useState<string | null>(null)

  const refresh = () => getTillDevices().then(setRows)

  useEffect(() => {
    // The till registers the device; this page only needs to know which row
    // is the one being read on, which it learns the same way the till does.
    const secret = getDeviceSecret()
    if (secret) {
      registerTillDevice({ secret })
        .then((r) => { if (r.success) setMine(r.deviceId) })
        .catch(() => {})
    }
    refresh().finally(() => setLoading(false))
  }, [])

  const flash = (m: string) => { setSaved(m); setTimeout(() => setSaved(""), 2500) }

  const doRename = async (id: string) => {
    setBusy(id); setError("")
    const r = await renameTillDevice({ deviceId: id, name: draftName })
    if (!r.success) setError(r.error)
    else { await refresh(); setRenaming(null); flash("Renamed") }
    setBusy(null)
  }

  const doRevoke = async (d: DeviceRow) => {
    setBusy(d.id); setError("")
    const r = await setTillDeviceRevoked({ deviceId: d.id, revoked: !d.revokedAt })
    if (!r.success) setError(r.error)
    else { await refresh(); flash(d.revokedAt ? d.name + " can sell again" : d.name + " has been stopped") }
    setBusy(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-3 pb-24">
      <div className="flex items-center gap-2">
        <Link
          href="/pos/settings"
          className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white inline-flex items-center gap-1 h-9 -ml-1 px-1 rounded-lg active:scale-95 transition-transform"
        >
          <ArrowLeft className="w-4 h-4" /> Settings
        </Link>
      </div>
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Devices</h1>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
          Every phone, tablet or computer that has opened your till. A device that stopped
          checking in may still be holding sales that have not reached here.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2.5 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-red-700 dark:text-red-300 leading-snug">{error}</p>
        </div>
      )}
      {saved && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2.5 flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" strokeWidth={3} />
          <p className="text-xs text-emerald-700 dark:text-emerald-300">{saved}</p>
        </div>
      )}

      <Card className="p-4 rounded-2xl">
        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-4 text-center">
            <Monitor className="w-5 h-5 text-gray-300 dark:text-gray-600 mx-auto" />
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              Nothing here yet. Open the till on a phone and it will appear.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {rows.map((d) => {
              const Icon = d.platform === "ios" || d.platform === "android" ? Smartphone
                : d.platform === "windows" || d.platform === "mac" ? Monitor : Tablet
              return (
                <div
                  key={d.id}
                  className={`p-3 rounded-xl border ${
                    d.revokedAt
                      ? "border-red-100 dark:border-red-900/50 bg-red-50/50 dark:bg-red-900/10"
                      : "border-gray-200 dark:border-gray-700"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      d.revokedAt ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-500"
                    }`}>
                      <Icon className="w-4 h-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                        {d.name}
                        {d.id === mine && <span className="ml-1.5 text-[10px] font-bold text-primary">this one</span>}
                      </p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        {d.revokedAt ? "Stopped" : lastSeen(d.lastSeenAt)}
                        {" · "}
                        {d.saleCount === 0 ? "no sales yet" : d.saleCount === 1 ? "1 sale" : d.saleCount + " sales"}
                      </p>
                    </div>
                    <button
                      onClick={() => { setRenaming(d.id); setDraftName(d.name); setError("") }}
                      aria-label={"Rename " + d.name}
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 active:scale-95"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => doRevoke(d)}
                      disabled={busy === d.id}
                      aria-label={d.revokedAt ? "Let " + d.name + " sell again" : "Stop " + d.name + " selling"}
                      className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 active:scale-95 disabled:opacity-50 ${
                        d.revokedAt
                          ? "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                          : "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                      }`}
                    >
                      {busy === d.id ? <Loader2 className="w-4 h-4 animate-spin" />
                        : d.revokedAt ? <RotateCcw className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                    </button>
                  </div>

                  {renaming === d.id && (
                    <div className="mt-2 flex gap-2">
                      <Input
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        placeholder="Front counter"
                        className="h-11 rounded-xl text-sm"
                      />
                      <Button
                        onClick={() => doRename(d.id)}
                        disabled={busy === d.id || draftName.trim().length === 0}
                        className="h-11 rounded-xl text-xs whitespace-nowrap"
                      >
                        Save
                      </Button>
                      <button
                        onClick={() => setRenaming(null)}
                        className="h-11 px-3 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-500 active:scale-95"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {d.id === mine && d.revokedAt && (
                    <p className="mt-2 text-[11px] text-red-700 dark:text-red-400 leading-snug">
                      This is the device you are reading on, and it cannot ring up a sale while it
                      is stopped.
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
        <p className="mt-3 text-[11px] text-gray-400 dark:text-gray-500 leading-snug">
          Stopping a device refuses its sales, including any it saved while offline and has not
          sent yet. It is reversible — a phone that turns up again can be turned back on.
        </p>
      </Card>
    </div>
  )
}

function lastSeen(iso: string | null): string {
  if (!iso) return "never opened"
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 2) return "here now"
  if (mins < 60) return mins + " minutes ago"
  const hours = Math.floor(mins / 60)
  if (hours < 24) return hours === 1 ? "an hour ago" : hours + " hours ago"
  const days = Math.floor(hours / 24)
  return days === 1 ? "yesterday" : days + " days ago"
}

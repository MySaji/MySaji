"use client"
import { useTillInstall } from "./install-provider"

export function BusinessInstallButton() {
  const { available, standalone, install, error, isIos } = useTillInstall()
  return <div className="mt-3">{standalone ? <p className="text-xs text-slate-500">Opened in the installed Till app.</p> : available ? <button onClick={() => void install()} className="min-h-12 w-full rounded-xl border border-slate-200 px-5 text-sm font-semibold text-blue-700">Install this business’s Till</button> : <p className="text-xs leading-6 text-slate-500">{isIos ? "To install: open Share, then Add to Home Screen." : "To install, open this page in Chrome or Edge and use the browser’s Install app option when available."}</p>}{error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}</div>
}

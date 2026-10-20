"use client"

import { RefreshCw, AlertCircle, ArrowRight } from "lucide-react"

export function WorkflowGuide({ title, steps }: { title: string; steps: { title: string; description: string }[] }) {
  return <details className="workflow-guide"><summary><span>{title}</span><span className="workflow-guide-hint">How it works</span></summary><ol>{steps.map((step, index) => <li key={step.title}><span className="workflow-step-number">{index + 1}</span><div><h2>{step.title}</h2><p>{step.description}</p></div>{index < steps.length - 1 && <ArrowRight size={16} className="workflow-step-arrow" aria-hidden="true" />}</li>)}</ol></details>
}

export function WorkspaceRecovery({ title = "This view is unavailable", retry, busy = false }: { title?: string; retry: () => void; busy?: boolean }) {
  return <section role="alert" className="workspace-recovery"><AlertCircle size={24} aria-hidden="true" /><div><h2>{title}</h2><p>Your data could not be loaded. Check your connection and try again.</p><button disabled={busy} onClick={retry}><RefreshCw size={15} className={busy ? "animate-spin" : ""} />{busy ? "Trying again..." : "Try again"}</button></div></section>
}

export function WorkspaceRefresh({ refreshing, updatedAt, refresh }: { refreshing: boolean; updatedAt?: number; refresh: () => void }) {
  return <div className="workspace-refresh"><p role="status">{refreshing ? "Updating this view..." : updatedAt ? `Updated ${new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Refresh to check for updates"}</p><button disabled={refreshing} onClick={refresh}><RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />Refresh</button></div>
}

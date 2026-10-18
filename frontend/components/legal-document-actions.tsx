"use client"

import { Download, Printer } from "lucide-react"

export function LegalDocumentActions({ title, updated, text }: { title: string; updated: string; text: string }) {
  const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
  return <div className="flex flex-wrap gap-2 print:hidden">
    <button type="button" onClick={() => window.print()} className={buttonClass}><Printer size={16} aria-hidden="true" />Print or save PDF</button>
    <a href={`data:text/plain;charset=utf-8,${encodeURIComponent(`${title}\nLast updated: ${updated}\n\n${text}`)}`} download={`mysaji-${title.toLowerCase().replace(/\s+/g, "-")}.txt`} className={buttonClass}><Download size={16} aria-hidden="true" />Download text</a>
  </div>
}

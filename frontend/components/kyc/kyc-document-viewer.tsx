"use client"

import { useEffect, useState } from "react"
import { FileText, X, ChevronLeft, ChevronRight, Download, ExternalLink } from "lucide-react"

export type KycDocumentItem = {
  label: string
  url: string
}

function isPdfDataUrl(url: string) {
  return url.startsWith("data:application/pdf")
}

/** Grid of document thumbnails (image or PDF) with a full-screen lightbox
 * for actually inspecting one before approving/rejecting it — base64 data
 * URLs (how every upload in this app is stored) don't render through
 * next/image, and a raw <img> can't render a PDF at all, so both need
 * explicit handling rather than one generic <img> tag. */
export function KycDocumentViewer({ documents }: { documents: KycDocumentItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  if (documents.length === 0) {
    return <p className="text-sm text-muted-foreground">No documents were submitted with this request.</p>
  }

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {documents.map((doc, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setOpenIndex(i)}
            className="group text-left"
          >
            <div className="relative aspect-[3/2] rounded-xl overflow-hidden border border-border bg-muted/40 flex items-center justify-center">
              {isPdfDataUrl(doc.url) ? (
                <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
                  <FileText className="w-8 h-8" />
                  <span className="text-[10px] font-medium">PDF document</span>
                </div>
              ) : (
                // Images use the configured unoptimized rendering policy -- base64 data URLs aren't supported by next/image
                <img src={doc.url} alt={doc.label} className="w-full h-full object-cover" />
              )}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
            </div>
            <p className="text-xs font-medium text-foreground mt-1.5">{doc.label}</p>
          </button>
        ))}
      </div>

      {openIndex !== null && (
        <KycDocumentLightbox
          documents={documents}
          index={openIndex}
          onIndexChange={setOpenIndex}
          onClose={() => setOpenIndex(null)}
        />
      )}
    </div>
  )
}

function KycDocumentLightbox({
  documents, index, onIndexChange, onClose,
}: {
  documents: KycDocumentItem[]
  index: number
  onIndexChange: (i: number) => void
  onClose: () => void
}) {
  const doc = documents[index]
  const isPdf = isPdfDataUrl(doc.url)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      if (e.key === "ArrowLeft") onIndexChange((index - 1 + documents.length) % documents.length)
      if (e.key === "ArrowRight") onIndexChange((index + 1) % documents.length)
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [index, documents.length, onIndexChange, onClose])

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
        <div>
          <p className="text-white text-sm font-semibold">{doc.label}</p>
          <p className="text-white/50 text-xs">{index + 1} of {documents.length}</p>
        </div>
        <div className="flex items-center gap-1">
          <a
            href={doc.url}
            download={`${doc.label.replace(/\s+/g, "-").toLowerCase()}${isPdf ? ".pdf" : ".jpg"}`}
            className="p-2 text-white/80 hover:text-white"
            title="Download"
          >
            <Download className="w-5 h-5" />
          </a>
          {isPdf && (
            <a href={doc.url} target="_blank" rel="noopener noreferrer" className="p-2 text-white/80 hover:text-white" title="Open in new tab">
              <ExternalLink className="w-5 h-5" />
            </a>
          )}
          <button onClick={onClose} className="p-2 text-white/80 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="relative flex-1 min-h-0 flex items-center justify-center px-3 pb-3">
        {documents.length > 1 && (
          <>
            <button
              onClick={() => onIndexChange((index - 1 + documents.length) % documents.length)}
              className="absolute left-1 top-1/2 -translate-y-1/2 z-10 p-2 text-white/60 hover:text-white"
              aria-label="Previous document"
            >
              <ChevronLeft className="w-8 h-8" />
            </button>
            <button
              onClick={() => onIndexChange((index + 1) % documents.length)}
              className="absolute right-1 top-1/2 -translate-y-1/2 z-10 p-2 text-white/60 hover:text-white"
              aria-label="Next document"
            >
              <ChevronRight className="w-8 h-8" />
            </button>
          </>
        )}

        {isPdf ? (
          <iframe src={doc.url} title={doc.label} className="w-full h-full max-w-4xl rounded-lg bg-white" />
        ) : (
          // Images use the configured unoptimized rendering policy -- base64 data URLs aren't supported by next/image
          <img src={doc.url} alt={doc.label} className="max-w-full max-h-full object-contain rounded-lg" />
        )}
      </div>
    </div>
  )
}

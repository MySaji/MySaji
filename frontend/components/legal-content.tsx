import type { ReactNode } from "react"

export function legalHeadings(content: string) {
  return content.split(/\n\s*\n/).map(block => block.trim()).filter(Boolean)
    .flatMap((block, index) => block.startsWith("## ")
      ? [{ id: `legal-section-${index}`, title: block.slice(3).trim() }] : [])
}

/** Renders admin-authored legal-page text (Terms/Privacy) into simple
 * structured HTML — blank-line-separated paragraphs, "## " lines as
 * headings, and "- " lines as bullet lists. Deliberately lightweight
 * (no markdown library, no dangerouslySetInnerHTML) since this is meant for
 * short-form legal copy, not general rich content. */
export function renderLegalContent(content: string): ReactNode[] {
  const blocks = content.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)

  return blocks.map((block, i) => {
    if (block.startsWith("## ")) {
      return (
        <h2 key={i} id={`legal-section-${i}`} className="scroll-mt-6 text-xl font-semibold tracking-tight text-foreground pt-6 sm:text-2xl">
          {block.slice(3).trim()}
        </h2>
      )
    }

    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean)
    if (lines.length > 0 && lines.every((l) => l.startsWith("- "))) {
      return (
        <ul key={i} className="list-disc space-y-3 pl-5 text-muted-foreground leading-7">
          {lines.map((l, j) => (
            <li key={j}>{l.slice(2).trim()}</li>
          ))}
        </ul>
      )
    }

    return (
      <p key={i} className="text-muted-foreground leading-relaxed">
        {block}
      </p>
    )
  })
}

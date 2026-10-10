import type { ReactNode } from "react"

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
        <h2 key={i} className="text-2xl font-bold text-foreground mb-4 mt-2">
          {block.slice(3).trim()}
        </h2>
      )
    }

    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean)
    if (lines.length > 0 && lines.every((l) => l.startsWith("- "))) {
      return (
        <ul key={i} className="list-disc list-inside space-y-2 text-muted-foreground">
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

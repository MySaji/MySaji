// Minimal RFC4180-ish CSV parser: handles quoted fields (with embedded
// commas/newlines) and escaped double-quotes (""), which a naive
// text.split(",") would break on for anything but the simplest product
// descriptions.
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false

  const pushField = () => { row.push(field); field = "" }
  const pushRow = () => { pushField(); rows.push(row); row = [] }

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else {
        field += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ",") {
      pushField()
    } else if (char === "\n") {
      pushRow()
    } else if (char === "\r") {
      // skip; \n right after handles the row break
    } else {
      field += char
    }
  }
  if (field.length > 0 || row.length > 0) pushRow()

  const nonEmptyRows = rows.filter((r) => r.some((cell) => cell.trim().length > 0))
  if (nonEmptyRows.length === 0) return []

  const headers = nonEmptyRows[0].map((h) => h.trim())
  return nonEmptyRows.slice(1).map((cells) => {
    const record: Record<string, string> = {}
    headers.forEach((header, i) => { record[header] = (cells[i] ?? "").trim() })
    return record
  })
}

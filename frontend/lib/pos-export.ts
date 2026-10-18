export function csvCell(value: unknown): string {
  const text = String(value ?? "")
  const safe = /^[\s]*[=+@-]/.test(text) ? "'" + text : text
  return '"' + safe.replaceAll('"', '""') + '"'
}

export function downloadCsv(filename: string, rows: unknown[][]) {
  const url = URL.createObjectURL(new Blob(["\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }))
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

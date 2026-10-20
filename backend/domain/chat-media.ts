export const MAX_CHAT_FILE_BYTES = 5 * 1024 * 1024
export const MAX_CHAT_DATA_URL_LENGTH = Math.ceil(MAX_CHAT_FILE_BYTES / 3) * 4 + 256
export type ChatSendType = "TEXT" | "IMAGE" | "FILE" | "VOICE" | "LOCATION"
const FILE_MIMES = new Set(["application/pdf", "text/plain", "text/csv", "application/zip", "application/x-zip-compressed", "application/octet-stream", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"])

export function validChatAttachment(type: ChatSendType, url?: string) {
  if (!url || url.length > MAX_CHAT_DATA_URL_LENGTH) return false
  if (url.startsWith("https://")) { try { return new URL(url).protocol === "https:" } catch { return false } }
  const match = /^data:([^;,]+)(?:;codecs=[^;,]+)?;base64,([A-Za-z0-9+/]*={0,2})$/.exec(url)
  if (!match || !match[2]) return false
  const mime = match[1].toLowerCase()
  const bytes = match[2].length * 3 / 4 - (match[2].endsWith("==") ? 2 : match[2].endsWith("=") ? 1 : 0)
  if (bytes > MAX_CHAT_FILE_BYTES) return false
  if (type === "IMAGE") return /^image\/(jpeg|png|webp|gif|avif)$/.test(mime)
  if (type === "VOICE") return /^audio\/(webm|mp4|mpeg|ogg|wav|x-m4a)$/.test(mime)
  return type === "FILE" && FILE_MIMES.has(mime)
}

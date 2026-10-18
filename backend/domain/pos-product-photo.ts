export const PRODUCT_PHOTO_MAX_LENGTH = 2_000_000

export function productPhotoFailure(error: unknown, stage: "rate-limit" | "provider"): { status: number | null; message: string } {
  const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : null
  if (stage === "rate-limit") return { status, message: "Could not check the photo editing limit. Check the database connection and try again. Your original photo is unchanged." }
  if (status === 429) return { status, message: "Gemini's image quota or usage limit has been reached. Check the project's quota and billing in Google AI Studio, or try again later. Your original photo is unchanged." }
  if (status === 401 || status === 403) return { status, message: "Gemini did not authorize image editing with the configured API key. Check the key's project, restrictions and image-model access. Your original photo is unchanged." }
  if (status === 404) return { status, message: "The configured Gemini image model is unavailable. Check POS_IMAGE_MODEL against the models available to your API key. Your original photo is unchanged." }
  if (status === 400) return { status, message: "Gemini could not process this photo with the current image settings. Try another photo or check the image model configuration." }
  return { status, message: "Could not reach the image editor or complete the request. Try again shortly. Your original photo is unchanged." }
}

/** Accept image bytes, never a remote URL that would make the server fetch arbitrary hosts. */
export function parseProductPhoto(value: string, maxLength = PRODUCT_PHOTO_MAX_LENGTH): { mimeType: string; data: string } | null {
  if (value.length > maxLength) return null
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value)
  if (!match || match[2].length % 4 !== 0) return null
  const bytes = Buffer.from(match[2], "base64")
  if (bytes.toString("base64") !== match[2]) return null
  const valid = match[1] === "image/jpeg" ? bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : match[1] === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : bytes.length > 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP"
  return valid ? { mimeType: match[1], data: match[2] } : null
}

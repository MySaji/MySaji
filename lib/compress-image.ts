/** Downscales and re-encodes an image file to a JPEG data URL, client-side,
 * via a throwaway canvas. Real phone-camera photos routinely run 3-8MB each;
 * this app stores uploads as base64 data URLs directly in Postgres (no
 * object storage), and forms that submit more than one photo in a single
 * server action call (unlike every other single-photo upload in this app)
 * can otherwise exceed the server action body-size limit even after phone
 * photos are combined — the request then just hangs from the UI's
 * perspective instead of failing with a clear error. */
export function compressImageToDataUrl(file: File, maxDimension = 1280, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const scale = Math.min(1, maxDimension / Math.max(img.width, img.height))
      const width = Math.round(img.width * scale)
      const height = Math.round(img.height * scale)

      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext("2d")
      if (!ctx) {
        reject(new Error("Canvas is not supported in this browser."))
        return
      }
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL("image/jpeg", quality))
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error("Could not read that image file."))
    }
    img.src = objectUrl
  })
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error("Could not read that file."))
    reader.readAsDataURL(file)
  })
}

/** Same purpose as `compressImageToDataUrl`, but safe to point at an
 * image-or-PDF upload zone: PDFs can't be re-encoded through a canvas, so
 * those are just read through as-is and only real images get compressed. */
export function compressUploadToDataUrl(file: File, maxDimension = 1280, quality = 0.8): Promise<string> {
  if (file.type === "application/pdf") return readFileAsDataUrl(file)
  return compressImageToDataUrl(file, maxDimension, quality)
}

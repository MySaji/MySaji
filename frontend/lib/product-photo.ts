/** Normalize phone photos to a small JPEG suitable for the catalogue and server action limit. */
export function prepareProductPhoto(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp|avif|heic|heif)$/i.test(file.type)) return Promise.reject(new Error("Choose a JPG, PNG, WebP, AVIF or phone camera photo."))
  if (file.size > 20 * 1024 * 1024) return Promise.reject(new Error("Choose a photo smaller than 20 MB."))
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      try {
        if (!image.naturalWidth || !image.naturalHeight) throw new Error("This photo has no readable image content.")
        const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight))
        const canvas = document.createElement("canvas")
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
        const context = canvas.getContext("2d")
        if (!context) throw new Error("This browser cannot prepare photos. Try another browser.")
        context.fillStyle = "#ffffff"
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        let result = canvas.toDataURL("image/jpeg", 0.85)
        if (result.length > 1_900_000) result = canvas.toDataURL("image/jpeg", 0.65)
        if (result.length > 1_900_000) throw new Error("This photo is too detailed to save. Try a smaller photo.")
        resolve(result)
      } catch (error) { reject(error) }
    }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("This browser could not read the photo. Export it as JPG or PNG and try again.")) }
    image.src = url
  })
}

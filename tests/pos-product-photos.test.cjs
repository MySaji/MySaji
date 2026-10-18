const { test } = require("node:test")
const assert = require("node:assert/strict")
const { loadService } = require("./load-service.cjs")
const photos = loadService("backend/domain/pos-product-photo.ts")
const jpeg = "data:image/jpeg;base64," + Buffer.from([255, 216, 255, 224, 0, 0, 255, 217]).toString("base64")

function editor({ authorized = true, configured = true, allowed = true, output = jpeg } = {}) {
  const requests = []
  const gates = []
  const actions = loadService("backend/actions/pos-product-photos.ts", {
    zod: require("zod"), "@/backend/domain/pos-product-photo": photos,
    "@/backend/services/pos-access-core": { requirePosPermission: async permission => {
      gates.push(permission)
      return authorized ? { ok: true, actor: { userId: "owner", businessId: "store" } } : { ok: false, error: "Not authorized" }
    } },
    "@/backend/services/rate-limit": { checkRateLimit: async () => allowed ? { allowed: true } : { allowed: false, retryAfterSeconds: 120 } },
    "@/backend/services/ai/credentials": { isGeminiConfigured: () => configured },
    "@/backend/services/ai/gemini-client": { getGeminiClient: () => ({ models: { generateContent: async request => {
      requests.push(request)
      const part = output ? { inlineData: { mimeType: output.split(";")[0].slice(5), data: output.split(",")[1] } } : { text: "No photo generated" }
      return { candidates: [{ content: { parts: [part] } }] }
    } } }) },
  })
  return { ...actions, requests, gates }
}

test("photo input validates actual image signatures and refuses remote fetches or executable formats", () => {
  assert.equal(photos.parseProductPhoto(jpeg).mimeType, "image/jpeg")
  for (const bad of ["https://example.com/photo.jpg", "http://127.0.0.1/private", "data:image/svg+xml;base64,PHN2Zz4=", "data:image/png;base64,YWJjZA==", jpeg + "!", "x".repeat(2_000_001)]) assert.equal(photos.parseProductPhoto(bad), null)
})

test("AI editing is permission checked, optional, and rate limited before contacting the provider", async () => {
  for (const options of [{ authorized: false }, { configured: false }, { allowed: false }]) {
    const action = editor(options)
    assert.equal((await action.editProductPhoto({ image: jpeg, mode: "background" })).success, false)
    assert.equal(action.requests.length, 0)
  }
  const action = editor()
  await action.getProductPhotoOptions(true)
  assert.equal(action.gates[0], "product.edit")
  await action.editProductPhoto({ image: jpeg, mode: "background", editing: false })
  assert.equal(action.gates[1], "product.create")
})

test("image editing sends the selected image and returns a preview without saving a product", async () => {
  const action = editor()
  const result = await action.editProductPhoto({ image: jpeg, mode: "studio", editing: true })
  assert.equal(result.success, true)
  assert.equal(result.image, jpeg)
  assert.equal(action.requests[0].contents[0].parts[1].inlineData.data, jpeg.split(",")[1])
  assert.match(action.requests[0].contents[0].parts[0].text, /Preserve the product's identity/)
  assert.equal(action.requests[0].config.httpOptions.timeout, 90_000)
})

test("an empty AI response leaves the original photo available", async () => {
  const action = editor({ output: null })
  const result = await action.editProductPhoto({ image: jpeg, mode: "background" })
  assert.equal(result.success, false)
  assert.match(result.error, /original has been kept/)
})

test("photo editing distinguishes database, quota, authorization and missing-model failures", () => {
  assert.match(photos.productPhotoFailure({}, "rate-limit").message, /database connection/)
  assert.match(photos.productPhotoFailure({ status: 429 }, "provider").message, /quota/)
  assert.match(photos.productPhotoFailure({ status: 403 }, "provider").message, /did not authorize/)
  assert.match(photos.productPhotoFailure({ status: 404 }, "provider").message, /POS_IMAGE_MODEL/)
  assert.equal(photos.productPhotoFailure({ status: 429, message: "private-key-photo-data" }, "provider").message.includes("private-key-photo-data"), false)
})

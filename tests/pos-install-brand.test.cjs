const { test } = require("node:test")
const assert = require("node:assert/strict")
const { loadService } = require("./load-service.cjs")
const React = require("react")
const { ImageResponse } = require("next/og")
const photo = loadService("backend/domain/pos-product-photo.ts")

function branding(shop = null) {
  const queries = []
  const service = loadService("backend/services/pos-install-brand.ts", {
    react: React, "next/og": { ImageResponse }, "@/backend/domain/pos-product-photo": photo,
    "@/backend/db": { db: { shopkeeperProfile: { findFirst: async q => { queries.push(q); return shop } } } },
  })
  return { ...service, queries }
}
async function logo() {
  const png = await new ImageResponse(React.createElement("div", { style: { display: "flex", width: 512, height: 512, background: "#0647b5" } }), { width: 512, height: 512 }).arrayBuffer()
  return `data:image/png;base64,${Buffer.from(png).toString("base64")}`
}

test("brand icons validate and decode local square PNGs without remote image fetching", async () => {
  const b = branding()
  const input = await logo()
  assert.equal(b.validInstallLogo(input), true)
  for (const invalid of ["https://example.com/logo.png", "data:image/svg+xml;base64,PHN2Zz4=", input + "!", null, "data:image/png;base64," + Buffer.alloc(34).toString("base64")]) assert.equal(b.validInstallLogo(invalid), false)
  for (const size of [192, 512]) {
    const image = b.renderInstallLogo(input, size)
    const png = Buffer.from(await image.arrayBuffer())
    assert.equal(png.readUInt32BE(16), size)
    assert.equal(png.readUInt32BE(20), size)
    assert.equal(image.headers.get("content-type"), "image/png")
  }
})

test("public installation branding exposes only the name, validated logo and colour, never settings or credentials", async () => {
  const input = await logo()
  const b = branding({ shopName: "Amina Shop", tillSlug: "amina-shop", posConfig: { installLogo: input, primaryColor: "#0647b5", secret: "must-not-leak" } })
  assert.equal(await b.publicTillBrand("../admin"), null)
  assert.equal(b.queries.length, 0)
  const brand = await b.publicTillBrand("amina-shop")
  assert.equal(b.queries[0].where.posEnabled, true)
  assert.equal(JSON.stringify(brand).includes("must-not-leak"), false)
  const manifest = b.brandedManifest(brand)
  assert.equal(manifest.start_url, "/pos/open?shop=amina-shop")
  assert.equal(manifest.scope, "/pos/")
  assert.equal(manifest.icons.length, 2)
  assert.ok(manifest.icons.every(icon => icon.src.includes(brand.revision)))
  const other = b.brandedManifest({ ...brand, slug: "other-shop" })
  assert.notEqual(other.id, manifest.id)
  assert.equal(JSON.stringify(manifest).includes("must-not-leak"), false)
})

test("logo-free shops retain valid Saji Till icons", async () => {
  const b = branding({ shopName: "Shop", tillSlug: "shop", posConfig: { installLogo: "https://not-allowed.example/logo.png" } })
  const manifest = b.brandedManifest(await b.publicTillBrand("shop"))
  assert.equal(manifest.icons[0].src, "/pos/icon-192.png")
  assert.equal(manifest.icons[1].src, "/pos/icon-512.png")
})

test("logo mutation checks actual business ownership, preserves existing settings and rejects malformed images", async () => {
  const writes = [], recorded = [], cookieWrites = []
  let role = "CASHIER", actualOwner = "owner", userId = "employee"
  const b = branding()
  const actions = loadService("backend/actions/pos-install-logo.ts", {
    "next/headers": { cookies: async () => ({ set: (...args) => cookieWrites.push(args) }) }, "next/cache": { revalidatePath() {} },
    "@/backend/services/pos-install-brand": b,
    "@/backend/actions/pos-install": { getTillAddress: async () => ({ slug: "shop" }) },
    "@/backend/services/pos-access-core": { resolvePosActor: async () => ({ businessId: "business", shopkeeperId: "my-shop", userId, role }), recordPosAudit: async e => recorded.push(e) },
    "@/backend/db": { db: { posBusiness: { findUnique: async () => ({ ownerUserId: actualOwner }) }, shopkeeperProfile: { findUnique: async () => ({ posConfig: { primaryColor: "#123456", receiptFooter: "Thank you" } }), update: async q => writes.push(q) } } },
  })
  assert.equal((await actions.saveTillLogo(null)).success, false)
  role = "OWNER" // An employee cannot obtain this report by being assigned an OWNER seat.
  assert.equal((await actions.saveTillLogo(null)).success, false)
  assert.equal(writes.length, 0)
  userId = actualOwner
  assert.equal((await actions.saveTillLogo("https://example.com/logo.png")).success, false)
  const result = await actions.saveTillLogo(await logo())
  assert.equal(result.success, true)
  assert.equal(writes[0].where.id, "my-shop")
  assert.equal(writes[0].data.posConfig.primaryColor, "#123456")
  assert.equal(writes[0].data.posConfig.receiptFooter, "Thank you")
  assert.equal(recorded[0].action, "settings.install_logo")
  assert.equal(cookieWrites[0][0], "saji-till-shop")
  assert.equal(cookieWrites[0][1], "shop")
  assert.equal((await actions.saveTillLogo(null)).success, true)
  assert.equal(writes[1].data.posConfig.installLogo, null)
})

test("Till logout cache clearing preserves other app caches", async () => {
  const removed = []
  const actions = loadService("frontend/lib/pos-install-session.ts", {}, { caches: { keys: async () => ["saji-till-shell-v3", "saji-till-shell-v4", "other-app-cache"], delete: async name => removed.push(name) } })
  await actions.clearTillInstallCache()
  assert.deepEqual(removed, ["saji-till-shell-v3", "saji-till-shell-v4"])
})

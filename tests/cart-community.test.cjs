const { test } = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const { loadService } = require("./load-service.cjs")

test("community uploads reject executable media and oversized files before writing; valid posts retain the authenticated author", async () => {
  const written = []
  const actions = loadService("backend/actions/community.ts", {
    zod: require("zod"), "@/backend/auth": { auth: async () => ({ user: { id: "current-user" } }) },
    "@/backend/db": { db: { post: { create: async query => { written.push(query.data); return { id: "created" } } } } },
  })
  for (const payload of [
    { images: ["data:image/svg+xml;base64,PHN2Zz4="] },
    { images: [`data:image/png;base64,${Buffer.alloc(1024 * 1024 + 1).toString("base64")}`] },
    { video: "javascript:alert(1)" },
    { video: `data:video/mp4;base64,${Buffer.alloc(3 * 1024 * 1024 + 1).toString("base64")}` },
    { content: "a".repeat(2001) },
  ]) assert.equal((await actions.createPost(payload)).success, false)
  assert.equal(written.length, 0)
  assert.equal((await actions.createPost({ content: "A useful question", images: ["data:image/png;base64,cHJldmlldw=="], authorId: "someone-else" })).success, true)
  assert.equal(written[0].authorId, "current-user")
  assert.equal(written[0].location, undefined)
})

test("shared community links look up the requested post without exposing archived posts", async () => {
  let query
  const actions = loadService("backend/actions/community.ts", {
    zod: require("zod"), "@/backend/auth": { auth: async () => ({ user: { id: "current-user" } }) },
    "@/backend/db": { db: { post: { findMany: async value => { query = value; return [] } } } },
  })
  assert.equal((await actions.getPosts("shared-post")).length, 0)
  assert.equal(query.where.id, "shared-post")
  assert.equal(query.where.isArchived, false)
  await actions.getPosts(undefined, true)
  assert.equal(query.where.saves.some.userId, "current-user")
})

test("checkout refuses an unreviewed price change before reading or debiting the wallet", async () => {
  const filename = "backend/actions/cart.ts"
  const dependencies = Object.fromEntries([...fs.readFileSync(filename, "utf8").matchAll(/from "([^"]+)"/g)].map(match => [match[1], {}]))
  let walletReads = 0, writes = 0
  Object.assign(dependencies, {
    zod: require("zod"), "@/backend/auth": { auth: async () => ({ user: { id: "current-customer" } }) },
    "@/backend/services/verification-gate": { requireVerified: async () => ({ ok: true }) },
    "@/backend/db": { db: {
      cartItem: { findMany: async () => [{ offerId: "offer", quantity: 1, offer: { title: "Garden kit", status: "LIVE", actionType: "BUY", price: 500, stockQuantity: 4, providerId: "provider", provider: { user: { name: "Alex" } } } }] },
      blockedShopCustomer: { findMany: async () => [] }, blockedClient: { findFirst: async () => null },
      shopkeeperProfile: { findMany: async () => [] }, wallet: { findUnique: async () => { walletReads++; return { balance: 1000 } } },
      $transaction: async () => { writes++; throw new Error("Unexpected write") },
    } },
  })
  const { checkout } = loadService(filename, dependencies)
  const result = await checkout({ shippingPhone: "0712345678", shippingAddress: "Example street", expectedTotal: 400 })
  assert.equal(result.success, false)
  assert.match(result.error, /total changed/)
  assert.equal(walletReads, 0)
  assert.equal(writes, 0)
})

test("cart delivery quotes use the current customer's records, distinct shop IDs and the selected destination", async () => {
  const filename = "backend/actions/cart.ts"
  const source = fs.readFileSync(filename, "utf8")
  const dependencies = Object.fromEntries([...source.matchAll(/from "([^"]+)"/g)].map(match => [match[1], {}]))
  const shops = ["shop-a", "shop-b"].map((id, index) => ({ id, shopName: "Same display name", latitude: 0, longitude: 0, deliveryFee: 100 + index, deliveryRadiusKm: 5, deliveryFeePerKm: 20, isOnVacation: false }))
  let query
  const quotes = []
  Object.assign(dependencies, {
    zod: require("zod"), "@/backend/auth": { auth: async () => ({ user: { id: "current-customer" } }) },
    "@/backend/db": { db: { cartItem: { findMany: async value => { query = value; return shops.map((shop, index) => ({ productId: `product-${index}`, quantity: 1, product: { name: "Basket", price: 400, images: [], shopkeeperId: shop.id, shopkeeper: shop, inventory: { currentStock: 5, reservedStock: 1 } } })) } } } },
    "@/backend/domain/format": { resolveShopHoursForToday: () => ({}), isShopCurrentlyOpen: () => true },
    "@/backend/domain/geo": { toCoordinates: (latitude, longitude) => ({ latitude, longitude }) },
    "@/backend/domain/delivery-zone": { quoteDelivery: (zone, origin, destination) => { quotes.push({ zone, destination }); return { deliverable: true, fee: zone.flatFee + 40 } } },
  })
  const actions = loadService(filename, dependencies)
  const cart = await actions.getCart({ latitude: 1, longitude: 2 })
  assert.equal(query.where.customerId, "current-customer")
  assert.deepEqual(Array.from(cart, line => line.shopId), ["shop-a", "shop-b"])
  assert.deepEqual(Array.from(cart, line => line.shopDeliveryFee), [140, 141])
  assert.equal(quotes[0].destination.latitude, 1)
  assert.equal(quotes[0].destination.longitude, 2)
  assert.equal(cart[0].stock, 4)
})

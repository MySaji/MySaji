const { test } = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const crypto = require("node:crypto")
const { loadService } = require("./load-service.cjs")
const depsFor = file => Object.fromEntries([...fs.readFileSync(file, "utf8").matchAll(/from "([^"]+)"/g)].map(match => [match[1], {}]))

test("admin saves the customer payment switch, job mode and debt limit; disabled mode is effective without destroying the saved mode", async () => {
  let value = { customerAppPaymentsEnabled: false, jobPaymentMode: "BOTH", commissionDebtCap: 2400 }
  const service = loadService("backend/actions/admin-settings.ts", {
    zod: require("zod"), "@/backend/db": { db: { platformSetting: { findUnique: async () => ({ value }), upsert: async q => { value = q.update.value } } } },
    "@/backend/actions/admin-dashboard": { requireAdmin: async () => ({ userId: "admin" }) },
    "@/backend/services/admin-audit-core": { logAdminAction: async () => {} },
  })
  assert.equal((await service.getPlatformPreferences()).jobPaymentMode, "BOTH")
  const disabled = await service.getEffectivePlatformPreferences()
  assert.equal(disabled.jobPaymentMode, "DIRECT")
  assert.equal(disabled.customerAppPaymentsEnabled, false)
  assert.equal((await service.updatePlatformPreferences({ ...disabled, customerAppPaymentsEnabled: true, jobPaymentMode: "BOTH", commissionDebtCap: 2400 })).success, true)
  const enabled = await service.getEffectivePlatformPreferences()
  assert.equal(enabled.customerAppPaymentsEnabled, true)
  assert.equal(enabled.jobPaymentMode, "BOTH")
  assert.equal(enabled.commissionDebtCap, 2400)
  assert.equal((await service.updatePlatformPreferences({ ...enabled, customerAppPaymentsEnabled: "true" })).success, false)
})

function cartFixture(enabled) {
  const file = "backend/actions/cart.ts", deps = depsFor(file)
  const payments = [], notifications = [], entries = [], counters = { walletReads: 0, walletDebits: 0, receipts: 0 }
  const tx = { $queryRaw: async () => [], cartItem: { count: async () => 1, deleteMany: async () => ({ count: 1 }) }, job: { create: async q => ({ id: "job", ...q.data }) }, offer: { update: async () => {} }, payment: { create: async q => { payments.push(q.data); return { id: "payment" } } }, notification: { create: async q => { notifications.push(q.data) } }, transaction: { create: async q => entries.push(q.data) }, wallet: { findUnique: async () => ({ id: "wallet", balance: 1000 }), updateMany: async () => { counters.walletDebits++; return { count: 1 } } } }
  const db = { cartItem: { findMany: async () => [{ id: "cart-line", offerId: "offer", quantity: 1, offer: { id: "offer", title: "Garden kit", status: "LIVE", actionType: "BUY", price: 500, currency: "KES", stockQuantity: 4, providerId: "provider", provider: { userId: "owner", user: { name: "Alex" } } } }] }, blockedShopCustomer: { findMany: async () => [] }, blockedClient: { findFirst: async () => null }, shopkeeperProfile: { findMany: async () => [] }, wallet: { findUnique: async () => { counters.walletReads++; return { id: "wallet", balance: 1000 } } }, $transaction: async fn => fn(tx) }
  Object.assign(deps, { "node:crypto": crypto, zod: require("zod"), "@/backend/auth": { auth: async () => ({ user: { id: "customer", role: "customer" } }) }, "@/backend/db": { db }, "@/backend/actions/admin-settings": { getEffectivePlatformPreferences: async () => ({ customerAppPaymentsEnabled: enabled, jobPaymentMode: enabled ? "BOTH" : "DIRECT" }) }, "@/backend/services/verification-gate": { requireVerified: async () => ({ ok: true }) }, "@/backend/services/push-core": { pushToUser: async () => {} }, "@/backend/services/receipts-core": { createAndEmailReceipt: async () => { counters.receipts++ } } })
  return { service: loadService(file, deps), payments, notifications, counters, entries }
}
const checkoutInput = { shippingAddress: "Example street", shippingPhone: "0712345678", expectedTotal: 500 }

test("direct checkout creates an outstanding owner payment and order without reading/debiting a wallet or issuing a paid receipt", async () => {
  const f = cartFixture(false), result = await f.service.checkout(checkoutInput)
  assert.equal(result.success, true)
  assert.equal(result.paymentMode, "DIRECT")
  assert.equal(f.counters.walletReads, 0)
  assert.equal(f.counters.walletDebits, 0)
  assert.equal(f.counters.receipts, 0)
  assert.equal(f.payments[0].status, "PENDING")
  assert.match(f.payments[0].externalRef, /^DIRECT:/)
  assert.equal(f.payments[0].paidAt, undefined)
  assert.equal(f.entries.length, 0)
})

test("wallet checkout is blocked while disabled, then works again when admin enables payments", async () => {
  const blocked = cartFixture(false)
  assert.equal((await blocked.service.checkout({ ...checkoutInput, paymentChoice: "WALLET" })).success, false)
  assert.equal(blocked.counters.walletReads, 0)
  const enabled = cartFixture(true), result = await enabled.service.checkout({ ...checkoutInput, paymentChoice: "WALLET" })
  assert.equal(result.success, true)
  assert.equal(result.paymentMode, "WALLET")
  assert.equal(enabled.counters.walletDebits, 1)
  assert.equal(enabled.counters.receipts, 1)
  assert.equal(enabled.payments[0].status, "COMPLETED")
  assert.equal(enabled.entries.length, 1)
})

test("session policy tolerates phone sleep under an hour, expires idle sessions and caps active sessions at twelve hours", () => {
  const p = loadService("backend/domain/session-policy.ts"), start = 100000
  assert.equal(p.sessionExpired(start, start, start + 46_000), false)
  assert.equal(p.sessionExpired(start, start, start + p.SESSION_IDLE_MS - 1), false)
  assert.equal(p.sessionExpired(start, start, start + p.SESSION_IDLE_MS), true)
  assert.equal(p.sessionExpired(start, start + p.SESSION_ABSOLUTE_MS - 1000, start + p.SESSION_ABSOLUTE_MS), true)
  assert.equal(p.sessionExpired(NaN, start, start), true)
})

test("WhatsApp OTP uses an authentication template and refuses rejected/provider-error responses", async () => {
  const env = { INFOBIP_BASE_URL: "https://example.api.infobip.com", INFOBIP_API_KEY: "test-key", INFOBIP_WHATSAPP_SENDER: "254700000000", INFOBIP_WHATSAPP_OTP_TEMPLATE: "saji_otp" }
  let payload, accepted = true
  const service = loadService("backend/services/whatsapp-otp.ts", { "node:crypto": crypto }, { process: { env }, URL, AbortSignal, fetch: async (_url, request) => { payload = JSON.parse(request.body); return { ok: true, json: async () => ({ messages: [{ messageId: "test-message", status: { groupName: accepted ? "PENDING" : "REJECTED" } }] }) } } })
  assert.equal((await service.sendWhatsAppOtp("+254712345678", "123456")).sent, true)
  assert.equal(payload.messages[0].content.templateData.buttons[0].parameter, "123456")
  assert.equal(payload.messages[0].to, "254712345678")
  accepted = false
  assert.equal((await service.sendWhatsAppOtp("+254712345678", "123456")).sent, false)
  delete env.INFOBIP_WHATSAPP_OTP_TEMPLATE
  assert.match((await service.sendWhatsAppOtp("+254712345678", "123456")).error, /not configured/)
})

test("WhatsApp signup stores only a salted hash and consumes the verified challenge once", async () => {
  let stored, sentCode
  const service = loadService("backend/actions/otp.ts", {
    crypto, "@/backend/db": { db: { user: { findFirst: async () => null }, verificationToken: {
      deleteMany: async q => { if (stored && (!q.where.token || q.where.token === stored.token)) { stored = null; return { count: 1 } }; return { count: 0 } },
      create: async q => { stored = q.data; return q.data }, findFirst: async q => stored?.identifier === q.where.identifier ? stored : null,
    } } }, "@/backend/services/password": {}, "@/backend/services/rate-limit": { checkRateLimit: async () => ({ allowed: true }) }, "@/backend/services/email": {}, "@/backend/services/email-templates": {}, "@/backend/services/login-proof": {},
    "@/backend/services/sms": { normalizeKenyanPhone: phone => phone === "0712345678" ? "+254712345678" : phone },
    "@/backend/services/whatsapp-otp": { sendWhatsAppOtp: async (_phone, code) => { sentCode = code; return { sent: true } } },
  })
  const sent = await service.sendSignupOtp("0712345678", undefined, "whatsapp")
  assert.equal(sent.channel, "whatsapp")
  assert.match(stored.token, /^wa:[a-f0-9]{32}:[a-f0-9]{64}$/)
  assert.equal(stored.token.includes(sentCode), false)
  assert.equal((await service.verifySignupOtp("+254712345678", "000000")).success, false)
  const verified = await service.verifySignupOtp("+254712345678", sentCode)
  assert.equal(verified.success, true)
  assert.match(stored.identifier, /^signup-verified:/)
  assert.equal((await service.verifySignupOtp("+254712345678", sentCode)).success, false)
})

test("thermal receipt title is centered above the content and a scannable QR sits below it", () => {
  const service = loadService("frontend/lib/receipt-print.ts", { qrcode: require("qrcode"), "@/backend/domain/pos-receipt-details": loadService("backend/domain/pos-receipt-details.ts") })
  const r = { shopName: "<Shop>", saleNumber: "T-1", total: 200, occurredAt: new Date().toISOString(), lines: [], payments: [], subtotal: 200, discount: 0, tax: 0, change: 0 }
  const html = service.receiptHtml(r)
  assert.match(html, /receipt-heading[^}]*text-align: center/)
  assert.match(html, /<h1>&lt;SHOP&gt;<\/h1>/)
  assert.ok(html.indexOf('<header class="receipt-heading">') < html.indexOf('<pre>'))
  assert.ok(html.indexOf('<footer class="receipt-qr">') > html.indexOf('</pre>'))
  const qr = service.receiptQrSvg(r)
  assert.match(qr, /shape-rendering="crispEdges"/)
  assert.match(qr, /<path d="M/)
})

function rentalFixture(enabled, paid = 0) {
  const file = "backend/actions/rentals.ts", deps = depsFor(file)
  let booking, role = "customer", walletWrites = 0, conflict = false
  const tx = { $queryRaw: async () => [], rentalBooking: { findFirst: async () => conflict ? { id: "conflict" } : null, create: async q => (booking = { id: "rental", ...q.data }), updateMany: async q => { if (!booking || !["CONFIRMED", "PICKED_UP"].includes(booking.status)) return { count: 0 }; Object.assign(booking, q.data); return { count: 1 } } }, providerProfile: { findUnique: async () => ({ id: "provider", userId: "owner" }) }, payment: { create: async () => ({ id: "direct" }) }, offer: { update: async () => {} }, notification: { create: async () => {} }, wallet: { upsert: async () => ({ id: "wallet", balance: 0 }), update: async () => { walletWrites++ } }, transaction: { create: async () => {} } }
  const db = { ...tx, rentalBooking: { ...tx.rentalBooking, findFirst: async () => null, findUnique: async () => ({ ...booking, provider: { userId: "owner" } }) }, offer: { findFirst: async () => ({ id: "offer", title: "Equipment", price: 300, depositAmount: 100, providerId: "provider" }) }, payment: { aggregate: async () => ({ _sum: { amount: paid } }) }, $transaction: async fn => fn(tx) }
  Object.assign(deps, { "node:crypto": crypto, zod: require("zod"), "@/backend/db": { db }, "@/backend/auth": { auth: async () => ({ user: { id: role === "customer" ? "customer" : "owner", role } }) }, "@/backend/services/verification-gate": { requireVerified: async () => ({ ok: true }) }, "@/backend/actions/admin-settings": { getEffectivePlatformPreferences: async () => ({ customerAppPaymentsEnabled: enabled }) } })
  return { service: loadService(file, deps), get booking() { return booking }, get walletWrites() { return walletWrites }, provider() { role = "provider" }, clash() { conflict = true }, pickedUp() { booking.status = "PICKED_UP" } }
}
const rentalInput = { offerId: "offer", startDate: "2030-01-02", endDate: "2030-01-04", location: "Counter" }
test("rental reservations use direct payment while disabled and cannot mint a wallet refund; re-enabled bookings retain app checkout", async () => {
  const direct = rentalFixture(false)
  const result = await direct.service.createRentalBooking(rentalInput)
  assert.equal(result.success, true)
  assert.equal(result.directPayment, true)
  assert.equal(direct.booking.status, "CONFIRMED")
  assert.equal(direct.booking.totalAmount, 700)
  assert.equal(direct.booking.startDate.toISOString(), "2030-01-01T21:00:00.000Z")
  assert.equal((await direct.service.cancelRentalBooking({ id: "rental" })).success, true)
  assert.equal(direct.walletWrites, 0)
  const app = rentalFixture(true)
  await app.service.createRentalBooking(rentalInput)
  assert.equal(app.booking.status, "PENDING_PAYMENT")
  const clash = rentalFixture(false); clash.clash()
  assert.equal((await clash.service.createRentalBooking(rentalInput)).success, false)
})

test("actual historical rental app payments still receive deposit refunds even if new app payments are disabled", async () => {
  const paid = rentalFixture(false, 700)
  await paid.service.createRentalBooking(rentalInput)
  paid.provider(); paid.pickedUp()
  assert.equal((await paid.service.returnRentalBooking({ id: "rental", depositRefundAmount: 100 })).success, true)
  assert.equal(paid.walletWrites, 1)
  assert.equal(paid.booking.depositRefundAmount, 100)
  const direct = rentalFixture(false)
  await direct.service.createRentalBooking(rentalInput)
  direct.provider(); direct.pickedUp()
  assert.equal((await direct.service.returnRentalBooking({ id: "rental", depositRefundAmount: 100 })).success, true)
  assert.equal(direct.walletWrites, 0)
  assert.equal(direct.booking.depositRefundAmount, 0)
})

test("the payment API enforces the admin switch before gateways, and resumes the existing gateway flow after re-enabling", async () => {
  const file = "app/api/payments/initiate/route.ts", deps = depsFor(file)
  let enabled = false, gatewayCalls = 0
  Object.assign(deps, {
    "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    "@/backend/auth": { auth: async () => ({ user: { id: "customer", role: "customer" } }) },
    "@/backend/services/verification-gate": { requireVerified: async () => ({ ok: true }) },
    "@/backend/actions/admin-settings": { getEffectivePlatformPreferences: async () => ({ customerAppPaymentsEnabled: enabled, jobPaymentMode: "BOTH" }) },
    "@/backend/db": { db: { rentalBooking: { findUnique: async () => ({ id: "rental", customerId: "customer", status: "PENDING_PAYMENT", totalAmount: 500, offerId: "offer", offer: { title: "Equipment" } }) }, payment: { findFirst: async () => null } } },
    "@/backend/services/payment-gateways": { initiateMpesaPayment: async () => { gatewayCalls++; return { success: false, message: "Gateway fixture; no real request sent" } } },
  })
  const { POST } = loadService(file, deps, { URL })
  const request = { url: "https://mysaji.com/api/payments/initiate", json: async () => ({ context: "rental-booking", provider: "mpesa", phone: "0712345678", bookingId: "rental" }) }
  assert.equal((await POST(request)).status, 403)
  assert.equal(gatewayCalls, 0)
  enabled = true
  assert.equal((await POST(request)).body.message, "Gateway fixture; no real request sent")
  assert.equal(gatewayCalls, 1)
})

test("fresh login clears old local inactivity before Auth.js broadcasts the authenticated session", async () => {
  const calls = []
  const service = loadService("frontend/lib/hooks/useAuth.ts", {
    react: { useCallback: callback => callback },
    "next-auth/react": { useSession: () => ({ status: "unauthenticated", data: null }), signIn: async () => { calls.push("sign-in"); return {} }, getSession: async () => ({ user: { role: "customer" } }) },
    "@/frontend/lib/session-heartbeat": { clearSessionHeartbeat: () => calls.push("clear-idle") },
    "@/frontend/lib/pos-offline-scope": {}, "@/frontend/lib/device-push": {},
  })
  const result = await service.useAuth().login("customer@example.invalid", "password", "verified-proof")
  assert.equal(result.success, true)
  assert.equal(calls[0], "clear-idle")
  assert.equal(calls[1], "sign-in")
})

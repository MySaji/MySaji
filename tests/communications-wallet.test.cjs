const { test } = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const vm = require("node:vm")
const { loadService } = require("./load-service.cjs")

test("chat attachments enforce actual size and media type; executable inline files are rejected", () => {
  const { validChatAttachment, MAX_CHAT_FILE_BYTES } = loadService("backend/domain/chat-media.ts")
  const small = Buffer.from("preview").toString("base64")
  assert.equal(validChatAttachment("VOICE", `data:audio/mp4;base64,${small}`), true)
  assert.equal(validChatAttachment("VOICE", `data:audio/webm;codecs=opus;base64,${small}`), true)
  assert.equal(validChatAttachment("FILE", `data:application/pdf;base64,${small}`), true)
  for (const url of [`data:text/html;base64,${small}`, `data:image/svg+xml;base64,${small}`, "javascript:alert(1)", "data:audio/mp4;base64,not-valid!"]) assert.equal(validChatAttachment("FILE", url), false)
  assert.equal(validChatAttachment("IMAGE", `data:image/png;base64,${Buffer.alloc(MAX_CHAT_FILE_BYTES + 1).toString("base64")}`), false)
})

test("wallet filters retain signed amounts, failed states and inclusive date boundaries; CSV escapes formulas", () => {
  const { filterLedger, csvCell } = loadService("frontend/lib/wallet-ledger.ts")
  const rows = [{ id: "a", description: "Deposit", amount: 500, status: "completed", date: "2026-10-18T09:00:00Z" }, { id: "b", description: "Payout", amount: -200, status: "failed", date: "2026-10-18T10:00:00Z" }]
  assert.deepEqual(Array.from(filterLedger(rows, "payout", "failed", "out", "2026-10-18", "2026-10-18"), entry => entry.id), ["b"])
  assert.equal(filterLedger(rows, "", "completed", "out", "", "").length, 0)
  assert.equal(rows[1].amount, -200)
  assert.equal(csvCell('=SUM(1,2)'), '"\'=SUM(1,2)"')
  assert.equal(csvCell('A "quote"'), '"A ""quote"""')
  assert.equal(csvCell(-200), '"-200"')
})

function worker() {
  const events = {}, notices = [], opened = []
  let session = null
  const indexedDB = { open: () => {
    const request = {}
    queueMicrotask(() => {
      request.result = { close() {}, transaction() {
        const tx = { objectStore: () => ({ get: () => operation(session), put: value => { session = value; return operation(value) } }) }
        function operation(value) { const op = {}; queueMicrotask(() => { op.result = value; op.onsuccess?.(); queueMicrotask(() => tx.oncomplete?.()) }); return op }
        return tx
      } }
      request.onsuccess?.()
    })
    return request
  } }
  vm.runInNewContext(fs.readFileSync("public/sw.js", "utf8"), { URL, Date, indexedDB, self: { location: { origin: "https://mysaji.com" }, addEventListener: (name, fn) => events[name] = fn, skipWaiting() {}, registration: { showNotification: async (...args) => notices.push(args) }, clients: { claim() {}, matchAll: async () => [], openWindow: async url => opened.push(url) } } })
  const trigger = async (name, value) => { let pending; events[name]({ ...value, waitUntil: promise => pending = promise }); await pending }
  return { events, notices, opened, trigger }
}

test("device push rejects signed-out, expired and wrong-account delivery and constrains click destinations", async () => {
  const w = worker()
  const payload = { title: "New message", body: "A message", recipientId: "customer-a", url: "https://attacker.example/" }
  await w.trigger("push", { data: { json: () => payload } })
  assert.equal(w.notices.length, 0)
  await w.trigger("message", { data: { type: "SAJI_PUSH_SESSION", session: { userId: "customer-a", expiresAt: Date.now() + 60000 } } })
  await w.trigger("push", { data: { json: () => ({ ...payload, recipientId: "customer-b" }) } })
  assert.equal(w.notices.length, 0)
  await w.trigger("push", { data: { json: () => payload } })
  assert.equal(w.notices.length, 1)
  assert.equal(w.notices[0][1].data.url, "https://mysaji.com/")
  assert.equal(w.notices[0][1].silent, false)
  await w.trigger("message", { data: { type: "SAJI_PUSH_SESSION", session: { userId: "customer-a", expiresAt: Date.now() - 1 } } })
  await w.trigger("push", { data: { json: () => payload } })
  assert.equal(w.notices.length, 1)
  await w.trigger("notificationclick", { notification: { close() {}, data: { url: "javascript:alert(1)" } } })
  assert.deepEqual(w.opened, ["https://mysaji.com/"])
  assert.equal(w.events.fetch, undefined)
})

test("call signals require conversation membership; cleanup preserves fresh termination signals", async () => {
  const deleted = []
  let participant = false
  const calls = loadService("backend/actions/calls.ts", {
    zod: require("zod"), "next/server": { after() {} }, "@/backend/auth": { auth: async () => ({ user: { id: "me" } }) },
    "@/backend/db": { db: { conversation: { findUnique: async () => participant ? { participantAId: "me", participantBId: "other" } : null }, callSignal: { deleteMany: async input => deleted.push(input) } } },
    "@/backend/services/push-core": { pushToUser() {} }, "@/backend/services/role-map": { ROLE_DB_TO_APP: {} },
  })
  assert.equal((await calls.sendCallSignal({ conversationId: "secret", type: "offer", payload: {} })).success, false)
  await calls.clearCallSignals("secret")
  assert.equal(deleted.length, 0)
  participant = true
  await calls.clearCallSignals("mine")
  assert.equal(deleted[0].where.toUserId, "me")
  assert.ok(deleted[0].where.createdAt.lt < new Date(Date.now() - 80000))
})

test("personal wallets use the active session owner and preserve failed/reversed transaction states", async () => {
  let session = null, active = true
  const writes = []
  const wallet = loadService("backend/actions/wallet.ts", {
    zod: require("zod"), "@/backend/auth": { auth: async () => session },
    "@/backend/db": { db: {
      user: { findUnique: async () => ({ isActive: active, deletedAt: null }) },
      wallet: { upsert: async input => { writes.push(input); return { balance: 0, currency: "KES", transactions: [{ id: "failed", type: "CREDIT", amount: 100, status: "FAILED", description: "Failed deposit", createdAt: new Date() }, { id: "reversed", type: "DEBIT", amount: -100, status: "REVERSED", description: "Reversed debit", createdAt: new Date() }] } } },
      paymentMethod: { findMany: async () => [] }, transaction: { aggregate: async () => ({ _sum: { amount: 0 } }) }, job: { count: async () => 0 },
    } },
    "@/backend/services/verification-gate": {}, "@/backend/services/push-core": {}, "@/backend/services/notifications-core": {},
    "@/backend/actions/jobs": { getActiveEscrowJobs: async () => [] }, "@/backend/services/receipts-core": {}, "@/backend/services/payment-method-crypto": {}, "@/backend/services/wallet-core": {},
  })
  assert.equal(await wallet.getWalletSummary(), null)
  assert.equal(writes.length, 0)
  session = { user: { id: "staff-owner", role: "secretary" } }
  active = false
  assert.equal(await wallet.getWalletSummary(), null)
  assert.equal(writes.length, 0)
  active = true
  const result = await wallet.getWalletSummary()
  assert.equal(writes[0].where.userId, "staff-owner")
  assert.equal(writes[0].create.userId, "staff-owner")
  assert.equal(Object.hasOwn(writes[0].create, "balance"), false)
  assert.equal(Object.keys(writes[0].update).length, 0)
  assert.deepEqual(Array.from(result.transactions, transaction => transaction.status), ["failed", "reversed"])
})

test("private attachments authorize both participants and support byte-range audio seeking without public caching", async () => {
  let userId = null
  const queries = []
  const { GET } = loadService("app/api/messages/[id]/attachment/route.ts", {
    "@/backend/auth": { auth: async () => userId ? { user: { id: userId } } : null },
    "@/backend/db": { db: { message: { findUnique: async input => { queries.push(input); return { attachmentUrl: "data:audio/mp4;base64," + Buffer.from("abcdef").toString("base64"), type: "VOICE", content: "Voice message", conversation: { participantAId: "sender", participantBId: "receiver" } } } } } },
  }, { Headers, Response, Request })
  const params = { params: Promise.resolve({ id: "voice-a" }) }
  assert.equal((await GET(new Request("https://mysaji.com/api/messages/voice-a/attachment"), params)).status, 401)
  assert.equal(queries.length, 0)
  userId = "stranger"
  assert.equal((await GET(new Request("https://mysaji.com/api/messages/voice-a/attachment"), params)).status, 404)
  userId = "receiver"
  const part = await GET(new Request("https://mysaji.com/api/messages/voice-a/attachment", { headers: { Range: "bytes=1-3" } }), params)
  assert.equal(part.status, 206)
  assert.equal(await part.text(), "bcd")
  assert.equal(part.headers.get("Content-Range"), "bytes 1-3/6")
  assert.match(part.headers.get("Cache-Control"), /private, no-store/)
  assert.equal((await GET(new Request("https://mysaji.com/api/messages/voice-a/attachment", { headers: { Range: "bytes=100-" } }), params)).status, 416)
})

test("message polling returns private attachment references and never reloads inline file bodies", async () => {
  let userId = "stranger", reads = 0
  const messages = loadService("backend/actions/messages.ts", {
    zod: require("zod"), "next/server": { after() {} }, "@/backend/auth": { auth: async () => ({ user: { id: userId } }) },
    "@/backend/db": { db: { conversation: { findUnique: async () => ({ participantAId: "sender", participantBId: "receiver" }) }, message: {
      updateMany: async input => { assert.equal(input.where.conversationId, "conversation-a") },
      findMany: async input => { reads++; assert.equal(input.where.conversationId, "conversation-a"); assert.equal(Object.hasOwn(input.select, "attachmentUrl"), false); return [{ id: "voice-a", senderId: "sender", type: "VOICE", content: "Voice message", attachmentUrl: "data:audio/mp4;base64,YWJj", isRead: true, createdAt: new Date(), replyTo: null }] },
    } } },
    "@/backend/services/moderation-core": {}, "@/backend/services/role-map": {}, "@/backend/services/push-core": {}, "@/backend/domain/message-permissions": {}, "@/backend/domain/contact-info-filter": {},
    "@/backend/domain/chat-media": loadService("backend/domain/chat-media.ts"),
  })
  assert.equal((await messages.getMessages("conversation-a")).length, 0)
  assert.equal(reads, 0)
  userId = "receiver"
  const result = await messages.getMessages("conversation-a")
  assert.equal(result[0].attachmentUrl, "/api/messages/voice-a/attachment")
  assert.equal(JSON.stringify(result).includes("base64"), false)
  assert.equal(reads, 1)
})

const { test } = require("node:test")
const assert = require("node:assert/strict")
const { loadService } = require("./load-service.cjs")

function till() {
  const journal = []
  const db = {
    shopkeeperProfile: { findUnique: async () => ({ id: "shop", shopName: "Shop", posEnabled: true, posProfileKey: "GROCERY", posConfig: {} }) },
    tillSession: { findFirst: async () => null, create: async () => ({ id: "shift" }), update: async () => ({}) },
  }
  const actions = loadService("backend/actions/pos-sales.ts", {
    zod: require("zod"), bcryptjs: {}, crypto: require("node:crypto"),
    "@/backend/db": { db },
    "@/backend/auth": { auth: async () => ({ user: { id: "employee-user", role: "shopkeeper", name: "Amina" } }) },
    "@/backend/services/pos-access-core": { requirePosPermission: async () => ({ ok: true, actor: { businessId: "business", storeId: "branch", staffId: "employee-seat" } }), recordPosAudit: async event => journal.push(event) },
    "@/backend/services/pos-tenant": { posShopIdFor: async () => "shop" },
    "@/backend/domain/pos-receipt-details": loadService("backend/domain/pos-receipt-details.ts"),
    "@/backend/domain/pos-mpesa": loadService("backend/domain/pos-mpesa.ts"),
    "@/backend/services/pos-mpesa-claims": {}, "@/backend/services/pos-ledger": {},
    "@/backend/services/pos-approval": { approveWithManagerPin: async () => ({ ok: true }) },
    "@/backend/domain/pos-pricing": {}, "@/backend/domain/pos-config": { parsePosConfig: () => ({}) },
    "@/backend/actions/pos-mpesa": {}, "@/backend/services/etims-queue-core": { queueSaleForEtims: async () => {} },
    "@/backend/actions/pos-billing-shop": {}, "@/backend/domain/pos-profiles": { effectiveTraits: () => [] },
  })
  return { actions, db, journal }
}

test("shift opening logs the authenticated staff identity, not a supplied cashier label", async () => {
  const { actions, journal, db } = till()
  assert.equal((await actions.openTillShift({ openingFloat: 100, cashierName: "Someone else" })).success, true)
  assert.equal(journal[0].action, "shift.open")
  assert.equal(journal[0].actor.staffId, "employee-seat")
  assert.equal(journal[0].actor.userId, "employee-user")
  assert.equal(journal[0].entityId, "shift")
  assert.match(journal[0].summary, /Amina/)
  db.tillSession.findFirst = async () => ({ id: "already-open" })
  assert.equal((await actions.openTillShift({ openingFloat: 100 })).success, false)
  assert.equal(journal.length, 1, "Rejected openings must not inflate activity")
})

test("shift closing journals the actual closing actor and saved reconciliation figures", async () => {
  const { actions, journal, db } = till()
  db.tillSession.findFirst = async () => ({ id: "shift", openingFloat: 100 })
  db.posSale = { findMany: async () => [] }
  assert.equal((await actions.closeTillShift({ countedCash: 90 })).success, true)
  assert.equal(journal[0].action, "shift.close")
  assert.equal(journal[0].actor.staffId, "employee-seat")
  assert.equal(journal[0].detail.expectedCash, 100)
  assert.equal(journal[0].detail.variance, -10)
})

test("sale void audit is inside the financial transaction and an audit failure prevents success", async () => {
  const { actions, db } = till()
  db.posSale = { findFirst: async () => ({ id: "sale", saleNumber: "S-001", status: "COMPLETED", items: [], total: 100 }) }
  let committed = false, failAudit = false, event
  db.$transaction = async fn => {
    await fn({
      posSale: { update: async () => {} }, posLoyaltyEntry: { findMany: async () => [] },
      stockMovement: { findMany: async () => [] }, productSerial: { findMany: async () => [] },
      posAuditEvent: { create: async input => { if (failAudit) throw Error("audit unavailable"); event = input.data } },
    })
    committed = true
  }
  assert.equal((await actions.voidPosSale({ saleId: "sale", reason: "Wrong item" })).success, true)
  assert.equal(committed, true)
  assert.equal(event.action, "sale.void")
  assert.equal(event.actorStaffId, "employee-seat")
  assert.equal(event.businessId, "business")
  committed = false; failAudit = true
  assert.equal((await actions.voidPosSale({ saleId: "sale", reason: "Wrong item" })).success, false)
  assert.equal(committed, false)
})

const { test } = require("node:test")
const assert = require("node:assert/strict")
const { loadService } = require("./load-service.cjs")

function setup({ signedIn = true, owner = true } = {}) {
  const queries = []
  const staff = [
    { id: "cashier", name: "Amina", role: "CASHIER", userId: "amina-account", isActive: true },
    { id: "stock", name: "Brian", role: "STOCK_CONTROLLER", userId: "brian-account", isActive: false },
    { id: "quiet", name: "Chao", role: "ACCOUNTANT", userId: "chao-account", isActive: true },
  ]
  const at = new Date()
  const group = (actorStaffId, actorUserId, action, count) => ({ actorStaffId, actorUserId, action, _count: { _all: count }, _max: { createdAt: at } })
  const groups = [group("cashier", "owner-account", "receipt.issue", 8), group(null, "brian-account", "product.create", 3), group("stock", "brian-account", "stock.count_submit", 2), group(null, "owner-account", "team.update", 1), group("deleted-staff", "owner-account", "sale.void", 1), group(null, null, "device.sync", 1)]
  const db = {
    posBusiness: { findUnique: async q => { queries.push(["business", q]); return owner ? { id: "my-business" } : null } },
    posStaff: { findMany: async q => { queries.push(["staff", q]); return staff } },
    posStore: { findMany: async q => { queries.push(["stores", q]); return [{ id: "my-branch", name: "Main shop" }] } },
    posAuditEvent: {
      groupBy: async q => { queries.push(["groups", q]); return groups },
      count: async q => { queries.push(["count", q]); return 125 },
      findMany: async q => { queries.push(["events", q]); return [{ id: "event", createdAt: at, action: "receipt.issue", summary: "Receipt issued", actorStaffId: "cashier", actorUserId: "owner-account", storeId: "my-branch", entityType: "pos_sale", entityId: "sale" }] },
    },
  }
  const actions = loadService("backend/actions/pos-audit.ts", {
    zod: require("zod"), "@/backend/db": { db },
    "@/backend/services/active-user": { activeUser: async () => signedIn ? { id: "owner-account", name: "Owner" } : null },
  })
  return { ...actions, queries, staff }
}

test("employee audit requires the real signed-in business owner before reading any events", async () => {
  const anonymous = setup({ signedIn: false })
  assert.equal((await anonymous.getPosEmployeeAudit()).success, false)
  assert.equal(anonymous.queries.length, 0)
  const employee = setup({ owner: false })
  assert.equal((await employee.getPosEmployeeAudit()).success, false)
  assert.equal(employee.queries.length, 1)
  assert.equal(employee.queries[0][1].where.ownerUserId, "owner-account")
})

test("audit scopes all data to the owner's business and rejects foreign employee/branch filters", async () => {
  const service = setup()
  for (const input of [{ storeId: "another-shop" }, { employeeId: "someone-else" }, { days: 365 }, { page: -1 }]) {
    assert.equal((await service.getPosEmployeeAudit(input)).success, false)
  }
  assert.equal(service.queries.some(([kind]) => ["groups", "count", "events"].includes(kind)), false)
  await service.getPosEmployeeAudit({ days: 30, storeId: "my-branch", employeeId: "stock", action: "product.create", page: 2, search: "rice" })
  for (const [kind, q] of service.queries.filter(([kind]) => kind !== "business")) {
    assert.equal(q.where.businessId, "my-business", kind)
    if (["groups", "count", "events"].includes(kind)) assert.equal(q.where.storeId, "my-branch")
  }
  const q = service.queries.find(([kind]) => kind === "events")[1]
  assert.equal(q.take, 50); assert.equal(q.skip, 50)
  assert.equal(q.where.action, "product.create")
  assert.equal(q.where.summary.contains, "rice")
  assert.equal(q.where.OR[0].actorStaffId, "stock")
  assert.equal(q.where.OR[1].actorStaffId, null)
  assert.equal(q.select.detail, undefined, "Receipt payloads and sensitive audit detail must not be returned")
})

test("activity gives counter PINs precedence, preserves disabled/zero-activity staff and separates owner/system events", async () => {
  const { getPosEmployeeAudit } = setup()
  const result = await getPosEmployeeAudit()
  assert.equal(result.success, true)
  const data = result.data
  assert.equal(data.people[0].name, "Amina")
  assert.equal(data.people[0].actions, 8)
  assert.equal(data.people[0].receipts, 8)
  assert.equal(data.people[1].actions, 5)
  assert.equal(data.people[1].catalogue, 3)
  assert.equal(data.people[1].stock, 2)
  assert.equal(data.people[1].enabled, false)
  assert.equal(data.people[2].actions, 0)
  assert.equal(data.people[2].lastActivity, null)
  assert.equal(data.ownerActions, 1)
  assert.equal(data.unattributedActions, 2)
  assert.equal(data.totalActions, 16)
  assert.equal(data.events[0].who, "Amina")
})

test("shared account fallback cannot assign events to an arbitrary employee", async () => {
  const service = setup()
  service.staff.push({ id: "duplicate", name: "Other seat", userId: "brian-account", role: "CASHIER", isActive: true })
  const result = await service.getPosEmployeeAudit({ employeeId: "stock" })
  assert.equal(result.data.people.find(p => p.id === "stock").actions, 2)
  assert.equal(result.data.unattributedActions, 5)
  const events = service.queries.find(([kind]) => kind === "events")[1]
  assert.equal(events.where.OR.length, 1)
})

test("custom employee dates include both calendar days in East Africa Time", async () => {
  const service = setup()
  const result = await service.getPosEmployeeAudit({ employeeId: "cashier", from: "2026-10-01", to: "2026-10-15", page: 2 })
  assert.equal(result.success, true)
  for (const [kind, query] of service.queries.filter(([kind]) => ["groups", "count", "events"].includes(kind))) {
    assert.equal(query.where.createdAt.gte.toISOString(), "2026-09-30T21:00:00.000Z", kind)
    assert.equal(query.where.createdAt.lt.toISOString(), "2026-10-15T21:00:00.000Z", kind)
  }
  const events = service.queries.find(([kind]) => kind === "events")[1]
  assert.equal(events.where.OR[0].actorStaffId, "cashier")
  assert.equal(events.skip, 50)
  assert.equal(result.data.until, "2026-10-15T20:59:59.999Z")
})

test("incomplete, impossible and reversed custom dates cannot query audit events", async () => {
  for (const input of [{ from: "2026-10-01" }, { to: "2026-10-01" }, { from: "2026-02-30", to: "2026-03-01" }, { from: "2026-99-99", to: "2026-99-99" }, { from: "2026-10-15", to: "2026-10-01" }]) {
    const service = setup()
    assert.equal((await service.getPosEmployeeAudit(input)).success, false)
    assert.equal(service.queries.some(([kind]) => ["groups", "count", "events"].includes(kind)), false)
  }
})

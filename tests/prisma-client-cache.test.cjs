const { test } = require("node:test")
const assert = require("node:assert/strict")
const { loadService } = require("./load-service.cjs")

test("development reuses a matching Prisma client but refreshes it after schema generation", () => {
  const shared = {}
  let created = 0
  const Prisma = { dmmf: { datamodel: { models: [{ name: "User", fields: ["id"] }] } } }
  class PrismaClient { constructor() { this.generation = ++created } }
  const load = () => loadService("backend/db.ts", { "@prisma/client": { Prisma, PrismaClient } }, { globalThis: shared, process: { env: { NODE_ENV: "development" } } }).db
  const first = load()
  assert.equal(load(), first)
  Prisma.dmmf.datamodel.models.push({ name: "PosSalonAppointment", fields: ["id", "startsAt"] })
  const updated = load()
  assert.notEqual(updated, first)
  assert.equal(load(), updated)
  assert.equal(created, 2)
})

test("a legacy development singleton without a schema stamp cannot hide new model delegates", () => {
  const stale = { generation: "old" }
  const shared = { prisma: stale }
  class PrismaClient {}
  const { db } = loadService("backend/db.ts", { "@prisma/client": { Prisma: { dmmf: { datamodel: { models: [] } } }, PrismaClient } }, { globalThis: shared, process: { env: { NODE_ENV: "development" } } })
  assert.notEqual(db, stale)
  assert.equal(shared.prisma, db)
})

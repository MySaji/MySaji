"use server"

import { z } from "zod"
import { Prisma } from "@prisma/client"
import { db } from "@/backend/db"
import { requirePosPermission, recordPosAudit } from "@/backend/services/pos-access-core"

/**
 * A restaurant floor: tables, tabs, and the kitchen.
 *
 * WHY A TAB IS NOT THE TILL'S BASKET
 *
 * A counter basket is rung up in one go by the person holding it. A tab is
 * open for an hour, added to three times by two waiters, partly cooked, and
 * paid at the end. The till's cart has nowhere to put "ordered at 19:42, with
 * the kitchen, not yet served", and on a restaurant floor that is the only
 * state anybody cares about.
 *
 * WHY THE KITCHEN SCREEN READS LINES AND NOT ORDERS
 *
 * A table orders two starters and three mains. The starters are cooked now
 * and the mains in ten minutes, by different people on different sections. A
 * screen that shows whole orders makes the kitchen read around the half it is
 * not working on. So the unit is the line, grouped by table for plating, and
 * a line is bumped when it is ready rather than a whole ticket.
 *
 * WHY PAYING GOES THROUGH recordPosSale
 *
 * Same reason a job card does. Tender, change, the shift, stock and tax
 * already exist once, correctly, in the till. A second copy here would drift.
 */

const D = (v: unknown) => new Prisma.Decimal(v as never)
const money = (d: Prisma.Decimal) => Number(d.toFixed(2))
const qty = (d: Prisma.Decimal) => Number(d.toFixed(3))

async function gate(permission: Parameters<typeof requirePosPermission>[0], staffId?: string | null) {
  const g = await requirePosPermission(permission, staffId)
  if (!g.ok) return { ok: false as const, error: g.error }
  if (!g.actor.shopkeeperId) return { ok: false as const, error: "This business has no shop set up yet." }
  return { ok: true as const, shopkeeperId: g.actor.shopkeeperId, actor: g.actor }
}

export type TableRow = {
  id: string
  name: string
  area: string | null
  seats: number
  /** The tab currently open on it, if any. */
  openOrderId: string | null
  openReference: string | null
  /** How long it has been sitting, in minutes. The number a host scans for. */
  sittingMinutes: number | null
  runningTotal: number
  covers: number | null
}

export async function getFloor(staffId?: string | null): Promise<TableRow[]> {
  const g = await gate("till.sell", staffId)
  if (!g.ok) return []

  const tables = await db.posTable.findMany({
    where: { shopkeeperId: g.shopkeeperId, isActive: true },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    include: {
      orders: {
        where: { status: { in: ["OPEN", "IN_KITCHEN", "SERVED"] } },
        orderBy: { openedAt: "desc" },
        take: 1,
        include: { lines: { where: { voidedAt: null } } },
      },
    },
  })

  const now = Date.now()
  return tables.map((t) => {
    const order = t.orders[0]
    return {
      id: t.id,
      name: t.name,
      area: t.area,
      seats: t.seats,
      openOrderId: order?.id ?? null,
      openReference: order?.reference ?? null,
      sittingMinutes: order ? Math.floor((now - order.openedAt.getTime()) / 60000) : null,
      runningTotal: order ? money(order.lines.reduce((a, l) => a.add(l.total), D(0))) : 0,
      covers: order?.covers ?? null,
    }
  })
}

export type TabLineRow = {
  id: string
  name: string
  quantity: number
  unitPrice: number
  total: number
  modifiers: string[]
  course: number
  /** Where the line has got to, in one word for the waiter. */
  state: "ordered" | "cooking" | "ready" | "served"
  sentToKitchenAt: string | null
}

export type TabRow = {
  id: string
  reference: string
  tableName: string | null
  isTakeaway: boolean
  status: "OPEN" | "IN_KITCHEN" | "SERVED" | "CLOSED" | "CANCELLED"
  covers: number | null
  customerName: string | null
  openedAt: string
  openedBy: string | null
  serviceChargePercent: number | null
  lines: TabLineRow[]
  food: number
  serviceCharge: number
  total: number
}

function lineState(l: { sentToKitchenAt: Date | null; readyAt: Date | null; servedAt: Date | null }): TabLineRow["state"] {
  if (l.servedAt) return "served"
  if (l.readyAt) return "ready"
  if (l.sentToKitchenAt) return "cooking"
  return "ordered"
}

function toTab(o: {
  id: string; reference: string; status: string; covers: number | null; isTakeaway: boolean
  customerName: string | null; openedAt: Date; openedByName: string | null
  serviceChargePercent: Prisma.Decimal | null
  table: { name: string } | null
  lines: { id: string; name: string; quantity: Prisma.Decimal; unitPrice: Prisma.Decimal; total: Prisma.Decimal; modifiers: string[]; course: number; sentToKitchenAt: Date | null; readyAt: Date | null; servedAt: Date | null }[]
}): TabRow {
  const food = o.lines.reduce((a, l) => a.add(l.total), D(0))
  const pct = o.serviceChargePercent ? D(o.serviceChargePercent) : D(0)
  const service = food.mul(pct).div(100)
  return {
    id: o.id,
    reference: o.reference,
    tableName: o.table?.name ?? null,
    isTakeaway: o.isTakeaway,
    status: o.status as TabRow["status"],
    covers: o.covers,
    customerName: o.customerName,
    openedAt: o.openedAt.toISOString(),
    openedBy: o.openedByName,
    serviceChargePercent: o.serviceChargePercent ? Number(o.serviceChargePercent) : null,
    lines: o.lines.map((l) => ({
      id: l.id,
      name: l.name,
      quantity: qty(l.quantity),
      unitPrice: money(l.unitPrice),
      total: money(l.total),
      modifiers: l.modifiers,
      course: l.course,
      state: lineState(l),
      sentToKitchenAt: l.sentToKitchenAt?.toISOString() ?? null,
    })),
    food: money(food),
    serviceCharge: money(service),
    total: money(food.add(service)),
  }
}

export async function getTab(id: string, staffId?: string | null): Promise<TabRow | null> {
  const g = await gate("till.sell", staffId)
  if (!g.ok) return null

  const o = await db.posTableOrder.findFirst({
    where: { id, shopkeeperId: g.shopkeeperId },
    include: {
      table: { select: { name: true } },
      lines: { where: { voidedAt: null }, orderBy: [{ course: "asc" }, { createdAt: "asc" }] },
    },
  })
  return o ? toTab(o) : null
}

export type TableResult = { success: true; id: string } | { success: false; error: string }

const tableSchema = z.object({
  name: z.string().trim().min(1, "Give the table a name."),
  area: z.string().trim().max(60).optional().nullable(),
  seats: z.coerce.number().int().min(1).max(50).default(4),
  staffId: z.string().optional().nullable(),
})

export async function createTable(input: unknown): Promise<TableResult> {
  const parsed = tableSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Check the details." }
  }
  const { name, area, seats, staffId } = parsed.data

  const g = await gate("settings.store", staffId)
  if (!g.ok) return { success: false, error: g.error }

  const clash = await db.posTable.findFirst({
    where: { shopkeeperId: g.shopkeeperId, name }, select: { id: true },
  })
  if (clash) return { success: false, error: "There is already a table called " + name + "." }

  const t = await db.posTable.create({
    data: { shopkeeperId: g.shopkeeperId, name, area: area || null, seats },
    select: { id: true },
  })
  return { success: true, id: t.id }
}

const openSchema = z.object({
  tableId: z.string().trim().optional().nullable(),
  isTakeaway: z.coerce.boolean().default(false),
  covers: z.coerce.number().int().min(1).max(100).optional().nullable(),
  customerName: z.string().trim().max(120).optional().nullable(),
  customerPhone: z.string().trim().max(30).optional().nullable(),
  serviceChargePercent: z.coerce.number().min(0).max(100).optional().nullable(),
  staffId: z.string().optional().nullable(),
})

/** Seat a table, or start a takeaway. */
export async function openTab(input: unknown): Promise<TableResult> {
  const parsed = openSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Check the details." }
  }
  const d = parsed.data

  const g = await gate("till.sell", d.staffId)
  if (!g.ok) return { success: false, error: g.error }

  if (!d.tableId && !d.isTakeaway) {
    return { success: false, error: "Pick a table, or mark it as takeaway." }
  }

  if (d.tableId) {
    const table = await db.posTable.findFirst({
      where: { id: d.tableId, shopkeeperId: g.shopkeeperId, isActive: true },
      select: { id: true, name: true },
    })
    if (!table) return { success: false, error: "That table was not found." }

    // One tab per table. Two open tabs on table four is how a party pays for
    // half its meal and walks out believing it settled.
    const busy = await db.posTableOrder.findFirst({
      where: { tableId: d.tableId, status: { in: ["OPEN", "IN_KITCHEN", "SERVED"] } },
      select: { reference: true },
    })
    if (busy) {
      return { success: false, error: table.name + " already has " + busy.reference + " open on it." }
    }
  }

  const last = await db.posTableOrder.findFirst({
    where: { shopkeeperId: g.shopkeeperId },
    orderBy: { openedAt: "desc" },
    select: { reference: true },
  })
  const n = last ? Number(last.reference.replace(/\D/g, "")) + 1 : 1
  const reference = "TB-" + String(Number.isFinite(n) ? n : 1).padStart(4, "0")

  const created = await db.posTableOrder.create({
    data: {
      shopkeeperId: g.shopkeeperId,
      tableId: d.tableId || null,
      reference,
      isTakeaway: d.isTakeaway,
      covers: d.covers ?? null,
      customerName: d.customerName || null,
      customerPhone: d.customerPhone || null,
      serviceChargePercent: d.serviceChargePercent == null ? null : D(d.serviceChargePercent),
      openedByName: g.actor.name,
    },
    select: { id: true },
  })

  return { success: true, id: created.id }
}

const addSchema = z.object({
  orderId: z.string().min(1),
  productId: z.string().trim().optional().nullable(),
  name: z.string().trim().max(200).optional().nullable(),
  quantity: z.coerce.number().positive().default(1),
  unitPrice: z.coerce.number().min(0).optional().nullable(),
  modifiers: z.array(z.string().trim().max(80)).max(20).default([]),
  course: z.coerce.number().int().min(1).max(9).default(1),
  staffId: z.string().optional().nullable(),
})

/** Put something on the tab. Nothing goes to the kitchen until it is sent. */
export async function addTabLine(input: unknown): Promise<TableResult> {
  const parsed = addSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Check the details." }
  }
  const d = parsed.data

  const g = await gate("till.sell", d.staffId)
  if (!g.ok) return { success: false, error: g.error }

  const order = await db.posTableOrder.findFirst({
    where: { id: d.orderId, shopkeeperId: g.shopkeeperId },
    select: { id: true, status: true, reference: true },
  })
  if (!order) return { success: false, error: "That tab was not found." }
  if (order.status === "CLOSED") {
    return { success: false, error: "Tab " + order.reference + " has been paid." }
  }
  if (order.status === "CANCELLED") {
    return { success: false, error: "Tab " + order.reference + " was cancelled." }
  }

  let name = (d.name ?? "").trim()
  let price = d.unitPrice == null ? null : D(d.unitPrice)

  if (d.productId) {
    const p = await db.product.findFirst({
      where: { id: d.productId, shopkeeperId: g.shopkeeperId },
      select: { id: true, name: true, price: true, discountPrice: true },
    })
    if (!p) return { success: false, error: "That dish is not on this shop's menu." }
    name = p.name
    if (price === null) price = D(p.discountPrice ?? p.price)
  }

  if (!name) return { success: false, error: "Say what was ordered." }
  if (price === null) return { success: false, error: "Say what it costs." }

  const line = await db.posTableOrderLine.create({
    data: {
      orderId: d.orderId,
      productId: d.productId || null,
      name,
      quantity: D(d.quantity),
      unitPrice: price,
      total: D(d.quantity).mul(price),
      modifiers: d.modifiers,
      course: d.course,
    },
    select: { id: true },
  })

  return { success: true, id: line.id }
}

/** Void a line before it is cooked, or after, with a reason either way. */
export async function voidTabLine(
  input: { lineId: string; reason: string; staffId?: string | null },
): Promise<TableResult> {
  const g = await gate("till.void", input.staffId)
  if (!g.ok) return { success: false, error: g.error }
  if (!input.reason || input.reason.trim().length < 3) {
    return { success: false, error: "Say why the line is coming off." }
  }

  const line = await db.posTableOrderLine.findFirst({
    where: { id: input.lineId, order: { shopkeeperId: g.shopkeeperId } },
    select: { id: true, name: true, order: { select: { status: true, reference: true } } },
  })
  if (!line) return { success: false, error: "That line was not found." }
  if (line.order.status === "CLOSED") {
    return { success: false, error: "Tab " + line.order.reference + " has been paid." }
  }

  await db.posTableOrderLine.update({
    where: { id: input.lineId },
    data: { voidedAt: new Date(), voidReason: input.reason.trim() },
  })

  await recordPosAudit({
    actor: g.actor,
    action: "table.line_void",
    entityType: "table_order_line",
    entityId: input.lineId,
    summary: "Took " + line.name + " off " + line.order.reference + ": " + input.reason.trim(),
  })

  return { success: true, id: input.lineId }
}

/** Fire everything not yet with the kitchen. */
export async function sendToKitchen(
  input: { orderId: string; course?: number | null; staffId?: string | null },
): Promise<{ success: true; sent: number } | { success: false; error: string }> {
  const g = await gate("till.sell", input.staffId)
  if (!g.ok) return { success: false, error: g.error }

  const order = await db.posTableOrder.findFirst({
    where: { id: input.orderId, shopkeeperId: g.shopkeeperId },
    select: { id: true, status: true, reference: true },
  })
  if (!order) return { success: false, error: "That tab was not found." }
  if (order.status === "CLOSED" || order.status === "CANCELLED") {
    return { success: false, error: "Tab " + order.reference + " is no longer open." }
  }

  const now = new Date()
  const res = await db.posTableOrderLine.updateMany({
    where: {
      orderId: input.orderId,
      voidedAt: null,
      sentToKitchenAt: null,
      ...(input.course ? { course: input.course } : {}),
    },
    data: { sentToKitchenAt: now },
  })
  if (res.count === 0) {
    return { success: false, error: "Everything on that tab is already with the kitchen." }
  }

  await db.posTableOrder.update({ where: { id: input.orderId }, data: { status: "IN_KITCHEN" } })
  return { success: true, sent: res.count }
}

export type KitchenTicket = {
  orderId: string
  reference: string
  tableName: string | null
  isTakeaway: boolean
  /** Minutes since the oldest unfinished line was fired. The number that matters. */
  waitingMinutes: number
  lines: { id: string; name: string; quantity: number; modifiers: string[]; course: number; ready: boolean }[]
}

/**
 * The kitchen screen.
 *
 * Shows lines that have been fired and are not yet ready, grouped by table so
 * a plate goes out together, oldest first. A line that is ready but not yet
 * carried out stays visible until the waiter marks it served, because a dish
 * sitting under the lamp is the kitchen's problem too.
 */
export async function getKitchenScreen(staffId?: string | null): Promise<KitchenTicket[]> {
  const g = await gate("till.sell", staffId)
  if (!g.ok) return []

  const orders = await db.posTableOrder.findMany({
    where: {
      shopkeeperId: g.shopkeeperId,
      status: { in: ["IN_KITCHEN", "SERVED"] },
      lines: { some: { voidedAt: null, sentToKitchenAt: { not: null }, servedAt: null } },
    },
    include: {
      table: { select: { name: true } },
      lines: {
        where: { voidedAt: null, sentToKitchenAt: { not: null }, servedAt: null },
        orderBy: [{ course: "asc" }, { sentToKitchenAt: "asc" }],
      },
    },
  })

  const now = Date.now()
  return orders
    .map((o) => {
      const oldest = o.lines.reduce<number>((a, l) => {
        const t = l.sentToKitchenAt ? l.sentToKitchenAt.getTime() : now
        return Math.min(a, t)
      }, now)
      return {
        orderId: o.id,
        reference: o.reference,
        tableName: o.table?.name ?? null,
        isTakeaway: o.isTakeaway,
        waitingMinutes: Math.floor((now - oldest) / 60000),
        lines: o.lines.map((l) => ({
          id: l.id,
          name: l.name,
          quantity: qty(l.quantity),
          modifiers: l.modifiers,
          course: l.course,
          ready: !!l.readyAt,
        })),
      }
    })
    // Longest wait at the top. A kitchen screen sorted any other way makes
    // somebody scan for the oldest ticket, which is the one thing it exists
    // to stop them doing.
    .sort((a, b) => b.waitingMinutes - a.waitingMinutes)
}

/** The kitchen says a dish is up. */
export async function markLineReady(
  input: { lineId: string; staffId?: string | null },
): Promise<TableResult> {
  const g = await gate("till.sell", input.staffId)
  if (!g.ok) return { success: false, error: g.error }

  const line = await db.posTableOrderLine.findFirst({
    where: { id: input.lineId, order: { shopkeeperId: g.shopkeeperId } },
    select: { id: true, sentToKitchenAt: true, readyAt: true },
  })
  if (!line) return { success: false, error: "That line was not found." }
  if (!line.sentToKitchenAt) {
    return { success: false, error: "That has not been sent to the kitchen yet." }
  }
  if (line.readyAt) return { success: false, error: "That is already up." }

  await db.posTableOrderLine.update({ where: { id: input.lineId }, data: { readyAt: new Date() } })
  return { success: true, id: input.lineId }
}

/** The waiter has carried it out. */
export async function markLineServed(
  input: { lineId: string; staffId?: string | null },
): Promise<TableResult> {
  const g = await gate("till.sell", input.staffId)
  if (!g.ok) return { success: false, error: g.error }

  const line = await db.posTableOrderLine.findFirst({
    where: { id: input.lineId, order: { shopkeeperId: g.shopkeeperId } },
    select: { id: true, orderId: true, servedAt: true },
  })
  if (!line) return { success: false, error: "That line was not found." }
  if (line.servedAt) return { success: false, error: "That was already served." }

  const now = new Date()
  await db.posTableOrderLine.update({
    where: { id: input.lineId },
    // A dish carried out without the kitchen bumping it is still served.
    // Refusing here would mean a busy kitchen leaves tables stuck.
    data: { servedAt: now, readyAt: line.servedAt ?? undefined },
  })

  const outstanding = await db.posTableOrderLine.count({
    where: { orderId: line.orderId, voidedAt: null, servedAt: null },
  })
  if (outstanding === 0) {
    await db.posTableOrder.update({ where: { id: line.orderId }, data: { status: "SERVED" } })
  }

  return { success: true, id: input.lineId }
}

export type TabForTill = {
  orderId: string
  reference: string
  customerName: string | null
  lines: { productId: string; quantity: string; unitPriceOverride: number }[]
  /** Dishes with no catalogue product behind them, which the till cannot ring. */
  offMenu: { name: string; quantity: number; unitPrice: number }[]
  serviceCharge: number
  total: number
}

/**
 * Hand the tab to the till to be paid.
 *
 * Prices come across as overrides for the same reason a quote's do: they are
 * what the customer was told when they ordered, and a menu price that moved
 * during dinner must not change the bill.
 */
export async function prepareTabForTill(
  input: { orderId: string; staffId?: string | null },
): Promise<{ success: true; tab: TabForTill } | { success: false; error: string }> {
  const g = await gate("till.sell", input.staffId)
  if (!g.ok) return { success: false, error: g.error }

  const o = await db.posTableOrder.findFirst({
    where: { id: input.orderId, shopkeeperId: g.shopkeeperId },
    include: {
      table: { select: { name: true } },
      lines: { where: { voidedAt: null } },
    },
  })
  if (!o) return { success: false, error: "That tab was not found." }
  if (o.status === "CLOSED") return { success: false, error: "Tab " + o.reference + " has already been paid." }
  if (o.status === "CANCELLED") return { success: false, error: "Tab " + o.reference + " was cancelled." }
  if (o.lines.length === 0) return { success: false, error: "Nothing has been ordered on that tab." }

  const tab = toTab(o)
  return {
    success: true,
    tab: {
      orderId: o.id,
      reference: o.reference,
      customerName: o.customerName,
      lines: o.lines
        .filter((l) => l.productId)
        .map((l) => ({
          productId: l.productId as string,
          quantity: l.quantity.toString(),
          unitPriceOverride: money(l.unitPrice),
        })),
      offMenu: o.lines
        .filter((l) => !l.productId)
        .map((l) => ({ name: l.name, quantity: qty(l.quantity), unitPrice: money(l.unitPrice) })),
      serviceCharge: tab.serviceCharge,
      total: tab.total,
    },
  }
}

/** Close the tab against the sale that paid it, freeing the table. */
export async function closeTab(
  input: { orderId: string; posSaleId: string; staffId?: string | null },
): Promise<TableResult> {
  const g = await gate("till.sell", input.staffId)
  if (!g.ok) return { success: false, error: g.error }

  const o = await db.posTableOrder.findFirst({
    where: { id: input.orderId, shopkeeperId: g.shopkeeperId },
    select: { status: true, reference: true },
  })
  if (!o) return { success: false, error: "That tab was not found." }
  if (o.status === "CLOSED") return { success: false, error: "Tab " + o.reference + " was already paid." }

  const sale = await db.posSale.findFirst({
    where: { id: input.posSaleId, shopkeeperId: g.shopkeeperId },
    select: { id: true },
  })
  if (!sale) return { success: false, error: "That sale was not found in this shop." }

  await db.posTableOrder.update({
    where: { id: input.orderId },
    data: { status: "CLOSED", closedAt: new Date(), posSaleId: sale.id },
  })

  return { success: true, id: input.orderId }
}

/** Walk-out, mistake, or a table that changed its mind before anything cooked. */
export async function cancelTab(
  input: { orderId: string; reason: string; staffId?: string | null },
): Promise<TableResult> {
  const g = await gate("till.void", input.staffId)
  if (!g.ok) return { success: false, error: g.error }
  if (!input.reason || input.reason.trim().length < 3) {
    return { success: false, error: "Say why the tab is being cancelled." }
  }

  const o = await db.posTableOrder.findFirst({
    where: { id: input.orderId, shopkeeperId: g.shopkeeperId },
    select: { status: true, reference: true },
  })
  if (!o) return { success: false, error: "That tab was not found." }
  if (o.status === "CLOSED") return { success: false, error: "Tab " + o.reference + " has been paid." }

  await db.posTableOrder.update({
    where: { id: input.orderId },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: input.reason.trim() },
  })

  await recordPosAudit({
    actor: g.actor,
    action: "table.cancel",
    entityType: "table_order",
    entityId: input.orderId,
    summary: "Cancelled tab " + o.reference + ": " + input.reason.trim(),
  })

  return { success: true, id: input.orderId }
}

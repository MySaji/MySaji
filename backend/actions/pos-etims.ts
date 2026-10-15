"use server"

import { queueSaleForEtims } from "@/backend/services/etims-queue-core"

import { z } from "zod"
import { Prisma } from "@prisma/client"
import { db } from "@/backend/db"
import { requirePosPermission, recordPosAudit } from "@/backend/services/pos-access-core"
import {
  encryptAccountNumber, decryptAccountNumber, paymentEncryptionConfigured,
} from "@/backend/services/payment-method-crypto"
import {
  ETIMS_TAX_CODES, ETIMS_TAX_CODE_META, buildEtimsDocument, etimsSettingsComplete,
  isValidKraPin, verificationUrl,
  type EtimsTaxCodeKey, type SaleForEtims,
} from "@/backend/domain/etims"
import {
  etimsConfig, etimsConfigured, initialiseDevice, sendDocument,
} from "@/backend/services/etims-client"

/**
 * Declaring sales to KRA.
 *
 * THE RULE THIS WHOLE FILE IS BUILT AROUND
 *
 * A sale is never blocked by KRA. Their service goes down, a duka's internet
 * drops, and a queue of customers does not care about either. So a sale is
 * recorded, an invoice row is QUEUED against it, and sending happens after
 * the fact and is retried. The counter never waits.
 *
 * The honest consequence is that the receipt handed over at that moment is
 * not yet a signed tax invoice, and it says so. When the signature arrives
 * the receipt can be reprinted with it. Pretending otherwise, by printing a
 * made up signature or a blank space where one should be, would make the
 * shop look compliant while leaving it exposed.
 *
 * WHAT IS NEVER DONE HERE
 *
 * Nothing is sent for a shop that has not deliberately switched this on and
 * entered its own PIN. SAJI is not the taxpayer, and an invoice filed under
 * the wrong PIN is somebody else's tax. A shop with eTIMS off has its
 * invoices marked SKIPPED, which is a record of a decision rather than a gap.
 */

const D = (v: unknown) => new Prisma.Decimal(v as never)
const num = (v: Prisma.Decimal | null | undefined, fallback = 0) =>
  v === null || v === undefined ? fallback : Number(v.toString())

async function gate(permission: Parameters<typeof requirePosPermission>[0], staffId?: string | null) {
  const g = await requirePosPermission(permission, staffId)
  if (!g.ok) return { ok: false as const, error: g.error }
  if (!g.actor.shopkeeperId) return { ok: false as const, error: "This business has no shop set up yet." }
  return { ok: true as const, shopkeeperId: g.actor.shopkeeperId, actor: g.actor }
}

// ------------------------------------------------------------------ settings

export type EtimsTaxCodeOption = { code: EtimsTaxCodeKey; label: string; rate: number; note: string }

export type EtimsSettings = {
  enabled: boolean
  tin: string | null
  branchId: string
  deviceSerial: string | null
  env: string
  /** True once KRA have issued a key for this device. Never the key itself. */
  registered: boolean
  initialisedAt: string | null
  defaultTaxCode: EtimsTaxCodeKey
  /** Whether this deployment knows where KRA is for that environment. */
  reachable: boolean
  /** Whether credentials can be stored at all on this deployment. */
  canStoreSecrets: boolean
  taxCodes: EtimsTaxCodeOption[]
  /** How the queue is doing, so the page can say something true at a glance. */
  queued: number
  signed: number
  rejected: number
  failed: number
  canManage: boolean
} | null

export async function getEtimsSettings(input?: unknown): Promise<EtimsSettings> {
  const parsed = z.object({ staffId: z.string().trim().max(60).optional() }).safeParse(input ?? {})
  const g = await gate("payment.settings", parsed.success ? parsed.data.staffId : undefined)
  if (!g.ok) return null

  const shop = await db.shopkeeperProfile.findUnique({
    where: { id: g.shopkeeperId },
    select: {
      etimsEnabled: true, etimsTin: true, etimsBranchId: true, etimsDeviceSerial: true,
      etimsCmcKey: true, etimsEnv: true, etimsInitialisedAt: true, etimsDefaultTaxCode: true,
    },
  })
  if (!shop) return null

  const counts = await db.posEtimsInvoice.groupBy({
    by: ["status"],
    where: { shopkeeperId: g.shopkeeperId },
    _count: { id: true },
  })
  const by = new Map(counts.map((c) => [c.status, c._count.id]))

  return {
    enabled: shop.etimsEnabled,
    tin: shop.etimsTin,
    branchId: shop.etimsBranchId ?? "00",
    deviceSerial: shop.etimsDeviceSerial,
    env: shop.etimsEnv,
    registered: Boolean(shop.etimsCmcKey),
    initialisedAt: shop.etimsInitialisedAt ? shop.etimsInitialisedAt.toISOString() : null,
    defaultTaxCode: shop.etimsDefaultTaxCode as EtimsTaxCodeKey,
    reachable: etimsConfigured(shop.etimsEnv),
    canStoreSecrets: paymentEncryptionConfigured(),
    taxCodes: ETIMS_TAX_CODES.map((code) => ({
      code,
      label: ETIMS_TAX_CODE_META[code].label,
      rate: ETIMS_TAX_CODE_META[code].rate,
      note: ETIMS_TAX_CODE_META[code].note,
    })),
    queued: by.get("QUEUED") ?? 0,
    signed: by.get("SIGNED") ?? 0,
    rejected: by.get("REJECTED") ?? 0,
    failed: by.get("FAILED") ?? 0,
    canManage: g.actor.can("settings.business"),
  }
}

export type EtimsResult = { success: true; message?: string } | { success: false; error: string }

export async function saveEtimsSettings(input: unknown): Promise<EtimsResult> {
  const parsed = z.object({
    enabled: z.boolean().optional(),
    tin: z.string().trim().max(20).optional(),
    branchId: z.string().trim().max(10).optional(),
    deviceSerial: z.string().trim().max(60).optional(),
    env: z.enum(["sandbox", "production"]).optional(),
    defaultTaxCode: z.enum(ETIMS_TAX_CODES as unknown as [string, ...string[]]).optional(),
    staffId: z.string().trim().max(60).optional(),
  }).safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Check the form" }
  const d = parsed.data

  const g = await gate("settings.business", d.staffId)
  if (!g.ok) return { success: false, error: g.error }

  const shop = await db.shopkeeperProfile.findUnique({
    where: { id: g.shopkeeperId },
    select: { etimsTin: true, etimsDeviceSerial: true, etimsCmcKey: true, etimsEnv: true, etimsEnabled: true },
  })
  if (!shop) return { success: false, error: "That shop no longer exists." }

  if (d.tin !== undefined && d.tin.length > 0 && !isValidKraPin(d.tin)) {
    return { success: false, error: "That does not look like a KRA PIN. They read like P051234567X." }
  }

  const data: Record<string, unknown> = {}
  if (d.tin !== undefined) data.etimsTin = d.tin.length > 0 ? d.tin.toUpperCase() : null
  if (d.branchId !== undefined) data.etimsBranchId = d.branchId.length > 0 ? d.branchId : "00"
  if (d.deviceSerial !== undefined) data.etimsDeviceSerial = d.deviceSerial.length > 0 ? d.deviceSerial : null
  if (d.defaultTaxCode !== undefined) data.etimsDefaultTaxCode = d.defaultTaxCode

  // Changing environment or identity invalidates the key KRA issued, because
  // it was issued to that device in that environment. Clearing it forces a
  // deliberate re-registration rather than filing with a key that no longer
  // matches what is being claimed.
  const identityChanged =
    (d.tin !== undefined && d.tin.toUpperCase() !== (shop.etimsTin ?? "")) ||
    (d.deviceSerial !== undefined && d.deviceSerial !== (shop.etimsDeviceSerial ?? "")) ||
    (d.env !== undefined && d.env !== shop.etimsEnv)
  if (d.env !== undefined) data.etimsEnv = d.env
  if (identityChanged) {
    data.etimsCmcKey = null
    data.etimsInitialisedAt = null
  }

  if (d.enabled !== undefined) {
    // Switching it on with nothing behind it would mark every sale as
    // declared when none of them are.
    if (d.enabled) {
      const tin = d.tin ?? shop.etimsTin
      const serial = d.deviceSerial ?? shop.etimsDeviceSerial
      if (!tin) return { success: false, error: "Enter your KRA PIN before switching eTIMS on." }
      if (!serial) return { success: false, error: "Enter the device serial KRA issued before switching eTIMS on." }
      if (!etimsConfigured(d.env ?? shop.etimsEnv)) {
        return {
          success: false,
          error: "This site has no KRA address configured yet, so nothing could be sent. Ask support to set it up.",
        }
      }
    }
    data.etimsEnabled = d.enabled
  }

  await db.shopkeeperProfile.update({ where: { id: g.shopkeeperId }, data })

  await recordPosAudit({
    actor: g.actor,
    action: "etims.settings",
    summary: g.actor.name + " changed the KRA eTIMS settings",
    entityType: "shop",
    entityId: g.shopkeeperId,
    detail: { enabled: data.etimsEnabled ?? shop.etimsEnabled, env: data.etimsEnv ?? shop.etimsEnv },
  })

  return {
    success: true,
    message: identityChanged && shop.etimsCmcKey
      ? "Saved. The till needs registering with KRA again, because the PIN, serial or environment changed."
      : undefined,
  }
}

/**
 * Register the till with KRA and keep the key they issue.
 *
 * The key is the thing that lets this shop file at all, so it is encrypted
 * at rest exactly like the Daraja credentials next door, and never leaves
 * the server.
 */
export async function registerEtimsDevice(input?: unknown): Promise<EtimsResult> {
  const parsed = z.object({ staffId: z.string().trim().max(60).optional() }).safeParse(input ?? {})
  const g = await gate("settings.business", parsed.success ? parsed.data.staffId : undefined)
  if (!g.ok) return { success: false, error: g.error }

  const shop = await db.shopkeeperProfile.findUnique({
    where: { id: g.shopkeeperId },
    select: { etimsTin: true, etimsBranchId: true, etimsDeviceSerial: true, etimsEnv: true },
  })
  if (!shop) return { success: false, error: "That shop no longer exists." }
  if (!shop.etimsTin || !shop.etimsDeviceSerial) {
    return { success: false, error: "Enter your KRA PIN and the device serial first." }
  }
  if (!paymentEncryptionConfigured()) {
    return { success: false, error: "This site cannot store the KRA key securely yet. Ask support to set it up." }
  }

  const res = await initialiseDevice(shop.etimsEnv, {
    tin: shop.etimsTin,
    branchId: shop.etimsBranchId ?? "00",
    deviceSerial: shop.etimsDeviceSerial,
  })
  if (!res.ok) return { success: false, error: res.message }

  const enc = encryptAccountNumber(res.cmcKey)
  if (!enc) return { success: false, error: "KRA accepted the till, but the key could not be stored securely." }

  await db.shopkeeperProfile.update({
    where: { id: g.shopkeeperId },
    data: { etimsCmcKey: enc, etimsInitialisedAt: new Date() },
  })

  await recordPosAudit({
    actor: g.actor,
    action: "etims.register",
    summary: g.actor.name + " registered this till with KRA",
    entityType: "shop",
    entityId: g.shopkeeperId,
  })

  return { success: true, message: "Registered with KRA. Sales from now on will be declared." }
}

// --------------------------------------------------------------- the queueing

/**
 * Write down that a sale needs declaring.
 *
 * Called from the sale path, inside nothing: it must not be part of the sale
 * transaction, because a failure to write a queue row must never undo a sale
 * that has already taken money. A sale that was not queued is recoverable by
 * a sweep; a sale that was rolled back at the counter is not.
 */


/**
 * Send one queued document to KRA.
 *
 * Returns what happened rather than throwing, so the caller can be a button,
 * a sweep or the sale path, and none of them has to care.
 */
export async function sendQueuedInvoice(input: unknown): Promise<EtimsResult> {
  const parsed = z.object({ invoiceId: z.string().trim().min(1) }).safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const row = await db.posEtimsInvoice.findUnique({
    where: { id: parsed.data.invoiceId },
    select: {
      id: true, shopkeeperId: true, posSaleId: true, kind: true, status: true,
      invoiceNumber: true, attempts: true,
    },
  })
  if (!row) return { success: false, error: "That invoice is not on the queue." }
  if (row.status === "SIGNED") return { success: true, message: "Already signed by KRA." }

  const shop = await db.shopkeeperProfile.findUnique({
    where: { id: row.shopkeeperId },
    select: {
      etimsEnabled: true, etimsTin: true, etimsBranchId: true, etimsDeviceSerial: true,
      etimsCmcKey: true, etimsEnv: true, etimsDefaultTaxCode: true, shopName: true,
    },
  })
  if (!shop || !etimsSettingsComplete(shop)) {
    return { success: false, error: "This shop is not set up to file with KRA." }
  }

  const cmcKey = decryptAccountNumber(shop.etimsCmcKey!)
  if (!cmcKey) {
    return { success: false, error: "The stored KRA key could not be read. Register the till again." }
  }

  const sale = await db.posSale.findUnique({
    where: { id: row.posSaleId },
    select: {
      saleNumber: true, occurredAt: true, cashierName: true, customerName: true,
      items: {
        select: {
          name: true, sku: true, quantity: true, unitPrice: true, lineDiscount: true,
          product: { select: { etimsTaxCode: true, etimsItemCode: true, unit: true } },
        },
      },
    },
  })
  if (!sale) return { success: false, error: "That sale no longer exists." }
  if (sale.items.length === 0) return { success: false, error: "That sale has no lines to declare." }

  const forEtims: SaleForEtims = {
    invoiceNumber: row.invoiceNumber,
    occurredAt: sale.occurredAt,
    customerName: sale.customerName,
    servedBy: sale.cashierName ?? shop.shopName,
    lines: sale.items.map((i) => ({
      name: i.name,
      sku: i.sku ?? i.name.slice(0, 20),
      itemClassCode: i.product?.etimsItemCode ?? null,
      unit: i.product?.unit ?? "piece",
      quantity: num(i.quantity),
      unitPrice: num(i.unitPrice),
      lineDiscount: num(i.lineDiscount),
      taxCode: (i.product?.etimsTaxCode ?? shop.etimsDefaultTaxCode) as EtimsTaxCodeKey,
    })),
  }

  const doc = buildEtimsDocument({
    sale: forEtims,
    tin: shop.etimsTin!,
    branchId: shop.etimsBranchId ?? "00",
    kind: row.kind as "INVOICE" | "CREDIT_NOTE",
    originalInvoiceNumber: row.kind === "CREDIT_NOTE" ? sale.saleNumber : null,
  })

  const res = await sendDocument(shop.etimsEnv, {
    tin: shop.etimsTin!,
    branchId: shop.etimsBranchId ?? "00",
    deviceSerial: shop.etimsDeviceSerial!,
    cmcKey,
  }, doc)

  if (res.ok) {
    const cfg = etimsConfig(shop.etimsEnv)
    await db.posEtimsInvoice.update({
      where: { id: row.id },
      data: {
        status: "SIGNED",
        payload: doc as never,
        receiptNumber: res.receiptNumber,
        receiptSignature: res.receiptSignature,
        internalData: res.internalData,
        sdcDateTime: res.sdcDateTime,
        verificationUrl: cfg
          ? verificationUrl(cfg.verifyBase, shop.etimsTin!, shop.etimsBranchId ?? "00", res.receiptSignature)
          : null,
        attempts: { increment: 1 },
        lastTriedAt: new Date(),
        lastError: null,
      },
    })
    return { success: true, message: "Signed by KRA." }
  }

  // A refusal and a failure are kept apart: one is worth retrying, the other
  // will refuse identically forever until somebody changes something.
  await db.posEtimsInvoice.update({
    where: { id: row.id },
    data: {
      status: res.kind === "rejected" ? "REJECTED" : "FAILED",
      payload: doc as never,
      attempts: { increment: 1 },
      lastTriedAt: new Date(),
      lastError: res.message.slice(0, 500),
    },
  })
  return { success: false, error: res.message }
}

/**
 * Work through what is waiting.
 *
 * Oldest first, because a tax authority cares about sequence, and capped per
 * run so a shop coming back from a week offline does not hold one request
 * open for ten minutes. Anything left over goes on the next run.
 */
export async function flushEtimsQueue(input?: unknown): Promise<{ sent: number; failed: number; left: number }> {
  const parsed = z.object({
    limit: z.number().int().min(1).max(100).optional(),
    staffId: z.string().trim().max(60).optional(),
  }).safeParse(input ?? {})
  const g = await gate("payment.settings", parsed.success ? parsed.data.staffId : undefined)
  if (!g.ok) return { sent: 0, failed: 0, left: 0 }

  const limit = (parsed.success ? parsed.data.limit : undefined) ?? 20

  const waiting = await db.posEtimsInvoice.findMany({
    where: { shopkeeperId: g.shopkeeperId, status: { in: ["QUEUED", "FAILED"] } },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  })

  let sent = 0
  let failed = 0
  for (const row of waiting) {
    const r = await sendQueuedInvoice({ invoiceId: row.id })
    if (r.success) sent++
    else failed++
  }

  const left = await db.posEtimsInvoice.count({
    where: { shopkeeperId: g.shopkeeperId, status: { in: ["QUEUED", "FAILED"] } },
  })
  return { sent, failed, left }
}

// ------------------------------------------------------------------ the queue

export type EtimsQueueRow = {
  id: string
  saleId: string
  invoiceNumber: string
  kind: string
  status: string
  total: number
  receiptNumber: string | null
  receiptSignature: string | null
  verificationUrl: string | null
  sdcDateTime: string | null
  attempts: number
  lastError: string | null
  occurredAt: string
}

export async function getEtimsQueue(input?: unknown): Promise<EtimsQueueRow[]> {
  const parsed = z.object({
    status: z.enum(["QUEUED", "SIGNED", "REJECTED", "FAILED", "SKIPPED"]).optional(),
    limit: z.number().int().min(1).max(200).optional(),
    staffId: z.string().trim().max(60).optional(),
  }).safeParse(input ?? {})
  const g = await gate("payment.settings", parsed.success ? parsed.data.staffId : undefined)
  if (!g.ok) return []

  const rows = await db.posEtimsInvoice.findMany({
    where: {
      shopkeeperId: g.shopkeeperId,
      ...(parsed.success && parsed.data.status ? { status: parsed.data.status as never } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: (parsed.success ? parsed.data.limit : undefined) ?? 50,
    select: {
      id: true, posSaleId: true, invoiceNumber: true, kind: true, status: true,
      receiptNumber: true, receiptSignature: true, verificationUrl: true, sdcDateTime: true,
      attempts: true, lastError: true, createdAt: true,
      sale: { select: { total: true, occurredAt: true } },
    },
  })

  return rows.map((r) => ({
    id: r.id,
    saleId: r.posSaleId,
    invoiceNumber: r.invoiceNumber,
    kind: r.kind,
    status: r.status,
    total: num(r.sale?.total),
    receiptNumber: r.receiptNumber,
    receiptSignature: r.receiptSignature,
    verificationUrl: r.verificationUrl,
    sdcDateTime: r.sdcDateTime ? r.sdcDateTime.toISOString() : null,
    attempts: r.attempts,
    lastError: r.lastError,
    occurredAt: (r.sale?.occurredAt ?? r.createdAt).toISOString(),
  }))
}

/**
 * How a product is taxed.
 *
 * Separate from the product form because this is the pass a shopkeeper makes
 * once, over the handful of lines that are not standard rated, usually with
 * an accountant beside them.
 */
export async function setProductTaxCode(input: unknown): Promise<EtimsResult> {
  const parsed = z.object({
    productId: z.string().trim().min(1),
    taxCode: z.enum(ETIMS_TAX_CODES as unknown as [string, ...string[]]).nullable().optional(),
    itemCode: z.string().trim().max(40).optional(),
    staffId: z.string().trim().max(60).optional(),
  }).safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }
  const d = parsed.data

  const g = await gate("product.edit", d.staffId)
  if (!g.ok) return { success: false, error: g.error }

  const product = await db.product.findFirst({
    where: { id: d.productId, shopkeeperId: g.shopkeeperId },
    select: { id: true, name: true },
  })
  if (!product) return { success: false, error: "That product is not in this shop." }

  await db.product.update({
    where: { id: product.id },
    data: {
      ...(d.taxCode !== undefined ? { etimsTaxCode: d.taxCode as never } : {}),
      ...(d.itemCode !== undefined ? { etimsItemCode: d.itemCode.length > 0 ? d.itemCode : null } : {}),
    },
  })

  return { success: true }
}

/** What the receipt needs, where KRA have signed it. */
export type EtimsReceiptBlock = {
  invoiceNumber: string
  receiptNumber: string
  receiptSignature: string
  internalData: string
  sdcDateTime: string
  verificationUrl: string | null
  tin: string
  branchId: string
}

export async function getEtimsReceiptBlock(saleId: string): Promise<EtimsReceiptBlock | null> {
  const parsed = z.string().trim().min(1).safeParse(saleId)
  if (!parsed.success) return null

  const row = await db.posEtimsInvoice.findFirst({
    where: { posSaleId: parsed.data, kind: "INVOICE", status: "SIGNED" },
    select: {
      invoiceNumber: true, receiptNumber: true, receiptSignature: true, internalData: true,
      sdcDateTime: true, verificationUrl: true,
      shopkeeper: { select: { etimsTin: true, etimsBranchId: true } },
    },
  })
  if (!row || !row.receiptSignature || !row.receiptNumber) return null

  return {
    invoiceNumber: row.invoiceNumber,
    receiptNumber: row.receiptNumber,
    receiptSignature: row.receiptSignature,
    internalData: row.internalData ?? "",
    sdcDateTime: (row.sdcDateTime ?? new Date()).toISOString(),
    verificationUrl: row.verificationUrl,
    tin: row.shopkeeper.etimsTin ?? "",
    branchId: row.shopkeeper.etimsBranchId ?? "00",
  }
}

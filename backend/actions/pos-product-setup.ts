"use server"

import { z } from "zod"
import { Prisma } from "@prisma/client"
import { db } from "@/backend/db"
import { requirePosPermission, recordPosAudit } from "@/backend/services/pos-access-core"
import { posBusinessFeatures } from "@/backend/domain/pos-business-features"
import { recordStockMovement } from "@/backend/services/pos-ledger"

const failure = (error: string) => ({ success: false as const, error })
const selectProduct = { id: true, name: true, isService: true, hasVariants: true, tracksBatches: true, tracksSerials: true, controlled: true, madeToOrder: true, updatedAt: true, unit: true, fitsWith: true, bulkUnit: true, unitsPerBulk: true } as const

export async function getProductBusinessSetup(productId: string) {
  if (typeof productId !== "string" || productId.length > 100) return failure("Choose a catalogue item.")
  const gate = await requirePosPermission("product.view")
  if (!gate.ok || !gate.actor.shopkeeperId) return failure("You do not have catalogue access.")
  const shopId = gate.actor.shopkeeperId
  const [product, shop] = await Promise.all([
    db.product.findFirst({ where: { id: productId, shopkeeperId: shopId }, select: { ...selectProduct, variants: { orderBy: { position: "asc" }, select: { id: true, label: true, sku: true, barcode: true, price: true, isActive: true, currentStock: true, stockOnHand: true } }, salonServices: { select: { durationMinutes: true, commissionBps: true } } } }),
    db.shopkeeperProfile.findUnique({ where: { id: shopId }, select: { posProfileKey: true, posTraits: true, posConfig: true } }),
  ])
  if (!product || !shop) return failure("That item is not in this branch.")
  const { salonServices, variants, ...item } = product
  return { success: true as const, data: {
    ...item, updatedAt: product.updatedAt.toISOString(), unitsPerBulk: product.unitsPerBulk === null ? null : Number(product.unitsPerBulk),
    features: posBusinessFeatures(shop), canAdjustStock: gate.actor.can("stock.adjust"), canEdit: gate.actor.can("product.edit"), canPrice: gate.actor.can("product.price"), canManageSalon: gate.actor.can("salon.manage"),
    durationMinutes: salonServices[0]?.durationMinutes ?? 60, commissionBps: gate.actor.can("salon.manage") || gate.actor.can("salon.commission") ? salonServices[0]?.commissionBps ?? 0 : null,
    variants: variants.map(v => ({ id: v.id, label: v.label, sku: v.sku ?? "", barcode: v.barcode ?? "", price: v.price === null ? null : Number(v.price), isActive: v.isActive, stock: Number(v.stockOnHand ?? v.currentStock) })),
  } }
}

const variantSchema = z.object({ id: z.string().max(100).optional(), label: z.string().trim().min(1).max(120), sku: z.string().trim().max(40).default(""), barcode: z.string().trim().max(60).default(""), price: z.number().finite().min(0).max(100000000).multipleOf(0.01).nullable(), isActive: z.boolean(), openingStock: z.number().finite().min(0).max(1000000).multipleOf(0.001).default(0) })
const schema = z.object({ productId: z.string().min(1).max(100), version: z.string().datetime(), activateWhenReady: z.boolean().default(false), variants: z.array(variantSchema).max(100), hasVariants: z.boolean(), tracksBatches: z.boolean(), tracksSerials: z.boolean(), controlled: z.boolean(), madeToOrder: z.boolean(), fitsWith: z.array(z.string().trim().min(1).max(120)).max(50), bulkUnit: z.string().trim().max(20), unitsPerBulk: z.number().finite().positive().max(1000000).multipleOf(0.001).nullable(), durationMinutes: z.number().int().min(5).max(720).optional(), commissionBps: z.number().int().min(0).max(10000).optional() })

export async function saveProductBusinessSetup(input: unknown) {
  const parsed = schema.safeParse(input)
  if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? "Check the item setup.")
  const gate = await requirePosPermission("product.edit")
  if (!gate.ok || !gate.actor.shopkeeperId) return failure("You do not have permission to edit the catalogue.")
  const actor = gate.actor, shopId = actor.shopkeeperId!, d = parsed.data
  try {
    const result = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(hashtext('catalogue-setup'), hashtext(${shopId}))`
      const [product, shop] = await Promise.all([
        tx.product.findFirst({ where: { id: d.productId, shopkeeperId: shopId }, select: { ...selectProduct, variants: true, inventory: true } }),
        tx.shopkeeperProfile.findUnique({ where: { id: shopId }, select: { posProfileKey: true, posTraits: true, posConfig: true } }),
      ])
      if (!product || !shop) throw Error("That item is not in this branch.")
      const features = posBusinessFeatures(shop)
      for (const [field, allowed] of [["hasVariants", features.variants], ["tracksBatches", features.batches], ["tracksSerials", features.serials], ["controlled", features.traits.includes("CONTROLLED")], ["madeToOrder", features.deposits]] as const) {
        if (d[field] && !product[field] && !allowed) throw Error("Enable this selling feature in Till Settings first.")
      }
      for (const field of ["hasVariants", "tracksBatches", "tracksSerials"] as const) {
        if (product[field] && !d[field]) throw Error("Stock tracking cannot be removed from an existing item. Pause its options or create a separate item.")
        if (!product[field] && d[field] && Number(product.inventory?.stockOnHand ?? product.inventory?.currentStock ?? 0) !== 0) throw Error("This item already has stock. Reconcile existing stock before changing its tracking method.")
      }
      if (product.isService && (d.tracksBatches || d.tracksSerials || d.controlled)) throw Error("Services cannot use physical stock tracking.")
      if (!features.variants && d.variants.some(v => !v.id)) throw Error("Enable sizes and options in Till Settings before adding new options.")
      if (d.activateWhenReady && (!d.hasVariants || !d.variants.some(v => v.isActive))) throw Error("Add an active option before making this item available for sale.")
      if (d.hasVariants && !d.variants.some(v => v.isActive)) throw Error("Keep at least one active size or option.")
      if (!d.hasVariants && d.variants.length) throw Error("Enable sizes and options before adding variants.")
      const suppliedIds = d.variants.flatMap(v => v.id ? [v.id] : [])
      if (new Set(suppliedIds).size !== suppliedIds.length || suppliedIds.some(id => !product.variants.some(v => v.id === id))) throw Error("One of these options does not belong to this item.")
      if (product.variants.some(v => !suppliedIds.includes(v.id))) throw Error("Keep existing options in the list; pause them instead of deleting their history.")
      for (const field of ["sku", "barcode", "label"] as const) {
        const values = d.variants.map(v => v[field].toLowerCase()).filter(Boolean)
        if (new Set(values).size !== values.length) throw Error(`Each option needs a distinct ${field}.`)
      }
      for (const variant of d.variants) {
        const prior = product.variants.find(v => v.id === variant.id)
        const priceChanged = prior ? (prior.price === null ? variant.price !== null : variant.price === null || !prior.price.equals(variant.price)) : variant.price !== null
        if (priceChanged && !actor.can("product.price")) throw Error("You do not have permission to set option prices.")
        if (!Number.isInteger(variant.openingStock) && !features.traits.includes("MEASURED")) throw Error("This business sells whole units. Enter a whole opening quantity.")
        if (variant.openingStock > 0 && (variant.id || !actor.can("stock.adjust") || product.isService || d.tracksBatches || d.tracksSerials)) throw Error("Opening option stock needs stock adjustment access and an untracked physical item. Use receiving for batches and serials.")
        const codes = [...(variant.sku ? [{ sku: variant.sku }] : []), ...(variant.barcode ? [{ barcode: variant.barcode }] : [])]
        if (codes.length) {
          const [parentClash, optionClash] = await Promise.all([tx.product.findFirst({ where: { shopkeeperId: shopId, OR: codes }, select: { id: true } }), tx.productVariant.findFirst({ where: { shopkeeperId: shopId, OR: codes, ...(variant.id ? { id: { not: variant.id } } : {}) }, select: { id: true } })])
          if (parentClash || optionClash) throw Error("An option code or barcode is already in use in this branch.")
        }
      }
      if ((d.fitsWith.length || product.fitsWith.length) && JSON.stringify(d.fitsWith) !== JSON.stringify(product.fitsWith) && !features.traits.includes("FITMENT")) throw Error("Enable compatibility lookup in Settings first.")
      if ((d.bulkUnit || d.unitsPerBulk !== null) && !features.traits.includes("BULK_BREAK") && (d.bulkUnit !== (product.bulkUnit ?? "") || d.unitsPerBulk !== (product.unitsPerBulk === null ? null : Number(product.unitsPerBulk)))) throw Error("Enable bulk breakdown in Settings first.")
      if (!!d.bulkUnit !== (d.unitsPerBulk !== null)) throw Error("Enter both the bulk unit and units per bulk pack.")
      if ((d.durationMinutes !== undefined || d.commissionBps !== undefined) && (!features.salon || !product.isService || !actor.can("salon.manage"))) throw Error("Salon configuration needs an enabled salon service and salon management access.")
      const changed = await tx.product.updateMany({ where: { id: product.id, shopkeeperId: shopId, updatedAt: new Date(d.version) }, data: { ...(d.activateWhenReady ? { isActive: true } : {}), hasVariants: d.hasVariants, tracksBatches: d.tracksBatches, tracksSerials: d.tracksSerials, controlled: d.controlled, madeToOrder: d.madeToOrder, fitsWith: d.fitsWith, bulkUnit: d.bulkUnit || null, unitsPerBulk: d.unitsPerBulk === null ? null : new Prisma.Decimal(d.unitsPerBulk), updatedAt: new Date() } })
      if (changed.count !== 1) throw Error("This item changed while you were editing. Close and reopen setup.")
      for (const [position, variant] of d.variants.entries()) {
        const values = { label: variant.label, sku: variant.sku || null, barcode: variant.barcode || null, price: variant.price === null ? null : new Prisma.Decimal(variant.price), isActive: variant.isActive, position }
        const saved = variant.id ? await tx.productVariant.update({ where: { id: variant.id }, data: values }) : await tx.productVariant.create({ data: { ...values, productId: product.id, shopkeeperId: shopId } })
        if (variant.openingStock > 0) {
          const movement = await recordStockMovement(tx as never, { shopkeeperId: shopId, productId: product.id, variantId: saved.id, kind: "OPENING_BALANCE", quantity: String(variant.openingStock), reason: "Opening stock for new catalogue option", actorUserId: actor.userId })
          if (!movement.ok) throw Error(movement.message)
        }
      }
      if (d.durationMinutes !== undefined || d.commissionBps !== undefined) await tx.posSalonService.upsert({ where: { productId: product.id }, create: { shopkeeperId: shopId, productId: product.id, durationMinutes: d.durationMinutes ?? 60, commissionBps: d.commissionBps ?? 0 }, update: { ...(d.durationMinutes !== undefined ? { durationMinutes: d.durationMinutes } : {}), ...(d.commissionBps !== undefined ? { commissionBps: d.commissionBps } : {}) } })
      return { success: true as const }
    }, { timeout: 30000, maxWait: 10000 })
    await recordPosAudit({ actor, action: "product.business_setup", entityType: "product", entityId: d.productId, summary: "Updated catalogue tracking, options or service settings", detail: { hasVariants: d.hasVariants, optionCount: d.variants.length, tracksBatches: d.tracksBatches, tracksSerials: d.tracksSerials, controlled: d.controlled, madeToOrder: d.madeToOrder } })
    return result
  } catch (error) { return failure(error instanceof Error && !('code' in error) ? error.message : "Item setup could not be saved. Refresh and try again.") }
}

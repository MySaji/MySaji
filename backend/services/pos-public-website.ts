import "server-only"
import { db } from "@/backend/db"
import { activeUser } from "@/backend/services/active-user"
import { validBusinessSubdomain, websiteContentSchema } from "@/backend/domain/pos-website"
import { readOperationsSettings } from "@/backend/domain/pos-operations"
import { validInstallLogo } from "@/backend/services/pos-install-brand"

export async function loadBusinessWebsite(subdomain: string, preview = false) {
  if (!validBusinessSubdomain(subdomain)) return null
  const user = preview ? await activeUser() : null
  if (preview && !user) return null
  const site = await db.posBusinessWebsite.findFirst({ where: { subdomain,
    ...(preview ? { business: { ownerUserId: user!.id } } : { publishedAt: { not: null }, business: { owner: { isActive: true, deletedAt: null } } }) },
    select: { draft: true, publishedContent: true, subdomain: true, updatedAt: true,
      business: { select: { currency: true, stores: { where: { isActive: true }, orderBy: { createdAt: "asc" }, select: { shopkeeperId: true } } } } } })
  if (!site) return null
  const parsed = websiteContentSchema.safeParse(preview ? site.draft : site.publishedContent)
  if (!parsed.success) return null
  const content = parsed.data
  const shopIds = site.business.stores.map(s => s.shopkeeperId)
  const [products, logoShop, bookingConfig] = await Promise.all([
    content.productIds.length ? db.product.findMany({ where: { id: { in: content.productIds }, shopkeeperId: { in: shopIds }, isActive: true },
      select: { id: true, shopkeeperId: true, name: true, description: true, price: true, discountPrice: true, images: true, isService: true, unit: true, hasVariants: true, inventory: {select:{currentStock:true,stockOnHand:true,reservedStock:true}}, variants:{where:{isActive:true},select:{currentStock:true,stockOnHand:true}} }, take: 24 }) : Promise.resolve([]),
    shopIds[0] ? db.shopkeeperProfile.findUnique({ where: { id: shopIds[0] }, select: { posConfig: true } }) : Promise.resolve(null),
    db.posOperationsConfig.findMany({where:{shopkeeperId:{in:shopIds}},select:{shopkeeperId:true,settings:true}}),
  ])
  const config = logoShop?.posConfig as Record<string, unknown> | null
  return { onlineBooking: bookingConfig.some(c=>{const settings=readOperationsSettings(c.settings);return settings.bookingEnabled&&settings.publicStaffIds.length>0&&products.some(p=>p.shopkeeperId===c.shopkeeperId&&p.isService)}), subdomain: site.subdomain, content, currency: site.business.currency, updatedAt: site.updatedAt.toISOString(), preview,
    logo: validInstallLogo(config?.installLogo) ? config.installLogo : null,
    products: products.map(p => ({ id: p.id, name: p.name, description: p.description, price: Number(p.discountPrice ?? p.price), isService: p.isService, unit: p.unit,
      availability: p.isService ? "Ask for an appointment" : p.hasVariants ? (p.variants.some(v=>Number(v.stockOnHand??v.currentStock)>0) ? "Some variants in stock" : "Ask about restocking") : p.inventory ? (Number(p.inventory.stockOnHand??p.inventory.currentStock)-p.inventory.reservedStock>0 ? "In stock at last update" : "Ask about restocking") : "Contact to confirm availability",
      image: p.images.find(url => /^https:\/\//.test(url) || /^data:image\/(png|jpeg|webp);base64,/.test(url) || /^\/(?!\/)/.test(url)) ?? null })) }
}
export type PublicBusinessWebsite = NonNullable<Awaited<ReturnType<typeof loadBusinessWebsite>>>

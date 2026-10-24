import { z } from "zod"

export const pulseSettingsSchema = z.object({
  leadDays: z.number().int().min(0).max(90).default(3),
  coverDays: z.number().int().min(1).max(90).default(14),
  discountPercent: z.number().min(1).max(100).default(20),
  returnAfterDays: z.number().int().min(7).max(365).default(30),
  recipes: z.array(z.object({ serviceId: z.string().min(1).max(60), commissionPercent: z.number().min(0).max(100),
    materials: z.array(z.object({ productId: z.string().min(1).max(60), quantity: z.number().positive().max(100000) })).max(30),
  })).max(200).default([]),
  consents: z.array(z.object({ customerId: z.string().min(1).max(60), allowed: z.boolean(), evidence: z.string().trim().min(5).max(200), at: z.string().datetime(), recordedBy: z.string().max(100) })).max(2000).default([]),
})
export type PulseSettings = z.infer<typeof pulseSettingsSchema>
export function readPulseSettings(raw: unknown): PulseSettings {
  const result = pulseSettingsSchema.safeParse(raw ?? {})
  return result.success ? result.data : pulseSettingsSchema.parse({})
}
export const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
export function pulseDay(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(value + "T00:00:00+03:00")
  return Number.isFinite(date.getTime()) && new Date(+date + 10800000).toISOString().slice(0,10) === value ? date : null
}
export function restockSuggestion(stock: number, sold: number, leadDays: number, coverDays: number, fractional: boolean) {
  const daily = Math.max(0, sold) / 30
  const target = daily * (leadDays + coverDays)
  const required = Math.max(0, target - Math.max(0, stock))
  return { daily: Math.round(daily * 1000) / 1000, daysLeft: daily > 0 ? Math.max(0, stock) / daily : null,
    quantity: fractional ? Math.ceil(required * 1000) / 1000 : Math.ceil(required) }
}
export function serviceCostCard(priceExTax: number, commissionPercent: number, materials: { quantity: number; cost: number | null }[]) {
  const missing = materials.filter(m=>m.cost === null).length
  const materialsCost = roundMoney(materials.reduce((sum,m)=>sum + m.quantity * (m.cost ?? 0),0))
  const commission = roundMoney(priceExTax * commissionPercent / 100)
  return { materialsCost, commission, missing, contribution: missing ? null : roundMoney(priceExTax - materialsCost - commission) }
}
export function outreachDraft(name: string, shop: string, points: number, language: "en" | "sw", salon: boolean) {
  return language === "sw"
    ? `Habari ${name}, ni ${shop}. ${salon ? "Karibu kupanga miadi yako ijayo." : "Karibu tena dukani."}${points > 0 ? ` Una pointi ${points}.` : ""} Tuambie ikiwa hutaki kupokea ujumbe huu tena.`
    : `Hi ${name}, this is ${shop}. ${salon ? "Would you like to book your next appointment?" : "We would love to welcome you back."}${points > 0 ? ` Your loyalty balance is ${points} points.` : ""} Let us know if you no longer want these messages.`
}
export type AssistantFacts = { day: string; sales: number; collected: number; expenses: number; refunds: number; unmatched: number; lowStock: number; top: string; limited: boolean }
export function answerPulse(question: string, language: "en" | "sw", facts: AssistantFacts) {
  const q = question.toLowerCase(), sw = language === "sw", money = (n:number)=>`KSh ${n.toLocaleString("en-KE",{maximumFractionDigits:2})}`
  const prefix = `${facts.day} (EAT)${facts.limited ? " - partial data / data haijakamilika" : ""}: `
  if (/profit|faida|margin/.test(q)) return { text: sw ? "Mauzo si faida. Kagua gharama za bidhaa, kamisheni, matumizi na gharama zinazokosekana kabla ya kukadiria faida." : "Sales are not profit. Review product costs, commissions, expenses and missing costs before estimating profit.", href:"/pos/reports" }
  if (/mpesa|m-pesa|payment|money|malipo|pesa/.test(q)) return { text: prefix + (sw ? `Malipo yaliyorekodiwa ${money(facts.collected)}. Malipo ${facts.unmatched} yaliyothibitishwa ya M-Pesa hayajaunganishwa na risiti.` : `Recorded tenders: ${money(facts.collected)}. ${facts.unmatched} confirmed M-Pesa payments are not linked to a receipt.`), href:"/pos/pulse#money" }
  if (/stock|restock|bidhaa|nunua/.test(q)) return { text: prefix + (sw ? `Bidhaa ${facts.lowStock} zinahitaji ukaguzi wa kuagiza. Kagua kiasi na oda zilizopo kabla ya kununua.` : `${facts.lowStock} items need a restocking review. Check quantities and open orders before buying.`), href:"/pos/pulse#restock" }
  if (/expense|cost|matumizi|gharama/.test(q)) return { text: prefix + (sw ? `Matumizi yaliyorekodiwa ${money(facts.expenses)}.` : `Recorded expenses: ${money(facts.expenses)}.`), href:"/pos/expenses" }
  if (/top|best|most|zaidi/.test(q)) return { text: prefix + (sw ? `Bidhaa inayoongoza kwa kiasi katika siku 30: ${facts.top}.` : `Leading item by units over the last 30 days: ${facts.top}.`), href:"/pos/pulse#restock" }
  if (/sale|sold|summary|brief|mauzo|muhtasari/.test(q)) return { text: prefix + (sw ? `Mauzo yaliyorekodiwa ${money(facts.sales)}; matumizi ${money(facts.expenses)}; marejesho ${money(facts.refunds)}.` : `Recorded sales: ${money(facts.sales)}; expenses: ${money(facts.expenses)}; refunds issued: ${money(facts.refunds)}.`), href:"/pos/pulse#brief" }
  return { text: sw ? "Uliza kuhusu mauzo, matumizi, malipo, bidhaa au faida. Majibu hutumia rekodi za tawi na tarehe ulizochagua pekee." : "Ask about sales, expenses, payments, stock or profit. Answers use only the selected branch and date's records.", href:"/pos/pulse" }
}

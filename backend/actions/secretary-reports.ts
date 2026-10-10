"use server"

import { z } from "zod"
import { db } from "@/backend/db"
import { requireSecretary } from "@/backend/actions/secretary-dashboard"
import { logAdminAction } from "@/backend/actions/admin-dashboard"
import type { TaxReportType } from "@prisma/client"

export type RevenuePeriod = "monthly" | "quarterly" | "annual"

export type RevenueReportRow = {
  label: string
  grossVolume: number
  paymentCount: number
  withdrawalsPaidOut: number
  netRetained: number
}

export type RevenueReport = {
  period: RevenuePeriod
  year: number
  rows: RevenueReportRow[]
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const QUARTER_MONTHS = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11]]

export async function getSecretaryRevenueReport(period: RevenuePeriod, year?: number): Promise<RevenueReport | null> {
  const secretary = await requireSecretary()
  if (!secretary) return null

  const targetYear = year ?? new Date().getFullYear()

  if (period === "annual") {
    const startYear = targetYear - 4
    const rangeStart = new Date(startYear, 0, 1)
    const rangeEnd = new Date(targetYear + 1, 0, 1)

    const [payments, withdrawals] = await Promise.all([
      db.payment.findMany({ where: { status: "COMPLETED", paidAt: { gte: rangeStart, lt: rangeEnd } }, select: { amount: true, paidAt: true } }),
      db.withdrawalRequest.findMany({ where: { status: "COMPLETED", completedAt: { gte: rangeStart, lt: rangeEnd } }, select: { netAmount: true, completedAt: true } }),
    ])

    const rows: RevenueReportRow[] = []
    for (let y = startYear; y <= targetYear; y++) {
      const yearPayments = payments.filter((p) => p.paidAt && p.paidAt.getFullYear() === y)
      const yearWithdrawals = withdrawals.filter((w) => w.completedAt && w.completedAt.getFullYear() === y)
      const grossVolume = yearPayments.reduce((s, p) => s + Number(p.amount), 0)
      const withdrawalsPaidOut = yearWithdrawals.reduce((s, w) => s + Number(w.netAmount), 0)
      rows.push({
        label: String(y),
        grossVolume,
        paymentCount: yearPayments.length,
        withdrawalsPaidOut,
        netRetained: grossVolume - withdrawalsPaidOut,
      })
    }
    return { period, year: targetYear, rows }
  }

  const rangeStart = new Date(targetYear, 0, 1)
  const rangeEnd = new Date(targetYear + 1, 0, 1)

  const [payments, withdrawals] = await Promise.all([
    db.payment.findMany({ where: { status: "COMPLETED", paidAt: { gte: rangeStart, lt: rangeEnd } }, select: { amount: true, paidAt: true } }),
    db.withdrawalRequest.findMany({ where: { status: "COMPLETED", completedAt: { gte: rangeStart, lt: rangeEnd } }, select: { netAmount: true, completedAt: true } }),
  ])

  const buckets = period === "monthly" ? MONTH_NAMES.map((name, i) => ({ label: name, months: [i] })) : QUARTER_MONTHS.map((months, i) => ({ label: `Q${i + 1}`, months }))

  const rows: RevenueReportRow[] = buckets.map(({ label, months }) => {
    const bucketPayments = payments.filter((p) => p.paidAt && months.includes(p.paidAt.getMonth()))
    const bucketWithdrawals = withdrawals.filter((w) => w.completedAt && months.includes(w.completedAt.getMonth()))
    const grossVolume = bucketPayments.reduce((s, p) => s + Number(p.amount), 0)
    const withdrawalsPaidOut = bucketWithdrawals.reduce((s, w) => s + Number(w.netAmount), 0)
    return {
      label,
      grossVolume,
      paymentCount: bucketPayments.length,
      withdrawalsPaidOut,
      netRetained: grossVolume - withdrawalsPaidOut,
    }
  })

  return { period, year: targetYear, rows }
}

// ============================================================================
// TAX REPORTS — the revenue breakdown above was always recomputed live with
// no persisted record of what was actually filed. TaxReport existed in the
// schema (period/type/status/dueDate/filedDate/amount/taxDue) but nothing
// ever wrote to it, so there was no audit trail: no way to say "we filed the
// Q1 VAT return on this date for this amount" or track what's still owed.
// ============================================================================

export type SecretaryTaxReport = {
  id: string
  period: string
  type: TaxReportType
  status: "DRAFT" | "FILED" | "PENDING" | "OVERDUE"
  dueDate: string
  filedDate: string | null
  amount: number
  taxDue: number
  createdAt: string
}

export async function getTaxReports(): Promise<SecretaryTaxReport[]> {
  const secretary = await requireSecretary()
  if (!secretary) return []

  const reports = await db.taxReport.findMany({ orderBy: { dueDate: "desc" } })
  const now = new Date()

  return reports.map((r) => ({
    id: r.id,
    period: r.period,
    type: r.type,
    // Overdue is derived at read time (unfiled + past due) rather than a
    // separate persisted transition — no cron in this app runs finely
    // enough to flip it the instant a due date passes.
    status: r.status !== "FILED" && r.dueDate < now ? "OVERDUE" : r.status,
    dueDate: r.dueDate.toISOString(),
    filedDate: r.filedDate ? r.filedDate.toISOString() : null,
    amount: Number(r.amount),
    taxDue: Number(r.taxDue),
    createdAt: r.createdAt.toISOString(),
  }))
}

type TaxReportActionResult = { success: true } | { success: false; error: string }

const createTaxReportSchema = z.object({
  period: z.string().trim().min(1, "Period label is required"),
  type: z.enum(["MONTHLY_VAT", "QUARTERLY", "ANNUAL", "PAYE"]),
  dueDate: z.string().min(1, "Due date is required"),
  amount: z.number().min(0),
  taxDue: z.number().min(0),
})

export async function createTaxReport(input: unknown): Promise<TaxReportActionResult> {
  const secretary = await requireSecretary()
  if (!secretary) return { success: false, error: "Not authorized." }

  const parsed = createTaxReportSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const dueDate = new Date(parsed.data.dueDate)
  if (Number.isNaN(dueDate.getTime())) return { success: false, error: "Invalid due date" }

  const report = await db.taxReport.create({
    data: {
      period: parsed.data.period,
      type: parsed.data.type,
      dueDate,
      amount: parsed.data.amount,
      taxDue: parsed.data.taxDue,
      status: "DRAFT",
    },
  })

  await logAdminAction({
    userId: secretary.userId,
    action: "tax_report.create",
    entityType: "TaxReport",
    entityId: report.id,
    newValues: { period: parsed.data.period, type: parsed.data.type, taxDue: parsed.data.taxDue },
  })

  return { success: true }
}

const taxReportIdSchema = z.object({ taxReportId: z.string().trim().min(1) })

export async function markTaxReportFiled(input: unknown): Promise<TaxReportActionResult> {
  const secretary = await requireSecretary()
  if (!secretary) return { success: false, error: "Not authorized." }

  const parsed = taxReportIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const report = await db.taxReport.findUnique({ where: { id: parsed.data.taxReportId } })
  if (!report) return { success: false, error: "Tax report not found." }
  if (report.status === "FILED") return { success: false, error: "This report is already filed." }

  await db.taxReport.update({
    where: { id: report.id },
    data: { status: "FILED", filedDate: new Date() },
  })

  await logAdminAction({
    userId: secretary.userId,
    action: "tax_report.mark_filed",
    entityType: "TaxReport",
    entityId: report.id,
    oldValues: { status: report.status },
    newValues: { status: "FILED" },
  })

  return { success: true }
}

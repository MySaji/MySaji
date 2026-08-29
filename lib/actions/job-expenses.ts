"use server"

import { z } from "zod"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { pushToUser } from "@/lib/actions/push"

export type JobExpenseItem = {
  id: string
  jobId: string
  description: string
  amount: number
  receiptPhotoUrl: string | null
  status: "PENDING" | "APPROVED" | "REJECTED"
  createdAt: string
  respondedAt: string | null
}

function toJobExpenseItem(e: {
  id: string; jobId: string; description: string; amount: unknown; receiptPhotoUrl: string | null
  status: string; createdAt: Date; respondedAt: Date | null
}): JobExpenseItem {
  return {
    id: e.id,
    jobId: e.jobId,
    description: e.description,
    amount: Number(e.amount),
    receiptPhotoUrl: e.receiptPhotoUrl,
    status: e.status as JobExpenseItem["status"],
    createdAt: e.createdAt.toISOString(),
    respondedAt: e.respondedAt?.toISOString() ?? null,
  }
}

/** Either party on the job (the provider who added it, or the customer who
 * needs to approve it) can read a job's expense history. */
export async function getJobExpenses(jobId: string): Promise<JobExpenseItem[]> {
  const session = await auth()
  if (!session?.user?.id) return []

  const job = await db.job.findUnique({ where: { id: jobId }, include: { provider: true } })
  if (!job) return []
  const isCustomer = job.customerId === session.user.id
  const isProvider = job.provider?.userId === session.user.id
  if (!isCustomer && !isProvider) return []

  const expenses = await db.jobExpense.findMany({ where: { jobId }, orderBy: { createdAt: "desc" } })
  return expenses.map(toJobExpenseItem)
}

export type JobExpenseActionResult = { success: true } | { success: false; error: string }

const addJobExpenseSchema = z.object({
  jobId: z.string().trim().min(1),
  description: z.string().trim().min(1, "Please describe the part or expense").max(300),
  amount: z.number().positive("Enter a valid amount"),
  receiptPhotoUrl: z.string().min(1, "Please upload a photo of the receipt"),
})

/** Gap 1 — the provider's "Add Expense/Part" button mid-job. Only creates
 * the request; no money moves and Job.price isn't touched until the
 * customer actually approves via respondToJobExpense below. */
export async function addJobExpense(input: unknown): Promise<JobExpenseActionResult> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "provider") {
    return { success: false, error: "You must be signed in as a provider." }
  }

  const parsed = addJobExpenseSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { jobId, description, amount, receiptPhotoUrl } = parsed.data

  const job = await db.job.findUnique({ where: { id: jobId }, include: { provider: true } })
  if (!job || job.provider?.userId !== session.user.id) return { success: false, error: "Job not found." }
  if (job.status !== "ACCEPTED" && job.status !== "IN_PROGRESS") {
    return { success: false, error: "Expenses can only be added to a job that's underway." }
  }

  const expense = await db.jobExpense.create({
    data: { jobId, description, amount, receiptPhotoUrl },
  })

  await db.notification.create({
    data: {
      userId: job.customerId,
      title: "Approval needed: extra cost",
      message: `Your provider added "${description}" (KES ${amount.toLocaleString()}) to ${job.title}. Review and approve before they continue.`,
      type: "JOB",
      relatedType: "JOB",
      relatedId: job.id,
      actionUrl: "/customer/jobs",
    },
  })
  await pushToUser(job.customerId, {
    title: "Approval needed: extra cost",
    body: `${description}: KES ${amount.toLocaleString()}`,
    url: "/customer/jobs",
  }, "job")

  return { success: true }
}

const respondSchema = z.object({ expenseId: z.string().trim().min(1), approve: z.boolean() })

/**
 * The customer's approve/reject tap. Approval is also the actual charge —
 * the up-charge amount is debited from the customer's wallet right here
 * (same immediate-wallet-debit convention as checkout()) and added to
 * Job.price, so completeJob()'s payout later reflects the full amount the
 * provider is actually owed. Rejecting costs the customer nothing and
 * leaves Job.price untouched.
 */
export async function respondToJobExpense(input: unknown): Promise<JobExpenseActionResult> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "customer") {
    return { success: false, error: "You must be signed in as a customer." }
  }

  const parsed = respondSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }
  const { expenseId, approve } = parsed.data

  const expense = await db.jobExpense.findUnique({ where: { id: expenseId }, include: { job: { include: { provider: true } } } })
  if (!expense || expense.job.customerId !== session.user.id) return { success: false, error: "Not found." }
  if (expense.status !== "PENDING") return { success: false, error: "This expense has already been resolved." }

  // Guards the status transition atomically inside each transaction below
  // (not just the plain check above) so a double-tap or two concurrent
  // requests for the same expense can't both process a refund/charge.
  const ALREADY_RESOLVED = Symbol("expense-already-resolved")

  if (!approve) {
    try {
      await db.$transaction(async (tx) => {
        const { count } = await tx.jobExpense.updateMany({ where: { id: expense.id, status: "PENDING" }, data: { status: "REJECTED", respondedAt: new Date() } })
        if (count === 0) throw ALREADY_RESOLVED

        if (expense.job.provider) {
          await tx.notification.create({
            data: {
              userId: expense.job.provider.userId,
              title: "Expense declined",
              message: `The customer declined "${expense.description}" for ${expense.job.title}.`,
              type: "JOB",
              relatedType: "JOB",
              relatedId: expense.jobId,
              actionUrl: "/provider/jobs",
            },
          })
        }
      })
    } catch (err) {
      if (err === ALREADY_RESOLVED) return { success: false, error: "This expense has already been resolved." }
      return { success: false, error: "Something went wrong. Please try again." }
    }
    if (expense.job.provider) {
      await pushToUser(expense.job.provider.userId, {
        title: "Expense declined",
        body: `The customer declined "${expense.description}" for ${expense.job.title}.`,
        url: "/provider/jobs",
      }, "job")
    }
    return { success: true }
  }

  const amount = Number(expense.amount)
  const wallet = await db.wallet.findUnique({ where: { userId: session.user.id } })
  if (!wallet) return { success: false, error: "Wallet not found." }
  if (Number(wallet.balance) < amount) {
    return { success: false, error: "Insufficient wallet balance to approve this expense. Please top up your wallet first." }
  }

  try {
    await db.$transaction(async (tx) => {
      const { count } = await tx.jobExpense.updateMany({ where: { id: expense.id, status: "PENDING" }, data: { status: "APPROVED", respondedAt: new Date() } })
      if (count === 0) throw ALREADY_RESOLVED

      const balanceBefore = Number(wallet.balance)
      const balanceAfter = balanceBefore - amount

      await tx.wallet.update({ where: { id: wallet.id }, data: { balance: balanceAfter } })
      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          type: "DEBIT",
          amount: -amount,
          description: `Approved extra cost: ${expense.description} (${expense.job.title})`,
          referenceType: "JOB",
          referenceId: expense.jobId,
          status: "COMPLETED",
          balanceBefore,
          balanceAfter,
        },
      })
      await tx.payment.create({
        data: {
          amount,
          status: "COMPLETED",
          contextType: "JOB",
          jobId: expense.jobId,
          payerId: session.user.id,
          payeeId: expense.job.provider?.userId,
          paidAt: new Date(),
        },
      })
      await tx.job.update({ where: { id: expense.jobId }, data: { price: { increment: amount } } })

      if (expense.job.provider) {
        await tx.notification.create({
          data: {
            userId: expense.job.provider.userId,
            title: "Expense approved",
            message: `The customer approved "${expense.description}" (KES ${amount.toLocaleString()}) for ${expense.job.title}. You can continue.`,
            type: "JOB",
            relatedType: "JOB",
            relatedId: expense.jobId,
            actionUrl: "/provider/jobs",
          },
        })
      }
    }, { timeout: 30000, maxWait: 10000 })
  } catch (err) {
    if (err === ALREADY_RESOLVED) return { success: false, error: "This expense has already been resolved." }
    return { success: false, error: "Something went wrong approving this expense. Please try again." }
  }

  if (expense.job.provider) {
    await pushToUser(expense.job.provider.userId, {
      title: "Expense approved",
      body: `${expense.description} was approved. You can continue.`,
      url: "/provider/jobs",
    }, "job")
  }

  return { success: true }
}

"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { isVerifiedStatus } from "@/lib/verification-capabilities"

async function requireProviderProfile() {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "provider") return null
  return db.providerProfile.findUnique({ where: { userId: session.user.id }, include: { user: true } })
}

export type DashboardRecentJob = {
  id: string
  title: string
  client: string
  status: string
  amount: number
  currency: string
}

export type DashboardAlert = {
  type: "request" | "dispute"
  title: string
  service: string
  amount: number | null
  action: string
  color: "orange" | "red"
}

export type OnboardingStep = { label: string; done: boolean; href: string }

export type ProviderDashboardData = {
  name: string
  activeJobs: number
  completedJobs: number
  inProgressJobs: number
  earnings: number
  rating: number
  recentJobs: DashboardRecentJob[]
  alerts: DashboardAlert[]
  onboarding: OnboardingStep[]
} | null

export async function getProviderDashboardData(): Promise<ProviderDashboardData> {
  const session = await auth()
  if (!session?.user?.id) return null
  const profile = await requireProviderProfile()
  if (!profile) return null

  const [
    activeJobs, inProgressJobs, completedJobs, pendingJobs, disputedJobsList,
    earnedAgg, recentJobsRaw, portfolioCount, paymentMethodCount, certificationCount, availability,
  ] = await Promise.all([
    db.job.count({ where: { providerId: profile.id, status: "ACCEPTED" } }),
    db.job.count({ where: { providerId: profile.id, status: "IN_PROGRESS" } }),
    db.job.count({ where: { providerId: profile.id, status: "COMPLETED" } }),
    db.job.findMany({ where: { providerId: profile.id, status: "PENDING" }, take: 3 }),
    db.dispute.findMany({ where: { providerId: profile.id, status: { in: ["OPEN", "IN_REVIEW"] } }, take: 3 }),
    db.job.aggregate({ where: { providerId: profile.id, status: "COMPLETED" }, _sum: { price: true } }),
    db.job.findMany({
      where: { providerId: profile.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { customer: true },
    }),
    db.portfolioItem.count({ where: { providerId: profile.id } }),
    db.paymentMethod.count({ where: { userId: session.user.id } }),
    db.certification.count({ where: { providerId: profile.id } }),
    db.providerAvailability.findUnique({ where: { providerId: profile.id } }),
  ])

  const alerts: DashboardAlert[] = [
    ...pendingJobs.map((j) => ({
      type: "request" as const,
      title: "New Job Request",
      service: j.title,
      amount: Number(j.price),
      action: "Review Request",
      color: "orange" as const,
    })),
    ...disputedJobsList.map((d) => ({
      type: "dispute" as const,
      title: "Dispute Open",
      service: d.reason,
      amount: d.refundAmount ? Number(d.refundAmount) : null,
      action: "Review Dispute",
      color: "red" as const,
    })),
  ]

  const onboarding: OnboardingStep[] = [
    { label: "Complete your profile", done: Boolean(profile.bio && profile.businessName), href: "/provider/profile/account" },
    { label: "Add skills & work area", done: profile.skills.length > 0 && profile.workAreas.length > 0, href: "/provider/profile/skills" },
    { label: "Upload proof of work", done: portfolioCount > 0, href: "/provider/profile/proof" },
    { label: "Add payment method", done: paymentMethodCount > 0, href: "/provider/profile/payments" },
    // verificationStatus, not kycStatus: the first is what actually unlocks
    // publishing and payouts, and is what the provider is being sent to the
    // verification page to change.
    { label: "Get identity verified", done: isVerifiedStatus(session.user.verificationStatus), href: "/provider/profile/verification" },
    { label: "Add certifications", done: certificationCount > 0, href: "/provider/profile/certifications" },
    { label: "Set your availability", done: Boolean(availability), href: "/provider/availability" },
  ]

  return {
    name: profile.user.name,
    activeJobs,
    completedJobs,
    inProgressJobs,
    earnings: Number(earnedAgg._sum.price ?? 0),
    rating: Number(profile.rating),
    recentJobs: recentJobsRaw.map((j) => ({
      id: j.id,
      title: j.title,
      client: j.customer.name,
      status: j.status,
      amount: Number(j.price),
      currency: j.currency,
    })),
    alerts,
    onboarding,
  }
}

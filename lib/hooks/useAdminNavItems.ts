"use client"

import { type ComponentType } from "react"
import useSWR from "swr"
import {
  LayoutDashboard, Users, Briefcase, AlertTriangle, CreditCard, CheckCircle,
  DollarSign, SettingsIcon, ScrollText, Shield, Megaphone, Percent, BarChart3,
  Mail, Store, Bot, Tag, MapPin, Image as ImageIcon, MessageCircle, Gift,
  MessageSquare, Award, Siren, Layers,
} from "lucide-react"
import { getAdminNavBadges, type AdminNavBadges } from "@/lib/actions/admin-dashboard"
import { getShopUpgradeRequests } from "@/lib/actions/shop-upgrade-requests"
import { getProCapabilityRequests } from "@/lib/actions/pro-capabilities"
import { getPendingChatbotEscalationCount } from "@/lib/actions/chatbot-admin"
import { getPendingCertificationCount } from "@/lib/actions/admin-certifications"
import { getActiveSafetyIncidentsForAdmin } from "@/lib/actions/safety"

const EMPTY_BADGES: AdminNavBadges = { users: 0, jobs: 0, disputes: 0, verifications: 0, moderation: 0 }

export type AdminNavItem = {
  icon: ComponentType<{ size?: number; className?: string }>
  label: string
  href: string
  badge: string | null
  group: string | null
}

export const ADMIN_NAV_GROUP_LABEL: Record<string, string> = {
  trust: "Trust & Safety",
  finance: "Finance",
  growth: "Growth",
  organization: "Organization",
  account: "Account",
}

/** Single source of truth for admin's nav items — previously AdminSidebar
 * (desktop) and AdminMobileNav (mobile bottom bar) each hand-maintained a
 * separate list. They'd drifted: the mobile bar had a "Messages" shortcut
 * pointing to a real page that the desktop sidebar never listed at all (no
 * way to reach it from desktop nav), and the mobile bar never fetched or
 * showed any of the live badge counts (Users/Jobs/Disputes/etc.) the
 * desktop sidebar does. One shared hook means both surfaces always agree. */
export function useAdminNavItems(): AdminNavItem[] {
  // Keyed identically (and fetcher-identically) everywhere this hook is
  // called — AdminSidebar and AdminMobileNav are both always mounted at
  // once (CSS just hides one per breakpoint), so without SWR's shared
  // cache every page load would fire these 3 badge queries twice.
  const { data: badges } = useSWR("admin-nav-badges", getAdminNavBadges)
  const { data: shopUpgradeRequests } = useSWR("admin-nav-shop-upgrades", getShopUpgradeRequests)
  const { data: proCapabilityRequests } = useSWR("admin-nav-pro-business", getProCapabilityRequests)
  const { data: pendingChatbotEscalations } = useSWR("admin-nav-chatbot-escalations", getPendingChatbotEscalationCount)
  const { data: pendingCertifications } = useSWR("admin-nav-certifications", getPendingCertificationCount)
  const { data: safetyIncidents } = useSWR("admin-nav-safety-incidents", getActiveSafetyIncidentsForAdmin, { refreshInterval: 30_000 })

  const pendingShopUpgrades = shopUpgradeRequests?.filter((r) => r.status === "OPEN" || r.status === "IN_PROGRESS").length ?? 0
  const pendingProBusiness = proCapabilityRequests?.filter((r) => r.status === "PENDING").length ?? 0
  const b = badges ?? EMPTY_BADGES
  const chatbotCount = pendingChatbotEscalations ?? 0
  const certificationCount = pendingCertifications ?? 0
  const safetyIncidentCount = safetyIncidents?.length ?? 0

  return [
    { icon: LayoutDashboard, label: "Dashboard", href: "/admin", badge: null, group: null },
    { icon: Users, label: "Users", href: "/admin/users", badge: b.users > 0 ? b.users.toLocaleString() : null, group: null },
    { icon: Briefcase, label: "Jobs", href: "/admin/jobs", badge: b.jobs > 0 ? b.jobs.toLocaleString() : null, group: null },
    { icon: AlertTriangle, label: "Disputes", href: "/admin/disputes", badge: b.disputes > 0 ? b.disputes.toLocaleString() : null, group: null },
    { icon: Siren, label: "Safety Incidents", href: "/admin/safety-incidents", badge: safetyIncidentCount > 0 ? safetyIncidentCount.toLocaleString() : null, group: null },
    { icon: MessageSquare, label: "Messages", href: "/admin/messages", badge: null, group: null },
    { icon: CheckCircle, label: "Verifications", href: "/admin/verifications", badge: b.verifications > 0 ? b.verifications.toLocaleString() : null, group: "trust" },
    { icon: Shield, label: "Moderation", href: "/admin/moderation", badge: b.moderation > 0 ? b.moderation.toLocaleString() : null, group: "trust" },
    { icon: MessageCircle, label: "Community", href: "/admin/community", badge: null, group: "trust" },
    { icon: Bot, label: "Chatbot", href: "/admin/chatbot", badge: chatbotCount > 0 ? chatbotCount.toLocaleString() : null, group: "trust" },
    { icon: Award, label: "Certifications", href: "/admin/certifications", badge: certificationCount > 0 ? certificationCount.toLocaleString() : null, group: "trust" },
    { icon: CreditCard, label: "Payments", href: "/admin/payments", badge: null, group: "finance" },
    { icon: DollarSign, label: "Pricing", href: "/admin/pricing", badge: null, group: "finance" },
    { icon: Percent, label: "Commissions", href: "/admin/commissions", badge: null, group: "finance" },
    { icon: BarChart3, label: "Analytics", href: "/admin/analytics", badge: null, group: "growth" },
    { icon: Gift, label: "Marketing", href: "/admin/marketing", badge: null, group: "growth" },
    { icon: Megaphone, label: "Announcements", href: "/admin/announcements", badge: null, group: "growth" },
    { icon: Mail, label: "Subscribers", href: "/admin/subscribers", badge: null, group: "growth" },
    { icon: Store, label: "Shop Upgrades", href: "/admin/shop-upgrades", badge: pendingShopUpgrades > 0 ? pendingShopUpgrades.toLocaleString() : null, group: "growth" },
    // Approve what a Saji Pro may offer, and control which pages each kind of
    // offer opens up. See components/pro-business/pro-business-control.tsx.
    { icon: Layers, label: "Saji Pro Business", href: "/admin/pro-business", badge: pendingProBusiness > 0 ? pendingProBusiness.toLocaleString() : null, group: "growth" },
    { icon: Users, label: "Team", href: "/admin/team", badge: null, group: "organization" },
    { icon: Tag, label: "Categories", href: "/admin/categories", badge: null, group: "organization" },
    { icon: MapPin, label: "Counties", href: "/admin/counties", badge: null, group: "organization" },
    { icon: ImageIcon, label: "Banners", href: "/admin/banners", badge: null, group: "organization" },
    { icon: ScrollText, label: "Audit Log", href: "/admin/audit-log", badge: null, group: "organization" },
    { icon: SettingsIcon, label: "Settings", href: "/admin/settings", badge: null, group: "account" },
  ]
}

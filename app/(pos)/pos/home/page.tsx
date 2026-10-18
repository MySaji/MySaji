"use client"

import {
  BadgeCheck, BarChart3, Boxes, ClipboardCheck, ClipboardList, Clock, FileText, Gift, Hammer, HandCoins, Monitor, Package, Receipt, Settings, ShoppingCart, Smartphone, Store, Tag, Truck, UserCog, Users, UtensilsCrossed, Wallet, Wrench,
} from "lucide-react"
import { OverviewDashboard } from "@/frontend/components/pos/overview-dashboard"

const GROUPS: { title: string; blurb: string; items: { href: string; icon: typeof ShoppingCart; label: string }[] }[] = [
  {
    title: "Selling",
    blurb: "The counter, and the ways money comes in.",
    items: [
      { href: "/pos/customers", icon: Users, label: "Customers" },
      { href: "/pos/sell", icon: ShoppingCart, label: "New sale" },
      { href: "/pos/floor", icon: UtensilsCrossed, label: "Floor" },
      { href: "/pos/jobs", icon: Wrench, label: "Jobs" },
      { href: "/pos/quotes", icon: FileText, label: "Quotes" },
      { href: "/pos/cards", icon: Gift, label: "Gift cards" },
      { href: "/pos/credit", icon: HandCoins, label: "On the book" },
    ],
  },
  {
    title: "Stock",
    blurb: "What is on the shelf, and what is coming in.",
    items: [
      { href: "/pos/products", icon: Package, label: "Products" },
      { href: "/pos/stock", icon: Boxes, label: "Stock" },
      { href: "/pos/stocktake", icon: ClipboardCheck, label: "Count" },
      { href: "/pos/purchasing", icon: ClipboardList, label: "Buying" },
      { href: "/pos/transfers", icon: Truck, label: "Transfers" },
      { href: "/pos/pricing", icon: Tag, label: "Prices" },
    ],
  },
  {
    title: "Money",
    blurb: "The drawer, the costs, and what the month actually did.",
    items: [
      { href: "/pos/shifts", icon: Clock, label: "Shifts" },
      { href: "/pos/expenses", icon: Wallet, label: "Costs" },
      { href: "/pos/reports", icon: BarChart3, label: "Reports" },
      { href: "/pos/orders", icon: Hammer, label: "Deposits" },
      { href: "/pos/mpesa", icon: Smartphone, label: "M-Pesa" },
      { href: "/pos/etims", icon: Receipt, label: "Tax" },
    ],
  },
  {
    title: "Setting up",
    blurb: "Your people, your branches and how the till behaves.",
    items: [
      { href: "/pos/team", icon: UserCog, label: "Team" },
      { href: "/pos/people", icon: Users, label: "Till PINs" },
      { href: "/pos/stores", icon: Store, label: "Branches" },
      { href: "/pos/devices", icon: Monitor, label: "Devices" },
      { href: "/pos/settings", icon: Settings, label: "Settings" },
      { href: "/pos/subscription", icon: BadgeCheck, label: "Plan" },
    ],
  },
]

export default function TillDashboardPage() {
  return <OverviewDashboard groups={GROUPS} />
}

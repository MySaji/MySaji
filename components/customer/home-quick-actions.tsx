"use client"

import Link from "next/link"
import { Card } from "@/components/ui/card"
import { ShoppingBag, Wrench, Percent, Package } from "lucide-react"

const ACTIONS = [
  { icon: ShoppingBag, label: "Order Quickly", sub: "From local shops", href: "/customer/shops", color: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400" },
  { icon: Wrench, label: "Solve a Problem", sub: "Find a professional", href: "/customer/services", color: "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400" },
  { icon: Percent, label: "Flash Deals", sub: "Limited time offers", href: "#flash-deals", color: "bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400" },
  // The mockup calls this "Rent a Space" (homes/rooms/offices) — this app
  // only has real equipment/tool rentals (RENT-actionType Offers), not
  // property rental, so the copy here reflects what's actually behind the
  // link rather than promising a feature that doesn't exist.
  { icon: Package, label: "Rent Equipment", sub: "Tools & machinery", href: "/customer/services/more?type=rental", color: "bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400" },
]

export function HomeQuickActions() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {ACTIONS.map((action) => (
        <Link key={action.label} href={action.href}>
          <Card className={`flex h-full flex-col gap-2 rounded-2xl border-0 p-4 shadow-sm transition-transform hover:-translate-y-0.5 ${action.color}`}>
            <action.icon className="h-5 w-5" />
            <div>
              <p className="text-sm font-bold">{action.label}</p>
              <p className="text-xs opacity-80">{action.sub}</p>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  )
}

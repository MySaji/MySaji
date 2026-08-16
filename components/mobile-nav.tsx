"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

interface MenuItem {
  label: string
  href: string
  icon: string
}

interface MobileNavProps {
  menuItems: MenuItem[]
}

export function MobileNav({ menuItems }: MobileNavProps) {
  const pathname = usePathname()

  const getIcon = (iconName: string) => {
    const icons: Record<string, string> = {
      LayoutDashboard: "📊",
      Users: "👥",
      Users2: "👫",
      TrendingUp: "📈",
      BarChart3: "📊",
      Settings: "⚙️",
    }
    return icons[iconName] || "•"
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 lg:hidden z-50">
      <div className="flex justify-around items-center h-16">
        {menuItems.map(item => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center w-full h-full gap-1 text-xs transition-colors ${
                isActive
                  ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
            >
              <span className="text-lg">{getIcon(item.icon)}</span>
              <span className="hidden sm:inline text-[10px]">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

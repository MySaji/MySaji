"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useAuthContext } from "@/lib/auth-context"
import { Menu, X, LogOut, LayoutDashboard, ChevronLeft, ChevronRight } from "lucide-react"
import { useAdminNavItems, ADMIN_NAV_GROUP_LABEL } from "@/lib/hooks/useAdminNavItems"
import { useSidebarCollapsed } from "@/lib/hooks/useSidebarCollapsed"
import { useLocalization } from "@/lib/hooks/useLocalization"

export function AdminSidebar() {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()
  const { logout } = useAuthContext()
  const menuItems = useAdminNavItems()
  const { t } = useLocalization()
  const { isCollapsed, toggle: toggleCollapsed } = useSidebarCollapsed()

  const isActive = (href: string) => href === "/admin" ? pathname === href : (pathname === href || pathname.startsWith(href + "/"))

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-4 left-4 z-50 lg:hidden bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition-colors"
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Sidebar */}
      <aside
        className={`
        fixed top-0 left-0 h-dvh ${isCollapsed ? "lg:w-20" : "lg:w-64"} w-64 bg-gradient-to-b from-blue-600 to-blue-800 text-white
        transform transition-[transform,width] duration-300 z-40 flex flex-col
        ${isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        lg:relative lg:transform-none overflow-visible
      `}
      >
        <button
          onClick={toggleCollapsed}
          aria-label={isCollapsed ? t("common.sidebar.expand") : t("common.sidebar.collapse")}
          title={isCollapsed ? t("common.sidebar.expand") : t("common.sidebar.collapse")}
          className="hidden lg:flex absolute -right-3 top-20 z-10 w-6 h-6 items-center justify-center rounded-full border border-blue-400/40 bg-blue-700 text-white shadow-md hover:bg-blue-600 transition-colors"
        >
          {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>

        {/* Logo Section */}
        <div className={`p-6 border-b border-blue-400/30 flex-shrink-0 ${isCollapsed ? "lg:px-3" : ""}`}>
          <div className={`flex items-center gap-3 ${isCollapsed ? "lg:justify-center" : ""}`}>
            <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
              <LayoutDashboard size={24} />
            </div>
            <div className={isCollapsed ? "lg:hidden" : ""}>
              <h1 className="text-base font-bold">Admin</h1>
              <p className="text-[11px] text-blue-200">Portal</p>
            </div>
          </div>
        </div>

        {/* Navigation Section */}
        <nav className="flex-1 p-4 overflow-y-auto overflow-x-hidden space-y-1">
          {menuItems.map((item, i) => {
            const Icon = item.icon
            const active = isActive(item.href)
            const showGroupLabel = item.group && item.group !== menuItems[i - 1]?.group
            return (
              <div key={item.href}>
                {showGroupLabel && (
                  <p className={`px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-blue-200/70 ${isCollapsed ? "lg:hidden" : ""}`}>
                    {ADMIN_NAV_GROUP_LABEL[item.group as string]}
                  </p>
                )}
                <Link
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  title={isCollapsed ? item.label : undefined}
                  className={`
                    flex items-center justify-between py-3 rounded-lg transition-all duration-200
                    ${isCollapsed ? "lg:justify-center lg:relative px-2" : "px-4"}
                    ${active
                      ? "bg-white text-blue-600 font-semibold shadow-lg"
                      : "text-blue-50 hover:bg-blue-500/40"
                    }
                  `}
                >
                  <div className="flex items-center gap-3">
                    <Icon size={20} className="flex-shrink-0" />
                    <span className={`text-xs ${isCollapsed ? "lg:hidden" : ""}`}>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className={`
                      px-2 py-1 rounded-full text-[11px] font-semibold
                      ${isCollapsed ? "lg:absolute lg:top-1 lg:right-1 lg:w-4 lg:h-4 lg:px-0 lg:py-0 lg:flex lg:items-center lg:justify-center lg:text-[9px]" : ""}
                      ${active
                        ? "bg-blue-100 text-blue-600"
                        : "bg-blue-400/30 text-blue-100"
                      }
                    `}>
                      {item.badge}
                    </span>
                  )}
                </Link>
              </div>
            )
          })}
        </nav>

        {/* Footer Section */}
        <div className={`p-4 border-t border-blue-400/30 flex-shrink-0 space-y-2 ${isCollapsed ? "lg:px-2" : ""}`}>
          <div className={`px-4 py-3 rounded-lg bg-blue-500/20 border border-blue-400/30 ${isCollapsed ? "lg:hidden" : ""}`}>
            <p className="text-[11px] text-blue-200">Admin Status</p>
            <p className="text-xs font-semibold text-white mt-1">Online</p>
          </div>
          <button
            onClick={() => {
              logout()
              setIsOpen(false)
            }}
            title={isCollapsed ? "Logout" : undefined}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg hover:bg-blue-500/40 transition-colors text-blue-50 hover:text-white font-medium text-xs ${isCollapsed ? "lg:px-2" : "px-4"}`}
          >
            <LogOut size={18} className="flex-shrink-0" />
            <span className={isCollapsed ? "lg:hidden" : ""}>Logout</span>
          </button>
        </div>
      </aside>

      {/* Mobile Overlay */}
      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden" onClick={() => setIsOpen(false)} />
      )}
    </>
  )
}

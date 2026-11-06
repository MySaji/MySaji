"use client"

import Link from "next/link"
import { ArrowUpRight, CalendarDays, MessageCircle, Users, MapPin, Heart, RefreshCw } from "lucide-react"
import type { CustomerJob } from "@/backend/actions/jobs"
import type { CustomerOrder } from "@/backend/actions/orders"

export function CustomerHomePlanner({
  jobs,
  orders,
  loading,
  failed,
}: {
  jobs: CustomerJob[]
  orders: CustomerOrder[]
  loading: boolean
  failed: boolean
}) {
  const live = jobs.filter((job) =>
    ["PENDING", "PENDING_PAYMENT", "ACCEPTED", "IN_PROGRESS", "DISPUTED"].includes(job.status)
  )
  const review = jobs.filter((job) => job.status === "COMPLETED" && !job.reviewed)
  const deliveries = orders.filter((order) => ["PENDING", "PROCESSING", "SHIPPED"].includes(order.status))
  const next = live
    .filter((job) => ["ACCEPTED", "IN_PROGRESS"].includes(job.status))
    .sort((a, b) => Date.parse(a.scheduledDate) - Date.parse(b.scheduledDate))[0]
  const metric = (count: number) => (loading ? "..." : failed ? "Check activity" : String(count))
  return (
    <section
      aria-label="Your next steps"
      id="customer-next-steps"
      className="scroll-mt-24 rounded-3xl border bg-card p-5 sm:p-7"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Your day, in one place
          </p>
          <h2 className="mt-2 text-xl font-semibold">Pick up where you left off</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            A quick look at your loaded jobs and recent orders.
          </p>
        </div>
        <Link
          href="/customer/jobs"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-medium"
        >
          Open activity
          <ArrowUpRight size={16} />
        </Link>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {[
          {
            label: "Open jobs",
            value: metric(live.length),
            href: "/customer/jobs",
            hint: "Check progress or coordinate with your provider",
          },
          {
            label: "Recent orders in progress",
            value: metric(deliveries.length),
            href: "/customer/orders",
            hint: "View seller updates and delivery status",
          },
          {
            label: "Completed jobs to review",
            value: metric(review.length),
            href: "/customer/jobs",
            hint: "Share your experience after the work is done",
          },
        ].map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="min-w-0 rounded-2xl border bg-muted/20 p-4 transition-colors hover:border-primary"
          >
            <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
            <strong className="mt-2 block text-2xl font-semibold tracking-tight">{item.value}</strong>
            <span className="mt-2 block text-xs leading-6 text-muted-foreground">{item.hint}</span>
          </Link>
        ))}
      </div>
      {next && !loading && !failed && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border-l-4 border-orange-500 bg-muted/30 p-4">
          <div>
            <p className="text-xs font-semibold text-primary">
              {next.status === "IN_PROGRESS" ? "Work in progress" : "Scheduled work"}
            </p>
            <p className="mt-1 text-sm font-semibold">{next.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {next.providerName} /{" "}
              {new Date(next.scheduledDate).toLocaleString("en-KE", {
                timeZone: "Africa/Nairobi",
                dateStyle: "medium",
                timeStyle: "short",
              })}{" "}
              EAT
            </p>
          </div>
          <Link
            href={`/customer/jobs?job=${encodeURIComponent(next.id)}`}
            className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary"
          >
            View job
            <ArrowUpRight size={15} />
          </Link>
        </div>
      )}
      <div className="mt-5 border-t pt-5">
        <h3 className="text-sm font-semibold">More ways to use MySaji</h3>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Community", href: "community", icon: Users },
            { label: "Appointments", href: "bookings", icon: CalendarDays },
            { label: "Your household", href: "household", icon: Users },
            { label: "Maintenance", href: "recurring-maintenance", icon: RefreshCw },
            { label: "Saved places", href: "saved-addresses", icon: MapPin },
            { label: "Favourites", href: "favorites", icon: Heart },
          ].map((item) => (
            <Link
              key={item.href}
              href={`/customer/${item.href}`}
              className="flex min-h-20 flex-col justify-center gap-3 rounded-xl border p-3 text-xs font-medium hover:bg-muted"
            >
              <item.icon size={18} className="text-primary" />
              {item.label}
            </Link>
          ))}
        </div>
        <Link
          href="/customer/messages"
          className="mt-4 inline-flex min-h-11 items-center gap-2 text-xs font-medium text-primary"
        >
          <MessageCircle size={15} />
          Need to coordinate? Open your inbox
        </Link>
      </div>
    </section>
  )
}

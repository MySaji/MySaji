"use client"

import { useEffect, useState } from "react"
import { Card } from "@/frontend/components/ui/card"
import {
  Calendar, CheckCircle2, XCircle, PlayCircle, CreditCard, AlertTriangle, Star, Ban, User, Loader2, Clock, ScrollText,
} from "lucide-react"
import { getJobTimeline, type JobTimelineEvent } from "@/backend/actions/job-events"

const EVENT_ICON: Record<string, typeof Calendar> = {
  JOB_CREATED: Calendar,
  JOB_ACCEPTED: CheckCircle2,
  JOB_DECLINED: XCircle,
  WORK_STARTED: PlayCircle,
  WORK_COMPLETED: CheckCircle2,
  PAYMENT_CONFIRMED: CreditCard,
  PAYMENT_FAILED: AlertTriangle,
  JOB_CANCELLED: Ban,
  NO_SHOW_REPORTED: AlertTriangle,
  DISPUTE_FILED: AlertTriangle,
  REVIEW_SUBMITTED: Star,
}

function iconFor(type: string) {
  return EVENT_ICON[type] ?? Clock
}

function actorLabel(event: JobTimelineEvent): string {
  if (event.actorName) return event.actorName
  if (event.actor === "SYSTEM") return "Saji"
  if (event.actor === "ADMIN") return "Saji Support"
  return event.actor === "CUSTOMER" ? "Customer" : "Provider"
}

/** The "Evidence Timeline" — a real, chronological, append-only record of
 * everything that happened on a job (booking, acceptance, payment, work,
 * completion, disputes, reviews, cancellations). Read-only by design;
 * nothing in this component can edit or delete an entry. */
export function JobTimeline({ jobId }: { jobId: string }) {
  const [events, setEvents] = useState<JobTimelineEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    getJobTimeline(jobId).then(setEvents).finally(() => setIsLoading(false))
  }, [jobId])

  if (isLoading) {
    return (
      <Card className="p-4 mb-4 border-0 shadow-sm flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </Card>
    )
  }

  if (events.length === 0) return null

  return (
    <Card className="p-4 mb-4 border-0 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <ScrollText className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-bold text-foreground">Job Timeline</h3>
      </div>
      <div className="space-y-0">
        {events.map((event, i) => {
          const Icon = iconFor(event.type)
          const isLast = i === events.length - 1
          return (
            <div key={event.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon className="h-3.5 w-3.5" />
                </div>
                {!isLast && <div className="w-px flex-1 bg-border" />}
              </div>
              <div className={`min-w-0 flex-1 ${isLast ? "pb-0" : "pb-4"}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">{event.description}</p>
                  <span className="flex-shrink-0 text-[11px] text-muted-foreground">
                    {new Date(event.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </span>
                </div>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <User className="h-3 w-3" /> {actorLabel(event)}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, RefreshCw, Loader2, CheckCircle2, Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  getMyRecurringMaintenance, markMaintenanceServiced, deactivateRecurringMaintenance, type RecurringMaintenanceItem,
} from "@/lib/actions/recurring-maintenance"

export default function RecurringMaintenancePage() {
  const [items, setItems] = useState<RecurringMaintenanceItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = () => getMyRecurringMaintenance().then(setItems)

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const handleServiced = async (id: string) => {
    setBusyId(id)
    await markMaintenanceServiced({ id })
    setBusyId(null)
    await refresh()
  }

  const handleRemove = async (id: string) => {
    if (!confirm("Remove this recurring schedule?")) return
    setBusyId(id)
    await deactivateRecurringMaintenance({ id })
    setBusyId(null)
    await refresh()
  }

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  }

  return (
    <div className="min-h-screen bg-background pb-10">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="mb-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild className="rounded-full"><Link href="/customer/home"><ArrowLeft className="h-4 w-4" /></Link></Button>
          <div><h1 className="text-xl font-bold text-foreground">Recurring Maintenance</h1><p className="text-sm text-muted-foreground">Services you've set to repeat</p></div>
        </div>

        {items.length === 0 ? (
          <Card className="border-dashed p-10 text-center">
            <RefreshCw className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No recurring schedules yet — set one up from a completed job.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <Card key={item.id} className={`border-0 p-4 shadow-sm ${item.isDue ? "border-l-4 border-l-amber-500" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">{item.title}</p>
                    {item.providerName && <p className="text-xs text-muted-foreground">{item.providerName}</p>}
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" /> Every {item.frequencyDays} days · next due {new Date(item.nextDueAt).toLocaleDateString()}
                    </p>
                    {item.isDue && <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">May be due</span>}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(item.serviceId || item.offerId) && (
                    <Link href={item.offerId ? `/customer/booking?offer=${item.offerId}` : `/customer/booking?service=${item.serviceId}`}>
                      <Button size="sm" className="rounded-lg">Book Service</Button>
                    </Link>
                  )}
                  <Button size="sm" variant="outline" className="gap-1.5 rounded-lg bg-transparent" disabled={busyId === item.id} onClick={() => handleServiced(item.id)}>
                    <CheckCircle2 className="h-3.5 w-3.5" />Mark as Serviced
                  </Button>
                  <Button size="sm" variant="ghost" className="rounded-lg text-muted-foreground" disabled={busyId === item.id} onClick={() => handleRemove(item.id)}>Remove</Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

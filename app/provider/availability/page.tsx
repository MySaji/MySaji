"use client"

import { useEffect, useState } from "react"
import { Clock, Calendar, ChevronLeft, ChevronRight, MapPin, AlertCircle, Check, Plane, Plus, X, Save, Loader2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  getProviderAvailability, updateProviderAvailability, addBlockedDate as addBlockedDateAction, removeBlockedDate as removeBlockedDateAction,
  setVacationMode,
  type WeeklySchedule, type ProviderBlockedDate, type ProviderJobEvent,
} from "@/lib/actions/provider-availability"
import { useLocalization } from "@/lib/hooks/useLocalization"
import type { TranslationKey } from "@/lib/i18n"

const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const
const DAY_LABEL_KEYS: Record<(typeof DAY_KEYS)[number], TranslationKey> = {
  monday: "provider.availability.dayMonday", tuesday: "provider.availability.dayTuesday", wednesday: "provider.availability.dayWednesday",
  thursday: "provider.availability.dayThursday", friday: "provider.availability.dayFriday", saturday: "provider.availability.daySaturday", sunday: "provider.availability.daySunday",
}
const MONTH_KEYS: TranslationKey[] = [
  "provider.availability.monthJanuary", "provider.availability.monthFebruary", "provider.availability.monthMarch", "provider.availability.monthApril",
  "provider.availability.monthMay", "provider.availability.monthJune", "provider.availability.monthJuly", "provider.availability.monthAugust",
  "provider.availability.monthSeptember", "provider.availability.monthOctober", "provider.availability.monthNovember", "provider.availability.monthDecember",
]
const SHORT_DAY_KEYS: TranslationKey[] = [
  "provider.availability.shortMon", "provider.availability.shortTue", "provider.availability.shortWed", "provider.availability.shortThu",
  "provider.availability.shortFri", "provider.availability.shortSat", "provider.availability.shortSun",
]

export default function AvailabilityPage() {
  const { t } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<"schedule" | "calendar" | "blocked">("schedule")
  const [weeklySchedule, setWeeklySchedule] = useState<WeeklySchedule | null>(null)
  const [blockedDates, setBlockedDates] = useState<ProviderBlockedDate[]>([])
  const [jobEvents, setJobEvents] = useState<ProviderJobEvent[]>([])
  const [newBlockDate, setNewBlockDate] = useState("")
  const [newBlockReason, setNewBlockReason] = useState("")
  const [maxJobsPerDay, setMaxJobsPerDay] = useState(5)
  const [breakDuration, setBreakDuration] = useState(30)
  const [autoAccept, setAutoAccept] = useState(false)
  const [travelRadius, setTravelRadius] = useState(10)
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth())
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear())
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [isOnVacation, setIsOnVacation] = useState(false)
  const [vacationNote, setVacationNote] = useState("")
  const [isSavingVacation, setIsSavingVacation] = useState(false)
  const [showVacationNote, setShowVacationNote] = useState(false)

  useEffect(() => {
    getProviderAvailability().then((data) => {
      if (!data) return
      setWeeklySchedule(data.weeklySchedule)
      setBlockedDates(data.blockedDates)
      setJobEvents(data.jobEvents)
      setMaxJobsPerDay(data.maxJobsPerDay)
      setBreakDuration(data.breakDuration)
      setAutoAccept(data.autoAccept)
      setTravelRadius(data.travelRadiusKm)
      setIsOnVacation(data.isOnVacation)
      setVacationNote(data.vacationNote ?? "")
    }).finally(() => setIsLoading(false))
  }, [])

  const handleToggleVacation = async () => {
    const next = !isOnVacation
    if (next) { setShowVacationNote(true); return }
    setIsSavingVacation(true)
    setIsOnVacation(false)
    await setVacationMode({ isOnVacation: false, vacationNote: vacationNote || undefined })
    setIsSavingVacation(false)
  }

  const confirmVacationOn = async () => {
    setIsSavingVacation(true)
    const result = await setVacationMode({ isOnVacation: true, vacationNote: vacationNote || undefined })
    setIsSavingVacation(false)
    if (result.success) { setIsOnVacation(true); setShowVacationNote(false) }
  }

  const toggleDay = (day: (typeof DAY_KEYS)[number]) => {
    setWeeklySchedule(prev => prev ? { ...prev, [day]: { ...prev[day], enabled: !prev[day].enabled } } : prev)
  }

  const updateTime = (day: (typeof DAY_KEYS)[number], field: "start" | "end", value: string) => {
    setWeeklySchedule(prev => prev ? { ...prev, [day]: { ...prev[day], [field]: value } } : prev)
  }

  const addBlockedDate = async () => {
    if (!newBlockDate) return
    const result = await addBlockedDateAction({ date: newBlockDate, reason: newBlockReason || undefined })
    if (result.success) {
      const data = await getProviderAvailability()
      if (data) setBlockedDates(data.blockedDates)
      setNewBlockDate("")
      setNewBlockReason("")
    }
  }

  const removeBlockedDate = async (id: string) => {
    setBlockedDates(prev => prev.filter(b => b.id !== id))
    await removeBlockedDateAction({ id })
  }

  const handleSave = async () => {
    if (!weeklySchedule) return
    setIsSaving(true)
    const result = await updateProviderAvailability({ weeklySchedule, maxJobsPerDay, breakDuration, autoAccept, travelRadiusKm: travelRadius })
    setIsSaving(false)
    if (result.success) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  const getDaysInMonth = (month: number, year: number) => new Date(year, month + 1, 0).getDate()
  const getFirstDayOfMonth = (month: number, year: number) => (new Date(year, month, 1).getDay() + 6) % 7

  const calendarDays = () => {
    const days = getDaysInMonth(currentMonth, currentYear)
    const firstDay = getFirstDayOfMonth(currentMonth, currentYear)
    const cells: (number | null)[] = Array(firstDay).fill(null)
    for (let i = 1; i <= days; i++) cells.push(i)
    return cells
  }

  const calendarEvents = [
    ...jobEvents.map(e => ({ date: e.date, title: e.title, type: "job" as const })),
    ...blockedDates.map(b => ({ date: b.date, title: b.reason, type: "blocked" as const })),
  ]

  const getEventsForDate = (day: number) => {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    return calendarEvents.filter(e => e.date === dateStr)
  }

  if (isLoading || !weeklySchedule) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("provider.availability.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("provider.availability.subtitle")}</p>
        </div>
        <Button onClick={handleSave} disabled={isSaving} className="flex items-center gap-2 rounded-xl">
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? t("provider.availability.saved") : t("provider.availability.saveChanges")}
        </Button>
      </div>

      {/* Vacation mode */}
      <Card className={`p-4 border rounded-xl ${isOnVacation ? "border-amber-300 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-900/20" : "border-border"}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${isOnVacation ? "bg-amber-500/20" : "bg-muted"}`}>
              <Plane className={`w-4.5 h-4.5 ${isOnVacation ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{t("provider.availability.vacationModeTitle")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isOnVacation ? (vacationNote || t("provider.availability.vacationModeOnHint")) : t("provider.availability.vacationModeOffHint")}
              </p>
            </div>
          </div>
          <button
            onClick={handleToggleVacation}
            disabled={isSavingVacation}
            aria-label={t("provider.availability.vacationModeTitle")}
            aria-pressed={isOnVacation}
            className={`w-11 h-6 rounded-full transition-colors flex items-center flex-shrink-0 ${isOnVacation ? "bg-amber-500 justify-end" : "bg-muted justify-start"}`}
          >
            <span className="w-5 h-5 bg-card rounded-full mx-0.5 shadow-sm" />
          </button>
        </div>

        {showVacationNote && (
          <div className="mt-3 pt-3 border-t border-border/60 space-y-2">
            <label className="text-xs font-medium text-muted-foreground">{t("provider.availability.vacationNoteLabel")}</label>
            <Textarea
              value={vacationNote}
              onChange={(e) => setVacationNote(e.target.value)}
              placeholder={t("provider.availability.vacationNotePlaceholder")}
              className="min-h-[60px] text-sm"
            />
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="bg-transparent" onClick={() => setShowVacationNote(false)} disabled={isSavingVacation}>
                {t("common.cancel")}
              </Button>
              <Button size="sm" onClick={confirmVacationOn} disabled={isSavingVacation}>
                {isSavingVacation ? <Loader2 className="w-4 h-4 animate-spin" /> : t("provider.availability.vacationModeEnable")}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted rounded-xl p-1">
        {[
          { id: "schedule" as const, label: t("provider.availability.tabWeeklyHours"), icon: Clock },
          { id: "calendar" as const, label: t("provider.availability.tabCalendarView"), icon: Calendar },
          { id: "blocked" as const, label: t("provider.availability.tabTimeOff"), icon: Plane },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Weekly Schedule Tab */}
      {activeTab === "schedule" && (
        <div className="space-y-4">
          <Card className="p-4 border border-border rounded-xl">
            <h3 className="font-semibold text-foreground mb-4">{t("provider.availability.workingHoursTitle")}</h3>
            <div className="space-y-3">
              {DAY_KEYS.map(day => (
                <div key={day} className="flex items-center gap-3">
                  <button
                    onClick={() => toggleDay(day)}
                    className={`w-10 h-6 rounded-full transition-colors flex items-center ${
                      weeklySchedule[day].enabled ? "bg-primary justify-end" : "bg-muted justify-start"
                    }`}
                  >
                    <span className="w-5 h-5 bg-card rounded-full mx-0.5 shadow-sm" />
                  </button>
                  <span className={`w-24 text-sm font-medium ${weeklySchedule[day].enabled ? "text-foreground" : "text-muted-foreground line-through"}`}>
                    {t(DAY_LABEL_KEYS[day])}
                  </span>
                  {weeklySchedule[day].enabled ? (
                    <div className="flex items-center gap-2 flex-1">
                      <Input
                        type="time"
                        value={weeklySchedule[day].start}
                        onChange={(e) => updateTime(day, "start", e.target.value)}
                        className="w-32 h-9 rounded-lg text-sm bg-card border-border"
                      />
                      <span className="text-muted-foreground text-sm">{t("provider.availability.toWord")}</span>
                      <Input
                        type="time"
                        value={weeklySchedule[day].end}
                        onChange={(e) => updateTime(day, "end", e.target.value)}
                        className="w-32 h-9 rounded-lg text-sm bg-card border-border"
                      />
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground italic">{t("provider.availability.dayOff")}</span>
                  )}
                </div>
              ))}
            </div>
          </Card>

          {/* Preferences */}
          <Card className="p-4 border border-border rounded-xl">
            <h3 className="font-semibold text-foreground mb-4">{t("provider.availability.bookingPreferencesTitle")}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">{t("provider.availability.maxJobsPerDay")}</label>
                <Input type="number" value={maxJobsPerDay} onChange={(e) => setMaxJobsPerDay(Number(e.target.value))} className="rounded-lg bg-card border-border" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">{t("provider.availability.breakBetweenJobs")}</label>
                <Input type="number" value={breakDuration} onChange={(e) => setBreakDuration(Number(e.target.value))} className="rounded-lg bg-card border-border" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">{t("provider.availability.travelRadius")}</label>
                <div className="flex items-center gap-2">
                  <Input type="number" value={travelRadius} onChange={(e) => setTravelRadius(Number(e.target.value))} className="rounded-lg bg-card border-border" />
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">{t("provider.availability.autoAcceptJobs")}</label>
                <button
                  onClick={() => setAutoAccept(!autoAccept)}
                  className={`w-11 h-6 rounded-full transition-colors flex items-center ${autoAccept ? "bg-primary justify-end" : "bg-muted justify-start"}`}
                >
                  <span className="w-5 h-5 bg-card rounded-full mx-0.5 shadow-sm" />
                </button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Calendar Tab */}
      {activeTab === "calendar" && (
        <Card className="p-4 border border-border rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => { if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1) } else setCurrentMonth(m => m - 1) }} aria-label={t("common.previousMonth")}>
              <ChevronLeft className="w-5 h-5 text-foreground" />
            </button>
            <h3 className="font-semibold text-foreground">{t(MONTH_KEYS[currentMonth])} {currentYear}</h3>
            <button onClick={() => { if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1) } else setCurrentMonth(m => m + 1) }} aria-label={t("common.nextMonth")}>
              <ChevronRight className="w-5 h-5 text-foreground" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center mb-2">
            {SHORT_DAY_KEYS.map(d => (
              <div key={d} className="text-[10px] font-semibold text-muted-foreground uppercase py-1">{t(d)}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendarDays().map((day, idx) => {
              if (!day) return <div key={`empty-${idx}`} />
              const events = getEventsForDate(day)
              const isToday = day === new Date().getDate() && currentMonth === new Date().getMonth() && currentYear === new Date().getFullYear()
              const hasBlocked = events.some(e => e.type === "blocked")
              return (
                <div
                  key={day}
                  className={`min-h-[72px] p-1 rounded-lg border text-xs transition-all ${
                    isToday ? "border-primary bg-primary/5" : hasBlocked ? "border-destructive/30 bg-destructive/5" : "border-border"
                  }`}
                >
                  <span className={`block text-right text-[11px] font-medium ${isToday ? "text-primary" : "text-foreground"}`}>{day}</span>
                  <div className="mt-0.5 space-y-0.5">
                    {events.slice(0, 2).map((ev, i) => (
                      <div key={i} className={`truncate px-1 py-0.5 rounded text-[9px] font-medium ${
                        ev.type === "job" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
                      }`}>
                        {ev.title}
                      </div>
                    ))}
                    {events.length > 2 && <span className="text-[9px] text-muted-foreground px-1">{t("provider.availability.moreEvents", { count: events.length - 2 })}</span>}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border">
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-primary" /><span className="text-xs text-muted-foreground">{t("provider.availability.legendJobs")}</span></div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-destructive" /><span className="text-xs text-muted-foreground">{t("provider.availability.legendBlocked")}</span></div>
          </div>
        </Card>
      )}

      {/* Blocked Dates Tab */}
      {activeTab === "blocked" && (
        <div className="space-y-4">
          <Card className="p-4 border border-border rounded-xl">
            <h3 className="font-semibold text-foreground mb-3">{t("provider.availability.addTimeOffTitle")}</h3>
            <div className="flex flex-col sm:flex-row gap-3">
              <Input type="date" value={newBlockDate} onChange={(e) => setNewBlockDate(e.target.value)} className="rounded-lg bg-card border-border" />
              <Input placeholder={t("provider.availability.reasonPlaceholder")} value={newBlockReason} onChange={(e) => setNewBlockReason(e.target.value)} className="rounded-lg bg-card border-border flex-1" />
              <Button onClick={addBlockedDate} disabled={!newBlockDate} className="rounded-xl"><Plus className="w-4 h-4 mr-1" />{t("provider.availability.addButton")}</Button>
            </div>
          </Card>
          <Card className="p-4 border border-border rounded-xl">
            <h3 className="font-semibold text-foreground mb-3">{t("provider.availability.upcomingTimeOffTitle")}</h3>
            {blockedDates.length === 0 ? (
              <div className="text-center py-8">
                <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">{t("provider.availability.noBlockedDates")}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {blockedDates.map((bd) => (
                  <div key={bd.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Plane className="w-4 h-4 text-primary" />
                      <div>
                        <p className="text-sm font-medium text-foreground">{bd.date}</p>
                        <p className="text-xs text-muted-foreground">{bd.reason}</p>
                      </div>
                    </div>
                    <button onClick={() => removeBlockedDate(bd.id)} aria-label={t("common.delete")} className="p-1 hover:bg-destructive/10 rounded-lg transition-colors">
                      <X className="w-4 h-4 text-destructive" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}

"use client"

import { ArrowLeft, HelpCircle, MessageCircle, Phone, Mail, Loader2, Plus, Clock } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import { Textarea } from "@/frontend/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/frontend/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/frontend/components/ui/select"
import { getSupportTickets, createSupportTicket, type SupportTicketItem } from "@/backend/actions/support"
import { formatRelativeTime } from "@/backend/domain/format"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"
import type { TranslationKey } from "@/backend/domain/i18n"

const statusColors: Record<string, string> = {
  open: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
  "in-progress": "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
  resolved: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
  closed: "bg-muted text-muted-foreground",
}

export default function HelpSupportPage() {
  const { t } = useLocalization()
  const faqs: { qKey: TranslationKey; aKey: TranslationKey }[] = [
    { qKey: "provider.help.faq1Q", aKey: "provider.help.faq1A" },
    { qKey: "provider.help.faq2Q", aKey: "provider.help.faq2A" },
    { qKey: "provider.help.faq3Q", aKey: "provider.help.faq3A" },
  ]
  const [tickets, setTickets] = useState<SupportTicketItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showNewTicket, setShowNewTicket] = useState(false)
  const [ticketCategory, setTicketCategory] = useState("")
  const [ticketSubject, setTicketSubject] = useState("")
  const [ticketDetails, setTicketDetails] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const refresh = () => getSupportTickets().then(setTickets)

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const handleSubmitTicket = async () => {
    setIsSubmitting(true)
    const result = await createSupportTicket({ category: ticketCategory, subject: ticketSubject, message: ticketDetails })
    setIsSubmitting(false)
    if (!result.success) return
    setShowNewTicket(false)
    setTicketCategory("")
    setTicketSubject("")
    setTicketDetails("")
    await refresh()
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20 lg:pb-0">
      {/* Header */}
      <div className="bg-blue-600 dark:bg-blue-700 text-white p-4 rounded-b-2xl lg:rounded-none">
        <div className="flex items-center gap-4 max-w-4xl mx-auto">
          <Link href="/provider/profile" className="lg:hidden">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <h1 className="text-lg font-bold">{t("provider.help.title")}</h1>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 max-w-2xl mx-auto lg:max-w-4xl space-y-6">
        {/* Support Options */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button onClick={() => setShowNewTicket(true)} className="bg-white dark:bg-gray-800 rounded-lg p-6 border dark:border-gray-700 text-center hover:border-blue-400 transition">
            <MessageCircle className="w-8 h-8 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
            <p className="font-medium text-gray-900 dark:text-white">{t("provider.help.fileTicketTitle")}</p>
            <p className="text-[11px] text-gray-600 dark:text-gray-400">{t("provider.help.fileTicketDesc")}</p>
          </button>
          <a href="tel:+254700072547" className="bg-white dark:bg-gray-800 rounded-lg p-6 border dark:border-gray-700 text-center hover:border-blue-400 transition block">
            <Phone className="w-8 h-8 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
            <p className="font-medium text-gray-900 dark:text-white">{t("provider.help.callUsTitle")}</p>
            <p className="text-[11px] text-gray-600 dark:text-gray-400">+254 700 072 547</p>
          </a>
          <a href="mailto:support@saji.co.ke" className="bg-white dark:bg-gray-800 rounded-lg p-6 border dark:border-gray-700 text-center hover:border-blue-400 transition block">
            <Mail className="w-8 h-8 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
            <p className="font-medium text-gray-900 dark:text-white">{t("auth.email")}</p>
            <p className="text-[11px] text-gray-600 dark:text-gray-400">support@saji.co.ke</p>
          </a>
        </div>

        {/* My Tickets */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <MessageCircle className="w-5 h-5" />{t("provider.help.myTicketsTitle")}
            </h2>
            <Button size="sm" onClick={() => setShowNewTicket(true)} className="gap-1.5"><Plus className="w-3.5 h-3.5" />{t("provider.help.newTicketButton")}</Button>
          </div>
          {isLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : tickets.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">{t("provider.help.noTicketsYet")}</p>
          ) : (
            <div className="space-y-2">
              {tickets.map((ticket) => {
                const uiStatus = ticket.status.toLowerCase().replace("_", "-")
                return (
                  <div key={ticket.id} className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="font-medium text-xs text-gray-900 dark:text-white">{ticket.subject}</p>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${statusColors[uiStatus] ?? statusColors.open}`}>{uiStatus.replace("-", " ")}</span>
                    </div>
                    <p className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400"><Clock className="w-3 h-3" />{t("provider.help.filedLabel", { time: formatRelativeTime(ticket.createdAt) })}</p>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* FAQs */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border dark:border-gray-700">
          <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <HelpCircle className="w-5 h-5" />
            {t("provider.help.faqTitle")}
          </h2>
          <div className="space-y-4">
            {faqs.map((faq, idx) => (
              <div key={idx} className="border-l-4 border-blue-600 pl-4">
                <p className="font-medium text-gray-900 dark:text-white mb-1">{t(faq.qKey)}</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">{t(faq.aKey)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* New Ticket Dialog */}
      <Dialog open={showNewTicket} onOpenChange={setShowNewTicket}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader><DialogTitle>{t("provider.help.fileTicketModalTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium mb-2 block">{t("provider.help.categoryLabel")}</label>
              <Select value={ticketCategory} onValueChange={setTicketCategory}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder={t("provider.help.selectCategoryPlaceholder")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="payout">{t("provider.help.categoryPayout")}</SelectItem>
                  <SelectItem value="dispute">{t("provider.help.categoryDispute")}</SelectItem>
                  <SelectItem value="account">{t("provider.help.categoryAccount")}</SelectItem>
                  <SelectItem value="verification">{t("provider.help.categoryVerification")}</SelectItem>
                  <SelectItem value="other">{t("provider.help.categoryOther")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><label className="text-xs font-medium mb-2 block">{t("provider.help.subjectLabel")}</label><Input value={ticketSubject} onChange={(e) => setTicketSubject(e.target.value)} placeholder={t("provider.help.subjectPlaceholder")} className="rounded-xl" /></div>
            <div><label className="text-xs font-medium mb-2 block">{t("provider.help.detailsLabel")}</label><Textarea value={ticketDetails} onChange={(e) => setTicketDetails(e.target.value)} placeholder={t("provider.help.detailsPlaceholder")} className="min-h-[120px] rounded-xl" /></div>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setShowNewTicket(false)} className="flex-1 rounded-xl bg-transparent" disabled={isSubmitting}>{t("common.cancel")}</Button>
            <Button onClick={handleSubmitTicket} className="flex-1 rounded-xl" disabled={!ticketCategory || !ticketSubject || isSubmitting}>
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t("provider.help.submitButton")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

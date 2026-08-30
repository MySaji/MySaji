"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Search, HelpCircle, MessageCircle, Shield, AlertTriangle, ChevronRight,
  FileText, Phone, Mail, Clock, CheckCircle, Plus, ChevronDown,
  Wallet, Briefcase, User, Settings, Loader2
} from "lucide-react"
import { getSupportTickets, createSupportTicket, type SupportTicketItem } from "@/lib/actions/support"
import { formatRelativeTime } from "@/lib/format"
import { useLocalization } from "@/lib/hooks/useLocalization"

interface FAQ { question: string; answer: string }

const statusColors: Record<string, { bg: string; text: string }> = {
  open: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400" },
  "in-progress": { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400" },
  resolved: { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-400" },
  closed: { bg: "bg-muted", text: "text-muted-foreground" },
}

export function CustomerHelpPage() {
  const { t, tn, formatMoney } = useLocalization()
  const faqs: FAQ[] = [
    { question: t("customer.help.faq1Q"), answer: t("customer.help.faq1A") },
    { question: t("customer.help.faq2Q"), answer: t("customer.help.faq2A") },
    { question: t("customer.help.faq3Q"), answer: t("customer.help.faq3A", { amount: formatMoney(2000) }) },
    { question: t("customer.help.faq4Q"), answer: t("customer.help.faq4A") },
    { question: t("customer.help.faq5Q"), answer: t("customer.help.faq5A") },
    { question: t("customer.help.faq6Q"), answer: t("customer.help.faq6A") },
  ]
  const ticketStatusLabels: Record<string, string> = {
    open: t("customer.help.statusOpen"),
    "in-progress": t("customer.help.statusInProgress"),
    resolved: t("customer.help.statusResolved"),
    closed: t("customer.help.statusClosed"),
  }
  const quickLinks = [
    { icon: Briefcase, label: t("customer.help.quickLinkBookings"), href: "/customer/jobs", desc: t("customer.help.quickLinkBookingsDesc") },
    { icon: Wallet, label: t("nav.wallet"), href: "/customer/wallet", desc: t("customer.help.quickLinkWalletDesc") },
    { icon: User, label: t("customer.help.quickLinkAccount"), href: "/customer/profile", desc: t("customer.help.quickLinkAccountDesc") },
    { icon: Settings, label: t("settings.title"), href: "/customer/settings", desc: t("customer.help.quickLinkSettingsDesc") },
  ]
  const [activeView, setActiveView] = useState<"main" | "faq" | "tickets">("main")
  const [searchQuery, setSearchQuery] = useState("")
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null)
  const [showNewTicket, setShowNewTicket] = useState(false)
  const [ticketCategory, setTicketCategory] = useState("")
  const [ticketSubject, setTicketSubject] = useState("")
  const [ticketDetails, setTicketDetails] = useState("")
  const [ticketSubmitted, setTicketSubmitted] = useState(false)
  const [isSubmittingTicket, setIsSubmittingTicket] = useState(false)

  const [tickets, setTickets] = useState<SupportTicketItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const refresh = () => getSupportTickets().then(setTickets)

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const filteredFaqs = searchQuery
    ? faqs.filter(f => f.question.toLowerCase().includes(searchQuery.toLowerCase()) || f.answer.toLowerCase().includes(searchQuery.toLowerCase()))
    : faqs

  const handleSubmitTicket = async () => {
    setIsSubmittingTicket(true)
    const result = await createSupportTicket({ category: ticketCategory, subject: ticketSubject, message: ticketDetails })
    setIsSubmittingTicket(false)
    if (!result.success) return
    setTicketSubmitted(true)
    await refresh()
    setTimeout(() => { setShowNewTicket(false); setTicketSubmitted(false); setTicketCategory(""); setTicketSubject(""); setTicketDetails("") }, 2500)
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-6 lg:py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl lg:text-2xl font-bold text-foreground flex items-center gap-2">
            <HelpCircle className="w-6 h-6 text-primary" />{t("customer.help.title")}
          </h1>
          <p className="text-xs text-muted-foreground mt-1">{t("customer.help.subtitle")}</p>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder={t("customer.help.searchPlaceholder")}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-12 h-12 rounded-xl border-0 bg-muted/50 text-sm"
          />
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6">
          {[
            { id: "main" as const, label: t("customer.help.tabOverview"), icon: HelpCircle },
            { id: "faq" as const, label: t("customer.help.tabFaq"), icon: FileText },
            { id: "tickets" as const, label: t("customer.help.tabTickets"), icon: MessageCircle },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveView(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium transition-all ${
                activeView === tab.id ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              <tab.icon className="w-4 h-4" />{tab.label}
            </button>
          ))}
        </div>

        {/* Main Overview */}
        {activeView === "main" && (
          <div className="space-y-6">
            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-3">
              <Card className="p-4 border-0 shadow-sm hover:shadow-md transition-all cursor-pointer" onClick={() => setShowNewTicket(true)}>
                <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-3">
                  <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
                <p className="font-semibold text-xs text-foreground">{t("customer.help.fileDispute")}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{t("customer.help.fileDisputeDesc")}</p>
              </Card>
              <Card className="p-4 border-0 shadow-sm hover:shadow-md transition-all cursor-pointer" onClick={() => setActiveView("faq")}>
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-3">
                  <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <p className="font-semibold text-xs text-foreground">{t("customer.help.browseFaq")}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{t("customer.help.browseFaqDesc")}</p>
              </Card>
            </div>

            {/* Contact Support */}
            <Card className="p-5 border-0 shadow-sm">
              <h3 className="font-semibold text-foreground mb-4">{t("customer.help.contactSupport")}</h3>
              <div className="space-y-3">
                <button onClick={() => setShowNewTicket(true)} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors">
                  <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center"><MessageCircle className="w-4 h-4 text-emerald-600" /></div>
                  <div className="flex-1 text-left"><p className="text-xs font-medium text-foreground">{t("customer.help.fileTicket")}</p><p className="text-[11px] text-muted-foreground">{t("customer.help.fileTicketDesc")}</p></div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
                <a href="tel:+254700072547" className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors">
                  <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center"><Phone className="w-4 h-4 text-blue-600" /></div>
                  <div className="flex-1 text-left"><p className="text-xs font-medium text-foreground">{t("customer.help.callUs")}</p><p className="text-[11px] text-muted-foreground">+254 700 072 547</p></div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </a>
                <a href="mailto:support@saji.co.ke" className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors">
                  <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center"><Mail className="w-4 h-4 text-amber-600" /></div>
                  <div className="flex-1 text-left"><p className="text-xs font-medium text-foreground">{t("customer.help.email")}</p><p className="text-[11px] text-muted-foreground">support@saji.co.ke</p></div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </a>
              </div>
            </Card>

            {/* Quick Links */}
            <Card className="p-5 border-0 shadow-sm">
              <h3 className="font-semibold text-foreground mb-4">{t("customer.help.quickLinks")}</h3>
              <div className="grid grid-cols-2 gap-2">
                {quickLinks.map((link, i) => (
                  <a key={i} href={link.href} className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors">
                    <link.icon className="w-4 h-4 text-primary" />
                    <div><p className="text-xs font-medium text-foreground">{link.label}</p><p className="text-[10px] text-muted-foreground">{link.desc}</p></div>
                  </a>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* FAQ View */}
        {activeView === "faq" && (
          <div className="space-y-2">
            {filteredFaqs.map((faq, idx) => (
              <Card key={idx} className="border-0 shadow-sm overflow-hidden">
                <button onClick={() => setExpandedFaq(expandedFaq === idx ? null : idx)} className="w-full p-4 text-left flex items-center justify-between gap-3">
                  <p className="font-medium text-xs text-foreground">{faq.question}</p>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform ${expandedFaq === idx ? "rotate-180" : ""}`} />
                </button>
                {expandedFaq === idx && (
                  <div className="px-4 pb-4 -mt-1"><p className="text-xs text-muted-foreground leading-relaxed">{faq.answer}</p></div>
                )}
              </Card>
            ))}
            {filteredFaqs.length === 0 && (
              <Card className="p-8 text-center border-0 shadow-sm">
                <Search className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="font-medium text-foreground">{t("customer.help.noResults")}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("customer.help.noResultsHint")}</p>
              </Card>
            )}
          </div>
        )}

        {/* Tickets View */}
        {activeView === "tickets" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{tn("customer.help.ticketCount", tickets.length)}</p>
              <Button size="sm" onClick={() => setShowNewTicket(true)} className="rounded-xl gap-1.5"><Plus className="w-3.5 h-3.5" />{t("customer.help.newTicket")}</Button>
            </div>
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : tickets.length === 0 ? (
              <Card className="p-8 text-center border-0 shadow-sm">
                <p className="text-xs text-muted-foreground">{t("customer.help.noTickets")}</p>
              </Card>
            ) : tickets.map(ticket => {
              const uiStatus = ticket.status.toLowerCase().replace("_", "-")
              const sc = statusColors[uiStatus] ?? statusColors.open
              const statusLabel = ticketStatusLabels[uiStatus] ?? ticketStatusLabels.open
              return (
                <Card key={ticket.id} className="p-4 border-0 shadow-sm hover:shadow-md transition-all">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <p className="font-semibold text-xs text-foreground">{ticket.subject}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{t("customer.help.ticketFiled", { id: ticket.id.slice(-8).toUpperCase(), time: formatRelativeTime(ticket.createdAt) })}</p>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold ${sc.bg} ${sc.text}`}>{statusLabel}</span>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock className="w-3 h-3" /> {t("customer.help.lastUpdated", { time: formatRelativeTime(ticket.updatedAt) })}
                  </div>
                </Card>
              )
            })}
          </div>
        )}

        {/* New Ticket Dialog */}
        <Dialog open={showNewTicket} onOpenChange={setShowNewTicket}>
          <DialogContent className="max-w-md rounded-2xl" aria-describedby={undefined}>
            {!ticketSubmitted ? (
              <>
                <DialogHeader><DialogTitle>{t("customer.help.fileSupportTicket")}</DialogTitle></DialogHeader>
                <div className="space-y-4 py-2">
                  <div><label className="text-xs font-medium mb-2 block">{t("customer.help.category")}</label>
                    <Select value={ticketCategory} onValueChange={setTicketCategory}><SelectTrigger className="rounded-xl"><SelectValue placeholder={t("customer.help.selectCategory")} /></SelectTrigger><SelectContent><SelectItem value="dispute">{t("customer.help.categoryDispute")}</SelectItem><SelectItem value="billing">{t("customer.help.categoryBilling")}</SelectItem><SelectItem value="account">{t("customer.help.categoryAccount")}</SelectItem><SelectItem value="safety">{t("customer.help.categorySafety")}</SelectItem><SelectItem value="other">{t("customer.savedAddresses.typeOther")}</SelectItem></SelectContent></Select>
                  </div>
                  <div><label className="text-xs font-medium mb-2 block">{t("customer.help.subject")}</label><Input value={ticketSubject} onChange={e => setTicketSubject(e.target.value)} placeholder={t("customer.help.briefDescription")} className="rounded-xl" /></div>
                  <div><label className="text-xs font-medium mb-2 block">{t("customer.help.details")}</label><Textarea value={ticketDetails} onChange={e => setTicketDetails(e.target.value)} placeholder={t("customer.help.describeIssue")} className="min-h-[120px] rounded-xl" /></div>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setShowNewTicket(false)} className="flex-1 rounded-xl bg-transparent" disabled={isSubmittingTicket}>{t("common.cancel")}</Button>
                  <Button onClick={handleSubmitTicket} className="flex-1 rounded-xl" disabled={!ticketCategory || !ticketSubject || isSubmittingTicket}>
                    {isSubmittingTicket ? <Loader2 className="w-4 h-4 animate-spin" /> : t("customer.help.submit")}
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-emerald-600" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-1">{t("customer.help.ticketSubmitted")}</h3>
                <p className="text-xs text-muted-foreground">{t("customer.help.respondWithin")}</p>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}

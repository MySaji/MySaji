'use client'

import { useState, useEffect } from 'react'
import { Mail, Send, Trash2, Download, Search, Loader2 } from 'lucide-react'
import { Button } from '@/frontend/components/ui/button'
import { Input } from '@/frontend/components/ui/input'
import { Card } from '@/frontend/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/frontend/components/ui/dialog'
import { getSubscribers, deleteSubscriber, type AdminSubscriber } from '@/backend/actions/admin-subscribers'
import { useLocalization } from '@/frontend/lib/hooks/useLocalization'

export default function SubscribersPage() {
  const { t } = useLocalization()
  const [subscribers, setSubscribers] = useState<AdminSubscriber[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [showEmailDialog, setShowEmailDialog] = useState(false)
  const [selectedRecipients, setSelectedRecipients] = useState<'all' | 'individual'>('all')
  const [selectedEmail, setSelectedEmail] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailContent, setEmailContent] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [sendMessage, setSendMessage] = useState('')
  const [sendMessageIsError, setSendMessageIsError] = useState(false)
  const [busyEmail, setBusyEmail] = useState<string | null>(null)

  const refresh = async () => {
    const data = await getSubscribers()
    setSubscribers(data)
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const filteredSubscribers = subscribers.filter((sub) =>
    sub.email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleDeleteSubscriber = async (email: string) => {
    if (!confirm(t("admin.subscribers.confirmRemoveSubscriber", { email }))) return
    setBusyEmail(email)
    const result = await deleteSubscriber({ email })
    setBusyEmail(null)
    if (!result.success) { alert(result.error); return }
    await refresh()
  }

  const handleSendEmail = async () => {
    if (!emailSubject || !emailContent) {
      setSendMessageIsError(true)
      setSendMessage(t("admin.subscribers.fillSubjectContent"))
      return
    }

    setIsSending(true)
    setSendMessage('')

    try {
      const recipients =
        selectedRecipients === 'all'
          ? subscribers.map((s) => s.email)
          : [selectedEmail]

      const response = await fetch('/api/send-newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients,
          subject: emailSubject,
          content: emailContent,
        }),
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result?.error || t("admin.subscribers.failedToSendEmails"))

      setSendMessageIsError(false)
      setSendMessage(result.message)
      setTimeout(() => {
        setShowEmailDialog(false)
        setEmailSubject('')
        setEmailContent('')
        setSendMessage('')
      }, 2000)
    } catch (err) {
      setSendMessageIsError(true)
      setSendMessage(err instanceof Error ? err.message : t("admin.subscribers.failedToSendEmailRetry"))
    } finally {
      setIsSending(false)
    }
  }

  const exportSubscribers = () => {
    const csv = [
      ['Email', 'Subscribed At'].join(','),
      ...subscribers.map((s) => [s.email, s.subscribedAt].join(',')),
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `subscribers-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {t("admin.subscribers.title")}
          </h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">
            {t("admin.subscribers.subtitle")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={exportSubscribers} variant="outline" className="gap-2">
            <Download className="w-4 h-4" />
            {t("admin.subscribers.exportCsv")}
          </Button>
          <Button onClick={() => setShowEmailDialog(true)} className="gap-2 bg-blue-600 hover:bg-blue-700">
            <Mail className="w-4 h-4" />
            {t("admin.subscribers.sendEmail")}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-3 dark:bg-blue-900/30">
              <Mail className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-gray-600 dark:text-gray-400">{t("admin.subscribers.statTotalSubscribers")}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{subscribers.length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-100 p-3 dark:bg-green-900/30">
              <Mail className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-xs text-gray-600 dark:text-gray-400">{t("admin.subscribers.statThisMonth")}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {subscribers.filter((s) => new Date(s.subscribedAt).getMonth() === new Date().getMonth()).length}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-purple-100 p-3 dark:bg-purple-900/30">
              <Mail className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-xs text-gray-600 dark:text-gray-400">{t("admin.subscribers.statNewToday")}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {subscribers.filter((s) => new Date(s.subscribedAt).toDateString() === new Date().toDateString()).length}
              </p>
            </div>
          </div>
        </Card>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder={t("admin.subscribers.searchPlaceholder")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900 dark:text-white">{t("auth.email")}</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900 dark:text-white">{t("admin.subscribers.colSubscribed")}</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-900 dark:text-white">{t("admin.subscribers.colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-center">
                    <Loader2 className="inline-block h-5 w-5 animate-spin text-primary" />
                  </td>
                </tr>
              ) : filteredSubscribers.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-center text-gray-500">{t("admin.subscribers.noSubscribersFound")}</td>
                </tr>
              ) : (
                filteredSubscribers.map((subscriber) => (
                  <tr
                    key={subscriber.email}
                    className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
                  >
                    <td className="px-6 py-4 text-xs text-gray-900 dark:text-white">{subscriber.email}</td>
                    <td className="px-6 py-4 text-xs text-gray-600 dark:text-gray-400">
                      {new Date(subscriber.subscribedAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setSelectedEmail(subscriber.email)
                            setSelectedRecipients('individual')
                            setShowEmailDialog(true)
                          }}
                          className="gap-1"
                        >
                          <Send className="w-4 h-4" />
                          {t("admin.subscribers.send")}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteSubscriber(subscriber.email)}
                          disabled={busyEmail === subscriber.email}
                          className="gap-1 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          {busyEmail === subscriber.email ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          {t("common.delete")}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("admin.subscribers.sendCampaignTitle")}</DialogTitle>
            <DialogDescription>{t("admin.subscribers.sendCampaignDesc")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-3">
              <label className="text-xs font-medium text-gray-900 dark:text-white">{t("admin.subscribers.recipients")}</label>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="recipients"
                    value="all"
                    checked={selectedRecipients === 'all'}
                    onChange={(e) => setSelectedRecipients(e.target.value as 'all' | 'individual')}
                  />
                  <span className="text-xs">{t("admin.subscribers.allSubscribersCount", { count: subscribers.length })}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="recipients"
                    value="individual"
                    checked={selectedRecipients === 'individual'}
                    onChange={(e) => setSelectedRecipients(e.target.value as 'all' | 'individual')}
                  />
                  <span className="text-xs">{t("admin.subscribers.individual")}</span>
                </label>
              </div>

              {selectedRecipients === 'individual' && (
                <select
                  value={selectedEmail}
                  onChange={(e) => setSelectedEmail(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                >
                  <option value="">{t("admin.subscribers.selectEmailPlaceholder")}</option>
                  {subscribers.map((s) => (
                    <option key={s.email} value={s.email}>{s.email}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-900 dark:text-white">{t("admin.subscribers.subject")}</label>
              <Input placeholder={t("admin.subscribers.subjectPlaceholder")} value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-900 dark:text-white">{t("admin.subscribers.message")}</label>
              <textarea
                placeholder={t("admin.subscribers.messagePlaceholder")}
                value={emailContent}
                onChange={(e) => setEmailContent(e.target.value)}
                rows={8}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
            </div>

            {sendMessage && (
              <div
                className={`rounded-lg px-4 py-2 text-xs font-medium ${
                  sendMessageIsError
                    ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                    : 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                }`}
              >
                {sendMessage}
              </div>
            )}

            <div className="flex gap-3 justify-end pt-4">
              <Button variant="outline" onClick={() => setShowEmailDialog(false)}>{t("common.cancel")}</Button>
              <Button onClick={handleSendEmail} disabled={isSending} className="gap-2 bg-blue-600 hover:bg-blue-700">
                <Send className="w-4 h-4" />
                {isSending ? t("admin.subscribers.sendingEllipsis") : t("admin.subscribers.sendEmail")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

"use client"

import { ArrowLeft, Star, MessageSquare, Loader2, Flag } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { getMyReviews, replyToReview, disputeReview, type ProviderReviewItem } from "@/lib/actions/provider-credentials"
import { useLocalization } from "@/lib/hooks/useLocalization"
import type { TranslationKey } from "@/lib/i18n"

const SUB_SCORES: { key: keyof Pick<ProviderReviewItem, "professionalism" | "communication" | "punctuality" | "qualityOfWork">; labelKey: TranslationKey }[] = [
  { key: "professionalism", labelKey: "provider.ratings.subProfessionalism" },
  { key: "communication", labelKey: "provider.ratings.subCommunication" },
  { key: "punctuality", labelKey: "provider.ratings.subPunctuality" },
  { key: "qualityOfWork", labelKey: "provider.ratings.subQualityOfWork" },
]

export default function RatingsPage() {
  const { t, tn } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [ratings, setRatings] = useState<ProviderReviewItem[]>([])
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [disputingId, setDisputingId] = useState<string | null>(null)
  const [disputeText, setDisputeText] = useState("")
  const [disputeError, setDisputeError] = useState("")
  const [isSubmittingDispute, setIsSubmittingDispute] = useState(false)

  const refresh = () => getMyReviews().then(setRatings)

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const avgRating = ratings.length > 0 ? (ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length).toFixed(1) : "0.0"

  const openReply = (id: string) => { setReplyingTo(id); setReplyText("") }

  const submitReply = async (id: string) => {
    if (!replyText.trim()) return
    setIsSaving(true)
    const result = await replyToReview({ reviewId: id, response: replyText.trim() })
    setIsSaving(false)
    if (result.success) { setReplyingTo(null); await refresh() }
  }

  const openDispute = (id: string) => { setDisputingId(id); setDisputeText(""); setDisputeError("") }

  const submitDispute = async (id: string) => {
    setIsSubmittingDispute(true)
    setDisputeError("")
    const result = await disputeReview({ reviewId: id, explanation: disputeText.trim() })
    setIsSubmittingDispute(false)
    if (!result.success) { setDisputeError(result.error); return }
    setDisputingId(null)
    await refresh()
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20 lg:pb-0">
      {/* Header */}
      <div className="bg-blue-600 dark:bg-blue-700 text-white p-4 rounded-b-2xl lg:rounded-none">
        <div className="flex items-center gap-4 max-w-4xl mx-auto">
          <Link href="/provider/profile" className="lg:hidden">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <h1 className="text-lg font-bold">{t("provider.ratings.title")}</h1>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 max-w-2xl mx-auto lg:max-w-4xl space-y-6">
        {/* Average Rating */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border dark:border-gray-700 text-center">
          <div className="flex justify-center gap-1 mb-2">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className={`w-5 h-5 ${i < Math.round(Number(avgRating)) ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`} />
            ))}
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">{avgRating}</p>
          <p className="text-xs text-gray-600 dark:text-gray-400">{tn("provider.ratings.reviewCount", ratings.length)}</p>
        </div>

        {/* Reviews */}
        <div className="space-y-3">
          {ratings.length === 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-8 border dark:border-gray-700 text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400">{t("provider.ratings.emptyText")}</p>
            </div>
          )}
          {ratings.map((review) => (
            <div key={review.id} className="bg-white dark:bg-gray-800 rounded-lg p-4 border dark:border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-gray-900 dark:text-white">{review.customerName}</p>
                <div className="flex gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className={`w-4 h-4 ${i < Math.floor(review.rating) ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`} />
                  ))}
                </div>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">{review.comment}</p>

              {SUB_SCORES.some((s) => review[s.key] != null) && (
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {SUB_SCORES.filter((s) => review[s.key] != null).map((s) => (
                    <div key={s.key} className="flex items-center justify-between text-[11px] bg-gray-50 dark:bg-gray-700/40 rounded-lg px-2 py-1">
                      <span className="text-gray-500 dark:text-gray-400">{t(s.labelKey)}</span>
                      <span className="font-medium text-gray-900 dark:text-white">{review[s.key]}/5</span>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-[11px] text-gray-500 dark:text-gray-500 mb-2">{new Date(review.createdAt).toLocaleDateString()}</p>

              {review.response ? (
                <div className="mt-2 pl-3 border-l-2 border-blue-500 bg-blue-50 dark:bg-blue-900/20 rounded-r-lg p-2">
                  <p className="text-[11px] font-medium text-blue-700 dark:text-blue-400 mb-0.5">{t("provider.ratings.yourReplyLabel")}</p>
                  <p className="text-xs text-gray-700 dark:text-gray-300">{review.response}</p>
                </div>
              ) : replyingTo === review.id ? (
                <div className="mt-2 space-y-2">
                  <Textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder={t("provider.ratings.replyPlaceholder")} className="text-xs min-h-[70px]" />
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setReplyingTo(null)} disabled={isSaving}>{t("common.cancel")}</Button>
                    <Button size="sm" onClick={() => submitReply(review.id)} disabled={!replyText.trim() || isSaving}>
                      {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t("provider.ratings.postReply")}
                    </Button>
                  </div>
                </div>
              ) : (
                <button onClick={() => openReply(review.id)} className="mt-1 flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline">
                  <MessageSquare className="w-3 h-3" /> {t("provider.ratings.replyButton")}
                </button>
              )}

              {/* Formal dispute — separate from the public reply above */}
              {review.disputeStatus ? (
                <div className="mt-2 pl-3 border-l-2 border-amber-500 bg-amber-50 dark:bg-amber-900/20 rounded-r-lg p-2">
                  <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400 mb-0.5">
                    {t("provider.ratings.disputeStatusLabel", { number: review.disputeStatus.disputeNumber })} &middot; {review.disputeStatus.status}
                  </p>
                  {review.disputeStatus.resolution && <p className="text-xs text-gray-700 dark:text-gray-300">{review.disputeStatus.resolution}</p>}
                </div>
              ) : disputingId === review.id ? (
                <div className="mt-2 space-y-2">
                  <Textarea value={disputeText} onChange={(e) => setDisputeText(e.target.value)} placeholder={t("provider.ratings.disputePlaceholder")} className="text-xs min-h-[70px]" />
                  {disputeError && <p className="text-[11px] text-red-600">{disputeError}</p>}
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setDisputingId(null)} disabled={isSubmittingDispute}>{t("common.cancel")}</Button>
                    <Button size="sm" className="bg-amber-600 hover:bg-amber-700" onClick={() => submitDispute(review.id)} disabled={disputeText.trim().length < 10 || isSubmittingDispute}>
                      {isSubmittingDispute ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t("provider.ratings.submitDispute")}
                    </Button>
                  </div>
                </div>
              ) : (
                <button onClick={() => openDispute(review.id)} className="mt-1 ml-3 flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400 hover:underline">
                  <Flag className="w-3 h-3" /> {t("provider.ratings.disputeButton")}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

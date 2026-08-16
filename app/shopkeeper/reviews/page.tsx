"use client"

import { useEffect, useState } from "react"
import {
  Star, Search, MessageSquare,
  Clock, CheckCircle2, TrendingUp, Loader2
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import Image from "next/image"
import {
  getMyReviews, replyToReview,
  type ShopkeeperReview, type ShopkeeperReviewsData,
} from "@/lib/actions/shopkeeper-reviews"
import { useLocalization } from "@/lib/hooks/useLocalization"

export default function ShopkeeperReviewsPage() {
  const { t, tn } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [data, setData] = useState<ShopkeeperReviewsData | null>(null)
  const [activeFilter, setActiveFilter] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [showReplyModal, setShowReplyModal] = useState(false)
  const [selectedReview, setSelectedReview] = useState<ShopkeeperReview | null>(null)
  const [replyText, setReplyText] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const refresh = async () => {
    const result = await getMyReviews()
    setData(result)
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const ratingFilters = [
    { key: "all", label: t("shopkeeper.reviews.filterAll") },
    { key: "5", label: t("shopkeeper.reviews.filter5Stars") },
    { key: "4", label: t("shopkeeper.reviews.filter4Stars") },
    { key: "3", label: t("shopkeeper.reviews.filter3Stars") },
    { key: "2", label: t("shopkeeper.reviews.filter2Stars") },
    { key: "1", label: t("shopkeeper.reviews.filter1Star") },
    { key: "unreplied", label: t("shopkeeper.reviews.filterNeedsReply") },
  ]

  const reviews = data?.reviews ?? []

  const filteredReviews = reviews.filter(review => {
    const matchesSearch = review.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (review.productName ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      review.comment.toLowerCase().includes(searchQuery.toLowerCase())

    if (activeFilter === "all") return matchesSearch
    if (activeFilter === "unreplied") return matchesSearch && !review.response
    return matchesSearch && review.rating === parseInt(activeFilter)
  })

  const handleReply = async () => {
    if (!replyText.trim() || !selectedReview) return
    setIsSubmitting(true)
    const result = await replyToReview({ reviewId: selectedReview.id, response: replyText })
    setIsSubmitting(false)
    if (!result.success) { alert(result.error); return }
    setShowReplyModal(false)
    setReplyText("")
    setSelectedReview(null)
    await refresh()
  }

  const formatDate = (iso: string) => {
    const diffMs = Date.now() - new Date(iso).getTime()
    const days = Math.floor(diffMs / 86400000)
    if (days === 0) return t("shopkeeper.reviews.todayLabel")
    if (days === 1) return t("shopkeeper.reviews.yesterdayLabel")
    if (days < 7) return tn("shopkeeper.reviews.daysAgo", days)
    if (days < 30) return tn("shopkeeper.reviews.weeksAgo", Math.floor(days / 7))
    return tn("shopkeeper.reviews.monthsAgo", Math.floor(days / 30))
  }

  const renderStars = (rating: number, size: string = "w-4 h-4") => {
    return (
      <div className="flex">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`${size} ${star <= rating ? "fill-amber-400 text-amber-400" : "text-gray-300 dark:text-gray-600"}`}
          />
        ))}
      </div>
    )
  }

  if (isLoading || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const avgRatingLabel = data.totalReviews > 0 ? data.avgRating.toFixed(1) : "—"

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 lg:p-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white">{t("shopkeeper.reviews.title")}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t("shopkeeper.reviews.subtitle")}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <Card className="p-5 border-0 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="text-center">
                <p className="text-4xl font-bold text-gray-900 dark:text-white">{avgRatingLabel}</p>
                {renderStars(Math.round(data.avgRating), "w-4 h-4")}
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{tn("shopkeeper.reviews.reviewsCount", data.totalReviews)}</p>
              </div>
              <div className="flex-1 space-y-1.5">
                {data.ratingDistribution.map(({ star, count, percent }) => (
                  <div key={star} className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400 w-3">{star}</span>
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                    <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-400 rounded-full transition-all"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400 w-6 text-right">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card className="p-5 border-0 shadow-sm flex flex-col justify-center">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs text-gray-500 dark:text-gray-400">{t("shopkeeper.reviews.responseRate")}</span>
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {data.totalReviews > 0 ? Math.round(((data.totalReviews - data.unrepliedCount) / data.totalReviews) * 100) : 0}%
                </p>
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <Clock className="w-4 h-4 text-blue-500" />
                  <span className="text-xs text-gray-500 dark:text-gray-400">{t("shopkeeper.reviews.avgReplyTime")}</span>
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {data.avgReplyTimeHours === null ? "—" : data.avgReplyTimeHours < 1 ? t("shopkeeper.reviews.lessThanHour") : t("shopkeeper.reviews.hoursSuffix", { hours: Math.round(data.avgReplyTimeHours) })}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-5 border-0 shadow-sm bg-amber-50 dark:bg-amber-900/20">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/40 rounded-lg">
                <MessageSquare className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="font-semibold text-amber-900 dark:text-amber-200">{t("shopkeeper.reviews.needsReplyMessage", { count: data.unrepliedCount })}</p>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                  {t("shopkeeper.reviews.needsReplyHint")}
                </p>
                <Button
                  size="sm"
                  className="mt-3 bg-amber-600 hover:bg-amber-700 text-xs h-8"
                  onClick={() => setActiveFilter("unreplied")}
                >
                  {t("shopkeeper.reviews.replyToReviews")}
                </Button>
              </div>
            </div>
          </Card>
        </div>

        <Card className="p-3 mb-4 border-0 shadow-sm">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder={t("shopkeeper.reviews.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-9"
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {ratingFilters.map((filter) => (
                <button
                  key={filter.key}
                  onClick={() => setActiveFilter(filter.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    activeFilter === filter.key
                      ? "bg-amber-600 text-white"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }`}
                >
                  {filter.label}
                  {filter.key === "unreplied" && data.unrepliedCount > 0 && (
                    <span className={`ml-1 px-1 py-0.5 rounded text-[10px] ${
                      activeFilter === filter.key ? "bg-white/20" : "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400"
                    }`}>
                      {data.unrepliedCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </Card>

        <div className="space-y-3">
          {filteredReviews.length > 0 ? (
            filteredReviews.map((review) => (
              <Card key={review.id} className="p-4 lg:p-5 border-0 shadow-sm">
                <div className="flex items-start gap-3 mb-3">
                  <Image
                    src={review.customerAvatar || "/placeholder.svg"}
                    alt={review.customerName}
                    width={40}
                    height={40}
                    className="rounded-full object-cover w-10 h-10 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-sm text-gray-900 dark:text-white">{review.customerName}</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {review.productName ?? (review.orderNumber ? t("shopkeeper.reviews.shopReviewLabel", { orderNumber: review.orderNumber }) : t("shopkeeper.reviews.shopReviewLabelGeneric"))}
                        </p>
                      </div>
                      <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">{formatDate(review.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {renderStars(review.rating, "w-3.5 h-3.5")}
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{review.rating}.0</span>
                    </div>
                  </div>
                </div>

                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-3">{review.comment}</p>

                {!review.response && (
                  <div className="flex items-center justify-end">
                    <Button
                      size="sm"
                      className="bg-amber-600 hover:bg-amber-700 text-xs h-7 gap-1"
                      onClick={() => {
                        setSelectedReview(review)
                        setReplyText("")
                        setShowReplyModal(true)
                      }}
                    >
                      <MessageSquare className="w-3 h-3" />
                      {t("shopkeeper.reviews.replyButton")}
                    </Button>
                  </div>
                )}

                {review.response && (
                  <div className="mt-3 ml-4 pl-4 border-l-2 border-amber-300 dark:border-amber-700">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white text-[10px] font-bold">
                        {data.shopName.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-xs font-semibold text-gray-900 dark:text-white">{data.shopName}</span>
                      {review.respondedAt && <span className="text-[10px] text-gray-400">{formatDate(review.respondedAt)}</span>}
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{review.response}</p>
                  </div>
                )}
              </Card>
            ))
          ) : (
            <Card className="p-12 border-0 shadow-sm text-center">
              <Star className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{t("shopkeeper.reviews.noReviewsFound")}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t("shopkeeper.reviews.noReviewsHint")}</p>
            </Card>
          )}
        </div>
      </div>

      {/* Reply Modal */}
      <Dialog open={showReplyModal} onOpenChange={setShowReplyModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("shopkeeper.reviews.replyModalTitle")}</DialogTitle>
          </DialogHeader>
          {selectedReview && (
            <div className="space-y-4 py-2">
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Image
                    src={selectedReview.customerAvatar || "/placeholder.svg"}
                    alt={selectedReview.customerName}
                    width={28}
                    height={28}
                    className="rounded-full object-cover"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{selectedReview.customerName}</p>
                    {renderStars(selectedReview.rating, "w-3 h-3")}
                  </div>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-3">{selectedReview.comment}</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">{t("shopkeeper.reviews.yourReplyLabel")}</label>
                <Textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={t("shopkeeper.reviews.replyPlaceholder")}
                  className="min-h-[100px]"
                />
                <p className="text-xs text-gray-400 mt-1">{t("shopkeeper.reviews.charCount", { count: replyText.length })}</p>
              </div>

              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  <strong>{t("shopkeeper.reviews.tipLabel")}</strong> {t("shopkeeper.reviews.tipText")}
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 bg-transparent"
                  onClick={() => setShowReplyModal(false)}
                  disabled={isSubmitting}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  className="flex-1 bg-amber-600 hover:bg-amber-700"
                  onClick={handleReply}
                  disabled={replyText.length < 10 || isSubmitting}
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t("shopkeeper.reviews.postReply")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

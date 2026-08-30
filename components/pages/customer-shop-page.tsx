"use client"

import { useParams, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { getShopById, type ShopDetail } from "@/lib/actions/shops"
import { getProducts, type ProductCard } from "@/lib/actions/products"
import { getShopPortfolioForCustomer, type PublicShopPortfolioItem } from "@/lib/actions/shopkeeper-credentials"
import {
  getShopReviews, getReviewableOrderForShop, submitShopReview,
  type PublicShopReview, type ReviewableShopOrder,
} from "@/lib/actions/shop-reviews"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Star, ShieldCheck, ArrowLeft, Package, Plus, Loader2, MapPin, Clock, Video, ImageIcon, Camera, X as XIcon, MessageSquare } from "lucide-react"
import { addToCart } from "@/lib/actions/cart"
import { revalidateCartCount } from "@/lib/hooks/useCartCount"
import Image from "next/image"
import Link from "next/link"
import { StaticLocationMap } from "@/components/maps/static-location-map"
import { getNextOpeningLabel } from "@/lib/format"
import { useLocalization } from "@/lib/hooks/useLocalization"
import { compressImageToDataUrl } from "@/lib/compress-image"

export function CustomerShopPage() {
  const { t, tn, formatMoney } = useLocalization()
  const params = useParams()
  const router = useRouter()
  const shopId = params.id as string

  const [shop, setShop] = useState<ShopDetail>(null)
  const [products, setProducts] = useState<ProductCard[]>([])
  const [portfolio, setPortfolio] = useState<PublicShopPortfolioItem[]>([])
  const [reviews, setReviews] = useState<PublicShopReview[]>([])
  const [reviewableOrder, setReviewableOrder] = useState<ReviewableShopOrder>(null)
  const [isLoading, setIsLoading] = useState(true)

  const [showReviewForm, setShowReviewForm] = useState(false)
  const [reviewRating, setReviewRating] = useState(0)
  const [reviewComment, setReviewComment] = useState("")
  const [reviewPhotos, setReviewPhotos] = useState<string[]>([])
  const [reviewError, setReviewError] = useState("")
  const [isSubmittingReview, setIsSubmittingReview] = useState(false)

  const refresh = () =>
    Promise.all([
      getShopById(shopId), getProducts({ shopId }), getShopPortfolioForCustomer(shopId),
      getShopReviews(shopId), getReviewableOrderForShop(shopId),
    ]).then(([shopDetail, productList, portfolioItems, reviewList, reviewable]) => {
      setShop(shopDetail)
      setProducts(productList)
      setPortfolio(portfolioItems)
      setReviews(reviewList)
      setReviewableOrder(reviewable)
    })

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [shopId])

  const handleAddToCart = async (product: ProductCard) => {
    if (shop?.isOnVacation) return
    const result = await addToCart({ productId: product.id, quantity: 1 })
    if (result.success) void revalidateCartCount()
  }

  const handleAddReviewPhoto = async (file: File) => {
    const dataUrl = await compressImageToDataUrl(file)
    setReviewPhotos((prev) => [...prev, dataUrl].slice(0, 4))
  }

  const handleSubmitShopReview = async () => {
    if (!reviewableOrder) return
    if (reviewRating === 0) { setReviewError(t("customer.shop.selectRating")); return }
    setIsSubmittingReview(true)
    setReviewError("")
    const result = await submitShopReview({
      orderId: reviewableOrder.orderId, rating: reviewRating, comment: reviewComment, photos: reviewPhotos,
    })
    setIsSubmittingReview(false)
    if (!result.success) { setReviewError(result.error); return }
    setShowReviewForm(false)
    setReviewRating(0)
    setReviewComment("")
    setReviewPhotos([])
    await refresh()
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!shop) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        <p className="text-base font-semibold text-foreground">{t("customer.shop.notFound")}</p>
        <Button onClick={() => router.push("/customer/services")}>{t("customer.shop.browseMarketplace")}</Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-16">
      <div className="mx-auto max-w-5xl px-4 py-6 lg:py-8">
        <Button variant="ghost" onClick={() => router.back()} className="mb-4 gap-2">
          <ArrowLeft className="h-4 w-4" />
          {t("customer.shop.back")}
        </Button>

        <Card className="overflow-hidden border-0 shadow-sm mb-6">
          <div className="relative h-40 sm:h-52 bg-muted">
            <Image src={shop.logoUrl || "/placeholder.svg"} alt={shop.name} fill className="object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
            <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-white">{shop.name}</h1>
                  {shop.isVerified && <ShieldCheck className="h-5 w-5 text-emerald-400" />}
                </div>
                {shop.category && <p className="text-xs text-white/80">{shop.category}</p>}
              </div>
              <div className="flex gap-2">
                {shop.isOpen ? (
                  <Badge className="bg-emerald-500 hover:bg-emerald-500 text-white border-0">{t("customer.shops.openNow")}</Badge>
                ) : shop.hoursLabel ? (
                  <Badge className="bg-black/60 hover:bg-black/60 text-white border-0">{t("customer.shops.closed")}</Badge>
                ) : null}
                {shop.hasSale && <Badge className="bg-amber-500 hover:bg-amber-500 text-white border-0">{t("customer.shops.sale")}</Badge>}
                {shop.isOnVacation && <Badge className="bg-red-500 hover:bg-red-500 text-white border-0">{t("customer.shop.onVacationBadge")}</Badge>}
              </div>
            </div>
          </div>
          <div className="p-5">
            <div className="flex items-center gap-2 text-xs mb-3">
              <div className="flex items-center">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className={`w-4 h-4 ${i < Math.round(shop.rating) ? "fill-amber-400 text-amber-400" : "text-muted"}`} />
                ))}
              </div>
              <span className="font-semibold text-foreground">{shop.rating.toFixed(1)}</span>
              <span className="text-muted-foreground">({tn("customer.shop.reviewsCount", shop.reviewCount)})</span>
              {shop.hoursLabel && (
                <span className="text-muted-foreground ml-2">&middot; {shop.hoursLabel}</span>
              )}
            </div>

            {shop.isOnVacation ? (
              <div className="mb-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
                <Clock className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <p>
                  {t("customer.shop.onVacationNotice")}{shop.vacationNote ? <> <strong>{shop.vacationNote}</strong></> : ""}
                </p>
              </div>
            ) : !shop.isOpen && shop.nextOpeningLabel && (
              <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300">
                <Clock className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <p>
                  {t("customer.shop.closedNotice")} <strong>{shop.nextOpeningLabel}</strong>.
                </p>
              </div>
            )}

            {shop.description && <p className="text-xs text-muted-foreground leading-6">{shop.description}</p>}

            {shop.location && (
              <div className="mt-4 pt-4 border-t border-border">
                <p className="flex items-center gap-1.5 text-xs text-foreground font-medium mb-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" /> {shop.location}
                </p>
                {shop.latitude != null && shop.longitude != null && (
                  <StaticLocationMap latitude={shop.latitude} longitude={shop.longitude} label={shop.name} className="h-36 w-full rounded-xl" />
                )}
              </div>
            )}
          </div>
        </Card>

        {portfolio.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <ImageIcon className="w-4 h-4 text-primary" />
              </div>
              <h2 className="text-base font-semibold text-foreground">{t("customer.shop.showcaseTitle")}</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
              {portfolio.map((item) => (
                <Card key={item.id} className="overflow-hidden border-0 shadow-sm">
                  <div className="relative aspect-video bg-muted/30">
                    <Image src={item.imageUrl || "/placeholder.svg"} alt={item.title} fill className="object-cover" />
                    {item.videoUrl && (
                      <span className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">
                        <Video className="h-3 w-3" /> {t("customer.shop.videoBadge")}
                      </span>
                    )}
                  </div>
                  <div className="p-2.5">
                    <p className="truncate text-xs font-medium text-foreground">{item.title}</p>
                    {item.videoUrl && (
                      <video src={item.videoUrl} controls className="mt-2 w-full rounded-lg aspect-video object-cover" />
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Package className="w-4 h-4 text-primary" />
          </div>
          <h2 className="text-base font-semibold text-foreground">{t("customer.shop.productsFrom", { name: shop.name })}</h2>
        </div>

        {products.length === 0 ? (
          <Card className="p-10 text-center border-dashed">
            <p className="text-xs text-muted-foreground">{t("customer.shop.noProducts")}</p>
          </Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {products.map((product) => (
              <Card key={product.id} className="overflow-hidden border-0 shadow-sm hover:shadow-lg transition-all">
                <Link href={`/customer/products/${product.id}`}>
                  <div className="relative aspect-square bg-muted/30">
                    <Image src={product.image || "/placeholder.svg"} alt={product.name} fill className="object-cover" />
                    {product.discountPercent != null && (
                      <span className="absolute left-2 top-2 rounded-md bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">-{product.discountPercent}%</span>
                    )}
                  </div>
                </Link>
                <div className="p-3 sm:p-4">
                  <Link href={`/customer/products/${product.id}`}>
                    <p className="truncate text-xs sm:text-sm font-semibold text-foreground">{product.name}</p>
                  </Link>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-primary font-bold text-xs sm:text-sm truncate">{formatMoney(product.discountPrice ?? product.price)}</p>
                    <Button size="sm" className="rounded-full flex-shrink-0 px-3" onClick={() => handleAddToCart(product)} disabled={product.stock === 0 || shop.isOnVacation} aria-label={t("common.addToCart")}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        <div className="mt-8">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <MessageSquare className="w-4 h-4 text-primary" />
              </div>
              <h2 className="text-base font-semibold text-foreground">{tn("customer.shop.reviewsCount", shop.reviewCount)}</h2>
            </div>
            {reviewableOrder && !showReviewForm && (
              <Button size="sm" variant="outline" className="rounded-full bg-transparent" onClick={() => setShowReviewForm(true)}>
                {t("customer.shop.writeReview")}
              </Button>
            )}
          </div>

          {showReviewForm && (
            <Card className="p-4 mb-4 border-0 shadow-sm">
              <p className="mb-2 text-xs font-semibold text-foreground">{t("customer.shop.reviewOrderLabel", { orderNumber: reviewableOrder?.orderNumber ?? "" })}</p>
              <div className="mb-3 flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button key={star} onClick={() => setReviewRating(star)} aria-label={t("common.rateStars", { count: star })}>
                    <Star className={`h-6 w-6 ${star <= reviewRating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
                  </button>
                ))}
              </div>
              <Textarea
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder={t("customer.shop.reviewPlaceholder")}
                className="mb-3 min-h-[80px] resize-none rounded-xl"
              />
              <div className="mb-3 flex gap-2 flex-wrap">
                {reviewPhotos.map((p, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-border">
                    {/* eslint-disable-next-line @next/next/no-img-element -- base64 data URL preview */}
                    <img src={p} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setReviewPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                      className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white flex items-center justify-center"
                      aria-label={t("common.delete")}
                    >
                      <XIcon className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
                {reviewPhotos.length < 4 && (
                  <label className="w-16 h-16 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center cursor-pointer hover:border-primary transition-colors">
                    <Camera className="w-5 h-5 text-muted-foreground" />
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      aria-label={t("customer.orderDetail.addPhoto")}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleAddReviewPhoto(f); e.target.value = "" }}
                    />
                  </label>
                )}
              </div>
              {reviewError && <p className="mb-2 text-[11px] text-red-600">{reviewError}</p>}
              <div className="flex gap-2">
                <Button size="sm" className="rounded-xl" onClick={handleSubmitShopReview} disabled={isSubmittingReview}>
                  {isSubmittingReview ? <Loader2 className="h-4 w-4 animate-spin" /> : t("customer.shop.submitReview")}
                </Button>
                <Button size="sm" variant="outline" className="rounded-xl bg-transparent" onClick={() => setShowReviewForm(false)} disabled={isSubmittingReview}>
                  {t("common.cancel")}
                </Button>
              </div>
            </Card>
          )}

          {reviews.length === 0 ? (
            <Card className="p-8 text-center border-dashed">
              <p className="text-xs text-muted-foreground">{t("customer.shop.noReviewsYet")}</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {reviews.map((review) => (
                <Card key={review.id} className="p-4 border-0 shadow-sm">
                  <div className="flex items-start gap-3">
                    <Image
                      src={review.customerAvatar || "/placeholder.svg"}
                      alt={review.customerName}
                      width={36}
                      height={36}
                      className="rounded-full object-cover w-9 h-9 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-foreground">{review.customerName}</p>
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap">{new Date(review.createdAt).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center mt-0.5">
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} className={`w-3.5 h-3.5 ${i < review.rating ? "fill-amber-400 text-amber-400" : "text-muted"}`} />
                        ))}
                      </div>
                      <p className="mt-1.5 text-xs text-muted-foreground">{review.comment}</p>
                      {review.response && (
                        <div className="mt-2 ml-2 pl-3 border-l-2 border-primary/30">
                          <p className="text-[11px] font-semibold text-foreground">{t("customer.shop.ownerResponseLabel")}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{review.response}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

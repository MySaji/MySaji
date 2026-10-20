"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { Button } from "@/frontend/components/ui/button"
import { Card } from "@/frontend/components/ui/card"
import { Textarea } from "@/frontend/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/frontend/components/ui/tabs"
import { ArrowLeft, Package, Star, ShoppingCart, Wallet, CheckCircle2, Loader2, Camera, X as XIcon, Pencil, Trash2 } from "lucide-react"
import { getProductById, submitProductReview, updateProductReview, deleteProductReview, type ProductDetail, type ProductReview } from "@/backend/actions/products"
import { addToCart, getCartCount } from "@/backend/actions/cart"
import { revalidateCartCount } from "@/frontend/lib/hooks/useCartCount"
import { recordView } from "@/backend/actions/recently-viewed"
import { compressImageToDataUrl } from "@/frontend/lib/compress-image"
import { KycDocumentViewer, type KycDocumentItem } from "@/frontend/components/kyc/kyc-document-viewer"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"

export default function CustomerProductDetailPage() {
  const { t, formatMoney } = useLocalization()
  const params = useParams()
  const router = useRouter()
  const productId = params.id as string

  const [cartCount, setCartCount] = useState(0)
  const [activeImage, setActiveImage] = useState(0)
  const [product, setProduct] = useState<ProductDetail>(null)
  const [isLoading, setIsLoading] = useState(true)

  const [reviewRating, setReviewRating] = useState(0)
  const [reviewComment, setReviewComment] = useState("")
  const [reviewPhotos, setReviewPhotos] = useState<string[]>([])
  const [isSubmittingReview, setIsSubmittingReview] = useState(false)
  const [reviewError, setReviewError] = useState("")
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null)
  const [isEditingForm, setIsEditingForm] = useState(false)
  const [deletingReviewId, setDeletingReviewId] = useState<string | null>(null)

  const refresh = () => getProductById(productId).then(setProduct)

  useEffect(() => {
    Promise.all([getProductById(productId), getCartCount()])
      .then(([detail, count]) => {
        setProduct(detail)
        setCartCount(count)
        if (detail) {
          recordView({
            targetType: "PRODUCT",
            targetId: detail.id,
            title: detail.name,
            subtitle: detail.shop,
            image: detail.images[0] ?? null,
            href: `/customer/products/${detail.id}`,
          })
        }
      })
      .finally(() => setIsLoading(false))
  }, [productId])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!product) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="p-8 text-center">
          <p className="text-base font-semibold">{t("customer.productDetail.notFound")}</p>
          <Button className="mt-4" onClick={() => router.push("/customer/products")}>{t("customer.productDetail.backToProducts")}</Button>
        </Card>
      </div>
    )
  }

  const galleryImages = product.images.length ? product.images : ["/placeholder.svg"]
  const displayPrice = product.discountPrice ?? product.price

  const handleAddToCart = async () => {
    const result = await addToCart({ productId: product.id, quantity: 1 })
    if (result.success) {
      setCartCount(await getCartCount())
      void revalidateCartCount()
    }
  }

  const resetReviewForm = () => {
    setReviewRating(0)
    setReviewComment("")
    setReviewPhotos([])
    setReviewError("")
    setEditingReviewId(null)
    setIsEditingForm(false)
  }

  const startEditReview = (review: ProductReview) => {
    setEditingReviewId(review.id)
    setReviewRating(review.rating)
    setReviewComment(review.comment)
    setReviewPhotos(review.photos)
    setReviewError("")
    setIsEditingForm(true)
  }

  const handleAddReviewPhoto = async (file: File) => {
    const dataUrl = await compressImageToDataUrl(file)
    setReviewPhotos((prev) => [...prev, dataUrl].slice(0, 4))
  }

  const handleSubmitReview = async () => {
    if (reviewRating === 0) { setReviewError(t("customer.productDetail.selectRating")); return }
    setIsSubmittingReview(true)
    setReviewError("")
    const result = editingReviewId
      ? await updateProductReview({ reviewId: editingReviewId, rating: reviewRating, comment: reviewComment, photos: reviewPhotos })
      : await submitProductReview({ productId: product.id, rating: reviewRating, comment: reviewComment, photos: reviewPhotos })
    setIsSubmittingReview(false)
    if (!result.success) { setReviewError(result.error); return }
    resetReviewForm()
    await refresh()
  }

  const handleDeleteReview = async (reviewId: string) => {
    setDeletingReviewId(reviewId)
    const result = await deleteProductReview({ reviewId })
    setDeletingReviewId(null)
    if (!result.success) { setReviewError(result.error); return }
    await refresh()
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
        <div className="mb-6 flex items-center justify-between">
          <Button variant="ghost" onClick={() => router.back()} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            {t("customer.shop.back")}
          </Button>
          <Link href="/customer/cart" className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
            <ShoppingCart className="h-4 w-4" />
            {t("customer.productDetail.inCart", { count: cartCount })}
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-3">
            <div className="relative h-[380px] overflow-hidden rounded-3xl bg-muted">
              <Image src={galleryImages[activeImage] || "/placeholder.svg"} alt={product.name} fill className="object-cover" />
            </div>
            {galleryImages.length > 1 && (
              <div className="grid grid-cols-4 gap-2">
                {galleryImages.map((image, index) => (
                  <button
                    key={`${product.id}-${index}`}
                    onClick={() => setActiveImage(index)}
                    className={`overflow-hidden rounded-2xl border ${activeImage === index ? "border-primary ring-2 ring-primary/20" : "border-border"}`}
                  >
                    <div className="relative aspect-square">
                      <Image src={image} alt={`${product.name} view ${index + 1}`} fill className="object-cover" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-5">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                <Package className="h-4 w-4" />
                {t("customer.productDetail.itemsLeft", { count: product.stock })}
              </div>
              <h1 className="text-2xl font-bold text-foreground">{product.name}</h1>
              <p className="mt-2 text-xs text-muted-foreground">{t("customer.productDetail.soldBy", { shop: product.shop })}</p>
            </div>

            <div className="rounded-2xl border border-border bg-muted/40 p-4">
              <p className="text-xs leading-7 text-foreground">{product.description}</p>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <div>
                <p className="text-xs text-muted-foreground">{t("customer.productDetail.price")}</p>
                <p className="text-2xl font-bold text-primary">{formatMoney(displayPrice)}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 sm:flex-none rounded-full bg-transparent" onClick={() => router.back()}>{t("common.cancel")}</Button>
                <Button className="flex-1 sm:flex-none rounded-full" onClick={handleAddToCart} disabled={product.stock === 0}>
                  {product.stock === 0 ? t("customer.products.outOfStock") : t("customer.productDetail.addToCartLower")}
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-border p-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-foreground">
                <Wallet className="h-4 w-4 text-primary" />
                {t("customer.productDetail.walletCheckoutAvailable")}
              </div>
              <p className="text-xs text-muted-foreground">{t("customer.productDetail.walletCheckoutHint")}</p>
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-border p-5">
          <Tabs defaultValue="details" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="details">{t("customer.productDetail.tabDetails")}</TabsTrigger>
              <TabsTrigger value="shipping">{t("customer.productDetail.tabShipping")}</TabsTrigger>
              <TabsTrigger value="reviews">{t("customer.productDetail.tabReviews")}</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl bg-muted/40 p-4">
                  <p className="text-xs font-semibold text-foreground">{t("customer.productDetail.highlights")}</p>
                  <ul className="mt-2 space-y-2 text-xs text-muted-foreground">
                    <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> {t("customer.productDetail.highlight1")}</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> {t("customer.productDetail.highlight2")}</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> {t("customer.productDetail.highlight3")}</li>
                  </ul>
                </div>
                <div className="rounded-xl bg-muted/40 p-4">
                  <p className="text-xs font-semibold text-foreground">{t("customer.productDetail.sellerNote")}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{t("customer.productDetail.sellerNoteText")}</p>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="shipping" className="rounded-xl bg-muted/40 p-4 text-xs text-muted-foreground">
              {t("customer.productDetail.shippingText", { amount: formatMoney(20000) })}
            </TabsContent>

            <TabsContent value="reviews" className="space-y-3">
              {product.reviews.length === 0 ? (
                <p className="rounded-xl bg-muted/40 p-4 text-xs text-muted-foreground">{t("customer.productDetail.noReviews")}</p>
              ) : (
                product.reviews.map((review) => (
                  <div key={review.id} className="rounded-xl bg-muted/40 p-3">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-foreground truncate">{review.customerName}</span>
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          {Array.from({ length: 5 }).map((_, starIndex) => (
                            <Star key={starIndex} className={`h-3.5 w-3.5 ${starIndex < review.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
                          ))}
                        </div>
                      </div>
                      {review.isMine && (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button onClick={() => startEditReview(review)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground" aria-label={t("common.edit")}>
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteReview(review.id)}
                            disabled={deletingReviewId === review.id}
                            className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                            aria-label={t("common.delete")}
                          >
                            {deletingReviewId === review.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{review.comment}</p>
                    {review.photos.length > 0 && (
                      <div className="mt-2">
                        <KycDocumentViewer
                          documents={review.photos.map((url, i) => ({ label: `${t("customer.orderDetail.addPhoto")} ${i + 1}`, url })) satisfies KycDocumentItem[]}
                        />
                      </div>
                    )}
                  </div>
                ))
              )}

              {(isEditingForm || !product.reviews.some((r) => r.isMine)) && (
                <div className="rounded-xl border border-border p-4">
                  <p className="mb-2 text-xs font-semibold text-foreground">
                    {editingReviewId ? t("customer.productDetail.editReview") : t("customer.productDetail.leaveReview")}
                  </p>
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
                    placeholder={t("customer.productDetail.reviewPlaceholder")}
                    className="mb-3 min-h-[80px] resize-none rounded-xl"
                  />
                  <div className="mb-3 flex gap-2 flex-wrap">
                    {reviewPhotos.map((p, i) => (
                      <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-border">
                        {/* Images use the configured unoptimized rendering policy -- base64 data URL preview */}
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
                    <Button size="sm" className="rounded-xl" onClick={handleSubmitReview} disabled={isSubmittingReview}>
                      {isSubmittingReview ? <Loader2 className="h-4 w-4 animate-spin" /> : editingReviewId ? t("common.save") : t("customer.productDetail.submitReview")}
                    </Button>
                    {editingReviewId && (
                      <Button size="sm" variant="outline" className="rounded-xl bg-transparent" onClick={resetReviewForm} disabled={isSubmittingReview}>
                        {t("common.cancel")}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        <div className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">{t("customer.productDetail.mayAlsoLike")}</h2>
            <Link href="/customer/products" className="text-xs font-medium text-primary">{t("customer.productDetail.browseCatalog")}</Link>
          </div>
          {product.relatedProducts.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("customer.productDetail.noRelated")}</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {product.relatedProducts.map((item) => (
                <Card key={item.id} className="overflow-hidden border-0 shadow-sm">
                  <div className="relative aspect-square bg-muted/30">
                    <Image src={item.image || "/placeholder.svg"} alt={item.name} fill className="object-cover" />
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold text-foreground">{item.name}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{item.shop}</p>
                    <div className="mt-3 flex items-center justify-between">
                      <p className="font-bold text-primary">{formatMoney(item.discountPrice ?? item.price)}</p>
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/customer/products/${item.id}`}>{t("common.viewDetails")}</Link>
                      </Button>
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

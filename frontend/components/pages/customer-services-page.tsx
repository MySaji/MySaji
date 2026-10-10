"use client"

import { useState, useEffect } from "react"
import { useJsApiLoader } from "@react-google-maps/api"
import { GOOGLE_MAPS_LIBRARIES, GOOGLE_MAPS_LOADER_ID, isGoogleMapsConfigured } from "@/backend/services/google-maps"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"
import { useGatedAction } from "@/frontend/lib/hooks/useGatedAction"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/frontend/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/frontend/components/ui/select"
import { Textarea } from "@/frontend/components/ui/textarea"
import { Calendar } from "@/frontend/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/frontend/components/ui/popover"
import {
  Search, Star, MapPin, Clock, CheckCircle, Heart, Navigation,
  Grid3X3, List, TrendingUp, ShoppingBag, Zap, CalendarIcon, Phone,
  MessageCircle, Loader2, SlidersHorizontal, ChevronRight, Eye,
  AlertTriangle, Wallet, ShieldCheck, ArrowRight, Check, Info,
  Flame, Plus, Minus, ArrowUpDown, Package, ChevronDown, ChevronUp, Briefcase,
  SquarePen,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { format } from "date-fns"
import { HeroBannerCarousel } from "@/frontend/components/customer/hero-banner-carousel"
import { ProductMarketplace } from "@/frontend/components/customer/product-marketplace"
import { getServiceCategories, type HomeServiceCategory } from "@/backend/actions/home"
import { getAllServices, getEmergencyCategoryOptions, type ServiceListItem, type EmergencyCategoryOption } from "@/backend/actions/services"
import { getProducts, type ProductCard } from "@/backend/actions/products"
import { getLiveOffers, type PublicOfferListItem } from "@/backend/actions/offers"
import { OFFER_KIND } from "@/backend/domain/offer-constants"
import { OfferFeedRow } from "@/frontend/components/offers/offer-feed-row"
import { getWalletSummary } from "@/backend/actions/wallet"
import { getWishlistIds, toggleWishlist } from "@/backend/actions/wishlist"
import { addToCart, getCart, type CartLine } from "@/backend/actions/cart"
import { revalidateCartCount } from "@/frontend/lib/hooks/useCartCount"
import { createBooking, createEmergencyBooking } from "@/backend/actions/jobs"
import { getAddresses } from "@/backend/actions/addresses"
import PaymentMethods from "@/frontend/components/payment/payment-methods"
import { withTimeout, DASHBOARD_FETCH_TIMEOUT_MS } from "@/frontend/lib/swr-utils"
import { useAuthContext } from "@/frontend/lib/auth-context"
import { CATEGORY_STYLE, DEFAULT_CATEGORY_STYLE, CATEGORY_ICONS } from "@/frontend/lib/customer/category-style"

const EMERGENCY_FEE = 2000

function convertTo24h(time12: string): string {
  const [time, modifier] = time12.split(" ")
  const parts = time.split(":").map(Number)
  let hours = parts[0]
  const minutes = parts[1]
  if (modifier === "PM" && hours !== 12) hours += 12
  if (modifier === "AM" && hours === 12) hours = 0
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
}

/** Distinguishes "the fetch failed/timed out" from "the catalog is
 * genuinely empty" — conflating the two (as a blanket .catch(() => [])
 * would) misrepresents a slow/dropped connection as an empty marketplace. */
function EmptyOrErrorState({
  failed, emptyMessage, errorMessage,
}: {
  failed: boolean; emptyMessage: string; errorMessage: string
}) {
  return (
    <Card className="p-8 text-center border-0 shadow-sm">
      <p className="text-xs text-muted-foreground">{failed ? errorMessage : emptyMessage}</p>
    </Card>
  )
}

export function CustomerServicesPage() {
  const { handleGateFailure } = useGatedAction()
  const { t, formatMoney } = useLocalization()
  const STATUS_STYLE: Record<ServiceListItem["status"], { label: string; badge: string }> = {
    available: { label: t("customer.services.statusAvailable"), badge: "bg-emerald-500/90 text-white" },
    busy: { label: t("customer.services.statusBusy"), badge: "bg-red-500/90 text-white" },
    booked: { label: t("customer.services.statusBookedToday"), badge: "bg-amber-500/90 text-white" },
  }
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("search") ?? "")
  const [favorites, setFavorites] = useState<string[]>([])
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [showFilters, setShowFilters] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState(() => searchParams.get("category") ?? "all")
  // Category list grew to 30+ real categories this session (see admin
  // catalog work) — rendering every tile at once buried the rest of the
  // page below a wall of icons on mobile. Collapsed to a preview count with
  // a "Show more" toggle, same pattern as every other "peek" section on
  // the customer home page.
  const [showAllCategories, setShowAllCategories] = useState(false)
  const CATEGORY_PREVIEW_COUNT = 7
  const [selectedService, setSelectedService] = useState<ServiceListItem | null>(null)
  const [showBookingModal, setShowBookingModal] = useState(false)
  const [currentLocation, setCurrentLocation] = useState<string | null>(null)
  const [isLocating, setIsLocating] = useState(false)
  const [locateError, setLocateError] = useState("")
  const [bookingDate, setBookingDate] = useState<Date | undefined>(undefined)
  const [bookingTime, setBookingTime] = useState("")
  const [bookingNotes, setBookingNotes] = useState("")
  const [bookingLocation, setBookingLocation] = useState("")
  const [bookingStep, setBookingStep] = useState(1)
  const [priceRange, setPriceRange] = useState("all")
  const [rating, setRating] = useState("all")
  const [availability, setAvailability] = useState("all")
  const [sortBy, setSortBy] = useState<"rating" | "price-asc" | "price-desc" | "newest">("rating")
  const [isBookingSubmitting, setIsBookingSubmitting] = useState(false)
  const [bookingError, setBookingError] = useState("")
  const [createdJobId, setCreatedJobId] = useState<string | null>(null)

  // Emergency booking state
  const [showEmergencyWizard, setShowEmergencyWizard] = useState(false)
  const [emergencyStep, setEmergencyStep] = useState(1)
  const [emergencyCategory, setEmergencyCategory] = useState("")
  // Set when the customer names their own emergency instead of picking one
  // of the listed types. Mutually exclusive with emergencyCategory.
  const [emergencyCustomType, setEmergencyCustomType] = useState("")
  const [useCustomEmergency, setUseCustomEmergency] = useState(false)
  const [emergencyDescription, setEmergencyDescription] = useState("")
  const [emergencyLocation, setEmergencyLocation] = useState("")
  const [emergencyBooked, setEmergencyBooked] = useState(false)
  const [emergencyAssigned, setEmergencyAssigned] = useState(false)
  const [isEmergencySubmitting, setIsEmergencySubmitting] = useState(false)
  const [emergencyError, setEmergencyError] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [categories, setCategories] = useState<HomeServiceCategory[]>([])
  const [services, setServices] = useState<ServiceListItem[]>([])
  const [trendingProducts, setTrendingProducts] = useState<ProductCard[]>([])
  const [liveOffers, setLiveOffers] = useState<PublicOfferListItem[]>([])
  const [cartItems, setCartItems] = useState<CartLine[]>([])
  const [walletBalance, setWalletBalance] = useState(0)
  const [emergencyCategories, setEmergencyCategories] = useState<EmergencyCategoryOption[]>([])
  // Tracked separately from "the list is genuinely empty" — this app's DB
  // pooler occasionally takes 60-100s+ on a query (observed directly), well
  // past this page's timeout, and silently rendering that as "No services/
  // products found" would misrepresent a slow connection as an empty catalog.
  const [servicesLoadFailed, setServicesLoadFailed] = useState(false)
  const [productsLoadFailed, setProductsLoadFailed] = useState(false)

  const timeSlots = ["09:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "02:00 PM", "03:00 PM", "04:00 PM", "05:00 PM"]

  const mapsConfigured = isGoogleMapsConfigured()
  const { isLoaded: mapsLoaded } = useJsApiLoader({
    id: GOOGLE_MAPS_LOADER_ID,
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
    libraries: GOOGLE_MAPS_LIBRARIES,
  })

  // Silent, non-intrusive resolution used on page load — never prompts for
  // geolocation permission on its own, just falls back to the customer's
  // saved default address.
  const detectLocation = async (): Promise<string | null> => {
    setIsLocating(true)
    const addresses = await getAddresses()
    const preferred = addresses.find((a) => a.isDefault) ?? addresses[0]
    const resolved = preferred ? preferred.address : null
    setCurrentLocation(resolved)
    setIsLocating(false)
    return resolved
  }

  // Real device GPS + reverse geocode — only ever fired by an explicit user
  // click (the pointer/arrow buttons below), so the browser's location
  // permission prompt only ever appears after a deliberate tap. Resolves to
  // a real formatted address ("Final Destination Wines, Embakasi, Nairobi,
  // Kenya"-style) via the Google Geocoder when a Maps key is configured and
  // loaded, same pattern as the saved-addresses page's "use current
  // location". Falls back to the saved default address if geolocation is
  // denied/unsupported, and to raw coordinates if a live fix succeeds but no
  // Maps key is configured — never silently fails with no location at all.
  const detectLiveLocation = (): Promise<string | null> => {
    setIsLocating(true)
    setLocateError("")
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        setLocateError(t("customer.savedAddresses.geoUnsupported"))
        void detectLocation().then(resolve)
        return
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords
          if (mapsConfigured && mapsLoaded && typeof google !== "undefined") {
            new google.maps.Geocoder().geocode({ location: { lat: latitude, lng: longitude } }, (results, status) => {
              setIsLocating(false)
              const resolved = status === "OK" && results?.[0] ? results[0].formatted_address : `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
              setCurrentLocation(resolved)
              resolve(resolved)
            })
          } else {
            const resolved = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
            setCurrentLocation(resolved)
            setIsLocating(false)
            resolve(resolved)
          }
        },
        () => {
          setLocateError(t("customer.savedAddresses.geoError"))
          setIsLocating(false)
          void detectLocation().then(resolve)
        },
        { enableHighAccuracy: true, timeout: 10000 },
      )
    })
  }

  const { isAuthenticated } = useAuthContext()

  const loadServices = () => {
    setServicesLoadFailed(false)
    return withTimeout(getAllServices(), DASHBOARD_FETCH_TIMEOUT_MS)
      .then(setServices)
      .catch(() => setServicesLoadFailed(true))
  }

  const loadProducts = () => {
    setProductsLoadFailed(false)
    return withTimeout(getProducts({ sortBy: "rating", take: 8 }), DASHBOARD_FETCH_TIMEOUT_MS)
      .then(setTrendingProducts)
      .catch(() => setProductsLoadFailed(true))
  }

  useEffect(() => {
    detectLocation()
    // Categories/wishlist/cart/wallet/emergency options are supplementary
    // chrome — best-effort with a silent empty/default fallback, matching
    // the rest of this codebase's convention. Services and products are the
    // actual page content, so they get their own tracked, retryable loaders
    // (see loadServices/loadProducts above) instead of being folded into
    // this same catch-and-forget Promise.all.
    Promise.all([
      withTimeout(getServiceCategories(), DASHBOARD_FETCH_TIMEOUT_MS).catch(() => []),
      withTimeout(getEmergencyCategoryOptions(), DASHBOARD_FETCH_TIMEOUT_MS).catch(() => []),
      withTimeout(getLiveOffers(), DASHBOARD_FETCH_TIMEOUT_MS).catch(() => []),
    ]).then(([cats, emergencyCats, offers]) => {
      setCategories(cats)
      setEmergencyCategories(emergencyCats)
      setLiveOffers(offers)
    })

    // The spinner waits on the services only. Trending products are a strip
    // further down the page, and blocking the whole marketplace on them meant
    // a visitor stared at a spinner until the slower of the two finished —
    // for no reason, since services are what they came for. Products fill in
    // when they arrive.
    loadServices().finally(() => setIsLoading(false))
    loadProducts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The signed-in half — a wishlist, a cart and a wallet balance a guest does
  // not have. These used to fire for everyone on what is now the marketplace's
  // most public page, and each one costs a round trip and one of only five
  // pooled connections to return an empty result to someone with no account.
  useEffect(() => {
    if (!isAuthenticated) return
    Promise.all([
      withTimeout(getWishlistIds("SERVICE"), DASHBOARD_FETCH_TIMEOUT_MS).catch(() => []),
      withTimeout(getCart(), DASHBOARD_FETCH_TIMEOUT_MS).catch(() => []),
      withTimeout(getWalletSummary(), DASHBOARD_FETCH_TIMEOUT_MS).catch(() => null),
    ]).then(([wishlistIds, cart, wallet]) => {
      setFavorites(wishlistIds)
      setCartItems(cart)
      setWalletBalance(wallet?.balance ?? 0)
    })
  }, [isAuthenticated])

  // Curated top-rated preview — independent of the customer's active
  // search/filter state below, same "small curated row above the full
  // searchable catalog" pattern as the Trending Products row.
  // Shared by every row below, so "Browse by category" means the same thing
  // everywhere on the page.
  const matchesSelectedCategory = (slug: string | null | undefined) =>
    selectedCategory === "all" || slug === selectedCategory

  const popularServices = [...services]
    .filter((s) => matchesSelectedCategory(s.categorySlug))
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 6)

  // Provider-created Offers, sorted into the same three buckets as the rest
  // of this page — BUY reads as a product, RENT as equipment for hire, and
  // BOOK/HIRE/QUOTE/REQUEST as a service — so each shows up next to its
  // real-catalog counterpart instead of one undifferentiated list.
  const offerProducts: PublicOfferListItem[] = []
  const offerServices: PublicOfferListItem[] = []
  const offerRentals: PublicOfferListItem[] = []
  for (const offer of liveOffers) {
    // Picking a category used to narrow the services list alone, leaving
    // Trending Products, the Saji Pro rows and Rentals showing everything —
    // so the page looked like the filter had been ignored. One predicate now
    // gates every row on this page.
    if (!matchesSelectedCategory(offer.categorySlug)) continue
    const bucket = OFFER_KIND[offer.actionType]
    if (bucket === "product") offerProducts.push(offer)
    else if (bucket === "rental") offerRentals.push(offer)
    else offerServices.push(offer)
  }

  const visibleTrendingProducts = trendingProducts.filter((p) => matchesSelectedCategory(p.categorySlug))

  const filteredServices = services.filter((service) => {
    const matchesSearch = service.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      service.providerName.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = selectedCategory === "all" || service.categorySlug === selectedCategory

    const matchesPrice = (() => {
      switch (priceRange) {
        case "0-2000":
          return service.price <= 2000
        case "2000-5000":
          return service.price >= 2000 && service.price <= 5000
        case "5000+":
          return service.price > 5000
        default:
          return true
      }
    })()

    const matchesRating = (() => {
      if (rating === "all") return true
      return service.rating >= Number(rating)
    })()

    const matchesAvailability = (() => {
      if (availability === "all") return true
      return service.status === "available"
    })()

    return matchesSearch && matchesCategory && matchesPrice && matchesRating && matchesAvailability
  }).sort((a, b) => {
    switch (sortBy) {
      case "price-asc":
        return a.price - b.price
      case "price-desc":
        return b.price - a.price
      case "newest":
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      default:
        return b.rating - a.rating
    }
  })

  const toggleFavorite = async (serviceId: string) => {
    const wasFavorite = favorites.includes(serviceId)
    setFavorites((prev) => (wasFavorite ? prev.filter((fav) => fav !== serviceId) : [...prev, serviceId]))
    const result = await toggleWishlist({ targetType: "SERVICE", targetId: serviceId })
    // Roll back if the real toggle didn't actually happen — an optimistic
    // heart that silently diverges from the real wishlist is worse than a
    // half-second delay would have been.
    if (!result.success) {
      setFavorites((prev) => (wasFavorite ? [...prev, serviceId] : prev.filter((fav) => fav !== serviceId)))
    }
  }

  const openServiceDetail = (service: ServiceListItem) => {
    if (service.categoryId) router.push(`/customer/services/${service.categoryId}`)
  }

  const openBooking = (service: ServiceListItem) => {
    setSelectedService(service)
    setShowBookingModal(true)
    setBookingStep(1)
    setBookingError("")
    setBookingLocation(currentLocation || "")
    setCreatedJobId(null)
  }

  const getBookingTotal = () => selectedService?.price || 0

  const handleBookingContinue = async () => {
    if (bookingStep < 2) {
      setBookingStep(bookingStep + 1)
      return
    }
    if (bookingStep === 2) {
      if (!selectedService || !bookingDate) return
      setIsBookingSubmitting(true)
      setBookingError("")
      const bookingResult = await createBooking({
        serviceId: selectedService.serviceId,
        date: format(bookingDate, "yyyy-MM-dd"),
        time: bookingTime ? convertTo24h(bookingTime) : "09:00",
        quantity: 1,
        location: bookingLocation || currentLocation || "Nairobi",
        notes: bookingNotes,
      })
      setIsBookingSubmitting(false)
      if (!bookingResult.success) {
        // A verification refusal opens the wizard rather than leaving the
        // customer with a message and nowhere to act on it.
        if (handleGateFailure(bookingResult)) return
        setBookingError(bookingResult.error)
        return
      }
      setCreatedJobId(bookingResult.jobId)
      setBookingStep(3)
    }
  }

  const handleBookingPaymentSuccess = async () => {
    const wallet = await getWalletSummary()
    setWalletBalance(wallet?.balance ?? 0)
    setShowBookingModal(false)
    setBookingStep(1)
    setCreatedJobId(null)
    setBookingDate(undefined)
    setBookingTime("")
    setBookingNotes("")
    setBookingLocation("")
  }

  const getSelectedEmergency = () => emergencyCategories.find(c => c.id === emergencyCategory)
  // A customer-named emergency has no category average to quote from, so the
  // call-out fee is all that can honestly be shown until a provider quotes.
  const getEmergencyTotal = () => (useCustomEmergency ? 0 : getSelectedEmergency()?.avgPrice || 0) + EMERGENCY_FEE

  const handleEmergencyContinue = async () => {
    if (emergencyStep < 2) {
      setEmergencyStep(emergencyStep + 1)
      return
    }
    const selected = getSelectedEmergency()
    if (!useCustomEmergency && !selected) return
    if (useCustomEmergency && emergencyCustomType.trim().length < 2) return

    setIsEmergencySubmitting(true)
    setEmergencyError("")
    const bookingResult = await createEmergencyBooking({
      categoryId: useCustomEmergency ? undefined : selected!.id,
      customType: useCustomEmergency ? emergencyCustomType.trim() : undefined,
      price: getEmergencyTotal(),
      description: emergencyDescription,
      location: emergencyLocation || currentLocation || "Nairobi",
    })
    setIsEmergencySubmitting(false)
    if (!bookingResult.success) {
      setEmergencyError(bookingResult.error)
      return
    }
    setCreatedJobId(bookingResult.jobId)
    setEmergencyAssigned(bookingResult.assigned)
    setEmergencyStep(3)
  }

  const handleEmergencyPaymentSuccess = async () => {
    const wallet = await getWalletSummary()
    setWalletBalance(wallet?.balance ?? 0)
    setEmergencyBooked(true)
  }

  const resetEmergencyWizard = () => {
    setShowEmergencyWizard(false)
    setEmergencyStep(1)
    setEmergencyCategory("")
    setEmergencyDescription("")
    setEmergencyLocation("")
    setEmergencyBooked(false)
    setEmergencyAssigned(false)
    setEmergencyError("")
    setCreatedJobId(null)
  }

  const handleAddToCart = async (product: ProductCard) => {
    const previousCart = cartItems
    const existing = cartItems.find((line) => line.kind === "product" && line.productId === product.id)
    setCartItems((prev) =>
      existing
        ? prev.map((line) => (line.kind === "product" && line.productId === product.id ? { ...line, quantity: line.quantity + 1 } : line))
        : [...prev, {
            kind: "product" as const,
            productId: product.id, name: product.name, price: product.discountPrice ?? product.price,
            image: product.image, shop: product.shop, quantity: 1, stock: product.stock,
            // Optimistic placeholder only — reconciled with the real getCart()
            // result (with the shop's actual open/closed state and delivery fee) moments later.
            shopIsOpen: true, shopNextOpeningLabel: null, shopDeliveryFee: 0,
            shopIsOnVacation: false, shopVacationNote: null,
          }],
    )
    const result = await addToCart({ productId: product.id, quantity: 1 })
    if (result.success) {
      // Reconcile with the real cart (real quantities, real stock-clamped
      // values) rather than trusting the optimistic guess indefinitely.
      setCartItems(await getCart())
      void revalidateCartCount()
    } else {
      setCartItems(previousCart)
    }
  }

  const openProduct = (product: ProductCard) => {
    router.push(`/customer/products/${product.id}`)
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-6 lg:py-8">
        {/* Page Header */}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div>
              <h1 className="text-xl lg:text-2xl font-bold text-foreground tracking-tight text-balance">{t("customer.layout.navMarketplace")}</h1>
              <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                <MapPin className="w-3.5 h-3.5" />
                {isLocating ? (
                  <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> {t("common.loading")}</span>
                ) : currentLocation ? (
                  <span>{currentLocation}</span>
                ) : (
                  <Link href="/customer/saved-addresses" className="text-primary hover:underline">{t("customer.services.addAnAddress")}</Link>
                )}
                <button
                  onClick={() => void detectLiveLocation()}
                  disabled={isLocating}
                  title={t("customer.savedAddresses.useCurrentLocation")}
                  className="text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
                >
                  <Navigation className="w-3.5 h-3.5" />
                </button>
              </div>
              {locateError && <p className="mt-1 text-[11px] text-red-600">{locateError}</p>}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Link href="/customer/wallet" className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-full">
                <Wallet className="w-3.5 h-3.5" />
                <span className="font-semibold">{formatMoney(walletBalance)}</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Emergency Service Banner */}
        <Card className="mb-6 overflow-hidden border-0 shadow-md bg-gradient-to-r from-red-600 to-orange-500 text-white">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 lg:p-5">
            <div className="flex items-center gap-3 flex-1">
              <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm">{t("customer.services.emergencyService")}</h3>
                <p className="text-xs text-white/80">{t("customer.services.emergencyServiceHint", { amount: formatMoney(EMERGENCY_FEE) })}</p>
              </div>
            </div>
            <Button
              onClick={() => { setShowEmergencyWizard(true); setEmergencyStep(1); setEmergencyBooked(false); setEmergencyLocation(currentLocation || "") }}
              className="bg-white text-red-600 hover:bg-white/90 font-semibold rounded-xl h-10 px-6 w-full sm:w-auto flex-shrink-0 shadow-lg"
            >
              <Zap className="w-4 h-4 mr-2" />
              {t("customer.services.bookEmergency")}
            </Button>
          </div>
        </Card>

        {/* Promotional Banners */}
        <div className="mb-6">
          <HeroBannerCarousel placement="SERVICES_TOP" />
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("customer.services.searchServicesProviders")}
              className="pl-10 h-11 rounded-xl bg-muted/50 border-0 focus-visible:ring-2 focus-visible:ring-primary/30"
            />
          </div>
          <div className="flex gap-2">
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
              <SelectTrigger className="h-11 rounded-xl gap-2 bg-transparent border-border w-auto">
                <ArrowUpDown className="w-4 h-4" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rating">{t("customer.services.sortRating")}</SelectItem>
                <SelectItem value="price-asc">{t("customer.services.sortPriceLowHigh")}</SelectItem>
                <SelectItem value="price-desc">{t("customer.services.sortPriceHighLow")}</SelectItem>
                <SelectItem value="newest">{t("customer.services.sortNewest")}</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => setShowFilters(true)}
              className="h-11 px-5 rounded-xl gap-2 bg-transparent border-border"
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span className="hidden sm:inline">{t("common.filter")}</span>
            </Button>
            <div className="flex items-center gap-0.5 bg-muted/50 rounded-xl p-1">
              <button
                onClick={() => setViewMode("grid")}
                aria-label={t("common.gridView")}
                aria-pressed={viewMode === "grid"}
                className={`p-2 rounded-lg transition-all ${viewMode === "grid" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Grid3X3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                aria-label={t("common.listView")}
                aria-pressed={viewMode === "list"}
                className={`p-2 rounded-lg transition-all ${viewMode === "list" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Categories - Icon Grid */}
        <div className="mb-8">
          <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Grid3X3 className="w-4 h-4 text-primary" />
            </div>
            {t("customer.services.browseByCategory")}
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
            <button
              onClick={() => setSelectedCategory("all")}
              className={`rounded-2xl p-3 flex flex-col items-center text-center gap-2 shadow-sm transition-all hover:scale-105 ${
                selectedCategory === "all"
                  ? "bg-primary text-primary-foreground ring-2 ring-primary/40"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted"
              }`}
            >
              <div className={`w-10 h-10 lg:w-12 lg:h-12 rounded-xl flex items-center justify-center ${
                selectedCategory === "all" ? "bg-white/20" : "bg-white/60 dark:bg-white/10"
              }`}>
                <Grid3X3 className="w-5 h-5 lg:w-6 lg:h-6" />
              </div>
              <p className="text-[11px] font-semibold leading-tight">{t("customer.services.allServices")}</p>
            </button>
            {(showAllCategories ? categories : categories.slice(0, CATEGORY_PREVIEW_COUNT)).map((cat) => {
              const style = CATEGORY_STYLE[cat.slug] ?? DEFAULT_CATEGORY_STYLE
              const Icon = style.icon
              const isActive = selectedCategory === cat.slug
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.slug)}
                  className={`rounded-2xl p-3 flex flex-col items-center text-center gap-2 shadow-sm transition-all hover:scale-105 ${
                    isActive ? "ring-2 ring-primary" : ""
                  } ${style.color}`}
                >
                  <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-xl bg-white/60 dark:bg-white/10 flex items-center justify-center">
                    <Icon className="w-5 h-5 lg:w-6 lg:h-6" />
                  </div>
                  <p className="text-[11px] font-semibold leading-tight">{cat.name}</p>
                </button>
              )
            })}
            {categories.length > CATEGORY_PREVIEW_COUNT && (
              <button
                onClick={() => setShowAllCategories((v) => !v)}
                className="rounded-2xl p-3 flex flex-col items-center text-center gap-2 shadow-sm transition-all hover:scale-105 bg-muted/60 text-muted-foreground hover:bg-muted"
              >
                <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-xl bg-white/60 dark:bg-white/10 flex items-center justify-center">
                  {showAllCategories ? <ChevronUp className="w-5 h-5 lg:w-6 lg:h-6" /> : <ChevronDown className="w-5 h-5 lg:w-6 lg:h-6" />}
                </div>
                <p className="text-[11px] font-semibold leading-tight">
                  {showAllCategories ? t("customer.services.showLess") : t("customer.services.showMore")}
                </p>
              </button>
            )}
          </div>
        </div>

        {/* Trending Products */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <ShoppingBag className="w-4 h-4 text-primary" />
              </div>
              {t("customer.services.trendingProducts")}
            </h2>
            <Link href="/customer/products" className="text-xs text-primary font-medium flex items-center gap-0.5 hover:gap-1.5 transition-all">
              {t("customer.services.viewAll")} <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          {visibleTrendingProducts.length === 0 ? (
            <EmptyOrErrorState
              failed={productsLoadFailed}
              emptyMessage={t("customer.services.noProductsYet")}
              errorMessage={t("customer.services.loadErrorProducts")}
            />
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide sm:mx-0 sm:px-0 sm:grid sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 sm:gap-4">
              {visibleTrendingProducts.map((product) => (
                <Card
                  key={product.id}
                  className="w-40 sm:w-auto flex-shrink-0 overflow-hidden border-0 shadow-sm transition-all hover:shadow-lg cursor-pointer group"
                  onClick={() => openProduct(product)}
                >
                  <div className="relative aspect-square bg-muted/30">
                    <Image src={product.image || "/placeholder.svg"} alt={product.name} fill className="object-cover transition-transform duration-300 group-hover:scale-105" />
                    {product.discountPercent != null && (
                      <span className="absolute left-2 top-2 rounded-md bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">-{product.discountPercent}%</span>
                    )}
                    {product.isFeatured && (
                      <span className="absolute right-2 top-2 rounded-md bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">{t("customer.services.featuredBadge")}</span>
                    )}
                    <div className="absolute bottom-2 left-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] sm:text-[10px] font-medium text-white">
                      {t("customer.products.stockLeft", { count: product.stock })}
                    </div>
                  </div>
                  <div className="p-3 sm:p-4">
                    <button onClick={() => openProduct(product)} className="text-left w-full">
                      <p className="truncate text-xs sm:text-sm font-semibold text-foreground">{product.name}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{product.shop}</p>
                    </button>
                    <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-primary font-bold text-xs sm:text-sm truncate">{formatMoney(product.discountPrice ?? product.price)}</p>
                        <p className="text-[10px] text-muted-foreground hidden sm:block">{t("customer.services.freeDelivery")}</p>
                      </div>
                      <Button
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation()
                          handleAddToCart(product)
                        }}
                        className="w-full sm:w-auto rounded-full sm:flex-shrink-0 px-3"
                        disabled={product.stock === 0}
                      >
                        <Plus className="h-4 w-4 mr-1" /> {t("customer.wallet.add")}
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* From Saji Pro Providers — provider-created BUY Offers, next to
            shop-sold Trending Products since they're the same thing to a
            customer: something for sale. */}
        <div className="mb-8">
          <OfferFeedRow
            title={t("customer.services.fromSajiProProducts")}
            seeAllHref="/customer/services/more?type=offer"
            offers={offerProducts}
            icon={<ShoppingBag className="w-4 h-4 text-primary" />}
          />
        </div>

        {/* Equipment for Rent — RENT-actionType Offers, the "neither a
            service nor a product sale" third kind. */}
        <div className="mb-8">
          <OfferFeedRow
            title={t("customer.services.equipmentForRent")}
            seeAllHref="/customer/services/more?type=rental"
            offers={offerRentals}
            icon={<Package className="w-4 h-4 text-primary" />}
          />
        </div>

        {/* Popular Services — curated top-rated preview, independent of the
            search/filter state below (same pattern as Trending Products). */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-primary" />
              </div>
              {t("customer.services.popularServices")}
            </h2>
            <Link href="/customer/services/more" className="text-xs text-primary font-medium flex items-center gap-0.5 hover:gap-1.5 transition-all">
              {t("customer.services.viewAll")} <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          {popularServices.length === 0 ? (
            <EmptyOrErrorState
              failed={servicesLoadFailed}
              emptyMessage={t("customer.services.noServicesFound")}
              errorMessage={t("customer.services.loadErrorServices")}
            />
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide sm:mx-0 sm:px-0 sm:grid sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 sm:gap-4">
              {popularServices.map((service) => (
                <Card
                  key={service.serviceId}
                  className="w-40 sm:w-auto flex-shrink-0 overflow-hidden border-0 shadow-sm transition-all hover:shadow-lg cursor-pointer"
                  onClick={() => openServiceDetail(service)}
                >
                  <div className="relative aspect-square bg-muted/30">
                    <Image src={service.image || "/placeholder.svg"} alt={service.title} fill className="object-cover" />
                    <span className={`absolute bottom-2 left-2 px-2 py-0.5 text-[10px] font-semibold rounded-md backdrop-blur-sm ${STATUS_STYLE[service.status].badge}`}>
                      {STATUS_STYLE[service.status].label}
                    </span>
                  </div>
                  <div className="p-3 sm:p-4">
                    <p className="truncate text-xs sm:text-sm font-semibold text-foreground">{service.title}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground truncate">{service.providerName}</p>
                    <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      <span className="font-semibold text-foreground">{service.rating.toFixed(1)}</span>
                    </div>
                    <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <p className="text-primary font-bold text-xs sm:text-sm truncate min-w-0 flex-1">{formatMoney(service.price)}</p>
                      <Button
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation()
                          openBooking(service)
                        }}
                        disabled={!service.isActive}
                        className="w-full sm:w-auto rounded-full sm:flex-shrink-0 px-3"
                      >
                        {t("customer.serviceDetail.bookNow")}
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Saji Pro Services — provider-created BOOK/HIRE/QUOTE/REQUEST
            Offers, next to the regular Popular Services row above. */}
        <div className="mb-8">
          <OfferFeedRow
            title={t("customer.services.sajiProServices")}
            seeAllHref="/customer/services/more?type=offer"
            offers={offerServices}
            icon={<Briefcase className="w-4 h-4 text-primary" />}
          />
        </div>

        {/* All Products — the normal, full-catalog counterpart to the
            curated Trending Products row above, now the shared marketplace
            block (sidebar filters + toolbar + pagination) also used by the
            dedicated /customer/products page. */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Package className="w-4 h-4 text-primary" />
            </div>
            <h2 className="text-base font-semibold text-foreground">{t("customer.services.allProducts")}</h2>
          </div>
          <ProductMarketplace categorySlug={selectedCategory} />
        </div>

        {/* All Services — the full, searchable/filterable/sortable catalog. */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <Grid3X3 className="w-4 h-4 text-primary" />
              </div>
              {t("customer.services.allServices")}
            </h2>
            <div className="flex items-center gap-3">
              <p className="text-xs text-muted-foreground">{t("customer.services.foundCount", { count: filteredServices.length })}</p>
              <Link href="/customer/services/more" className="text-xs font-medium text-primary hover:underline">
                {t("customer.services.viewMore")}
              </Link>
            </div>
          </div>

          {filteredServices.length === 0 ? (
            servicesLoadFailed ? (
              <EmptyOrErrorState
                failed
                emptyMessage=""
                errorMessage={t("customer.services.loadErrorServices")}
              />
            ) : (
              <div className="text-center py-16">
                <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Search className="w-7 h-7 text-muted-foreground" />
                </div>
                <p className="text-base font-semibold text-foreground mb-1">{t("customer.services.noServicesFound")}</p>
                <p className="text-xs text-muted-foreground">{t("customer.services.adjustSearchOrFilters")}</p>
              </div>
            )
          ) : (
            <div className={viewMode === "grid"
              // Two columns on a phone, four on a desktop, per the card spec.
              // At 390px this leaves each card 179px wide; inside a 1136px
              // content column it leaves each one 272px.
              ? "grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 lg:gap-4"
              : "space-y-3"
            }>
              {filteredServices.map((service) => (
                <Card
                  key={service.serviceId}
                  className={`cursor-pointer overflow-hidden border-0 shadow-sm hover:shadow-lg transition-all group rounded-xl lg:rounded-[14px] ${viewMode === "list" ? "flex flex-row" : "flex flex-col"}`}
                  onClick={() => openServiceDetail(service)}
                >
                  {/* 179x150 on a phone, 272x210 from lg: ratios rather than a
                      fixed height, so the image tracks the column width. */}
                  <div className={`relative ${viewMode === "list" ? "w-28 sm:w-36 flex-shrink-0" : "aspect-[179/150] lg:aspect-[272/210]"}`}>
                    <Image
                      src={service.image || "/placeholder.svg"}
                      alt={service.title}
                      fill
                      sizes="(min-width: 1024px) 272px, (min-width: 640px) 33vw, 50vw"
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                    <button
                      onClick={(event) => {
                        event.stopPropagation()
                        toggleFavorite(service.serviceId)
                      }}
                      aria-label={favorites.includes(service.serviceId) ? t("customer.products.removeFromWishlist") : t("customer.products.addToWishlist")}
                      className="absolute top-2 right-2 p-1.5 bg-white/90 dark:bg-black/50 rounded-full shadow-sm backdrop-blur-sm hover:scale-110 transition-transform lg:top-2.5 lg:right-2.5 lg:p-2"
                    >
                      <Heart className={`w-3.5 h-3.5 lg:w-4 lg:h-4 ${favorites.includes(service.serviceId) ? 'fill-red-500 text-red-500' : 'text-muted-foreground'}`} />
                    </button>
                    <span className={`absolute bottom-2 left-2 px-1.5 py-0.5 text-[10px] font-semibold rounded-md backdrop-blur-sm lg:bottom-2.5 lg:left-2.5 lg:px-2 ${STATUS_STYLE[service.status].badge}`}>
                      {STATUS_STYLE[service.status].label}
                    </span>
                  </div>

                  {/* 10px padding on a phone, 14px from lg, per the spec. */}
                  <div className={`p-2.5 lg:p-3.5 ${viewMode === "list" ? "flex-1 flex flex-col justify-between" : "flex flex-1 flex-col"}`}>
                    <div>
                      <div className="flex items-start gap-2 mb-1.5 lg:gap-2.5 lg:mb-2.5">
                        {/* At 179px the avatar costs more width than the
                            provider's name can spare, so it starts at sm. */}
                        <div className="relative hidden w-7 h-7 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-background sm:block lg:w-9 lg:h-9">
                          <Image src={service.providerAvatar || "/placeholder.svg"} alt={service.providerName} fill sizes="36px" className="object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1 lg:gap-1.5">
                            <p className="font-semibold text-[11px] lg:text-xs text-foreground truncate">{service.providerName}</p>
                            {service.verified && <CheckCircle className="w-3 h-3 lg:w-3.5 lg:h-3.5 text-blue-500 flex-shrink-0" />}
                          </div>
                          <p className="text-[10px] lg:text-[11px] text-muted-foreground line-clamp-2 lg:line-clamp-1">{service.title}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 mb-1.5 text-[10px] text-muted-foreground lg:gap-3 lg:mb-2.5 lg:text-[11px]">
                        <div className="flex items-center gap-0.5 shrink-0 lg:gap-1">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400 lg:w-3.5 lg:h-3.5" />
                          <span className="font-semibold text-foreground">{service.rating.toFixed(1)}</span>
                          <span>({service.reviewCount})</span>
                        </div>
                        <span className="w-px h-3 bg-border shrink-0" />
                        <div className="flex items-center gap-0.5 min-w-0 lg:gap-1">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="truncate">{service.location}</span>
                        </div>
                        {/* Response time is the first thing to go: three meta
                            items will not fit across a 179px card. */}
                        <span className="hidden w-px h-3 bg-border lg:block" />
                        <div className="hidden items-center gap-1 lg:flex">
                          <Clock className="w-3 h-3" />
                          {service.responseTime}
                        </div>
                      </div>

                      {service.badges.length > 0 && (
                        // One row only. A second row of chips is what pushes a
                        // 179px card past its height budget.
                        <div className="flex gap-1 overflow-hidden mb-2 lg:gap-1.5 lg:mb-3">
                          {service.badges.map((badge, idx) => (
                            <span key={idx} className="truncate px-1.5 py-0.5 bg-primary/10 text-primary text-[10px] font-medium rounded-md lg:px-2">{badge}</span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Stacked on a phone, side by side once there is room. */}
                    <div className="mt-auto flex flex-col gap-2 pt-2 border-t border-border/50 lg:flex-row lg:items-center lg:justify-between lg:pt-3">
                      <div>
                        <p className="text-[10px] text-muted-foreground">{t("customer.services.fromLabel")}</p>
                        <p className="text-xs font-bold text-foreground lg:text-sm">
                          {formatMoney(service.price)}<span className="text-[10px] font-normal text-muted-foreground lg:text-[11px]">{t("customer.favorites.perHour")}</span>
                        </p>
                      </div>
                      <Button
                        onClick={(event) => {
                          event.stopPropagation()
                          openBooking(service)
                        }}
                        disabled={!service.isActive}
                        size="sm"
                        className="w-full rounded-lg h-9 px-2 text-[10px] font-medium lg:w-auto lg:px-4 lg:text-xs"
                      >
                        {t("customer.serviceDetail.bookNow")}
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Filters Modal */}
      <Dialog open={showFilters} onOpenChange={setShowFilters}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader><DialogTitle>{t("customer.services.filterServices")}</DialogTitle></DialogHeader>
          <div className="space-y-5 py-4">
            <div>
              <label className="text-xs font-medium text-foreground mb-2 block">{t("customer.services.priceRange")}</label>
              <Select value={priceRange} onValueChange={setPriceRange}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("customer.services.allPrices")}</SelectItem>
                  <SelectItem value="0-2000">{t("customer.services.underAmount", { amount: formatMoney(2000) })}</SelectItem>
                  <SelectItem value="2000-5000">{t("customer.services.amountRange", { min: formatMoney(2000), max: formatMoney(5000) })}</SelectItem>
                  <SelectItem value="5000+">{t("customer.services.aboveAmount", { amount: formatMoney(5000) })}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground mb-2 block">{t("customer.services.minimumRating")}</label>
              <Select value={rating} onValueChange={setRating}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("customer.services.anyRating")}</SelectItem>
                  <SelectItem value="4.5">{t("customer.services.starsAndUp", { count: "4.5" })}</SelectItem>
                  <SelectItem value="4.0">{t("customer.services.starsAndUp", { count: "4.0" })}</SelectItem>
                  <SelectItem value="3.5">{t("customer.services.starsAndUp", { count: "3.5" })}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground mb-2 block">{t("customer.services.availabilityLabel")}</label>
              <Select value={availability} onValueChange={setAvailability}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("customer.services.allOption")}</SelectItem>
                  <SelectItem value="available">{t("customer.findSpecialists.statusAvailableNow")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 rounded-xl bg-transparent" onClick={() => { setPriceRange("all"); setRating("all"); setAvailability("all") }}>{t("customer.services.resetButton")}</Button>
            <Button className="flex-1 rounded-xl" onClick={() => setShowFilters(false)}>{t("customer.services.applyFilters")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Booking Modal */}
      <Dialog open={showBookingModal} onOpenChange={setShowBookingModal}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto rounded-2xl">
          {selectedService && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base">
                  {bookingStep === 1 && t("customer.services.selectDateTime")}
                  {bookingStep === 2 && t("customer.services.serviceDetails")}
                  {bookingStep === 3 && t("customer.services.confirmAndPay")}
                </DialogTitle>
              </DialogHeader>

              {/* Progress */}
              <div className="flex items-center gap-2 mb-5">
                {[1, 2, 3].map((step) => (
                  <div key={step} className="flex items-center flex-1">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold transition-colors ${
                      bookingStep >= step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    }`}>{step}</div>
                    {step < 3 && <div className={`flex-1 h-0.5 mx-2 rounded transition-colors ${bookingStep > step ? 'bg-primary' : 'bg-muted'}`} />}
                  </div>
                ))}
              </div>

              {/* Service Preview */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 mb-4">
                <div className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-background">
                  <Image src={selectedService.providerAvatar || "/placeholder.svg"} alt="" width={40} height={40} className="object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-xs text-foreground truncate">{selectedService.providerName}</p>
                  <p className="text-[11px] text-muted-foreground">{selectedService.title}</p>
                </div>
                <p className="font-bold text-xs text-primary">{formatMoney(selectedService.price)}{t("customer.favorites.perHour")}</p>
              </div>

              {bookingStep === 1 && (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-foreground mb-2 block">{t("customer.services.dateLabel")}</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left font-normal bg-transparent rounded-xl h-11">
                          <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                          {bookingDate ? format(bookingDate, "PPP") : t("customer.jobs.pickADate")}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={bookingDate} onSelect={setBookingDate} disabled={(date) => date < new Date()} /></PopoverContent>
                    </Popover>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-foreground mb-2 block">{t("customer.services.timeLabel")}</label>
                    <div className="grid grid-cols-4 gap-2">
                      {timeSlots.map((time) => (
                        <button key={time} onClick={() => setBookingTime(time)}
                          className={`p-2 text-[11px] font-medium rounded-lg border transition-all ${
                            bookingTime === time ? 'bg-primary text-primary-foreground border-primary shadow-sm' : 'border-border hover:border-primary/50'
                          }`}
                        >{time}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {bookingStep === 2 && (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-foreground mb-2 block">{t("customer.bookingConfirmation.location")}</label>
                    <div className="flex items-center gap-2">
                      <Input value={bookingLocation} onChange={(e) => setBookingLocation(e.target.value)} placeholder={t("customer.services.enterYourAddress")} className="flex-1 rounded-xl" />
                      <Button
                        variant="outline"
                        size="icon"
                        disabled={isLocating}
                        title={t("customer.savedAddresses.useCurrentLocation")}
                        onClick={async () => { const loc = await detectLiveLocation(); setBookingLocation(loc || "") }}
                        className="bg-transparent rounded-xl"
                      >
                        {isLocating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
                      </Button>
                    </div>
                    {locateError && <p className="mt-1.5 text-[11px] text-red-600">{locateError}</p>}
                  </div>
                  <div>
                    <label className="text-xs font-medium text-foreground mb-2 block">{t("customer.services.notesLabel")}</label>
                    <Textarea value={bookingNotes} onChange={(e) => setBookingNotes(e.target.value)} placeholder={t("customer.services.describeIssueOrRequirements")} className="min-h-[80px] rounded-xl" />
                  </div>
                </div>
              )}

              {bookingStep === 3 && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-muted/50 space-y-2 text-xs">
                    <div className="flex justify-between"><span className="text-muted-foreground">{t("customer.wallet.csvDate")}</span><span className="text-foreground font-medium">{bookingDate ? format(bookingDate, "PPP") : "-"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">{t("customer.services.timeLabel")}</span><span className="text-foreground font-medium">{bookingTime || "-"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">{t("customer.bookingConfirmation.location")}</span><span className="text-foreground font-medium">{bookingLocation || currentLocation}</span></div>
                  </div>

                  <div className="p-4 rounded-xl border-2 border-primary/20 space-y-2">
                    <h4 className="font-semibold text-foreground flex items-center gap-2 text-xs">
                      <Wallet className="w-4 h-4 text-primary" />{t("customer.services.totalDue")}
                    </h4>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{t("customer.services.servicePrice")}</span>
                      <span className="text-primary font-bold text-sm">{formatMoney(getBookingTotal())}</span>
                    </div>
                    {bookingError && <p className="text-[11px] text-red-600 dark:text-red-400">{bookingError}</p>}
                  </div>

                  <div className="p-3 rounded-xl bg-muted/50 border border-border">
                    <p className="text-[11px] text-muted-foreground leading-relaxed">{t("customer.booking.cancellationPolicy")}</p>
                  </div>

                  {createdJobId ? (
                    <PaymentMethods jobId={createdJobId} amount={getBookingTotal()} onSuccess={handleBookingPaymentSuccess} />
                  ) : (
                    <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                  )}
                </div>
              )}

              {bookingStep < 3 && (
                <div className="flex gap-3 mt-5">
                  {bookingStep > 1 && <Button variant="outline" onClick={() => setBookingStep(bookingStep - 1)} className="flex-1 rounded-xl bg-transparent" disabled={isBookingSubmitting}>{t("customer.jobs.backButton")}</Button>}
                  <Button onClick={handleBookingContinue} disabled={(bookingStep === 1 && (!bookingDate || !bookingTime)) || isBookingSubmitting} className="flex-1 rounded-xl">
                    {isBookingSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t("customer.wallet.continue")}
                  </Button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Emergency Booking Wizard */}
      <Dialog open={showEmergencyWizard} onOpenChange={(open) => { if (!open) resetEmergencyWizard() }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto rounded-2xl">
          {!emergencyBooked ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
                  <AlertTriangle className="w-5 h-5" />
                  {emergencyStep === 1 && t("customer.services.selectEmergencyType")}
                  {emergencyStep === 2 && t("customer.services.emergencyDetails")}
                  {emergencyStep === 3 && t("customer.services.confirmAndPay")}
                </DialogTitle>
              </DialogHeader>

              <div className="flex items-center gap-2 mb-4">
                {[1, 2, 3].map((step) => (
                  <div key={step} className="flex items-center flex-1">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold ${emergencyStep >= step ? 'bg-red-600 text-white' : 'bg-muted text-muted-foreground'}`}>{step}</div>
                    {step < 3 && <div className={`flex-1 h-0.5 mx-2 rounded ${emergencyStep > step ? 'bg-red-600' : 'bg-muted'}`} />}
                  </div>
                ))}
              </div>

              <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 mb-4">
                <Info className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-red-700 dark:text-red-400 leading-relaxed">
                  {t("customer.services.emergencySurchargeNotice", { amount: formatMoney(EMERGENCY_FEE) })}
                </p>
              </div>

              {emergencyStep === 1 && (
                emergencyCategories.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">{t("customer.services.noEmergencyCategories")}</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {emergencyCategories.map((cat) => {
                      const Icon = CATEGORY_ICONS[cat.slug] ?? Grid3X3
                      return (
                        <button key={cat.id} onClick={() => { setEmergencyCategory(cat.id); setUseCustomEmergency(false) }}
                          className={`p-4 rounded-xl border-2 text-left transition-all ${emergencyCategory === cat.id ? "border-red-500 bg-red-50 dark:bg-red-950/20 shadow-sm" : "border-border hover:border-red-300 dark:hover:border-red-700"}`}
                        >
                          <Icon className={`w-5 h-5 mb-2 ${emergencyCategory === cat.id ? "text-red-600" : "text-muted-foreground"}`} />
                          <p className="font-semibold text-foreground text-xs">{cat.name}</p>
                          <p className="text-[11px] text-muted-foreground mt-1">~{formatMoney(cat.avgPrice)} <span className="text-red-500">+ {formatMoney(EMERGENCY_FEE)}</span></p>
                        </button>
                      )
                    })}

                    {/* Emergencies do not always fit a list. Naming your own
                        keeps the booking moving instead of forcing the closest
                        wrong category — it is dispatched by an admin rather
                        than auto-matched, since there is no category to match
                        a provider on. */}
                    <button
                      onClick={() => { setUseCustomEmergency(true); setEmergencyCategory("") }}
                      className={`rounded-xl border-2 border-dashed p-4 text-left transition-all ${
                        useCustomEmergency ? "border-red-500 bg-red-50 shadow-sm dark:bg-red-950/20" : "border-border hover:border-red-300 dark:hover:border-red-700"
                      }`}
                    >
                      <SquarePen className={`mb-2 h-5 w-5 ${useCustomEmergency ? "text-red-600" : "text-muted-foreground"}`} />
                      <p className="text-xs font-semibold text-foreground">{t("customer.services.emergencyOther")}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">{t("customer.services.emergencyOtherHint")}</p>
                    </button>
                  </div>
                )
              )}

              {emergencyStep === 1 && useCustomEmergency && (
                <div className="mt-3">
                  <label className="mb-1.5 block text-xs font-medium text-foreground">{t("customer.services.emergencyTypeLabel")}</label>
                  <Input
                    autoFocus
                    value={emergencyCustomType}
                    onChange={(e) => setEmergencyCustomType(e.target.value)}
                    placeholder={t("customer.services.emergencyTypePlaceholder")}
                    maxLength={80}
                    className="rounded-xl"
                  />
                  <p className="mt-1.5 text-[11px] text-muted-foreground">{t("customer.services.emergencyCustomNotice")}</p>
                </div>
              )}

              {emergencyStep === 2 && (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-foreground mb-2 block">{t("customer.services.describeEmergency")}</label>
                    <Textarea value={emergencyDescription} onChange={(e) => setEmergencyDescription(e.target.value)} placeholder={t("customer.services.whatHappenedPlaceholder")} className="min-h-[80px] rounded-xl" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-foreground mb-2 block">{t("customer.services.yourLocation")}</label>
                    <div className="flex items-center gap-2">
                      <Input value={emergencyLocation} onChange={(e) => setEmergencyLocation(e.target.value)} placeholder={t("customer.services.enterYourAddress")} className="flex-1 rounded-xl" />
                      <Button
                        variant="outline"
                        size="icon"
                        disabled={isLocating}
                        title={t("customer.savedAddresses.useCurrentLocation")}
                        className="bg-transparent rounded-xl"
                        onClick={async () => { const loc = await detectLiveLocation(); setEmergencyLocation(loc || "") }}
                      >
                        {isLocating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {emergencyStep === 3 && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-muted/50 space-y-2 text-xs">
                    <div className="flex justify-between"><span className="text-muted-foreground">{t("customer.services.typeLabel")}</span><span className="font-medium">{getSelectedEmergency()?.name}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">{t("customer.bookingConfirmation.location")}</span><span className="font-medium truncate ml-4">{emergencyLocation || currentLocation}</span></div>
                  </div>
                  <div className="p-4 rounded-xl border-2 border-red-200 dark:border-red-900/30 space-y-2 text-xs">
                    <div className="flex justify-between"><span className="text-muted-foreground">{t("customer.jobs.serviceCost")}</span><span className="font-medium">~{formatMoney(getSelectedEmergency()?.avgPrice || 0)}</span></div>
                    <div className="flex justify-between text-red-600 dark:text-red-400"><span>{t("customer.services.emergencySurcharge")}</span><span className="font-medium">+ {formatMoney(EMERGENCY_FEE)}</span></div>
                    <div className="flex justify-between border-t border-border pt-2"><span className="font-semibold">{t("customer.services.totalDue")}</span><span className="font-bold text-sm">{formatMoney(getEmergencyTotal())}</span></div>
                  </div>
                  {emergencyError && <p className="text-[11px] text-red-600">{emergencyError}</p>}

                  {createdJobId ? (
                    <PaymentMethods jobId={createdJobId} amount={getEmergencyTotal()} onSuccess={handleEmergencyPaymentSuccess} />
                  ) : (
                    <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                  )}
                </div>
              )}

              {emergencyStep < 3 && (
                <div className="flex gap-3 mt-5">
                  {emergencyStep > 1 && <Button variant="outline" onClick={() => setEmergencyStep(emergencyStep - 1)} className="flex-1 rounded-xl bg-transparent" disabled={isEmergencySubmitting}>{t("customer.jobs.backButton")}</Button>}
                  <Button
                    onClick={handleEmergencyContinue}
                    disabled={(emergencyStep === 1 && (useCustomEmergency ? emergencyCustomType.trim().length < 2 : !emergencyCategory)) || (emergencyStep === 2 && (!emergencyDescription || !emergencyLocation)) || isEmergencySubmitting}
                    className="flex-1 rounded-xl"
                  >
                    {isEmergencySubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t("customer.wallet.continue")}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">{t("customer.services.emergencyBooked")}</h3>
              <p className="text-muted-foreground mb-1 text-xs">
                {emergencyAssigned ? t("customer.services.providerDispatched") : t("customer.services.requestSubmitted")}
              </p>
              <p className="text-[11px] text-muted-foreground mb-6">{t("customer.services.paymentReceivedInFull", { amount: formatMoney(getEmergencyTotal()) })}</p>
              <Button onClick={resetEmergencyWizard} className="rounded-xl">{t("customer.services.doneButton")}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  ArrowLeft, Search, Star, MapPin, CheckCircle, Calendar, Briefcase, Video,
  Filter, X, Phone, MessageCircle, Award, Store, Clock,
  ImageIcon, Shield, LocateFixed, Loader2, Heart, Share2, FileText,
  ChevronRight,
} from "lucide-react"
import NextImage from "next/image"
import Link from "next/link"
import { getSpecialists, getSpecialistDetail, type SpecialistCard, type SpecialistDetail } from "@/lib/actions/specialists"
import { getServiceCategories, type HomeServiceCategory } from "@/lib/actions/home"
import { toggleWishlist } from "@/lib/actions/wishlist"
import { useLocalization } from "@/lib/hooks/useLocalization"

const BADGE_STYLE: Record<string, string> = {
  Verified: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  "Top Rated": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  "Fast Responder": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
}

export default function FindSpecialistsPage() {
  const { t, tn, formatMoney } = useLocalization()
  const BADGE_LABEL: Record<string, string> = {
    Verified: t("customer.favorites.verified"),
    "Top Rated": t("customer.findSpecialists.badgeTopRated"),
    "Fast Responder": t("customer.findSpecialists.badgeFastResponder"),
  }
  const STATUS_STYLE: Record<SpecialistCard["status"], { label: string; dot: string; pill: string }> = {
    available: { label: t("customer.findSpecialists.statusAvailableNow"), dot: "bg-emerald-500", pill: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
    busy: { label: t("customer.services.statusBusy"), dot: "bg-red-500", pill: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
    booked: { label: t("customer.services.statusBookedToday"), dot: "bg-amber-500", pill: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  }
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedSkill, setSelectedSkill] = useState("All")
  const [selectedLocation, setSelectedLocation] = useState("")
  const [availableOnly, setAvailableOnly] = useState(false)
  const [vettedOnly, setVettedOnly] = useState(false)
  const [selectedSpecialist, setSelectedSpecialist] = useState<SpecialistDetail>(null)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [profileTab, setProfileTab] = useState("overview")
  const [isFavorite, setIsFavorite] = useState(false)

  const [specialists, setSpecialists] = useState<SpecialistCard[]>([])
  const [categories, setCategories] = useState<HomeServiceCategory[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const detectLocation = useCallback(() => {
    if (!navigator.geolocation) { setSelectedLocation(t("customer.findSpecialists.anywhere")); return }
    navigator.geolocation.getCurrentPosition(
      () => setSelectedLocation(t("customer.findSpecialists.nearYou")),
      () => setSelectedLocation(t("customer.findSpecialists.anywhere")),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    detectLocation()
    Promise.all([getSpecialists(), getServiceCategories()])
      .then(([specialistList, categoryList]) => {
        setSpecialists(specialistList)
        setCategories(categoryList)
      })
      .finally(() => setIsLoading(false))
  }, [detectLocation])

  const skills = ["All", ...categories.map((c) => c.name)]

  const filtered = specialists.filter((s) => {
    if (searchQuery && !s.name.toLowerCase().includes(searchQuery.toLowerCase()) && !s.skills.some((sk) => sk.toLowerCase().includes(searchQuery.toLowerCase()))) return false
    if (vettedOnly && !s.verified) return false
    if (availableOnly && s.status !== "available") return false
    if (selectedSkill !== "All" && !s.skills.some((sk) => sk.toLowerCase().includes(selectedSkill.toLowerCase()))) return false
    return true
  })

  const openSpecialist = async (providerId: string) => {
    setProfileTab("overview")
    setIsDetailLoading(true)
    const detail = await getSpecialistDetail(providerId)
    setIsDetailLoading(false)
    if (detail) {
      setSelectedSpecialist(detail)
      setIsFavorite(detail.isWishlisted)
    }
  }

  // Deep-link support — "Hire Now" on a provider card elsewhere (e.g. the
  // customer home page's Nearby Providers section) links here with
  // ?provider=<id> so it opens straight to that provider's detail/booking
  // view instead of just landing on the bare listing.
  useEffect(() => {
    const providerParam = searchParams.get("provider")
    if (!isLoading && providerParam) openSpecialist(providerParam)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, searchParams])

  const handleToggleFavorite = async () => {
    if (!selectedSpecialist) return
    setIsFavorite((prev) => !prev)
    await toggleWishlist({ targetType: "PROVIDER", targetId: selectedSpecialist.providerId })
  }

  const handleBookNow = () => {
    if (!selectedSpecialist) return
    if (selectedSpecialist.bookableCategoryId) {
      router.push(`/customer/services/${selectedSpecialist.bookableCategoryId}`)
    }
  }

  // Deep-link support — "Hire" on a provider card elsewhere (e.g. the home
  // page's mixed feed) links here with ?provider=<id>&action=book so it
  // jumps straight into booking instead of leaving the user to find the
  // Book button themselves inside the detail panel that just opened.
  useEffect(() => {
    if (selectedSpecialist && searchParams.get("action") === "book") handleBookNow()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSpecialist])

  const renderBadge = (badge: string) => (
    <span key={badge} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${BADGE_STYLE[badge] ?? "bg-muted text-muted-foreground"}`}>
      {BADGE_LABEL[badge] ?? badge}
    </span>
  )

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky Header */}
      <div className="sticky top-0 z-30 bg-card/95 backdrop-blur-lg border-b border-border/50 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => router.back()} className="p-2 hover:bg-muted rounded-xl transition-colors lg:hidden">
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold text-foreground">{t("customer.layout.navFindSpecialists")}</h1>
              <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                <LocateFixed className="w-3 h-3 flex-shrink-0" /> <span className="truncate">{selectedLocation || t("customer.findSpecialists.detecting")} -- {tn("customer.findSpecialists.specialistsFound", filtered.length)}</span>
              </p>
            </div>
            <button onClick={() => setShowFilters(!showFilters)} className="p-2.5 bg-muted rounded-xl hover:bg-muted/80 transition-colors relative">
              <Filter className="w-4 h-4 text-foreground" />
              {(vettedOnly || availableOnly) && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-primary rounded-full" />}
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t("customer.findSpecialists.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10 rounded-xl border-0 bg-muted text-sm"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Skill Pills */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {skills.map((skill) => (
              <button
                key={skill}
                onClick={() => setSelectedSkill(skill)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                  selectedSkill === skill
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {skill === "All" ? t("customer.findSpecialists.allSkills") : skill}
              </button>
            ))}
          </div>

          {/* Expanded Filters */}
          {showFilters && (
            <div className="flex flex-wrap gap-3 pt-3 border-t border-border/50 mt-3">
              <button
                onClick={() => setAvailableOnly(!availableOnly)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  availableOnly ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-muted text-muted-foreground"
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${availableOnly ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
                {t("customer.findSpecialists.statusAvailableNow")}
              </button>
              <button
                onClick={() => setVettedOnly(!vettedOnly)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  vettedOnly ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" : "bg-muted text-muted-foreground"
                }`}
              >
                <Shield className="w-3 h-3" />
                {t("customer.findSpecialists.verifiedOnly")}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="max-w-6xl mx-auto px-4 py-4">
        {filtered.length === 0 ? (
          <Card className="p-10 text-center border-0 shadow-sm">
            <Search className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="font-semibold text-foreground mb-1">{t("customer.findSpecialists.noneFound")}</p>
            <p className="text-sm text-muted-foreground">{t("customer.findSpecialists.adjustFilters")}</p>
          </Card>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {filtered.map((s) => (
              <Card
                key={s.providerId}
                onClick={() => openSpecialist(s.providerId)}
                className="p-4 border-0 shadow-sm hover:shadow-md transition-all cursor-pointer group"
              >
                <div className="flex gap-3.5">
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    <div className="w-16 h-16 lg:w-18 lg:h-18 rounded-2xl overflow-hidden ring-2 ring-border group-hover:ring-primary/40 transition-all">
                      <NextImage src={s.avatar || "/placeholder.svg"} alt={s.name} width={72} height={72} className="object-cover w-full h-full" />
                    </div>
                    <div
                      className={`absolute -bottom-1 -right-1 w-5 h-5 ${STATUS_STYLE[s.status].dot} rounded-full border-[3px] border-card flex items-center justify-center`}
                      title={STATUS_STYLE[s.status].label}
                    >
                      <div className="w-2 h-2 bg-white rounded-full" />
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <h3 className="font-bold text-foreground text-sm lg:text-base truncate">{s.name}</h3>
                      {s.verified && <CheckCircle className="w-4 h-4 text-blue-500 fill-blue-500 flex-shrink-0" />}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mb-1.5">
                      <span className="flex items-center gap-1 flex-shrink-0">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        <span className="font-semibold text-foreground">{s.rating.toFixed(1)}</span>
                        <span>({s.reviewCount})</span>
                      </span>
                      <span className="flex items-center gap-0.5 min-w-0"><MapPin className="w-3 h-3 flex-shrink-0" /><span className="truncate">{s.location}</span></span>
                      <span className="flex items-center gap-0.5 flex-shrink-0"><Briefcase className="w-3 h-3" />{s.completedJobs}</span>
                    </div>

                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold mb-1.5 ${STATUS_STYLE[s.status].pill}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_STYLE[s.status].dot}`} />
                      {STATUS_STYLE[s.status].label}
                    </span>

                    <div className="flex flex-wrap gap-1 mb-2">
                      {s.skills.map((sk, i) => (
                        <span key={i} className="text-[11px] bg-muted text-muted-foreground px-2 py-0.5 rounded-md font-medium">{sk}</span>
                      ))}
                    </div>

                    {s.badges.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {s.badges.map((b) => renderBadge(b))}
                      </div>
                    )}
                  </div>

                  {/* Price */}
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-foreground text-base lg:text-lg">{formatMoney(s.hourlyRate)}</p>
                    <p className="text-[11px] text-muted-foreground">{t("customer.findSpecialists.perHour")}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Specialist Profile Modal */}
      <Dialog open={!!selectedSpecialist || isDetailLoading} onOpenChange={(open) => { if (!open) setSelectedSpecialist(null) }}>
        <DialogContent
          showCloseButton={false}
          className="p-0 overflow-hidden flex flex-col max-w-full rounded-none border-0 top-0 translate-y-0 h-[100dvh] max-h-[100dvh] sm:max-w-lg sm:rounded-lg sm:border sm:top-[50%] sm:translate-y-[-50%] sm:h-[92vh] sm:max-h-[850px]"
        >
          {isDetailLoading && (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
          {selectedSpecialist && !isDetailLoading && (
            <>
              {/* Hero */}
              <div className="relative h-32 bg-gradient-to-br from-primary via-primary/80 to-blue-600 flex-shrink-0">
                <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
                  <button onClick={() => setSelectedSpecialist(null)} className="p-2 bg-black/20 hover:bg-black/40 rounded-xl transition-colors">
                    <ArrowLeft className="w-5 h-5 text-white" />
                  </button>
                  <div className="flex items-center gap-2">
                    <button onClick={handleToggleFavorite} className="p-2 bg-black/20 hover:bg-black/40 rounded-xl transition-colors">
                      <Heart className={`w-5 h-5 ${isFavorite ? "fill-red-500 text-red-500" : "text-white"}`} />
                    </button>
                    <button className="p-2 bg-black/20 hover:bg-black/40 rounded-xl transition-colors">
                      <Share2 className="w-5 h-5 text-white" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Avatar Overlap */}
              <div className="px-5 -mt-12 relative z-10 flex-shrink-0">
                <div className="flex items-end gap-4">
                  <div className="w-24 h-24 rounded-2xl overflow-hidden ring-4 ring-card shadow-lg">
                    <NextImage src={selectedSpecialist.avatar || "/placeholder.svg"} alt={selectedSpecialist.name} width={96} height={96} className="object-cover" />
                  </div>
                  <span className={`inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full font-medium mb-1 ${STATUS_STYLE[selectedSpecialist.status].pill}`}>
                    <span className={`w-2 h-2 rounded-full ${STATUS_STYLE[selectedSpecialist.status].dot} ${selectedSpecialist.status === "available" ? "animate-pulse" : ""}`} />
                    {STATUS_STYLE[selectedSpecialist.status].label}
                  </span>
                </div>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto">
                <div className="px-5 pt-3 pb-5 space-y-4">
                  {/* Name & Stats */}
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <h2 className="text-xl font-bold text-foreground">{selectedSpecialist.name}</h2>
                      {selectedSpecialist.verified && (
                        <span className="flex items-center gap-1 bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
                          <CheckCircle className="w-3.5 h-3.5 text-blue-600 fill-blue-600" />
                          <span className="text-[10px] font-semibold text-blue-700 dark:text-blue-300">{t("customer.favorites.verified")}</span>
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground font-medium">{selectedSpecialist.skills.join(" | ")}</p>
                    <div className="flex flex-wrap items-center gap-3 mt-2.5">
                      <span className="flex items-center gap-1 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1 rounded-lg text-sm">
                        <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                        <span className="font-bold text-foreground">{selectedSpecialist.rating.toFixed(1)}</span>
                        <span className="text-xs text-muted-foreground">({selectedSpecialist.reviewCount})</span>
                      </span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1"><Briefcase className="w-3.5 h-3.5" />{tn("customer.favorites.jobsCount", selectedSpecialist.completedJobs)}</span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{t("customer.findSpecialists.yearsExperience", { count: selectedSpecialist.yearsExperience })}</span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{selectedSpecialist.location}</span>
                    </div>
                    <p className="text-lg font-bold text-primary mt-2.5">
                      {formatMoney(selectedSpecialist.hourlyRate)} <span className="text-xs font-normal text-muted-foreground">{t("customer.findSpecialists.perHourSpaced")}</span>
                    </p>
                  </div>

                  {/* Quick Actions */}
                  <div className="grid grid-cols-5 gap-2">
                    {[
                      { icon: Phone, label: t("customer.serviceDetail.call"), bg: "bg-emerald-50 dark:bg-emerald-900/20", iconBg: "bg-emerald-500", textColor: "text-emerald-700 dark:text-emerald-300", href: selectedSpecialist.phone ? `tel:${selectedSpecialist.phone}` : undefined },
                      { icon: MessageCircle, label: t("customer.findSpecialists.chat"), bg: "bg-blue-50 dark:bg-blue-900/20", iconBg: "bg-blue-500", textColor: "text-blue-700 dark:text-blue-300", href: `/customer/messages?provider=${selectedSpecialist.userId}&action=message` },
                      { icon: Video, label: t("customer.findSpecialists.video"), bg: "bg-violet-50 dark:bg-violet-900/20", iconBg: "bg-violet-500", textColor: "text-violet-700 dark:text-violet-300" },
                      { icon: Calendar, label: t("customer.findSpecialists.book"), bg: "bg-orange-50 dark:bg-orange-900/20", iconBg: "bg-orange-500", textColor: "text-orange-700 dark:text-orange-300", onClick: handleBookNow },
                      { icon: FileText, label: "Get Quote", bg: "bg-rose-50 dark:bg-rose-900/20", iconBg: "bg-rose-500", textColor: "text-rose-700 dark:text-rose-300", href: `/customer/service-requests/new?provider=${selectedSpecialist.providerId}` },
                    ].map((action, idx) => {
                      const Icon = action.icon
                      if (action.href) {
                        return (
                          <Link key={idx} href={action.href} className={`flex flex-col items-center gap-1.5 p-3 ${action.bg} rounded-xl hover:opacity-80 transition-opacity`}>
                            <div className={`w-9 h-9 ${action.iconBg} rounded-full flex items-center justify-center`}>
                              <Icon className="w-4 h-4 text-white" />
                            </div>
                            <span className={`text-[11px] font-medium ${action.textColor}`}>{action.label}</span>
                          </Link>
                        )
                      }
                      return (
                        <button key={idx} onClick={action.onClick} className={`flex flex-col items-center gap-1.5 p-3 ${action.bg} rounded-xl hover:opacity-80 transition-opacity`}>
                          <div className={`w-9 h-9 ${action.iconBg} rounded-full flex items-center justify-center`}>
                            <Icon className="w-4 h-4 text-white" />
                          </div>
                          <span className={`text-[11px] font-medium ${action.textColor}`}>{action.label}</span>
                        </button>
                      )
                    })}
                  </div>

                  {/* Tabs */}
                  <Tabs value={profileTab} onValueChange={setProfileTab} className="w-full">
                    <TabsList className="w-full grid grid-cols-4 h-10 bg-muted rounded-xl p-1">
                      <TabsTrigger value="overview" className="rounded-lg text-xs">{t("customer.findSpecialists.tabOverview")}</TabsTrigger>
                      <TabsTrigger value="portfolio" className="rounded-lg text-xs">{t("customer.findSpecialists.tabPortfolio")}</TabsTrigger>
                      <TabsTrigger value="videos" className="rounded-lg text-xs">{t("customer.findSpecialists.tabVideos")}</TabsTrigger>
                      <TabsTrigger value="shop" className="rounded-lg text-xs">{t("customer.findSpecialists.tabShop")}</TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="mt-3 space-y-3">
                      <div className="bg-muted/50 rounded-xl p-4">
                        <h3 className="font-semibold text-foreground text-sm mb-1.5">{t("customer.findSpecialists.about")}</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">{selectedSpecialist.bio || t("customer.findSpecialists.noBio")}</p>
                      </div>
                      {selectedSpecialist.badges.length > 0 && (
                        <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-xl p-4">
                          <h3 className="font-semibold text-foreground text-sm mb-2 flex items-center gap-1.5"><Award className="w-4 h-4 text-amber-500" />{t("customer.findSpecialists.badgesLabel")}</h3>
                          <div className="flex flex-wrap gap-1.5">{selectedSpecialist.badges.map((b) => renderBadge(b))}</div>
                        </div>
                      )}
                      {selectedSpecialist.endorsements.length > 0 && (
                        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-xl p-4">
                          <h3 className="font-semibold text-foreground text-sm mb-2 flex items-center gap-1.5"><Store className="w-4 h-4 text-emerald-600" />{t("customer.findSpecialists.endorsements")}</h3>
                          {selectedSpecialist.endorsements.map((e) => (
                            <div key={e.id} className="flex gap-2.5">
                              <div className="relative w-10 h-10 rounded-xl overflow-hidden flex-shrink-0">
                                <NextImage src={e.avatar || "/placeholder.svg"} alt={e.ownerName} fill className="object-cover" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-foreground text-sm truncate">{e.shopName}</p>
                                <p className="text-[11px] text-muted-foreground mb-1 truncate">{t("customer.findSpecialists.byOwner", { name: e.ownerName })}</p>
                                <p className="text-sm text-foreground italic leading-relaxed">{`"${e.message}"`}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="portfolio" className="mt-3">
                      {selectedSpecialist.portfolio.length > 0 ? (
                        <div className="grid grid-cols-2 gap-2">
                          {selectedSpecialist.portfolio.map((sample) => (
                            <div key={sample.id} className="relative aspect-video rounded-xl overflow-hidden group cursor-pointer">
                              <NextImage src={sample.imageUrl} alt={sample.title} fill className="object-cover group-hover:scale-105 transition-transform" />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                              <p className="absolute bottom-2 left-2 right-2 text-white text-xs font-medium truncate">{sample.title}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 bg-muted/50 rounded-xl">
                          <ImageIcon className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">{t("customer.findSpecialists.noSamples")}</p>
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="videos" className="mt-3">
                      {selectedSpecialist.portfolio.some((p) => p.videoUrl) ? (
                        <div className="grid grid-cols-1 gap-3">
                          {selectedSpecialist.portfolio.filter((p) => p.videoUrl).map((item) => (
                            <div key={item.id}>
                              <video src={item.videoUrl!} controls className="w-full rounded-xl aspect-video object-cover" />
                              <p className="text-xs font-medium text-foreground mt-1.5">{item.title}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 bg-muted/50 rounded-xl">
                          <Video className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">{t("customer.findSpecialists.noVideos")}</p>
                        </div>
                      )}
                    </TabsContent>

                    {/* The provider's own public page — everything they offer
                        in one place, and a link they can share. */}
                    {selectedSpecialist.slug && (
                      <Link
                        href={`/p/${selectedSpecialist.slug}`}
                        className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-muted/50 p-4 transition-colors hover:bg-muted"
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">View full profile</span>
                          <span className="block text-xs text-muted-foreground">Services, products, portfolio and reviews</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      </Link>
                    )}

                    <TabsContent value="shop" className="mt-3">
                      {selectedSpecialist.shop ? (
                        <Link
                          href={`/customer/shops/${selectedSpecialist.shop.id}`}
                          className="flex items-center gap-3 p-4 bg-muted/50 rounded-xl hover:bg-muted transition-colors"
                        >
                          <div className="w-14 h-14 rounded-xl overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
                            {selectedSpecialist.shop.logoUrl ? (
                              <NextImage src={selectedSpecialist.shop.logoUrl} alt={selectedSpecialist.shop.name} width={56} height={56} className="object-cover w-full h-full" />
                            ) : (
                              <Store className="w-6 h-6 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-foreground text-sm truncate">{selectedSpecialist.shop.name}</p>
                            <span className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />{selectedSpecialist.shop.rating.toFixed(1)}
                            </span>
                          </div>
                        </Link>
                      ) : (
                        <div className="text-center py-8 bg-muted/50 rounded-xl">
                          <Store className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">{t("customer.findSpecialists.noShopLinked")}</p>
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </div>
              </div>

              {/* Fixed Bottom Actions */}
              <div className="flex-shrink-0 p-4 border-t border-border bg-card">
                <div className="flex gap-2.5">
                  <Button variant="outline" className="flex-1 h-11 gap-2 bg-transparent rounded-xl text-sm" onClick={handleBookNow} disabled={!selectedSpecialist.bookableCategoryId}>
                    <Calendar className="w-4 h-4" /> {t("customer.findSpecialists.schedule")}
                  </Button>
                  <Button className="flex-1 h-11 gap-2 rounded-xl shadow-lg shadow-primary/20 text-sm" onClick={handleBookNow} disabled={!selectedSpecialist.bookableCategoryId}>
                    <Briefcase className="w-4 h-4" /> {t("customer.serviceDetail.bookNow")}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

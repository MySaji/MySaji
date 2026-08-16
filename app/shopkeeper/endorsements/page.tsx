"use client"

import { useEffect, useState } from "react"
import {
  Award, Search, Star, MapPin, ThumbsUp, Calendar, Loader2, CheckCircle2
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import Image from "next/image"
import {
  getMyEndorsements, writeEndorsement,
  type ShopkeeperEndorsementsData,
} from "@/lib/actions/shopkeeper-endorsements"
import { getSpecialists, type SpecialistCard } from "@/lib/actions/specialists"
import { useLocalization } from "@/lib/hooks/useLocalization"

export default function ShopkeeperEndorsementsPage() {
  const { t } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<"given" | "find">("given")
  const [data, setData] = useState<ShopkeeperEndorsementsData>({ endorsements: [], totalGiven: 0, thisMonthCount: 0 })
  const [specialists, setSpecialists] = useState<SpecialistCard[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [showEndorseModal, setShowEndorseModal] = useState(false)
  const [selectedSpecialist, setSelectedSpecialist] = useState<SpecialistCard | null>(null)
  const [endorsementText, setEndorsementText] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState("")

  const refresh = async () => {
    const [endorsementsData, specialistsData] = await Promise.all([getMyEndorsements(), getSpecialists()])
    setData(endorsementsData)
    setSpecialists(specialistsData)
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const endorsedUserIds = new Set(data.endorsements.map((e) => e.providerUserId))

  const filteredSpecialists = specialists.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.skills.some((skill) => skill.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  const filteredEndorsements = data.endorsements.filter((e) =>
    e.name.toLowerCase().includes(searchQuery.toLowerCase()) || e.specialty.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleSubmitEndorsement = async () => {
    if (!selectedSpecialist) return
    setIsSubmitting(true)
    setFormError("")
    const result = await writeEndorsement({ providerUserId: selectedSpecialist.userId, message: endorsementText })
    setIsSubmitting(false)
    if (!result.success) { setFormError(result.error); return }
    setShowEndorseModal(false)
    setEndorsementText("")
    setSelectedSpecialist(null)
    await refresh()
  }

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" })

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-600 to-orange-600 dark:from-amber-800 dark:to-orange-800 text-white p-6 lg:rounded-b-3xl">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <Award className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{t("shopkeeper.endorsements.title")}</h1>
              <p className="text-amber-100 text-sm">{t("shopkeeper.endorsements.subtitle")}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 text-center">
              <p className="text-2xl font-bold">{data.totalGiven}</p>
              <p className="text-xs text-amber-100">{t("shopkeeper.endorsements.givenLabel")}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 text-center">
              <p className="text-2xl font-bold">{data.thisMonthCount}</p>
              <p className="text-xs text-amber-100">{t("shopkeeper.endorsements.thisMonthLabel")}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 -mt-4">
        {/* Tabs */}
        <Card className="p-2 mb-4 shadow-lg border-0">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab("given")}
              className={`flex-1 py-2.5 px-4 rounded-lg font-medium text-sm transition-all ${
                activeTab === "given"
                  ? "bg-amber-600 text-white shadow-md"
                  : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
            >
              {t("shopkeeper.endorsements.tabMyEndorsements")}
            </button>
            <button
              onClick={() => setActiveTab("find")}
              className={`flex-1 py-2.5 px-4 rounded-lg font-medium text-sm transition-all ${
                activeTab === "find"
                  ? "bg-amber-600 text-white shadow-md"
                  : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
            >
              {t("shopkeeper.endorsements.tabWriteNew")}
            </button>
          </div>
        </Card>

        {/* Search */}
        <Card className="p-4 mb-4 border-0 shadow-sm">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t("shopkeeper.endorsements.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </Card>

        {activeTab === "find" && (
          <Card className="p-4 mb-4 border-0 shadow-sm bg-amber-50 dark:bg-amber-900/20">
            <div className="flex items-start gap-3">
              <ThumbsUp className="w-5 h-5 text-amber-600 mt-0.5" />
              <div>
                <p className="font-medium text-amber-900 dark:text-amber-200 text-sm">{t("shopkeeper.endorsements.matterTitle")}</p>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                  {t("shopkeeper.endorsements.matterHint")}
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Find Specialists */}
        {activeTab === "find" && (
          <div className="space-y-4">
            {filteredSpecialists.length === 0 ? (
              <Card className="p-8 text-center border-0 shadow-sm">
                <Search className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{t("shopkeeper.endorsements.noSpecialistsFound")}</h3>
                <p className="text-sm text-muted-foreground">{t("shopkeeper.endorsements.tryDifferentSearch")}</p>
              </Card>
            ) : (
              filteredSpecialists.map((specialist) => {
                const alreadyEndorsed = endorsedUserIds.has(specialist.userId)
                return (
                  <Card key={specialist.providerId} className="p-5 border-0 shadow-sm">
                    <div className="flex gap-4">
                      <Image
                        src={specialist.avatar || "/placeholder.svg"}
                        alt={specialist.name}
                        width={64}
                        height={64}
                        className="rounded-full object-cover w-16 h-16"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-semibold text-gray-900 dark:text-white">{specialist.name}</h3>
                            <p className="text-sm text-muted-foreground">{specialist.skills.join(", ") || t("shopkeeper.endorsements.specialistFallback")}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 mt-2 text-sm">
                          <span className="flex items-center gap-1 text-amber-600">
                            <Star className="w-4 h-4 fill-amber-500" />
                            {specialist.rating.toFixed(1)}
                          </span>
                          <span className="text-muted-foreground">{t("shopkeeper.endorsements.reviewsCount", { count: specialist.reviewCount })}</span>
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <MapPin className="w-3.5 h-3.5" />
                            {specialist.location}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4">
                      {alreadyEndorsed ? (
                        <div className="flex items-center justify-center gap-2 text-sm text-emerald-600 py-2">
                          <CheckCircle2 className="w-4 h-4" />
                          {t("shopkeeper.endorsements.alreadyEndorsed")}
                        </div>
                      ) : (
                        <Button
                          className="w-full bg-amber-600 hover:bg-amber-700"
                          onClick={() => {
                            setSelectedSpecialist(specialist)
                            setEndorsementText("")
                            setFormError("")
                            setShowEndorseModal(true)
                          }}
                        >
                          <Award className="w-4 h-4 mr-2" />
                          {t("shopkeeper.endorsements.writeEndorsement")}
                        </Button>
                      )}
                    </div>
                  </Card>
                )
              })
            )}
          </div>
        )}

        {/* My Endorsements */}
        {activeTab === "given" && (
          <div className="space-y-4">
            {filteredEndorsements.length === 0 ? (
              <Card className="p-8 text-center border-0 shadow-sm">
                <Award className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{t("shopkeeper.endorsements.noEndorsementsYet")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("shopkeeper.endorsements.startEndorsingHint")}
                </p>
                <Button className="mt-4 bg-amber-600 hover:bg-amber-700" onClick={() => setActiveTab("find")}>
                  {t("shopkeeper.endorsements.findSpecialists")}
                </Button>
              </Card>
            ) : (
              filteredEndorsements.map((endorsement) => (
                <Card key={endorsement.id} className="p-5 border-0 shadow-sm">
                  <div className="flex gap-4 mb-3">
                    <Image
                      src={endorsement.avatar || "/placeholder.svg"}
                      alt={endorsement.name}
                      width={56}
                      height={56}
                      className="rounded-full object-cover w-14 h-14"
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 dark:text-white">{endorsement.name}</h3>
                      <p className="text-sm text-muted-foreground">{endorsement.specialty}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {formatDate(endorsement.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4">
                    <p className="text-sm text-amber-900 dark:text-amber-200">&quot;{endorsement.message}&quot;</p>
                  </div>
                </Card>
              ))
            )}
          </div>
        )}
      </div>

      {/* Endorsement Modal */}
      <Dialog open={showEndorseModal} onOpenChange={setShowEndorseModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("shopkeeper.endorsements.writeEndorsementModalTitle")}</DialogTitle>
          </DialogHeader>
          {selectedSpecialist && (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                <Image
                  src={selectedSpecialist.avatar || "/placeholder.svg"}
                  alt={selectedSpecialist.name}
                  width={48}
                  height={48}
                  className="rounded-full object-cover"
                />
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{selectedSpecialist.name}</p>
                  <p className="text-sm text-muted-foreground">{selectedSpecialist.skills.join(", ") || t("shopkeeper.endorsements.specialistFallback")}</p>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">{t("shopkeeper.endorsements.yourEndorsementLabel")}</p>
                <Textarea
                  value={endorsementText}
                  onChange={(e) => setEndorsementText(e.target.value)}
                  placeholder={t("shopkeeper.endorsements.endorsementPlaceholder")}
                  className="min-h-[120px]"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {t("shopkeeper.endorsements.charCount", { count: endorsementText.length })}
                </p>
              </div>

              {formError && <p className="text-sm text-red-600">{formError}</p>}

              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  <strong>{t("shopkeeper.endorsements.tipLabel")}</strong> {t("shopkeeper.endorsements.tipText")}
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 bg-transparent"
                  onClick={() => setShowEndorseModal(false)}
                  disabled={isSubmitting}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  className="flex-1 bg-amber-600 hover:bg-amber-700"
                  onClick={handleSubmitEndorsement}
                  disabled={endorsementText.length < 50 || isSubmitting}
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t("shopkeeper.endorsements.submitEndorsement")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

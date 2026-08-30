"use client"

import React from "react"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import { useLocalization } from "@/lib/hooks/useLocalization"
import { useProviderWorkspace } from "@/lib/hooks/useProviderWorkspace"
import type { TranslationKey } from "@/lib/i18n"
import {
  TrendingUp, AlertCircle, CheckCircle2, Clock, DollarSign, Bell, ArrowRight, Briefcase,
  Camera, Video, ImageIcon, X, MapPin, Tag, MessageCircle,
  Settings, Zap, Upload, Plus, Store, Sparkles,
  Award, ChevronRight, Layers, Loader2,
} from "lucide-react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import NextImage from "next/image"
import { getProviderDashboardData } from "@/lib/actions/provider-dashboard"
import { createProviderStory } from "@/lib/actions/provider-stories"
import { compressImageToDataUrl } from "@/lib/compress-image"
import { withTimeout, DASHBOARD_FETCH_TIMEOUT_MS } from "@/lib/swr-utils"

export default function ProviderHomePage() {
  const { t, formatMoney } = useLocalization()
  const router = useRouter()
  const { type: workspaceType, isLoading: isWorkspaceLoading } = useProviderWorkspace()

  // Adaptive UI Workspaces: /provider is the shared login landing route for
  // every provider account type (ROLE_HOME_PATH has no DB context to pick
  // a different one at login time), so this page itself routes onward —
  // Business Manager and Field Technician each have their own dedicated
  // home; only a Solo Pro actually stays here.
  useEffect(() => {
    if (isWorkspaceLoading) return
    if (workspaceType === "business_owner") router.replace("/provider/business/dashboard")
    else if (workspaceType === "field_technician") router.replace("/provider/field")
  }, [workspaceType, isWorkspaceLoading, router])

  const { data: dashboard, isLoading: isDashboardLoading } = useSWR(
    "provider-dashboard", () => withTimeout(getProviderDashboardData(), DASHBOARD_FETCH_TIMEOUT_MS),
  )

  const stats = [
    {
      icon: Briefcase,
      label: t("provider.dashboard.statActiveJobs"),
      value: String(dashboard?.activeJobs ?? 0),
      color: "bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300",
    },
    {
      icon: CheckCircle2,
      label: t("provider.dashboard.statCompleted"),
      value: String(dashboard?.completedJobs ?? 0),
      color: "bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-300",
    },
    {
      icon: Clock,
      label: t("provider.dashboard.statInProgress"),
      value: String(dashboard?.inProgressJobs ?? 0),
      color: "bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-300",
    },
    {
      icon: DollarSign,
      label: t("provider.dashboard.statEarnings"),
      value: formatMoney(dashboard?.earnings ?? 0),
      color: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900 dark:text-emerald-300",
    },
  ]

  const alerts = dashboard?.alerts ?? []
  const recentJobs = dashboard?.recentJobs ?? []
  const onboardingSteps = dashboard?.onboarding ?? []
  const onboardingDoneCount = onboardingSteps.filter((s) => s.done).length
  const onboardingPct = onboardingSteps.length > 0 ? Math.round((onboardingDoneCount / onboardingSteps.length) * 100) : 0

  const [showCreatePost, setShowCreatePost] = useState(false)
  const [showCreateStory, setShowCreateStory] = useState(false)
  const [showEndorsementRequest, setShowEndorsementRequest] = useState(false)
  const [beforeImage, setBeforeImage] = useState<string | null>(null)
  const [afterImage, setAfterImage] = useState<string | null>(null)
  const [isCompressingBefore, setIsCompressingBefore] = useState(false)
  const [isCompressingAfter, setIsCompressingAfter] = useState(false)
  const [storyTitle, setStoryTitle] = useState("")
  const [isPostingStory, setIsPostingStory] = useState(false)
  const [storyError, setStoryError] = useState("")
  const [endorsementShop, setEndorsementShop] = useState("")
  const [endorsementMessage, setEndorsementMessage] = useState("")
  const [postContent, setPostContent] = useState("")
  const [selectedImages, setSelectedImages] = useState<string[]>([])
  const [postLocation, setPostLocation] = useState("")
  const [postTags, setPostTags] = useState<string[]>([])
  const [isPosting, setIsPosting] = useState(false)
  const [postSuccess, setPostSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const cameraInputRef = useRef<HTMLInputElement | null>(null)

  if (isWorkspaceLoading || workspaceType !== "solo") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const handlePost = async () => {
    setIsPosting(true)
    // Simulate posting
    await new Promise(resolve => setTimeout(resolve, 1500))
    setIsPosting(false)
    setPostSuccess(true)
    setTimeout(() => {
      setPostSuccess(false)
      setShowCreatePost(false)
      setPostContent("")
      setSelectedImages([])
      setPostLocation("")
      setPostTags([])
    }, 1500)
  }

  const toggleImageSelection = (img: string) => {
    setSelectedImages(prev => 
      prev.includes(img) ? prev.filter(i => i !== img) : [...prev, img]
    )
  }

  // Handle file selection from device
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) {
      Array.from(files).forEach(file => {
        const reader = new FileReader()
        reader.onloadend = () => {
          setSelectedImages(prev => [...prev, reader.result as string])
        }
        reader.readAsDataURL(file)
      })
    }
    // Reset input so same file can be selected again
    e.target.value = ''
  }

  // Handle camera capture
  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files[0]) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setSelectedImages(prev => [...prev, reader.result as string])
      }
      reader.readAsDataURL(files[0])
    }
    e.target.value = ''
  }

  if (isDashboardLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24 lg:pb-8">
      {/* Create Post Modal */}
      <Dialog open={showCreatePost} onOpenChange={setShowCreatePost}>
        <DialogContent className="max-w-2xl p-0 bg-card overflow-hidden max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 z-10 bg-card border-b border-border p-4 flex items-center justify-between">
            <button onClick={() => setShowCreatePost(false)} aria-label={t("common.close")} className="p-2 hover:bg-muted rounded-full transition-colors">
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
            <h2 className="text-base font-semibold text-foreground">{t("provider.dashboard.createPostModalTitle")}</h2>
            <Button
              onClick={handlePost}
              disabled={!postContent.trim() || isPosting}
              className="bg-primary hover:bg-primary/90"
            >
              {isPosting ? t("provider.dashboard.posting") : postSuccess ? t("provider.dashboard.posted") : t("provider.dashboard.postAction")}
            </Button>
          </div>

          <div className="p-4 space-y-4">
            {/* User Info */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold">
                M
              </div>
              <div>
                <p className="font-semibold text-foreground">Mike Thompson</p>
                <p className="text-xs text-muted-foreground">{t("provider.dashboard.mockProviderRole")}</p>
              </div>
            </div>

            {/* Post Content */}
            <Textarea
              value={postContent}
              onChange={(e) => setPostContent(e.target.value)}
              placeholder={t("provider.dashboard.postPlaceholder")}
              className="min-h-[120px] border-0 bg-muted/50 resize-none focus:ring-0"
            />

            {/* Selected Images Preview */}
            {selectedImages.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {selectedImages.map((img, idx) => (
                  <div key={idx} className="relative aspect-video rounded-lg overflow-hidden bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img || "/placeholder.svg"} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => setSelectedImages(prev => prev.filter((_, i) => i !== idx))}
                      aria-label={t("common.removeItem")}
                      className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-full hover:bg-black/80 transition-colors"
                    >
                      <X className="w-4 h-4 text-white" />
                    </button>
                    <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/60 rounded text-[11px] text-white">
                      {idx + 1}/{selectedImages.length}
                    </div>
                  </div>
                ))}
                {/* Add More Button */}
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-video rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center hover:border-primary hover:bg-primary/5 transition-all"
                >
                  <Plus className="w-8 h-8 text-muted-foreground" />
                  <span className="text-[11px] text-muted-foreground mt-1">{t("provider.dashboard.addMore")}</span>
                </button>
              </div>
            )}

            {/* Hidden File Inputs */}
            <input 
              type="file" 
              ref={fileInputRef}
              accept="image/*,video/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <input 
              type="file" 
              ref={cameraInputRef}
              accept="image/*"
              capture="environment"
              onChange={handleCameraCapture}
              className="hidden"
            />

            {/* Add Photo/Video Buttons */}
            <div className="border-t border-border pt-4">
              <p className="text-xs font-medium text-muted-foreground mb-3">{t("provider.dashboard.addPhotosVideos")}</p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-muted-foreground/30 rounded-xl hover:border-primary hover:bg-primary/5 transition-all"
                >
                  <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center mb-2">
                    <Upload className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span className="text-xs font-medium text-foreground">{t("provider.dashboard.uploadFromDevice")}</span>
                  <span className="text-[11px] text-muted-foreground mt-1">{t("provider.dashboard.selectPhotosVideos")}</span>
                </button>
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-muted-foreground/30 rounded-xl hover:border-primary hover:bg-primary/5 transition-all"
                >
                  <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center mb-2">
                    <Camera className="w-6 h-6 text-green-600 dark:text-green-400" />
                  </div>
                  <span className="text-xs font-medium text-foreground">{t("provider.dashboard.takePhoto")}</span>
                  <span className="text-[11px] text-muted-foreground mt-1">{t("provider.dashboard.openCamera")}</span>
                </button>
              </div>

              {/* Sample Images Grid */}
              <p className="text-xs font-medium text-muted-foreground mb-3">{t("provider.dashboard.orChooseFromRecent")}</p>
              <div className="grid grid-cols-4 gap-2">
                {sampleImages.map((img, idx) => (
                  <button 
                    key={idx}
                    onClick={() => toggleImageSelection(img)}
                    className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                      selectedImages.includes(img) ? 'border-primary ring-2 ring-primary/30' : 'border-transparent'
                    }`}
                  >
                    <NextImage src={img || "/placeholder.svg"} alt="" fill className="object-cover" />
                    {selectedImages.includes(img) && (
                      <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                        <CheckCircle2 className="w-6 h-6 text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap items-center gap-4 border-t border-border pt-4">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                <ImageIcon className="w-5 h-5" />
                {t("provider.dashboard.gallery")}
              </button>
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                <Camera className="w-5 h-5" />
                {t("provider.dashboard.camera")}
              </button>
              <button
                onClick={() => setPostLocation(postLocation ? "" : "Nairobi, Kenya")}
                className={`flex items-center gap-2 text-xs transition-colors ${postLocation ? 'text-primary' : 'text-muted-foreground hover:text-primary'}`}
              >
                <MapPin className="w-5 h-5" />
                {postLocation || t("provider.dashboard.locationLabel")}
              </button>
              <button className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors">
                <Tag className="w-5 h-5" />
                {t("provider.dashboard.tag")}
              </button>
            </div>

            {/* Location Display */}
            {postLocation && (
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <MapPin className="w-4 h-4 text-primary" />
                <span className="text-xs text-foreground">{postLocation}</span>
                <button onClick={() => setPostLocation("")} aria-label={t("common.removeItem")} className="ml-auto">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className="bg-gradient-to-br from-blue-600 to-blue-700 dark:from-blue-800 dark:to-blue-900 text-white p-6 rounded-b-3xl shadow-lg">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold mb-1">{t("provider.dashboard.welcomeBack", { name: dashboard?.name ?? "there" })}</h1>
              <p className="text-blue-100">{t("provider.dashboard.performanceOverview")}</p>
            </div>
            <Bell className="w-8 h-8 text-blue-100" />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 lg:px-8 py-8">
        {/* Content Creation */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <Card
            onClick={() => setShowCreatePost(true)}
            className="p-6 bg-gradient-to-br from-blue-500 to-blue-600 border-0 rounded-xl shadow-lg cursor-pointer hover:shadow-xl transition-shadow group"
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Camera className="w-7 h-7 text-white" />
              </div>
              <div>
                <h3 className="text-white font-bold text-base">{t("provider.dashboard.createPostCardTitle")}</h3>
                <p className="text-blue-100 text-xs">{t("provider.dashboard.createPostCardDesc")}</p>
              </div>
            </div>
          </Card>

          <Link href="/provider/profile/proof">
            <Card className="p-6 bg-gradient-to-br from-amber-500 to-orange-600 border-0 rounded-xl shadow-lg cursor-pointer hover:shadow-xl transition-shadow group h-full">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <ImageIcon className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-base">{t("provider.dashboard.shareWork")}</h3>
                  <p className="text-orange-100 text-xs">{t("provider.dashboard.shareWorkDesc")}</p>
                </div>
              </div>
            </Card>
          </Link>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {stats.map((stat, idx) => {
            const Icon = stat.icon
            return (
              <Card
                key={idx}
                className="p-6 bg-white dark:bg-gray-800 border-0 rounded-xl shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 dark:text-gray-400 text-xs font-medium">{stat.label}</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">{stat.value}</p>
                  </div>
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${stat.color}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                </div>
              </Card>
            )
          })}
        </div>

        {/* Alerts Section */}
        <div className="grid lg:grid-cols-3 gap-8 mb-8">
          <div className="lg:col-span-2">
            <Card className="bg-white dark:bg-gray-800 border-0 rounded-xl shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-orange-500" />
                    {t("provider.dashboard.pendingActionsTitle")}
                  </h2>
                </div>
              </div>
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {alerts.length === 0 ? (
                  <div className="p-6 text-center text-xs text-muted-foreground">{t("provider.dashboard.noAlerts")}</div>
                ) : alerts.map((alert, idx) => (
                  <div key={idx} className="p-6 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 dark:text-white">{alert.title}</h3>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{alert.service}</p>
                        <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mt-2">{alert.amount != null ? formatMoney(alert.amount) : t("provider.dashboard.pendingReview")}</p>
                      </div>
                      <Link href="/provider/jobs">
                        <Button
                          className={`${
                            alert.color === "orange" ? "bg-orange-500 hover:bg-orange-600" : "bg-red-500 hover:bg-red-600"
                          } text-white font-medium h-9 text-xs`}
                        >
                          {alert.action}
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Quick Actions */}
          <Card className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border-0 rounded-xl shadow-sm p-6">
            <h3 className="font-bold text-gray-900 dark:text-white mb-4">{t("provider.dashboard.quickActionsTitle")}</h3>
            <div className="space-y-3">
              <Button
                onClick={() => setShowCreatePost(true)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium h-10 justify-start gap-2"
              >
                <Camera className="w-4 h-4" />
                {t("provider.dashboard.createNewPost")}
              </Button>
              <Button
                onClick={() => setShowCreateStory(true)}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium h-10 justify-start gap-2"
              >
                <Layers className="w-4 h-4" />
                {t("provider.dashboard.createBeforeAfterStory")}
              </Button>
              <Link href="/provider/profile/proof">
                <Button
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white font-medium h-10 justify-start gap-2"
                >
                  <ImageIcon className="w-4 h-4" />
                  {t("provider.dashboard.shareWork")}
                </Button>
              </Link>
              <Button
                onClick={() => setShowEndorsementRequest(true)}
                className="w-full bg-amber-500 hover:bg-amber-600 text-white font-medium h-10 justify-start gap-2"
              >
                <Store className="w-4 h-4" />
                {t("provider.dashboard.requestShopEndorsement")}
              </Button>
              <Link href="/provider/jobs">
                <Button
                  variant="outline"
                  className="w-full border-2 border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 font-medium h-10 justify-start gap-2 bg-transparent"
                >
                  <TrendingUp className="w-4 h-4" />
                  {t("provider.dashboard.findNewJobs")}
                </Button>
              </Link>
            </div>
          </Card>

          {/* My Vibe Badges */}
          <Card className="bg-white dark:bg-gray-800 border-0 rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900 dark:text-white">{t("provider.dashboard.myVibeBadges")}</h3>
              <Award className="w-5 h-5 text-amber-500" />
            </div>
            <div className="space-y-3">
              {myBadges.map((badge) => (
                <div 
                  key={badge.key}
                  className={`flex items-center justify-between p-3 rounded-lg ${
                    badge.locked 
                      ? 'bg-gray-100 dark:bg-gray-700/50 opacity-60' 
                      : 'bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{badge.icon}</span>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white text-xs">{t(badge.labelKey)}</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        {badge.locked ? t("provider.dashboard.moreVotesNeeded", { count: (badge.needed ?? 0) - badge.votes }) : t("provider.dashboard.communityVotes", { count: badge.votes })}
                      </p>
                    </div>
                  </div>
                  {!badge.locked && (
                    <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                      <Sparkles className="w-4 h-4" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Onboarding Checklist */}
        <Card className="bg-white dark:bg-gray-800 border-0 rounded-xl shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-gray-900 dark:text-white">{t("provider.dashboard.getStartedChecklist")}</h2>
              <span className="text-[11px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-0.5 rounded-full font-medium">{t("provider.dashboard.stepsComplete", { done: onboardingDoneCount, total: onboardingSteps.length })}</span>
            </div>
            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-1">
              <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${onboardingPct}%` }} />
            </div>
            <p className="text-[10px] text-gray-500 dark:text-gray-400">{t("provider.dashboard.completeStepsHint")}</p>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {onboardingSteps.map((step, i) => (
              <Link key={i} href={step.href} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${step.done ? "bg-blue-600" : "border-2 border-gray-300 dark:border-gray-600"}`}>
                  {step.done && <CheckCircle2 className="w-4 h-4 text-white" />}
                </div>
                <span className={`text-xs flex-1 ${step.done ? "text-gray-500 dark:text-gray-400 line-through" : "text-gray-900 dark:text-white font-medium"}`}>{step.label}</span>
                {!step.done && <ChevronRight className="w-4 h-4 text-gray-400" />}
              </Link>
            ))}
          </div>
        </Card>

        {/* Recent Jobs */}
        <Card className="bg-white dark:bg-gray-800 border-0 rounded-xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t("provider.dashboard.recentJobsTitle")}</h2>
            <Link
              href="/provider/jobs"
              className="text-blue-600 dark:text-blue-400 hover:underline font-medium text-xs flex items-center gap-1"
            >
              {t("provider.dashboard.viewAll")} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">
                    {t("provider.dashboard.colJobTitle")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("provider.dashboard.colClient")}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("common.status")}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("provider.dashboard.colAmount")}</th>
                </tr>
              </thead>
              <tbody>
                {recentJobs.length === 0 ? (
                  <tr><td colSpan={4} className="px-6 py-8 text-center text-xs text-muted-foreground">{t("provider.dashboard.noJobsYet")}</td></tr>
                ) : recentJobs.map((job) => (
                  <tr
                    key={job.id}
                    className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <td className="px-6 py-4 text-gray-900 dark:text-white font-medium">{job.title}</td>
                    <td className="px-6 py-4 text-gray-600 dark:text-gray-400">{job.client}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-3 py-1 rounded-full text-[11px] font-semibold ${
                          job.status === "IN_PROGRESS" || job.status === "ACCEPTED"
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                            : job.status === "COMPLETED"
                              ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                              : "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
                        }`}
                      >
                        {job.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">{formatMoney(job.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Create Story Modal (Before/After or Timelapse) */}
      <Dialog open={showCreateStory} onOpenChange={setShowCreateStory}>
        <DialogContent className="max-w-lg p-0 bg-card overflow-hidden max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 z-10 bg-card border-b border-border p-4 flex items-center justify-between">
            <button onClick={() => setShowCreateStory(false)} aria-label={t("common.close")} className="p-2 hover:bg-muted rounded-full transition-colors">
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
            <h2 className="text-base font-semibold text-foreground">{t("provider.dashboard.createBeforeAfterTitle")}</h2>
            <Button
              disabled={!beforeImage || !afterImage || !storyTitle || isPostingStory || isCompressingBefore || isCompressingAfter}
              className="bg-purple-600 hover:bg-purple-700"
              onClick={async () => {
                setIsPostingStory(true)
                setStoryError("")
                const result = await createProviderStory({ beforeImage, afterImage, caption: storyTitle })
                setIsPostingStory(false)
                if (!result.success) { setStoryError(result.error); return }
                setShowCreateStory(false)
                setBeforeImage(null)
                setAfterImage(null)
                setStoryTitle("")
              }}
            >
              {isPostingStory ? <Loader2 className="w-4 h-4 animate-spin" /> : t("provider.dashboard.postAction")}
            </Button>
          </div>

          <div className="p-4 space-y-4">
            {storyError && <p className="text-xs text-red-600">{storyError}</p>}

            {/* Story Title */}
            <Input
              value={storyTitle}
              onChange={(e) => setStoryTitle(e.target.value)}
              placeholder={t("provider.dashboard.storyTitlePlaceholder")}
              className="border-border"
            />

            {/* Before/After Image Upload */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-medium mb-2 text-muted-foreground">{t("provider.dashboard.beforeLabel")}</p>
                <label className="block aspect-video rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-purple-500 cursor-pointer overflow-hidden transition-colors">
                  {isCompressingBefore ? (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                  ) : beforeImage ? (
                    <img src={beforeImage || "/placeholder.svg"} alt="Before" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                      <Camera className="w-8 h-8 mb-2" />
                      <span className="text-[11px]">{t("provider.dashboard.addPhoto")}</span>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      setStoryError("")
                      setIsCompressingBefore(true)
                      try {
                        setBeforeImage(await compressImageToDataUrl(file))
                      } catch {
                        setStoryError(t("provider.dashboard.photoProcessError"))
                      } finally {
                        setIsCompressingBefore(false)
                      }
                    }}
                  />
                </label>
              </div>
              <div>
                <p className="text-xs font-medium mb-2 text-muted-foreground">{t("provider.dashboard.afterLabel")}</p>
                <label className="block aspect-video rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-purple-500 cursor-pointer overflow-hidden transition-colors">
                  {isCompressingAfter ? (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                  ) : afterImage ? (
                    <img src={afterImage || "/placeholder.svg"} alt="After" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                      <Camera className="w-8 h-8 mb-2" />
                      <span className="text-[11px]">{t("provider.dashboard.addPhoto")}</span>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      setStoryError("")
                      setIsCompressingAfter(true)
                      try {
                        setAfterImage(await compressImageToDataUrl(file))
                      } catch {
                        setStoryError(t("provider.dashboard.photoProcessError"))
                      } finally {
                        setIsCompressingAfter(false)
                      }
                    }}
                  />
                </label>
              </div>
            </div>

            {/* Tips */}
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3">
              <p className="text-xs font-medium text-purple-800 dark:text-purple-200 mb-1">{t("provider.dashboard.tipsTitle")}</p>
              <ul className="text-[11px] text-purple-700 dark:text-purple-300 space-y-1">
                <li>- {t("provider.dashboard.tipSameAngle")}</li>
                <li>- {t("provider.dashboard.tipGoodLighting")}</li>
                <li>- {t("provider.dashboard.tipShowsOnHomePage")}</li>
              </ul>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Request Endorsement Modal */}
      <Dialog open={showEndorsementRequest} onOpenChange={setShowEndorsementRequest}>
        <DialogContent className="max-w-lg p-0 bg-card overflow-hidden max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 z-10 bg-card border-b border-border p-4 flex items-center justify-between">
            <button onClick={() => setShowEndorsementRequest(false)} aria-label={t("common.close")} className="p-2 hover:bg-muted rounded-full transition-colors">
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
            <h2 className="text-base font-semibold text-foreground">{t("provider.dashboard.requestEndorsementTitle")}</h2>
            <Button
              disabled={!endorsementShop || !endorsementMessage}
              className="bg-amber-500 hover:bg-amber-600"
              onClick={() => {
                alert(t("provider.dashboard.endorsementSentAlert"))
                setShowEndorsementRequest(false)
                setEndorsementShop("")
                setEndorsementMessage("")
              }}
            >
              {t("provider.dashboard.sendRequest")}
            </Button>
          </div>

          <div className="p-4 space-y-4">
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 mb-4">
              <div className="flex items-start gap-3">
                <Store className="w-5 h-5 text-amber-600 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-800 dark:text-amber-200">{t("provider.dashboard.shopkeeperEndorsementsTitle")}</p>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                    {t("provider.dashboard.shopkeeperEndorsementsDesc")}
                  </p>
                </div>
              </div>
            </div>

            {/* Select Shop */}
            <div>
              <p className="text-xs font-medium mb-2 text-foreground">{t("provider.dashboard.selectShopLabel")}</p>
              <div className="space-y-2">
                {nearbyShops.map((shop) => (
                  <button
                    key={shop.id}
                    onClick={() => setEndorsementShop(shop.name)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left ${
                      endorsementShop === shop.name 
                        ? "border-amber-500 bg-amber-50 dark:bg-amber-900/20" 
                        : "border-border hover:border-amber-300"
                    }`}
                  >
                    <img 
                      src={shop.avatar || "/placeholder.svg"} 
                      alt={shop.owner} 
                      className="w-10 h-10 rounded-full object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{shop.name}</p>
                      <p className="text-[11px] text-muted-foreground">{shop.owner} - {shop.location}</p>
                    </div>
                    <span className="text-[11px] px-2 py-1 bg-muted rounded-full">{shop.category}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Message to Shop Owner */}
            <div>
              <p className="text-xs font-medium mb-2 text-foreground">{t("provider.dashboard.messageToShopLabel")}</p>
              <Textarea
                value={endorsementMessage}
                onChange={(e) => setEndorsementMessage(e.target.value)}
                placeholder={t("provider.dashboard.endorsementMessagePlaceholder")}
                className="min-h-[100px] border-border"
              />
            </div>

            {/* What happens next */}
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-xs font-medium text-foreground mb-2">{t("provider.dashboard.whatHappensNextTitle")}</p>
              <ul className="text-[11px] text-muted-foreground space-y-1">
                <li className="flex items-center gap-2">
                  <ChevronRight className="w-3 h-3" />
                  {t("provider.dashboard.whatHappensNext1")}
                </li>
                <li className="flex items-center gap-2">
                  <ChevronRight className="w-3 h-3" />
                  {t("provider.dashboard.whatHappensNext2")}
                </li>
                <li className="flex items-center gap-2">
                  <ChevronRight className="w-3 h-3" />
                  {t("provider.dashboard.whatHappensNext3")}
                </li>
              </ul>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const sampleImages = [
  "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400&h=300&fit=crop",
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=400&h=300&fit=crop",
  "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=400&h=300&fit=crop",
  "https://images.unsplash.com/photo-1621905251189-0a1dd7228f2d?w=400&h=300&fit=crop",
]

// Nearby shops for endorsement requests
const nearbyShops = [
  { id: 1, name: "Hotpoint Kenya", owner: "James Mwangi", avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=50&h=50&fit=crop", location: "Westlands, Nairobi", category: "Electronics" },
  { id: 2, name: "Hardware Hub", owner: "Michael Otieno", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=50&h=50&fit=crop", location: "Parklands, Nairobi", category: "Hardware" },
  { id: 3, name: "Green Energy Solutions", owner: "Patrick Kamau", avatar: "https://images.unsplash.com/photo-15602500970b93528c311a?w=50&h=50&fit=crop", location: "Kilimani, Nairobi", category: "Solar & Energy" },
  { id: 4, name: "Kenya Tiles Center", owner: "Grace Njeri", avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=50&h=50&fit=crop", location: "Industrial Area", category: "Tiles & Flooring" }
]

// Vibe badges the provider has earned
const myBadges: { key: string; labelKey: TranslationKey; icon: string; votes: number; locked?: boolean; needed?: number }[] = [
  { key: "great-teacher", labelKey: "provider.dashboard.badgeGreatTeacher", icon: "📚", votes: 45 },
  { key: "fast-responder", labelKey: "provider.dashboard.badgeFastResponder", icon: "⚡", votes: 67 },
  { key: "local-legend", labelKey: "provider.dashboard.badgeLocalLegend", icon: "🏆", votes: 23, locked: true, needed: 50 },
]


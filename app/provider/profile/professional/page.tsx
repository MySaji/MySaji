"use client"

import { useEffect, useState } from "react"
import {
  ArrowLeft, Save, Loader2, Plus, X, Globe, MapPin, Shuffle,
  GraduationCap, Trophy, FileText, Star, ExternalLink,
} from "lucide-react"
import Link from "next/link"
import {
  getMyProfessionalProfile,
  updateMyProfessionalProfile,
  type EducationEntry,
  type AwardEntry,
} from "@/lib/actions/provider-professional-profile"

type WorkPreference = "REMOTE" | "ONSITE" | "HYBRID"

const WORK_PREFERENCES: { value: WorkPreference; label: string; hint: string; icon: typeof Globe }[] = [
  { value: "REMOTE", label: "Remote", hint: "You work entirely online", icon: Globe },
  { value: "ONSITE", label: "On-site", hint: "You travel to the customer", icon: MapPin },
  { value: "HYBRID", label: "Hybrid", hint: "Either, depending on the job", icon: Shuffle },
]

export default function ProfessionalProfilePage() {
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")

  const [headline, setHeadline] = useState("")
  const [bio, setBio] = useState("")
  const [yearsExperience, setYearsExperience] = useState("0")
  const [workPreference, setWorkPreference] = useState<WorkPreference>("ONSITE")
  const [languages, setLanguages] = useState<string[]>([])
  const [newLanguage, setNewLanguage] = useState("")
  const [education, setEducation] = useState<EducationEntry[]>([])
  const [awards, setAwards] = useState<AwardEntry[]>([])
  const [resumeUrl, setResumeUrl] = useState("")
  const [slug, setSlug] = useState<string | null>(null)

  const [stats, setStats] = useState({
    rating: 0, reviewCount: 0, completedJobs: 0,
    successRate: null as number | null, repeatCustomers: 0,
  })

  useEffect(() => {
    getMyProfessionalProfile()
      .then((data) => {
        if (!data) return
        setHeadline(data.headline)
        setBio(data.bio)
        setYearsExperience(String(data.yearsExperience))
        setWorkPreference(data.workPreference)
        setLanguages(data.languages)
        setEducation(data.education)
        setAwards(data.awards)
        setResumeUrl(data.resumeUrl)
        setSlug(data.slug)
        setStats({
          rating: data.rating, reviewCount: data.reviewCount, completedJobs: data.completedJobs,
          successRate: data.successRate, repeatCustomers: data.repeatCustomers,
        })
      })
      .finally(() => setIsLoading(false))
  }, [])

  const addLanguage = () => {
    const value = newLanguage.trim()
    if (!value) return
    if (!languages.some((l) => l.toLowerCase() === value.toLowerCase())) {
      setLanguages([...languages, value])
    }
    setNewLanguage("")
  }

  const handleSave = async () => {
    setIsSaving(true)
    setError("")
    const result = await updateMyProfessionalProfile({
      headline, bio,
      yearsExperience: Number(yearsExperience) || 0,
      languages, education, awards, resumeUrl, workPreference,
    })
    setIsSaving(false)
    if (result.success) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } else {
      setError(result.error)
    }
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
      <div className="bg-blue-600 dark:bg-blue-700 text-white p-4 rounded-b-2xl lg:rounded-none">
        <div className="flex items-center gap-4 max-w-4xl mx-auto">
          <Link href="/provider/profile" className="lg:hidden">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">Professional Profile</h1>
            <p className="text-sm text-blue-100">What customers see when they find you</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-4">
        {/* The public page this profile feeds. Providers had no way to see or
            share their own storefront before. */}
        {slug && (
          <a
            href={`/p/${slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-3 bg-white dark:bg-gray-800 rounded-xl p-4 border dark:border-gray-700 hover:border-blue-500 transition"
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium">Your public storefront</span>
              <span className="block truncate text-xs text-gray-500 font-mono">/p/{slug}</span>
            </span>
            <ExternalLink className="w-4 h-4 shrink-0 text-gray-400" aria-hidden="true" />
          </a>
        )}
        {/* Social proof — read-only, so the provider sees what customers see. */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border dark:border-gray-700">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div>
              <div className="flex items-center justify-center gap-1 text-lg font-bold">
                <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                {stats.reviewCount > 0 ? stats.rating.toFixed(1) : "—"}
              </div>
              <p className="text-xs text-gray-500">
                {stats.reviewCount} review{stats.reviewCount === 1 ? "" : "s"}
              </p>
            </div>
            <div>
              <div className="text-lg font-bold">{stats.completedJobs}</div>
              <p className="text-xs text-gray-500">Jobs completed</p>
            </div>
            <div>
              <div className="text-lg font-bold">
                {stats.successRate === null ? "—" : `${stats.successRate}%`}
              </div>
              <p className="text-xs text-gray-500">Success rate</p>
            </div>
            <div>
              <div className="text-lg font-bold">{stats.repeatCustomers}</div>
              <p className="text-xs text-gray-500">Repeat customers</p>
            </div>
          </div>
        </div>

        {/* Identity */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border dark:border-gray-700 space-y-4">
          <h2 className="font-semibold">Who you are</h2>

          <div>
            <label htmlFor="headline" className="block text-sm font-medium mb-1">Professional headline</label>
            <input
              id="headline"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              maxLength={160}
              placeholder="Full-stack engineer · React and Go"
              className="w-full rounded-lg border px-3 py-2 dark:bg-gray-900 dark:border-gray-600"
            />
            <p className="text-xs text-gray-500 mt-1">{headline.length}/160</p>
          </div>

          <div>
            <label htmlFor="bio" className="block text-sm font-medium mb-1">About</label>
            <textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={5}
              maxLength={2000}
              placeholder="What you do, who you do it for, and what makes your work worth paying for."
              className="w-full rounded-lg border px-3 py-2 dark:bg-gray-900 dark:border-gray-600"
            />
            <p className="text-xs text-gray-500 mt-1">{bio.length}/2000</p>
          </div>

          <div>
            <label htmlFor="years" className="block text-sm font-medium mb-1">Years of experience</label>
            <input
              id="years"
              type="number"
              min={0}
              max={70}
              value={yearsExperience}
              onChange={(e) => setYearsExperience(e.target.value)}
              className="w-32 rounded-lg border px-3 py-2 dark:bg-gray-900 dark:border-gray-600"
            />
          </div>
        </div>

        {/* Work preference */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border dark:border-gray-700">
          <h2 className="font-semibold">How you work</h2>
          <p className="text-sm text-gray-500 mb-3">
            Customers filter on this. Choosing Remote means you reach people outside your area.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {WORK_PREFERENCES.map((option) => {
              const Icon = option.icon
              const active = workPreference === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setWorkPreference(option.value)}
                  aria-pressed={active}
                  className={`rounded-lg border p-3 text-left transition ${
                    active
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "hover:border-gray-400 dark:border-gray-600"
                  }`}
                >
                  <Icon className="w-5 h-5 mb-2" />
                  <div className="font-medium">{option.label}</div>
                  <div className={`text-xs ${active ? "text-blue-100" : "text-gray-500"}`}>{option.hint}</div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Languages */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border dark:border-gray-700">
          <h2 className="font-semibold mb-3">Languages</h2>
          <div className="flex flex-wrap gap-2 mb-3">
            {languages.length === 0 ? (
              <p className="text-sm text-gray-500">None added yet.</p>
            ) : (
              languages.map((language) => (
                <span key={language} className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-700 px-3 py-1 text-sm">
                  {language}
                  <button
                    type="button"
                    onClick={() => setLanguages(languages.filter((l) => l !== language))}
                    aria-label={`Remove ${language}`}
                    className="rounded-full p-0.5 hover:bg-gray-300 dark:hover:bg-gray-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))
            )}
          </div>
          <div className="flex gap-2">
            <input
              value={newLanguage}
              onChange={(e) => setNewLanguage(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLanguage() } }}
              placeholder="English"
              aria-label="Add a language"
              className="flex-1 rounded-lg border px-3 py-2 dark:bg-gray-900 dark:border-gray-600"
            />
            <button type="button" onClick={addLanguage} className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700">
              Add
            </button>
          </div>
        </div>

        {/* Education */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border dark:border-gray-700">
          <h2 className="font-semibold flex items-center gap-2 mb-3">
            <GraduationCap className="w-4 h-4" /> Education
          </h2>
          <div className="space-y-3 mb-3">
            {education.map((entry, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_6rem_auto]">
                <input
                  value={entry.institution}
                  onChange={(e) => setEducation(education.map((x, i) => i === index ? { ...x, institution: e.target.value } : x))}
                  placeholder="Institution"
                  aria-label="Institution"
                  className="rounded-lg border px-3 py-2 dark:bg-gray-900 dark:border-gray-600"
                />
                <input
                  value={entry.qualification}
                  onChange={(e) => setEducation(education.map((x, i) => i === index ? { ...x, qualification: e.target.value } : x))}
                  placeholder="Qualification"
                  aria-label="Qualification"
                  className="rounded-lg border px-3 py-2 dark:bg-gray-900 dark:border-gray-600"
                />
                <input
                  value={entry.year}
                  onChange={(e) => setEducation(education.map((x, i) => i === index ? { ...x, year: e.target.value } : x))}
                  placeholder="Year"
                  aria-label="Year"
                  className="rounded-lg border px-3 py-2 dark:bg-gray-900 dark:border-gray-600"
                />
                <button
                  type="button"
                  onClick={() => setEducation(education.filter((_, i) => i !== index))}
                  aria-label="Remove entry"
                  className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          {education.length < 10 && (
            <button
              type="button"
              onClick={() => setEducation([...education, { institution: "", qualification: "", year: "" }])}
              className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
            >
              <Plus className="w-4 h-4" /> Add education
            </button>
          )}
        </div>

        {/* Awards */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border dark:border-gray-700">
          <h2 className="font-semibold flex items-center gap-2 mb-3">
            <Trophy className="w-4 h-4" /> Awards &amp; recognition
          </h2>
          <div className="space-y-3 mb-3">
            {awards.map((entry, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_6rem_auto]">
                <input
                  value={entry.title}
                  onChange={(e) => setAwards(awards.map((x, i) => i === index ? { ...x, title: e.target.value } : x))}
                  placeholder="Award"
                  aria-label="Award"
                  className="rounded-lg border px-3 py-2 dark:bg-gray-900 dark:border-gray-600"
                />
                <input
                  value={entry.issuer}
                  onChange={(e) => setAwards(awards.map((x, i) => i === index ? { ...x, issuer: e.target.value } : x))}
                  placeholder="Issued by"
                  aria-label="Issued by"
                  className="rounded-lg border px-3 py-2 dark:bg-gray-900 dark:border-gray-600"
                />
                <input
                  value={entry.year}
                  onChange={(e) => setAwards(awards.map((x, i) => i === index ? { ...x, year: e.target.value } : x))}
                  placeholder="Year"
                  aria-label="Year"
                  className="rounded-lg border px-3 py-2 dark:bg-gray-900 dark:border-gray-600"
                />
                <button
                  type="button"
                  onClick={() => setAwards(awards.filter((_, i) => i !== index))}
                  aria-label="Remove award"
                  className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          {awards.length < 10 && (
            <button
              type="button"
              onClick={() => setAwards([...awards, { title: "", issuer: "", year: "" }])}
              className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
            >
              <Plus className="w-4 h-4" /> Add award
            </button>
          )}
        </div>

        {/* CV */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border dark:border-gray-700">
          <h2 className="font-semibold flex items-center gap-2 mb-1">
            <FileText className="w-4 h-4" /> Resume / CV
          </h2>
          <p className="text-sm text-gray-500 mb-3">A link to your CV — Drive, Dropbox, or your own site.</p>
          <input
            value={resumeUrl}
            onChange={(e) => setResumeUrl(e.target.value)}
            type="url"
            inputMode="url"
            placeholder="https://"
            aria-label="Resume or CV link"
            className="w-full rounded-lg border px-3 py-2 dark:bg-gray-900 dark:border-gray-600"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600">{error}</p>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 font-medium text-white disabled:opacity-50 hover:bg-blue-700"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {isSaving ? "Saving…" : saved ? "Saved" : "Save profile"}
        </button>
      </div>
    </div>
  )
}

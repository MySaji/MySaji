import { pageMetadata } from "@/frontend/lib/seo"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { getStorefront } from "@/backend/actions/storefront"
import StorefrontTabs from "./storefront-tabs"
import { BadgeCheck, Globe, MapPin, Shuffle, Star, Clock, FileText } from "lucide-react"

/**
 * Public provider storefront. Server-rendered and unauthenticated — this is
 * what a shared link opens.
 */

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const data = await getStorefront(decodeURIComponent(slug))
  if (!data) return { title: "Provider not found · SAJI" }

  const name = data.businessName || data.name
  return pageMetadata(`/p/${encodeURIComponent(data.slug)}`, name, data.bio?.slice(0, 160) || `${name} on MySaji`)

}

const WORK_PREFERENCE = {
  REMOTE: { label: "Works remotely", icon: Globe },
  ONSITE: { label: "Works on-site", icon: MapPin },
  HYBRID: { label: "Remote or on-site", icon: Shuffle },
} as const

export default async function StorefrontPage({ params }: Props) {
  const { slug } = await params
  const data = await getStorefront(decodeURIComponent(slug))
  if (!data) notFound()

  const displayName = data.businessName || data.name
  const preference = WORK_PREFERENCE[data.workPreference]
  const PreferenceIcon = preference.icon

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* ---- Overview ---- */}
      <header className="bg-white dark:bg-gray-800 border-b dark:border-gray-700">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
          {/* Avatar beside the name on every width. Stacking them on mobile
              spent a full 96px band on the photo alone and pushed the provider's
              name, rating and stats below the fold on a small phone. */}
          <div className="flex items-start gap-4 sm:gap-5">
            {data.avatar ? (
              // Images use the configured unoptimized rendering policy
              <img
                src={data.avatar}
                alt=""
                className="h-16 w-16 flex-shrink-0 rounded-2xl border object-cover dark:border-gray-700 sm:h-24 sm:w-24"
              />
            ) : (
              <div
                aria-hidden="true"
                className="grid h-16 w-16 flex-shrink-0 place-items-center rounded-2xl bg-blue-600 text-2xl font-bold text-white sm:h-24 sm:w-24 sm:text-3xl"
              >
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold sm:text-2xl">{displayName}</h1>
                {data.verified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-900/40 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
                    <BadgeCheck className="w-3.5 h-3.5" aria-hidden="true" />
                    Verified
                  </span>
                )}
                {data.isBusinessOwner && (
                  <span className="rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs font-medium">
                    Business
                  </span>
                )}
              </div>

              {data.headline && (
                <p className="mt-1 text-gray-600 dark:text-gray-300">{data.headline}</p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
                <span className="inline-flex items-center gap-1">
                  <PreferenceIcon className="w-4 h-4" aria-hidden="true" />
                  {preference.label}
                </span>
                {data.location && data.workPreference !== "REMOTE" && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-4 h-4" aria-hidden="true" />
                    {data.location}
                  </span>
                )}
                {data.yearsExperience > 0 && (
                  <span>{data.yearsExperience} year{data.yearsExperience === 1 ? "" : "s"} experience</span>
                )}
                {data.responseTimeMinutes != null && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-4 h-4" aria-hidden="true" />
                    Replies in ~{data.responseTimeMinutes} min
                  </span>
                )}
              </div>

              {data.languages.length > 0 && (
                <p className="mt-2 text-sm text-gray-500">
                  Speaks {data.languages.join(", ")}
                </p>
              )}
            </div>
          </div>

          {/* Social proof */}
          <div className="mt-5 grid grid-cols-2 gap-2.5 sm:mt-6 sm:grid-cols-4 sm:gap-3">
            <Stat
              value={data.reviewCount > 0 ? data.rating.toFixed(1) : "—"}
              label={`${data.reviewCount} review${data.reviewCount === 1 ? "" : "s"}`}
              star
            />
            <Stat value={String(data.completedJobs)} label="Jobs completed" />
            <Stat
              value={data.successRate === null ? "—" : `${data.successRate}%`}
              label="Success rate"
            />
            <Stat value={String(data.repeatCustomers)} label="Repeat customers" />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {data.bio && (
          <section className="bg-white dark:bg-gray-800 rounded-xl p-5 border dark:border-gray-700 mb-4">
            <h2 className="font-semibold mb-2">About</h2>
            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-line">{data.bio}</p>

            {data.resumeUrl && (
              <a
                href={data.resumeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline"
              >
                <FileText className="w-4 h-4" aria-hidden="true" />
                View CV
              </a>
            )}
          </section>
        )}

        {/* Tabs render only when they have content — a translator with no
            products never sees an empty Products tab. */}
        <StorefrontTabs data={data} />
      </main>
    </div>
  )
}

function Stat({ value, label, star = false }: { value: string; label: string; star?: boolean }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 text-center border dark:border-gray-700">
      <div className="flex items-center justify-center gap-1 text-lg font-bold">
        {star && <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" aria-hidden="true" />}
        {value}
      </div>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}

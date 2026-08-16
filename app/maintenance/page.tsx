import { redirect } from "next/navigation"
import { Wrench, Mail } from "lucide-react"
import { isMaintenanceModeActive, getPublicSiteSettings } from "@/lib/actions/admin-settings"

export default async function MaintenancePage() {
  const [active, { logoUrl, supportEmail }] = await Promise.all([
    isMaintenanceModeActive(),
    getPublicSiteSettings(),
  ])

  // Middleware is what actually enforces the redirect here — this only
  // guards against someone bookmarking /maintenance and landing on a stale
  // "down for maintenance" page after an admin has already turned it back off.
  if (!active) redirect("/")

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="Logo" className="h-12 mx-auto object-contain" />
        ) : null}
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
          <Wrench className="w-8 h-8 text-primary" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">We&apos;ll be right back</h1>
          <p className="text-muted-foreground leading-relaxed">
            SAJI is currently undergoing scheduled maintenance. We&apos;re working to get things back up and running — please check back shortly.
          </p>
        </div>
        {supportEmail && (
          <a
            href={`mailto:${supportEmail}`}
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <Mail className="w-4 h-4" /> {supportEmail}
          </a>
        )}
      </div>
    </div>
  )
}

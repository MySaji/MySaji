"use client"

import { useEffect, useState } from "react"
import { Truck, Loader2, CheckCircle2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getMyDriverProfile, registerAsDriver, setDriverAvailability, type DriverProfileData } from "@/lib/actions/driver-profile"

export default function DriverProfilePage() {
  const [profile, setProfile] = useState<DriverProfileData>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [form, setForm] = useState({ vehicleType: "", licensePlate: "", licenseNumber: "" })
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState("")

  const refresh = () => getMyDriverProfile().then(setProfile)

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const handleRegister = async () => {
    setIsSaving(true)
    setError("")
    const result = await registerAsDriver(form)
    setIsSaving(false)
    if (!result.success) { setError(result.error); return }
    await refresh()
  }

  const handleToggleAvailable = async (isAvailable: boolean) => {
    await setDriverAvailability(isAvailable)
    await refresh()
  }

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  }

  return (
    <div className="p-4 lg:p-6 max-w-md mx-auto space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-foreground"><Truck className="h-6 w-6" /> Driver Profile</h1>
        <p className="mt-1 text-xs text-muted-foreground">Add delivery-driver details to your account.</p>
      </div>

      {profile ? (
        <Card className="border-0 p-5 shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-emerald-600"><CheckCircle2 className="h-4 w-4" /><p className="text-xs font-medium">Registered as a driver</p></div>
          <div className="space-y-1 text-xs text-foreground">
            <p>Vehicle: {profile.vehicleType}</p>
            <p>Plate: {profile.licensePlate}</p>
            <p>License #: {profile.licenseNumber}</p>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border/70 p-3">
            <span className="text-xs text-foreground">Available for deliveries</span>
            <Button size="sm" variant={profile.isAvailable ? "default" : "outline"} className={profile.isAvailable ? "" : "bg-transparent"} onClick={() => handleToggleAvailable(!profile.isAvailable)}>
              {profile.isAvailable ? "Available" : "Unavailable"}
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="border-0 p-5 shadow-sm space-y-4">
          <Input value={form.vehicleType} onChange={(e) => setForm((p) => ({ ...p, vehicleType: e.target.value }))} placeholder="Vehicle type (e.g. Motorbike, Van)" />
          <Input value={form.licensePlate} onChange={(e) => setForm((p) => ({ ...p, licensePlate: e.target.value }))} placeholder="License plate" />
          <Input value={form.licenseNumber} onChange={(e) => setForm((p) => ({ ...p, licenseNumber: e.target.value }))} placeholder="Driving license number" />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <Button className="w-full rounded-xl" onClick={handleRegister} disabled={isSaving || !form.vehicleType || !form.licensePlate || !form.licenseNumber}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Register as Driver"}
          </Button>
        </Card>
      )}
    </div>
  )
}

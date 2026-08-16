"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Upload, Plus, Trash2, CheckCircle, AlertCircle } from "lucide-react"

interface ProviderProfileFormProps {
  provider: {
    id: string
    fullName: string
    email: string
  }
}

export function ProviderProfileForm({ provider }: ProviderProfileFormProps) {
  const [formData, setFormData] = useState({
    fullName: provider.fullName,
    email: provider.email,
    phone: "",
    bio: "",
    serviceCategory: "",
    yearsExperience: "",
    certifications: [] as string[],
    photos: [] as string[],
    bankAccount: "",
    mpesaNumber: "",
  })

  const [verificationStatus] = useState({
    identity: "pending",
    experience: "verified",
    bankDetails: "pending",
  })

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const getVerificationColor = (status: string) => {
    switch (status) {
      case "verified":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
      case "pending":
        return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100"
      case "rejected":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100"
      default:
        return ""
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold text-foreground mb-2">Your Profile</h1>
        <p className="text-muted-foreground">Complete your profile to get more job offers and build trust</p>
      </div>

      <Tabs defaultValue="basic" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="basic">Basic Info</TabsTrigger>
          <TabsTrigger value="verification">Verification</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
        </TabsList>

        {/* Basic Information Tab */}
        <TabsContent value="basic" className="space-y-6">
          <Card className="p-6 space-y-6">
            <h3 className="font-semibold text-foreground text-lg">Personal Information</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input
                  value={formData.fullName}
                  onChange={(e) => handleChange("fullName", e.target.value)}
                  className="rounded-lg border-2 border-border focus-visible:border-primary h-11"
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.email}
                  disabled
                  className="rounded-lg border-2 border-border h-11 bg-muted"
                />
              </div>
              <div className="space-y-2">
                <Label>Phone Number</Label>
                <Input
                  placeholder="+254 700 000 000"
                  value={formData.phone}
                  onChange={(e) => handleChange("phone", e.target.value)}
                  className="rounded-lg border-2 border-border focus-visible:border-primary h-11"
                />
              </div>
              <div className="space-y-2">
                <Label>Service Category</Label>
                <Select
                  value={formData.serviceCategory}
                  onValueChange={(value) => handleChange("serviceCategory", value)}
                >
                  <SelectTrigger className="h-11 rounded-lg border-2 border-border">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="skilled">Skilled Service</SelectItem>
                    <SelectItem value="semi-skilled">Semi-Skilled Service</SelectItem>
                    <SelectItem value="non-skilled">Non-Skilled Service</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Bio</Label>
              <Textarea
                placeholder="Tell customers about your experience and services..."
                value={formData.bio}
                onChange={(e) => handleChange("bio", e.target.value)}
                className="rounded-lg border-2 border-border focus-visible:border-primary min-h-24"
              />
            </div>

            <Button className="rounded-lg bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-semibold">
              Save Changes
            </Button>
          </Card>
        </TabsContent>

        {/* Verification Tab */}
        <TabsContent value="verification" className="space-y-6">
          <Card className="p-6 space-y-6">
            <h3 className="font-semibold text-foreground text-lg">Verification Status</h3>

            <div className="space-y-4">
              {[
                { label: "Identity Verification", status: verificationStatus.identity, icon: "🪪" },
                { label: "Experience Validation", status: verificationStatus.experience, icon: "📋" },
                { label: "Bank Details", status: verificationStatus.bankDetails, icon: "🏦" },
              ].map((item, idx) => (
                <Card key={idx} className="p-4 border-2 border-border">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{item.icon}</span>
                      <div>
                        <p className="font-semibold text-foreground">{item.label}</p>
                        <Badge className={getVerificationColor(item.status)}>
                          {item.status === "verified" && <CheckCircle className="w-3 h-3 mr-1" />}
                          {item.status === "pending" && <AlertCircle className="w-3 h-3 mr-1" />}
                          {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                        </Badge>
                      </div>
                    </div>
                    {item.status !== "verified" && (
                      <Button size="sm" className="rounded-lg bg-primary text-primary-foreground">
                        Upload
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </Card>
        </TabsContent>

        {/* Payments Tab */}
        <TabsContent value="payments" className="space-y-6">
          <Card className="p-6 space-y-6">
            <h3 className="font-semibold text-foreground text-lg">Payment Methods</h3>

            <div className="space-y-6">
              <div className="space-y-2">
                <Label>M-Pesa Number</Label>
                <Input
                  placeholder="+254 700 000 000"
                  value={formData.mpesaNumber}
                  onChange={(e) => handleChange("mpesaNumber", e.target.value)}
                  className="rounded-lg border-2 border-border focus-visible:border-primary h-11"
                />
                <p className="text-xs text-muted-foreground">Payments will be sent to this M-Pesa account</p>
              </div>

              <div className="space-y-2">
                <Label>Bank Account Number</Label>
                <Input
                  placeholder="Enter your bank account"
                  value={formData.bankAccount}
                  onChange={(e) => handleChange("bankAccount", e.target.value)}
                  className="rounded-lg border-2 border-border focus-visible:border-primary h-11"
                />
                <p className="text-xs text-muted-foreground">Optional: Add bank details for larger transactions</p>
              </div>

              <Button className="rounded-lg bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-semibold">
                Update Payment Methods
              </Button>
            </div>
          </Card>
        </TabsContent>

        {/* Portfolio Tab */}
        <TabsContent value="portfolio" className="space-y-6">
          <Card className="p-6 space-y-6">
            <h3 className="font-semibold text-foreground text-lg">Portfolio & Certifications</h3>

            <div className="space-y-6">
              {/* Certifications */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <Label className="text-base">Certifications</Label>
                  <Button size="sm" variant="outline" className="gap-2 border-2 bg-transparent rounded-lg">
                    <Plus className="w-4 h-4" />
                    Add Certification
                  </Button>
                </div>

                <div className="space-y-2">
                  {formData.certifications.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-4 text-center border-2 border-dashed border-border rounded-lg">
                      No certifications added yet
                    </p>
                  ) : (
                    formData.certifications.map((cert, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-3 border-2 border-border rounded-lg"
                      >
                        <span className="text-foreground">{cert}</span>
                        <Button size="sm" variant="ghost" className="text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Portfolio Photos */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <Label className="text-base">Portfolio Photos</Label>
                </div>

                <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer">
                  <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm font-semibold text-foreground mb-1">Upload Portfolio Photos</p>
                  <p className="text-xs text-muted-foreground">Show examples of your best work</p>
                </div>
              </div>

              <Button className="rounded-lg bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-semibold w-full">
                Save Portfolio
              </Button>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

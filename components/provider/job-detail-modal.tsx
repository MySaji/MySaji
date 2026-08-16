"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Calendar, DollarSign, MessageSquare, CheckCircle, Upload, FileText, ImageIcon, Phone } from "lucide-react"
import { useState } from "react"

interface Job {
  id: number
  title: string
  customer: string
  status: string
  date: string
  amount: number
  rating: number | null
  progress: number
}

interface JobDetailModalProps {
  job: Job
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}

export function JobDetailModal({ job, isOpen, onOpenChange }: JobDetailModalProps) {
  const [proofFiles, setProofFiles] = useState<string[]>([])
  const [description, setDescription] = useState("")

  const statusConfig = {
    "in-progress": {
      color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100",
      label: "In Progress",
    },
    "awaiting-confirmation": {
      color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100",
      label: "Awaiting Confirmation",
    },
    completed: {
      color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
      label: "Completed",
    },
  }

  const status = statusConfig[job.status as keyof typeof statusConfig]

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{job.title}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="proof">Proof of Work</TabsTrigger>
            <TabsTrigger value="messages">Messages</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            {/* Job Info */}
            <Card className="p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-foreground mb-2">Job Details</h3>
                  <Badge className={status.color}>{status.label}</Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Job Date</p>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span className="font-semibold text-foreground">{job.date}</span>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Amount</p>
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-primary" />
                    <span className="font-semibold text-foreground">KES {job.amount.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Customer Info */}
            <Card className="p-6 space-y-4">
              <h3 className="font-semibold text-foreground">Customer Information</h3>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Name</p>
                  <p className="font-semibold text-foreground">{job.customer}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="gap-2 rounded-lg bg-primary text-primary-foreground">
                    <Phone className="w-4 h-4" />
                    Call Customer
                  </Button>
                  <Button size="sm" variant="outline" className="gap-2 rounded-lg border-2 bg-transparent">
                    <MessageSquare className="w-4 h-4" />
                    Message
                  </Button>
                </div>
              </div>
            </Card>

            {/* Progress */}
            <Card className="p-6">
              <h3 className="font-semibold text-foreground mb-4">Progress</h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Overall completion</span>
                  <span className="font-semibold text-foreground">{job.progress}%</span>
                </div>
                <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-secondary"
                    style={{ width: `${job.progress}%` }}
                  />
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* Proof of Work Tab */}
          <TabsContent value="proof" className="space-y-4">
            {job.status === "completed" ? (
              <Card className="p-6 text-center">
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                <p className="font-semibold text-foreground mb-2">Work Completed</p>
                <p className="text-sm text-muted-foreground">All proof of work has been submitted and verified</p>
              </Card>
            ) : (
              <Card className="p-6 space-y-6">
                <div>
                  <h3 className="font-semibold text-foreground mb-4">Submit Proof of Work</h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    Upload photos, documents, or videos showing the completed work.
                  </p>

                  {/* File Upload */}
                  <div className="space-y-4 mb-6">
                    {/* Photo Upload */}
                    <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors cursor-pointer">
                      <ImageIcon className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm font-semibold text-foreground mb-1">Add Photos</p>
                      <p className="text-xs text-muted-foreground">Click to upload before/after photos</p>
                    </div>

                    {/* Document Upload */}
                    <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors cursor-pointer">
                      <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm font-semibold text-foreground mb-1">Add Documents</p>
                      <p className="text-xs text-muted-foreground">Upload certificates, reports, or invoices</p>
                    </div>
                  </div>

                  {/* Description */}
                  <div className="space-y-2 mb-6">
                    <label className="text-sm font-medium text-foreground">Work Description</label>
                    <Textarea
                      placeholder="Describe the work completed, any challenges faced, and how you resolved them..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="rounded-lg border-2 border-border focus-visible:border-primary min-h-32"
                    />
                  </div>

                  {/* Submit Button */}
                  <Button className="w-full rounded-lg bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-semibold gap-2">
                    <Upload className="w-4 h-4" />
                    Submit Proof of Work
                  </Button>
                </div>
              </Card>
            )}
          </TabsContent>

          {/* Messages Tab */}
          <TabsContent value="messages" className="space-y-4">
            <Card className="p-6">
              <div className="space-y-4 mb-6 max-h-64 overflow-y-auto">
                {/* Sample messages */}
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg p-3 max-w-xs">
                    <p className="text-sm text-muted-foreground">Customer - 2 hours ago</p>
                    <p className="text-foreground">When will you start the work?</p>
                  </div>
                </div>

                <div className="flex justify-end">
                  <div className="bg-primary text-primary-foreground rounded-lg p-3 max-w-xs">
                    <p className="text-sm text-primary-foreground/80">You - 1 hour ago</p>
                    <p>I'll start tomorrow morning at 9 AM</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Textarea
                  placeholder="Type your message..."
                  className="rounded-lg border-2 border-border focus-visible:border-primary min-h-12"
                />
                <Button className="rounded-lg bg-primary text-primary-foreground px-6">Send</Button>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

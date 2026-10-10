// Core type definitions for SAJI marketplace
export type UserRole = "customer" | "provider" | "shopkeeper" | "distributor" | "admin" | "sub-admin" | "secretary" | "agent"

export interface User {
  id: string
  name: string
  email: string
  phone: string
  role: UserRole
  avatar?: string
  createdAt: string
  kycStatus?: "pending" | "approved" | "rejected"
  teamRole?: "sub-admin" | "secretary" | "agent"
}

export interface CustomerProfile extends User {
  role: "customer"
  location?: string
  savedProviders?: string[]
}

export interface ProviderProfile extends User {
  role: "provider"
  bio: string
  category: string
  rating: number
  reviewCount: number
  completedJobs: number
  hourlyRate?: number
  responseTime?: string
  portfolio?: PortfolioItem[]
  services?: Service[]
  verified: boolean
}

export interface AdminProfile extends User {
  role: "admin"
  permissions: string[]
}

export interface Service {
  id: string
  providerId: string
  title: string
  description: string
  category: string
  skillLevel: "skilled" | "semi-skilled" | "non-skilled"
  basePrice: number
  currency: string
  rating?: number
  image?: string
  packages?: ServicePackage[]
}

export interface ServicePackage {
  id: string
  name: string
  description: string
  price: number
  duration?: string
  features: string[]
}

export interface PortfolioItem {
  id: string
  title: string
  description: string
  image: string
  category: string
  date: string
}

export interface Job {
  id: string
  customerId: string
  providerId: string
  serviceId: string
  title: string
  description: string
  status: "pending" | "accepted" | "in-progress" | "completed" | "cancelled"
  price: number
  currency: string
  scheduledDate: string
  location: string
  createdAt: string
}

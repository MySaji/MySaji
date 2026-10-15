-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CUSTOMER', 'PROVIDER', 'SHOPKEEPER', 'DISTRIBUTOR', 'AGENT', 'SECRETARY', 'SUB_ADMIN', 'ADMIN');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('BASIC', 'PENDING', 'VERIFIED', 'PREMIUM_VERIFIED');

-- CreateEnum
CREATE TYPE "ServiceApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "KycDocumentType" AS ENUM ('NATIONAL_ID', 'PASSPORT', 'DRIVERS_LICENSE', 'BUSINESS_PERMIT');

-- CreateEnum
CREATE TYPE "SkillLevel" AS ENUM ('SKILLED', 'SEMI_SKILLED', 'NON_SKILLED');

-- CreateEnum
CREATE TYPE "CategoryType" AS ENUM ('SERVICE', 'PRODUCT');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'DISPUTED', 'PENDING_PAYMENT');

-- CreateEnum
CREATE TYPE "JobUrgency" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "AddressType" AS ENUM ('HOME', 'OFFICE', 'OTHER');

-- CreateEnum
CREATE TYPE "WishlistTargetType" AS ENUM ('PROVIDER', 'SERVICE', 'PRODUCT', 'SHOP');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethodType" AS ENUM ('MPESA', 'CARD', 'BANK', 'PAYPAL');

-- CreateEnum
CREATE TYPE "PaymentContextType" AS ENUM ('JOB', 'ORDER', 'SUBSCRIPTION', 'WALLET_TOPUP', 'WHOLESALE_ORDER', 'RENTAL');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('CREDIT', 'DEBIT', 'REFUND', 'COMMISSION', 'PAYOUT', 'ESCROW_HOLD', 'ESCROW_RELEASE');

-- CreateEnum
CREATE TYPE "LoyaltyTransactionType" AS ENUM ('EARN', 'REDEEM', 'ADJUST');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REVERSED');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REJECTED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'IMAGE', 'FILE', 'VOICE', 'LOCATION');

-- CreateEnum
CREATE TYPE "ChatTheme" AS ENUM ('CLASSIC', 'AURORA', 'MIDNIGHT', 'SUNSET');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('JOB', 'MESSAGE', 'PAYMENT', 'REVIEW', 'SYSTEM', 'PROMO', 'ANNOUNCEMENT');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'ESCALATED', 'CLOSED');

-- CreateEnum
CREATE TYPE "DisputeSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "CommissionRole" AS ENUM ('PROVIDER', 'SHOPKEEPER', 'AGENT', 'DISTRIBUTOR');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "AnnouncementAudience" AS ENUM ('ALL', 'PROVIDERS', 'SHOPKEEPERS', 'DISTRIBUTORS', 'CUSTOMERS', 'AGENTS', 'INTERNAL_TEAM');

-- CreateEnum
CREATE TYPE "AnnouncementType" AS ENUM ('MAINTENANCE', 'POLICY', 'PROMO', 'INTERNAL', 'GENERAL');

-- CreateEnum
CREATE TYPE "AnnouncementStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENT');

-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('POST', 'POST_COMMENT', 'REVIEW', 'MESSAGE', 'USER');

-- CreateEnum
CREATE TYPE "ReportSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'APPROVED', 'REMOVED');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('CLEAR', 'UNDER_REVIEW', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "ViolationKind" AS ENUM ('CONTACT_DETAILS', 'OFF_PLATFORM_PAYMENT', 'PRICE_MANIPULATION');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('PENDING', 'RECONCILED', 'UNDER_REVIEW');

-- CreateEnum
CREATE TYPE "TaxReportType" AS ENUM ('MONTHLY_VAT', 'QUARTERLY', 'ANNUAL', 'PAYE');

-- CreateEnum
CREATE TYPE "TaxReportStatus" AS ENUM ('DRAFT', 'FILED', 'PENDING', 'OVERDUE');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'ACTIVATED', 'REWARDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PromotionType" AS ENUM ('PERCENTAGE', 'FIXED', 'BOGO');

-- CreateEnum
CREATE TYPE "PromotionStatus" AS ENUM ('ACTIVE', 'SCHEDULED', 'EXPIRED', 'PAUSED');

-- CreateEnum
CREATE TYPE "LocationSource" AS ENUM ('GPS', 'ADDRESS', 'IP');

-- CreateEnum
CREATE TYPE "WorkPreference" AS ENUM ('REMOTE', 'ONSITE', 'HYBRID');

-- CreateEnum
CREATE TYPE "OfferActionType" AS ENUM ('BOOK', 'HIRE', 'BUY', 'QUOTE', 'REQUEST', 'RENT');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'LIVE');

-- CreateEnum
CREATE TYPE "OfferPricingModel" AS ENUM ('FIXED', 'STARTING_FROM', 'PER_UNIT', 'BULK', 'QUOTE', 'INSPECTION');

-- CreateEnum
CREATE TYPE "OfferAvailabilityStatus" AS ENUM ('IN_STOCK', 'ON_REQUEST', 'BY_APPOINTMENT', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "OfferFulfilmentMethod" AS ENUM ('DELIVERY', 'PICKUP', 'PROVIDER_SITE_VISIT', 'SHIPPING', 'REMOTE');

-- CreateEnum
CREATE TYPE "RentalBookingStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'PICKED_UP', 'RETURNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('INACTIVE', 'ACTIVE', 'EXPIRED');

-- CreateEnum
CREATE TYPE "StaffInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "DistributorLocationType" AS ENUM ('WAREHOUSE', 'RETAIL_STORE', 'WHOLESALER', 'DISTRIBUTOR');

-- CreateEnum
CREATE TYPE "CategoryAttributeFieldType" AS ENUM ('TEXT', 'TEXTAREA', 'NUMBER', 'TAGS', 'SELECT');

-- CreateEnum
CREATE TYPE "SafetyIncidentStatus" AS ENUM ('ACTIVE', 'ESCALATED', 'EMERGENCY_SERVICES_CONTACTED', 'SAFETY_TEAM_ALERTED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "IdentityVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED');

-- CreateEnum
CREATE TYPE "HouseholdRole" AS ENUM ('OWNER', 'MEMBER', 'PROPERTY_MANAGER', 'PAYMENT_APPROVER');

-- CreateEnum
CREATE TYPE "HouseholdInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ProcurementStatus" AS ENUM ('QUOTES_OPEN', 'PENDING_APPROVAL', 'APPROVED', 'PURCHASE_ORDER_CREATED', 'FULFILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SupplierQuoteStatus" AS ENUM ('SUBMITTED', 'SELECTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'FULFILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('OPEN', 'CLOSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "WarrantyStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'VOID');

-- CreateEnum
CREATE TYPE "WarrantyClaimStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ChangeOrderStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "JobEventActor" AS ENUM ('CUSTOMER', 'PROVIDER', 'SYSTEM', 'ADMIN');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('REQUESTED', 'QUOTED', 'AGREED', 'DECLINED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MilestoneStatus" AS ENUM ('PENDING', 'COMPLETED', 'APPROVED');

-- CreateEnum
CREATE TYPE "JobExpenseStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CustomerRequestStatus" AS ENUM ('OPEN', 'ACCEPTED', 'CLOSED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RequestResponseStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "ReceiptType" AS ENUM ('PAYMENT', 'DEPOSIT', 'WITHDRAWAL');

-- CreateEnum
CREATE TYPE "CallOutcome" AS ENUM ('COMPLETED', 'MISSED', 'DECLINED');

-- CreateEnum
CREATE TYPE "BannerPlacement" AS ENUM ('HOME_HERO', 'SERVICES_TOP', 'PRODUCTS_TOP');

-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ChatbotConversationStatus" AS ENUM ('ACTIVE', 'ESCALATED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ChatbotMessageRole" AS ENUM ('USER', 'ASSISTANT', 'STAFF');

-- CreateEnum
CREATE TYPE "RecentlyViewedType" AS ENUM ('SERVICE', 'PRODUCT');

-- CreateEnum
CREATE TYPE "CoinTransactionType" AS ENUM ('PURCHASE', 'GIFT_SENT');

-- CreateEnum
CREATE TYPE "LiveSessionStatus" AS ENUM ('LIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "ProBusinessType" AS ENUM ('SERVICES', 'PRODUCTS', 'RENTALS', 'FREELANCE', 'TUTORING', 'CONSULTING', 'POS');

-- CreateEnum
CREATE TYPE "ProCapabilityStatus" AS ENUM ('ACTIVE', 'PENDING', 'REJECTED');

-- CreateEnum
CREATE TYPE "StockMovementKind" AS ENUM ('OPENING_BALANCE', 'PURCHASE', 'SALE', 'SALE_REVERSAL', 'ORDER_FULFILMENT', 'ORDER_RESTOCK', 'RETURN', 'COUNT_ADJUSTMENT', 'WASTAGE', 'TRANSFER_IN', 'TRANSFER_OUT', 'BULK_BREAK_IN', 'BULK_BREAK_OUT');

-- CreateEnum
CREATE TYPE "PosSaleStatus" AS ENUM ('COMPLETED', 'PARKED', 'VOIDED', 'REFUNDED', 'PART_REFUNDED', 'DEPOSIT');

-- CreateEnum
CREATE TYPE "PosPaymentMethod" AS ENUM ('CASH', 'MPESA', 'CARD', 'BANK', 'CREDIT', 'GIFT_CARD', 'SPLIT');

-- CreateEnum
CREATE TYPE "PosStaffRole" AS ENUM ('OWNER', 'MANAGER', 'CASHIER', 'STOCK_CONTROLLER', 'ACCOUNTANT');

-- CreateEnum
CREATE TYPE "PosPurchaseStatus" AS ENUM ('DRAFT', 'ORDERED', 'PART_RECEIVED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PosLoyaltyKind" AS ENUM ('EARN', 'REDEEM', 'REVERSAL', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "SerialStatus" AS ENUM ('IN_STOCK', 'SOLD', 'RETURNED', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "PosExpenseCategory" AS ENUM ('RENT', 'SALARIES', 'ELECTRICITY', 'WATER', 'TRANSPORT', 'AIRTIME_INTERNET', 'LICENCES', 'REPAIRS', 'PACKAGING', 'BANK_CHARGES', 'MARKETING', 'SECURITY', 'CLEANING', 'OTHER');

-- CreateEnum
CREATE TYPE "EtimsTaxCode" AS ENUM ('A', 'B', 'C', 'D', 'E');

-- CreateEnum
CREATE TYPE "EtimsStatus" AS ENUM ('QUEUED', 'SIGNED', 'REJECTED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "EtimsDocumentKind" AS ENUM ('INVOICE', 'CREDIT_NOTE');

-- CreateEnum
CREATE TYPE "PosBillingStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PosChargeKind" AS ENUM ('SETUP', 'MONTHLY');

-- CreateEnum
CREATE TYPE "PosChargeStatus" AS ENUM ('DUE', 'PAID', 'WAIVED', 'VOID');

-- CreateEnum
CREATE TYPE "PosCashMovementKind" AS ENUM ('PAY_IN', 'PAY_OUT');

-- CreateEnum
CREATE TYPE "PosStockCountStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PosJobStatus" AS ENUM ('RECEIVED', 'IN_PROGRESS', 'READY', 'COLLECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PosJobLineKind" AS ENUM ('LABOUR', 'PART');

-- CreateEnum
CREATE TYPE "PosCreditEntryKind" AS ENUM ('CHARGE', 'PAYMENT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "PosTransferStatus" AS ENUM ('DRAFT', 'DISPATCHED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PosPromotionKind" AS ENUM ('PERCENT_OFF', 'AMOUNT_OFF', 'BUY_X_GET_Y', 'BUNDLE_PRICE');

-- CreateEnum
CREATE TYPE "PosGiftCardKind" AS ENUM ('GIFT_CARD', 'STORE_CREDIT');

-- CreateEnum
CREATE TYPE "PosGiftCardEntryKind" AS ENUM ('ISSUE', 'TOPUP', 'REDEEM', 'VOID');

-- CreateEnum
CREATE TYPE "PosQuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'CONVERTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PosTableOrderStatus" AS ENUM ('OPEN', 'IN_KITCHEN', 'SERVED', 'CLOSED', 'CANCELLED');

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "rate_limit_attempts" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_limit_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "phone" TEXT,
    "password" TEXT,
    "image" TEXT,
    "role" "Role" NOT NULL DEFAULT 'CUSTOMER',
    "kycStatus" "KycStatus" NOT NULL DEFAULT 'PENDING',
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'BASIC',
    "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'CLEAR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "chatTheme" "ChatTheme" NOT NULL DEFAULT 'CLASSIC',
    "language" TEXT NOT NULL DEFAULT 'en',
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "notificationPreferences" JSONB,
    "lastDigestSentAt" TIMESTAMP(3),
    "coinBalance" INTEGER NOT NULL DEFAULT 0,
    "lastKnownLatitude" DECIMAL(9,6),
    "lastKnownLongitude" DECIMAL(9,6),
    "locationSource" "LocationSource",
    "lastLocationUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletionReason" TEXT,
    "referralCode" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bio" TEXT,
    "location" TEXT,

    CONSTRAINT "customer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bio" TEXT,
    "businessName" TEXT,
    "location" TEXT,
    "categoryId" TEXT,
    "skillLevel" "SkillLevel" NOT NULL DEFAULT 'SKILLED',
    "hourlyRate" DECIMAL(12,2),
    "responseTimeMinutes" INTEGER,
    "rating" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "completedJobs" INTEGER NOT NULL DEFAULT 0,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "skills" TEXT[],
    "workAreas" TEXT[],
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "affiliatedShopId" TEXT,
    "isBusinessOwner" BOOLEAN NOT NULL DEFAULT false,
    "registrationNumber" TEXT,
    "hqAddress" TEXT,
    "autoAssignEnabled" BOOLEAN NOT NULL DEFAULT false,
    "allowStaffRequestResponses" BOOLEAN NOT NULL DEFAULT false,
    "parentBusinessId" TEXT,
    "headline" TEXT,
    "yearsExperience" INTEGER NOT NULL DEFAULT 0,
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "education" JSONB,
    "awards" JSONB,
    "resumeUrl" TEXT,
    "workPreference" "WorkPreference" NOT NULL DEFAULT 'ONSITE',
    "slug" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offers" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "categoryId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "actionType" "OfferActionType" NOT NULL,
    "price" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "images" TEXT[],
    "status" "OfferStatus" NOT NULL DEFAULT 'DRAFT',
    "reviewNote" TEXT,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "bookingCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "pricingModel" "OfferPricingModel" NOT NULL DEFAULT 'FIXED',
    "unitLabel" TEXT,
    "minimumOrder" TEXT,
    "bulkPricingNote" TEXT,
    "availabilityStatus" "OfferAvailabilityStatus" NOT NULL DEFAULT 'IN_STOCK',
    "fulfilmentMethods" "OfferFulfilmentMethod"[],
    "includedItems" TEXT[],
    "excludedItems" TEXT[],
    "attributes" JSONB,
    "documents" JSONB,
    "wizardStep" INTEGER NOT NULL DEFAULT 1,
    "serviceArea" TEXT,
    "radiusKm" INTEGER,
    "depositAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "stockQuantity" INTEGER,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_bookings" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "days" INTEGER NOT NULL,
    "rentalFee" DECIMAL(12,2) NOT NULL,
    "depositAmount" DECIMAL(12,2) NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "status" "RentalBookingStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "location" TEXT NOT NULL,
    "depositRefundAmount" DECIMAL(12,2),
    "depositRefundNote" TEXT,
    "pickedUpAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rental_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_subscriptions" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'INACTIVE',
    "currentPeriodEnd" TIMESTAMP(3),
    "lastPaymentAmount" DECIMAL(10,2),
    "lastPaymentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_invites" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "token" TEXT NOT NULL,
    "status" "StaffInviteStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedById" TEXT,

    CONSTRAINT "staff_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_branches" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopkeeper_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shopName" TEXT NOT NULL,
    "shopDescription" TEXT,
    "shopCategory" TEXT,
    "shopLogoUrl" TEXT,
    "businessLicense" TEXT,
    "kraPin" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "rating" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "totalSales" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "openingTime" TEXT,
    "closingTime" TEXT,
    "sundayOpeningTime" TEXT,
    "sundayClosingTime" TEXT,
    "holidayOpeningTime" TEXT,
    "holidayClosingTime" TEXT,
    "deliveryFee" DECIMAL(10,2) NOT NULL DEFAULT 500,
    "deliveryRadiusKm" DECIMAL(6,2),
    "deliveryFeePerKm" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "isOnVacation" BOOLEAN NOT NULL DEFAULT false,
    "vacationNote" TEXT,
    "listedOnMarketplace" BOOLEAN NOT NULL DEFAULT true,
    "posEnabled" BOOLEAN NOT NULL DEFAULT false,
    "posProfileKey" TEXT,
    "posTraits" TEXT[],
    "posConfig" JSONB,
    "posActivatedAt" TIMESTAMP(3),
    "mpesaShortcode" TEXT,
    "mpesaShortcodeType" TEXT,
    "mpesaAccountRef" TEXT,
    "mpesaPromptEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mpesaConsumerKey" TEXT,
    "mpesaConsumerSecret" TEXT,
    "mpesaPasskey" TEXT,
    "mpesaEnv" TEXT,
    "mpesaUseDemoCreds" BOOLEAN NOT NULL DEFAULT false,
    "tillSlug" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "etimsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "etimsTin" TEXT,
    "etimsBranchId" TEXT DEFAULT '00',
    "etimsDeviceSerial" TEXT,
    "etimsCmcKey" TEXT,
    "etimsEnv" TEXT NOT NULL DEFAULT 'sandbox',
    "etimsInitialisedAt" TIMESTAMP(3),
    "etimsDefaultTaxCode" "EtimsTaxCode" NOT NULL DEFAULT 'B',

    CONSTRAINT "shopkeeper_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocked_shop_customers" (
    "id" TEXT NOT NULL,
    "shopkeeperId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocked_shop_customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distributor_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "description" TEXT,
    "logoUrl" TEXT,
    "businessLicense" TEXT,
    "kraPin" TEXT,
    "rating" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "distributor_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distributor_locations" (
    "id" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DistributorLocationType" NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "deliveryFee" DECIMAL(10,2) NOT NULL DEFAULT 500,
    "deliveryRadiusKm" DECIMAL(6,2),
    "deliveryFeePerKm" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "distributor_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distributor_products" (
    "id" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "categoryId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "images" TEXT[],
    "retailPrice" DECIMAL(12,2) NOT NULL,
    "wholesalePrice" DECIMAL(12,2) NOT NULL,
    "minWholesaleQty" INTEGER NOT NULL DEFAULT 1,
    "unit" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "totalSoldWholesale" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "distributor_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distributor_inventories" (
    "id" TEXT NOT NULL,
    "distributorProductId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "currentStock" INTEGER NOT NULL DEFAULT 0,
    "reservedStock" INTEGER NOT NULL DEFAULT 0,
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 10,
    "reorderLevel" INTEGER NOT NULL DEFAULT 20,
    "lastRestockedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "distributor_inventories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfers" (
    "id" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "distributorProductId" TEXT NOT NULL,
    "fromLocationId" TEXT NOT NULL,
    "toLocationId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "notes" TEXT,
    "initiatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wholesale_orders" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "buyerShopkeeperId" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "subtotal" DECIMAL(14,2) NOT NULL,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "deliveryFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wholesale_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wholesale_order_items" (
    "id" TEXT NOT NULL,
    "wholesaleOrderId" TEXT NOT NULL,
    "distributorProductId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "totalPrice" DECIMAL(12,2) NOT NULL,
    "restockProductId" TEXT,

    CONSTRAINT "wholesale_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_member_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobTitle" TEXT,
    "department" TEXT,
    "managerId" TEXT,
    "permissions" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_member_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_documents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentType" "KycDocumentType" NOT NULL,
    "documentNumber" TEXT,
    "idFileUrl" TEXT NOT NULL,
    "idBackFileUrl" TEXT,
    "selfieFileUrl" TEXT,
    "status" "KycStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "rejectionReason" TEXT,
    "documentNumberNormalized" TEXT,
    "idFileHash" TEXT,
    "idBackFileHash" TEXT,

    CONSTRAINT "kyc_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "CategoryType" NOT NULL,
    "icon" TEXT,
    "tier" TEXT,
    "parentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isEmergencyEligible" BOOLEAN NOT NULL DEFAULT false,
    "requiresLicense" BOOLEAN NOT NULL DEFAULT false,
    "licenseName" TEXT,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_attributes" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "CategoryAttributeFieldType" NOT NULL,
    "options" TEXT[],
    "placeholder" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_attributes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counties" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "counties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "categoryId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "skillLevel" "SkillLevel" NOT NULL DEFAULT 'SKILLED',
    "basePrice" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "images" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "rating" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "totalBookings" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "approvalStatus" "ServiceApprovalStatus" NOT NULL DEFAULT 'APPROVED',
    "rejectionReason" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_packages" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "duration" TEXT,
    "features" TEXT[],

    CONSTRAINT "service_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "shopkeeperId" TEXT NOT NULL,
    "categoryId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "costPrice" DECIMAL(12,2),
    "unit" TEXT NOT NULL DEFAULT 'piece',
    "hasVariants" BOOLEAN NOT NULL DEFAULT false,
    "ageRestricted" BOOLEAN NOT NULL DEFAULT false,
    "fitsWith" TEXT[],
    "bulkUnit" TEXT,
    "unitsPerBulk" DECIMAL(12,3),
    "tracksBatches" BOOLEAN NOT NULL DEFAULT false,
    "isService" BOOLEAN NOT NULL DEFAULT false,
    "tracksSerials" BOOLEAN NOT NULL DEFAULT false,
    "controlled" BOOLEAN NOT NULL DEFAULT false,
    "madeToOrder" BOOLEAN NOT NULL DEFAULT false,
    "etimsTaxCode" "EtimsTaxCode",
    "etimsItemCode" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "discountPrice" DECIMAL(12,2),
    "images" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3),
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "rating" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "totalSold" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "currentStock" INTEGER NOT NULL DEFAULT 0,
    "reservedStock" INTEGER NOT NULL DEFAULT 0,
    "stockOnHand" DECIMAL(14,3),
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 5,
    "reorderLevel" INTEGER NOT NULL DEFAULT 10,
    "lastRestockedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_items" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT NOT NULL,
    "videoUrl" TEXT,
    "category" TEXT,
    "projectDate" TIMESTAMP(3),
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_portfolio_items" (
    "id" TEXT NOT NULL,
    "shopkeeperId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT NOT NULL,
    "videoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_portfolio_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certifications" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "dateIssued" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "status" "KycStatus" NOT NULL DEFAULT 'PENDING',
    "documentUrl" TEXT,

    CONSTRAINT "certifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_availability" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "weeklySchedule" JSONB NOT NULL,
    "maxJobsPerDay" INTEGER NOT NULL DEFAULT 5,
    "breakDuration" INTEGER NOT NULL DEFAULT 30,
    "autoAccept" BOOLEAN NOT NULL DEFAULT false,
    "travelRadiusKm" INTEGER NOT NULL DEFAULT 10,
    "isOnVacation" BOOLEAN NOT NULL DEFAULT false,
    "vacationNote" TEXT,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "lastKnownLatitude" DECIMAL(9,6),
    "lastKnownLongitude" DECIMAL(9,6),
    "lastLocationUpdatedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocked_dates" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,

    CONSTRAINT "blocked_dates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "providerId" TEXT,
    "serviceId" TEXT,
    "servicePackageId" TEXT,
    "offerId" TEXT,
    "requestId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "price" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "location" TEXT NOT NULL,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "providerLatitude" DECIMAL(9,6),
    "providerLongitude" DECIMAL(9,6),
    "providerLocationUpdatedAt" TIMESTAMP(3),
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "expectedCompletionAt" TIMESTAMP(3),
    "urgency" "JobUrgency" NOT NULL DEFAULT 'MEDIUM',
    "attachments" TEXT[],
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "warrantyFollowUpForId" TEXT,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_maintenances" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "providerId" TEXT,
    "categoryId" TEXT,
    "serviceId" TEXT,
    "offerId" TEXT,
    "title" TEXT NOT NULL,
    "frequencyDays" INTEGER NOT NULL,
    "lastCompletedAt" TIMESTAMP(3),
    "nextDueAt" TIMESTAMP(3) NOT NULL,
    "reminderSentAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recurring_maintenances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vehicleType" TEXT,
    "licensePlate" TEXT,
    "licenseNumber" TEXT,
    "isAvailable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safety_incidents" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "reportedByUserId" TEXT NOT NULL,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "description" TEXT,
    "status" "SafetyIncidentStatus" NOT NULL DEFAULT 'ACTIVE',
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "safety_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_verifications" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "selfieUrl" TEXT NOT NULL,
    "status" "IdentityVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "identity_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "households" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "households_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household_members" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "HouseholdRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "household_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household_invites" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "role" "HouseholdRole" NOT NULL DEFAULT 'MEMBER',
    "status" "HouseholdInviteStatus" NOT NULL DEFAULT 'PENDING',
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "household_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement_requests" (
    "id" TEXT NOT NULL,
    "businessUserId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "deliveryLocation" TEXT NOT NULL,
    "recurrenceDays" INTEGER,
    "budgetMax" DECIMAL(12,2),
    "requirements" TEXT,
    "status" "ProcurementStatus" NOT NULL DEFAULT 'QUOTES_OPEN',
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "approverUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "procurement_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_quotes" (
    "id" TEXT NOT NULL,
    "procurementRequestId" TEXT NOT NULL,
    "supplierUserId" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "availability" TEXT,
    "deliveryTime" TEXT,
    "terms" TEXT,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "status" "SupplierQuoteStatus" NOT NULL DEFAULT 'SUBMITTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "procurementRequestId" TEXT NOT NULL,
    "supplierQuoteId" TEXT NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'APPROVED',
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_confirmations" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "deliveredQuantity" INTEGER NOT NULL,
    "recipientName" TEXT NOT NULL,
    "evidenceUrl" TEXT,
    "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedByUserId" TEXT NOT NULL,

    CONSTRAINT "delivery_confirmations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_opportunities" (
    "id" TEXT NOT NULL,
    "postedByProviderId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "preferredTime" TEXT,
    "budget" DECIMAL(12,2),
    "description" TEXT NOT NULL,
    "status" "OpportunityStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunity_responses" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "responderProviderId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opportunity_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warranties" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "terms" TEXT,
    "status" "WarrantyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warranties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warranty_claims" (
    "id" TEXT NOT NULL,
    "warrantyId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "WarrantyClaimStatus" NOT NULL DEFAULT 'OPEN',
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "warranty_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_handshakes" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "consumedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qr_handshakes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_orders" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "additionalWork" TEXT NOT NULL,
    "additionalCost" DECIMAL(12,2) NOT NULL,
    "additionalTimeDays" INTEGER,
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ChangeOrderStatus" NOT NULL DEFAULT 'PENDING',
    "declineReason" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "change_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_events" (
    "id" TEXT NOT NULL,
    "jobId" TEXT,
    "contractId" TEXT,
    "type" TEXT NOT NULL,
    "actor" "JobEventActor" NOT NULL,
    "actorUserId" TEXT,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "attachments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_contracts" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "categoryId" TEXT,
    "jobId" TEXT,
    "title" TEXT NOT NULL,
    "requestDescription" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'REQUESTED',
    "quotedPrice" DECIMAL(12,2),
    "scopeOfWork" TEXT,
    "estimatedDuration" TEXT,
    "materials" TEXT,
    "labourNotes" TEXT,
    "terms" TEXT,
    "quotedAt" TIMESTAMP(3),
    "agreedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_milestones" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(12,2),
    "order" INTEGER NOT NULL DEFAULT 0,
    "status" "MilestoneStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_expenses" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "receiptPhotoUrl" TEXT,
    "status" "JobExpenseStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "job_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_requests" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "budgetMin" DECIMAL(12,2),
    "budgetMax" DECIMAL(12,2),
    "location" TEXT NOT NULL,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "status" "CustomerRequestStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "customer_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_request_photos" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "dataUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_request_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_responses" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "responderId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "productId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" "RequestResponseStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "jobId" TEXT,
    "serviceId" TEXT,
    "providerId" TEXT,
    "productId" TEXT,
    "orderId" TEXT,
    "shopkeeperId" TEXT,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "professionalism" INTEGER,
    "communication" INTEGER,
    "punctuality" INTEGER,
    "qualityOfWork" INTEGER,
    "response" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addresses" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "AddressType" NOT NULL DEFAULT 'HOME',
    "address" TEXT NOT NULL,
    "city" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_items" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT,
    "serviceId" TEXT,
    "servicePackageId" TEXT,
    "offerId" TEXT,
    "scheduledDate" TIMESTAMP(3),
    "notes" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wishlist_items" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "targetType" "WishlistTargetType" NOT NULL,
    "providerId" TEXT,
    "serviceId" TEXT,
    "productId" TEXT,
    "shopId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wishlist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "shopkeeperId" TEXT NOT NULL,
    "requestId" TEXT,
    "addressId" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "subtotal" DECIMAL(14,2) NOT NULL,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "shippingCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "processingAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "totalPrice" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "totalEarned" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalWithdrawn" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pendingBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "escrowBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "description" TEXT NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "status" "TransactionStatus" NOT NULL DEFAULT 'COMPLETED',
    "balanceBefore" DECIMAL(14,2) NOT NULL,
    "balanceAfter" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "lifetimePoints" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loyalty_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_transactions" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "type" "LoyaltyTransactionType" NOT NULL,
    "points" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "balanceBefore" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_methods" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "PaymentMethodType" NOT NULL,
    "provider" TEXT,
    "accountNumber" TEXT NOT NULL,
    "encryptedAccountNumber" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "contextType" "PaymentContextType" NOT NULL,
    "jobId" TEXT,
    "orderId" TEXT,
    "wholesaleOrderId" TEXT,
    "rentalBookingId" TEXT,
    "payerId" TEXT NOT NULL,
    "payeeId" TEXT,
    "paymentMethodId" TEXT,
    "externalRef" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawal_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" "PaymentMethodType" NOT NULL,
    "recipientDetails" JSONB NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "processingFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(14,2) NOT NULL,
    "externalRef" TEXT,
    "b2cConversationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "withdrawal_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ReceiptType" NOT NULL,
    "paymentMethod" TEXT,
    "transactionRef" TEXT,
    "lineItems" JSONB NOT NULL,
    "subtotal" DECIMAL(14,2),
    "adjustments" JSONB,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "balanceAfter" DECIMAL(14,2),
    "emailedTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "customerId" TEXT,
    "jobId" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "rate" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "customerId" TEXT,
    "jobId" TEXT,
    "jobTitle" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_items" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "rate" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "quote_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "participantAId" TEXT NOT NULL,
    "participantBId" TEXT NOT NULL,
    "jobId" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "type" "MessageType" NOT NULL DEFAULT 'TEXT',
    "content" TEXT,
    "attachmentUrl" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "relatedStatusId" TEXT,
    "replyToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_logs" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "callerId" TEXT NOT NULL,
    "calleeId" TEXT NOT NULL,
    "outcome" "CallOutcome" NOT NULL,
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "answeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_signals" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "relatedType" TEXT,
    "relatedId" TEXT,
    "actionUrl" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" TEXT NOT NULL,
    "disputeNumber" TEXT NOT NULL,
    "jobId" TEXT,
    "orderId" TEXT,
    "customerId" TEXT NOT NULL,
    "providerId" TEXT,
    "reason" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "severity" "DisputeSeverity" NOT NULL DEFAULT 'MEDIUM',
    "assignedToId" TEXT,
    "refundAmount" DECIMAL(14,2),
    "resolution" TEXT,
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispute_messages" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "attachments" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispute_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_tiers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "CommissionRole" NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "minJobs" INTEGER,
    "minAmount" DECIMAL(14,2),
    "maxAmount" DECIMAL(14,2),
    "status" "CommissionStatus" NOT NULL DEFAULT 'ACTIVE',
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commission_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_revenue" (
    "id" TEXT NOT NULL,
    "role" "CommissionRole" NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grossAmount" DECIMAL(14,2) NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "commissionAmount" DECIMAL(14,2) NOT NULL,
    "payoutAmount" DECIMAL(14,2) NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_revenue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "audience" "AnnouncementAudience" NOT NULL DEFAULT 'ALL',
    "type" "AnnouncementType" NOT NULL DEFAULT 'GENERAL',
    "status" "AnnouncementStatus" NOT NULL DEFAULT 'DRAFT',
    "views" INTEGER NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "oldValues" JSONB,
    "newValues" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscribers" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "deviceId" TEXT,
    "unsubscribeToken" TEXT NOT NULL,
    "subscribedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscribers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "isBase" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banners" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "imageUrl" TEXT NOT NULL,
    "linkUrl" TEXT,
    "placement" "BannerPlacement" NOT NULL DEFAULT 'HOME_HERO',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_blocks" (
    "id" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_violations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageId" TEXT,
    "kind" "ViolationKind" NOT NULL,
    "severity" "ReportSeverity" NOT NULL DEFAULT 'MEDIUM',
    "excerpt" TEXT NOT NULL,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_violations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_reports" (
    "id" TEXT NOT NULL,
    "targetType" "ReportTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "contentSnapshot" TEXT NOT NULL,
    "reportedUserId" TEXT,
    "reporterId" TEXT,
    "reason" TEXT NOT NULL,
    "severity" "ReportSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,

    CONSTRAINT "content_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliations" (
    "id" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "systemBalance" DECIMAL(14,2) NOT NULL,
    "bankBalance" DECIMAL(14,2) NOT NULL,
    "variance" DECIMAL(14,2) NOT NULL,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_discrepancies" (
    "id" TEXT NOT NULL,
    "reconciliationId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'under_review',
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliation_discrepancies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_reports" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "type" "TaxReportType" NOT NULL,
    "status" "TaxReportStatus" NOT NULL DEFAULT 'DRAFT',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "filedDate" TIMESTAMP(3),
    "amount" DECIMAL(14,2) NOT NULL,
    "taxDue" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "referredUserId" TEXT NOT NULL,
    "referralCode" TEXT NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "rewardAmount" DECIMAL(12,2),
    "rewardGivenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "endorsements" (
    "id" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT,
    "toShopId" TEXT,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "endorsements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotions" (
    "id" TEXT NOT NULL,
    "shopkeeperId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "PromotionType" NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "minOrder" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "status" "PromotionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "categoryId" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "images" TEXT[],
    "video" TEXT,
    "location" TEXT,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "shareCount" INTEGER NOT NULL DEFAULT 0,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_likes" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_saves" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_saves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_comments" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_statuses" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "beforeImage" TEXT NOT NULL,
    "afterImage" TEXT NOT NULL,
    "caption" TEXT,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_status_views" (
    "id" TEXT NOT NULL,
    "statusId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_status_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_status_likes" (
    "id" TEXT NOT NULL,
    "statusId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_status_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follows" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "followingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocked_clients" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocked_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "image" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_memberships" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_posts" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "images" TEXT[],
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_post_likes" (
    "id" TEXT NOT NULL,
    "groupPostId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_post_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_post_comments" (
    "id" TEXT NOT NULL,
    "groupPostId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_post_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatbot_conversations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ChatbotConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "escalatedTicketId" TEXT,
    "assignedStaffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chatbot_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatbot_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "ChatbotMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "senderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chatbot_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recently_viewed" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetType" "RecentlyViewedType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "image" TEXT,
    "href" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recently_viewed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_sessions" (
    "id" TEXT NOT NULL,
    "providerId" TEXT,
    "shopkeeperId" TEXT,
    "roomName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "status" "LiveSessionStatus" NOT NULL DEFAULT 'LIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "peakViewers" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "live_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_chat_messages" (
    "id" TEXT NOT NULL,
    "liveSessionId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "live_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_session_products" (
    "id" TEXT NOT NULL,
    "liveSessionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "live_session_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gifts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "coinCost" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "gifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_gifts" (
    "id" TEXT NOT NULL,
    "liveSessionId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "giftId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "coinCost" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "live_gifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coin_transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "CoinTransactionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coin_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pro_capabilities" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ProBusinessType" NOT NULL,
    "status" "ProCapabilityStatus" NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT,
    "reviewNote" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,

    CONSTRAINT "pro_capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pro_module_settings" (
    "id" TEXT NOT NULL,
    "businessType" "ProBusinessType" NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "pro_module_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "shopkeeperId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "batchId" TEXT,
    "kind" "StockMovementKind" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'piece',
    "unitCost" DECIMAL(12,2),
    "balanceAfter" DECIMAL(14,3),
    "reason" TEXT,
    "posSaleId" TEXT,
    "orderId" TEXT,
    "wholesaleOrderId" TEXT,
    "actorUserId" TEXT,
    "idempotencyKey" TEXT,
    "deviceId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_sales" (
    "id" TEXT NOT NULL,
    "shopkeeperId" TEXT NOT NULL,
    "saleNumber" TEXT NOT NULL,
    "tillSessionId" TEXT,
    "cashierUserId" TEXT,
    "cashierName" TEXT,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "amountPaid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "changeGiven" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "PosSaleStatus" NOT NULL DEFAULT 'COMPLETED',
    "paymentMethod" "PosPaymentMethod" NOT NULL DEFAULT 'CASH',
    "customerName" TEXT,
    "customerPhone" TEXT,
    "customerId" TEXT,
    "posCustomerId" TEXT,
    "ageVerified" BOOLEAN NOT NULL DEFAULT false,
    "idempotencyKey" TEXT,
    "deviceId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedAt" TIMESTAMP(3),
    "balanceDue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3),
    "fulfilledAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "voidedByUserId" TEXT,
    "discountApprovedBy" TEXT,

    CONSTRAINT "pos_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_sale_items" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "productId" TEXT,
    "variantId" TEXT,
    "variantLabel" TEXT,
    "batchId" TEXT,
    "batchNumber" TEXT,
    "batchExpiry" TIMESTAMP(3),
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "barcode" TEXT,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'piece',
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "lineDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalPrice" DECIMAL(14,2) NOT NULL,
    "costAtSale" DECIMAL(12,2),
    "priceOverridden" BOOLEAN NOT NULL DEFAULT false,
    "serials" TEXT[],
    "notes" TEXT,

    CONSTRAINT "pos_sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_payments" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "method" "PosPaymentMethod" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stkCheckoutId" TEXT,
    "stkConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "stkPhone" TEXT,

    CONSTRAINT "pos_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "till_sessions" (
    "id" TEXT NOT NULL,
    "shopkeeperId" TEXT NOT NULL,
    "cashierUserId" TEXT,
    "cashierName" TEXT,
    "deviceId" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "openingFloat" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "expectedCash" DECIMAL(14,2),
    "countedCash" DECIMAL(14,2),
    "variance" DECIMAL(14,2),
    "note" TEXT,

    CONSTRAINT "till_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_businesses" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "activeStoreId" TEXT,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'KE',
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Nairobi',
    "registrationNumber" TEXT,
    "taxPin" TEXT,
    "county" TEXT,
    "town" TEXT,
    "street" TEXT,
    "postalCode" TEXT,
    "profileKey" TEXT NOT NULL DEFAULT 'SUPERMARKET',
    "profileVersion" INTEGER NOT NULL DEFAULT 1,
    "onboardingStep" TEXT,
    "onboardingData" JSONB,
    "setupCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_stores" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "shopkeeperId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "branchLabel" TEXT,
    "phone" TEXT,
    "county" TEXT,
    "town" TEXT,
    "street" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_staff" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "role" "PosStaffRole" NOT NULL DEFAULT 'CASHIER',
    "pinHash" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "features" TEXT[],
    "invitedAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_audit_events" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT,
    "actorUserId" TEXT,
    "actorStaffId" TEXT,
    "summary" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_returns" (
    "id" TEXT NOT NULL,
    "shopkeeperId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "returnNumber" TEXT NOT NULL,
    "totalRefunded" DECIMAL(14,2) NOT NULL,
    "method" "PosPaymentMethod" NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "handledByUserId" TEXT,
    "handledByName" TEXT,
    "approvedByName" TEXT,
    "deviceId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_return_items" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "saleItemId" TEXT NOT NULL,
    "productId" TEXT,
    "variantId" TEXT,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'piece',
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "lineRefund" DECIMAL(14,2) NOT NULL,
    "restocked" BOOLEAN NOT NULL DEFAULT true,
    "condition" TEXT,
    "serials" TEXT[],

    CONSTRAINT "pos_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_suppliers" (
    "id" TEXT NOT NULL,
    "shopkeeperId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "location" TEXT,
    "paymentTerms" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_purchase_orders" (
    "id" TEXT NOT NULL,
    "shopkeeperId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "status" "PosPurchaseStatus" NOT NULL DEFAULT 'DRAFT',
    "expectedTotal" DECIMAL(14,2) NOT NULL,
    "expectedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdByName" TEXT,
    "approvedByName" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_purchase_order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "variantId" TEXT,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'piece',
    "unitCost" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "pos_purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_goods_receipts" (
    "id" TEXT NOT NULL,
    "shopkeeperId" TEXT NOT NULL,
    "supplierId" TEXT,
    "orderId" TEXT,
    "receiptNumber" TEXT NOT NULL,
    "supplierRef" TEXT,
    "totalCost" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "receivedByUserId" TEXT,
    "receivedByName" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_goods_receipt_items" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "orderItemId" TEXT,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'piece',
    "unitCost" DECIMAL(12,2) NOT NULL,
    "batchNumber" TEXT,
    "expiryDate" TIMESTAMP(3),

    CONSTRAINT "pos_goods_receipt_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_customers" (
    "id" TEXT NOT NULL,
    "shopkeeperId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "userId" TEXT,
    "creditLimit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "creditBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "creditTermDays" INTEGER NOT NULL DEFAULT 30,
    "priceListId" TEXT,
    "pointsBalance" INTEGER NOT NULL DEFAULT 0,
    "pointsEarned" INTEGER NOT NULL DEFAULT 0,
    "totalSpent" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "visits" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "pos_customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_loyalty_entries" (
    "id" TEXT NOT NULL,
    "shopkeeperId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "kind" "PosLoyaltyKind" NOT NULL,
    "points" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "saleId" TEXT,
    "amount" DECIMAL(14,2),
    "reason" TEXT,
    "actorName" TEXT,
    "idempotencyKey" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_loyalty_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_devices" (
    "id" TEXT NOT NULL,
    "shopkeeperId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'web',
    "tokenHash" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_cashiers" (
    "id" TEXT NOT NULL,
    "shopkeeperId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'cashier',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_cashiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "shopkeeperId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "options" JSONB,
    "sku" TEXT,
    "barcode" TEXT,
    "price" DECIMAL(12,2),
    "costPrice" DECIMAL(12,2),
    "stockOnHand" DECIMAL(14,3),
    "currentStock" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_batches" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "shopkeeperId" TEXT NOT NULL,
    "batchNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "stockOnHand" DECIMAL(14,3),
    "currentStock" INTEGER NOT NULL DEFAULT 0,
    "costPrice" DECIMAL(12,2),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_serials" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "shopkeeperId" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "status" "SerialStatus" NOT NULL DEFAULT 'IN_STOCK',
    "posSaleItemId" TEXT,
    "soldAt" TIMESTAMP(3),
    "costPrice" DECIMAL(12,2),
    "note" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_serials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "controlled_sale_records" (
    "id" TEXT NOT NULL,
    "shopkeeperId" TEXT NOT NULL,
    "posSaleItemId" TEXT,
    "posSaleId" TEXT,
    "productName" TEXT NOT NULL,
    "variantLabel" TEXT,
    "batchNumber" TEXT,
    "serials" TEXT[],
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'piece',
    "buyerName" TEXT NOT NULL,
    "buyerIdNumber" TEXT,
    "buyerPhone" TEXT,
    "prescriberName" TEXT,
    "prescriptionRef" TEXT,
    "recordedByUserId" TEXT,
    "recordedByName" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "controlled_sale_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_expenses" (
    "id" TEXT NOT NULL,
    "shopkeeperId" TEXT NOT NULL,
    "category" "PosExpenseCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paidWith" "PosPaymentMethod" NOT NULL DEFAULT 'CASH',
    "payee" TEXT,
    "reference" TEXT,
    "recordedByUserId" TEXT,
    "recordedByStaffId" TEXT,
    "recordedByName" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "voidedByName" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_etims_invoices" (
    "id" TEXT NOT NULL,
    "shopkeeperId" TEXT NOT NULL,
    "posSaleId" TEXT NOT NULL,
    "kind" "EtimsDocumentKind" NOT NULL DEFAULT 'INVOICE',
    "status" "EtimsStatus" NOT NULL DEFAULT 'QUEUED',
    "invoiceNumber" TEXT NOT NULL,
    "payload" JSONB,
    "receiptNumber" TEXT,
    "receiptSignature" TEXT,
    "internalData" TEXT,
    "sdcDateTime" TIMESTAMP(3),
    "verificationUrl" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lastTriedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_etims_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_subscriptions" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "status" "PosBillingStatus" NOT NULL DEFAULT 'TRIAL',
    "setupFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "monthlyFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "trialEndsAt" TIMESTAMP(3),
    "periodEndsAt" TIMESTAMP(3),
    "graceDays" INTEGER NOT NULL DEFAULT 7,
    "setupSettled" BOOLEAN NOT NULL DEFAULT false,
    "lastPaidAt" TIMESTAMP(3),
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_billing_charges" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "kind" "PosChargeKind" NOT NULL,
    "status" "PosChargeStatus" NOT NULL DEFAULT 'DUE',
    "amount" DECIMAL(12,2) NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "paidMethod" TEXT,
    "reference" TEXT,
    "recordedBy" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_billing_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_cash_movements" (
    "id" TEXT NOT NULL,
    "shopkeeperId" TEXT NOT NULL,
    "tillSessionId" TEXT NOT NULL,
    "kind" "PosCashMovementKind" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "reference" TEXT,
    "actorUserId" TEXT,
    "actorName" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "voidedByUserId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_stock_counts" (
    "id" TEXT NOT NULL,
    "shopkeeperId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "status" "PosStockCountStatus" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "countedByUserId" TEXT,
    "countedByName" TEXT,
    "approvedByUserId" TEXT,
    "approvedByName" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "pos_stock_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_stock_count_lines" (
    "id" TEXT NOT NULL,
    "countId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "variantLabel" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'piece',
    "expected" DECIMAL(14,3) NOT NULL,
    "counted" DECIMAL(14,3),
    "variance" DECIMAL(14,3),
    "unitCost" DECIMAL(12,2),
    "reason" TEXT,
    "countedAt" TIMESTAMP(3),

    CONSTRAINT "pos_stock_count_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_job_cards" (
    "id" TEXT NOT NULL,
    "shopkeeperId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "PosJobStatus" NOT NULL DEFAULT 'RECEIVED',
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "posCustomerId" TEXT,
    "itemDescription" TEXT NOT NULL,
    "itemIdentifier" TEXT,
    "faultReported" TEXT,
    "accessories" TEXT,
    "quotedAmount" DECIMAL(14,2),
    "depositPaid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "posSaleId" TEXT,
    "assignedToName" TEXT,
    "promisedAt" TIMESTAMP(3),
    "notes" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "collectedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdByUserId" TEXT,
    "createdByName" TEXT,

    CONSTRAINT "pos_job_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_job_lines" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "kind" "PosJobLineKind" NOT NULL,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_job_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_credit_entries" (
    "id" TEXT NOT NULL,
    "shopkeeperId" TEXT NOT NULL,
    "posCustomerId" TEXT NOT NULL,
    "kind" "PosCreditEntryKind" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "balanceAfter" DECIMAL(14,2),
    "posSaleId" TEXT,
    "reference" TEXT,
    "note" TEXT,
    "dueOn" TIMESTAMP(3),
    "actorUserId" TEXT,
    "actorName" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "voidedByUserId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_credit_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_stock_transfers" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "fromShopkeeperId" TEXT NOT NULL,
    "toShopkeeperId" TEXT NOT NULL,
    "status" "PosTransferStatus" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "dispatchedByName" TEXT,
    "receivedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,

    CONSTRAINT "pos_stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_stock_transfer_lines" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "toProductId" TEXT,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'piece',
    "quantitySent" DECIMAL(14,3) NOT NULL,
    "quantityReceived" DECIMAL(14,3),
    "discrepancyNote" TEXT,
    "unitCost" DECIMAL(12,2),

    CONSTRAINT "pos_stock_transfer_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_price_lists" (
    "id" TEXT NOT NULL,
    "shopkeeperId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_price_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_price_list_items" (
    "id" TEXT NOT NULL,
    "priceListId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "minQuantity" DECIMAL(14,3) NOT NULL DEFAULT 1,

    CONSTRAINT "pos_price_list_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_promotions" (
    "id" TEXT NOT NULL,
    "shopkeeperId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PosPromotionKind" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "productId" TEXT,
    "categoryId" TEXT,
    "percentOff" DECIMAL(5,2),
    "amountOff" DECIMAL(12,2),
    "buyQuantity" INTEGER,
    "getQuantity" INTEGER,
    "getPercentOff" DECIMAL(5,2),
    "bundleQuantity" INTEGER,
    "bundlePrice" DECIMAL(12,2),
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 100,
    "stackable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_gift_cards" (
    "id" TEXT NOT NULL,
    "shopkeeperId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "PosGiftCardKind" NOT NULL,
    "initialValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "issuedToName" TEXT,
    "issuedToPhone" TEXT,
    "posCustomerId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "posReturnId" TEXT,
    "issuedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_gift_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_gift_card_entries" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "kind" "PosGiftCardEntryKind" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "balanceAfter" DECIMAL(14,2) NOT NULL,
    "posSaleId" TEXT,
    "note" TEXT,
    "actorUserId" TEXT,
    "actorName" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_gift_card_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_quotes" (
    "id" TEXT NOT NULL,
    "shopkeeperId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "PosQuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "posCustomerId" TEXT,
    "validUntil" TIMESTAMP(3),
    "note" TEXT,
    "posSaleId" TEXT,
    "preparedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,

    CONSTRAINT "pos_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_quote_lines" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'piece',
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_quote_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_tables" (
    "id" TEXT NOT NULL,
    "shopkeeperId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "area" TEXT,
    "seats" INTEGER NOT NULL DEFAULT 4,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "pos_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_table_orders" (
    "id" TEXT NOT NULL,
    "shopkeeperId" TEXT NOT NULL,
    "tableId" TEXT,
    "reference" TEXT NOT NULL,
    "status" "PosTableOrderStatus" NOT NULL DEFAULT 'OPEN',
    "covers" INTEGER,
    "isTakeaway" BOOLEAN NOT NULL DEFAULT false,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "serviceChargePercent" DECIMAL(5,2),
    "openedByName" TEXT,
    "note" TEXT,
    "posSaleId" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,

    CONSTRAINT "pos_table_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_table_order_lines" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "modifiers" TEXT[],
    "course" INTEGER NOT NULL DEFAULT 1,
    "sentToKitchenAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "servedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_table_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_providerAccountId_key" ON "accounts"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_sessionToken_key" ON "sessions"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "verification_tokens"("identifier", "token");

-- CreateIndex
CREATE INDEX "rate_limit_attempts_identifier_action_createdAt_idx" ON "rate_limit_attempts"("identifier", "action", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_referralCode_key" ON "users"("referralCode");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_kycStatus_idx" ON "users"("kycStatus");

-- CreateIndex
CREATE INDEX "users_verificationStatus_idx" ON "users"("verificationStatus");

-- CreateIndex
CREATE INDEX "users_moderationStatus_idx" ON "users"("moderationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "customer_profiles_userId_key" ON "customer_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "provider_profiles_userId_key" ON "provider_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "provider_profiles_slug_key" ON "provider_profiles"("slug");

-- CreateIndex
CREATE INDEX "provider_profiles_categoryId_idx" ON "provider_profiles"("categoryId");

-- CreateIndex
CREATE INDEX "provider_profiles_affiliatedShopId_idx" ON "provider_profiles"("affiliatedShopId");

-- CreateIndex
CREATE INDEX "provider_profiles_parentBusinessId_idx" ON "provider_profiles"("parentBusinessId");

-- CreateIndex
CREATE INDEX "provider_profiles_latitude_longitude_idx" ON "provider_profiles"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "offers_providerId_idx" ON "offers"("providerId");

-- CreateIndex
CREATE INDEX "offers_categoryId_idx" ON "offers"("categoryId");

-- CreateIndex
CREATE INDEX "offers_status_idx" ON "offers"("status");

-- CreateIndex
CREATE INDEX "rental_bookings_offerId_idx" ON "rental_bookings"("offerId");

-- CreateIndex
CREATE INDEX "rental_bookings_customerId_idx" ON "rental_bookings"("customerId");

-- CreateIndex
CREATE INDEX "rental_bookings_providerId_idx" ON "rental_bookings"("providerId");

-- CreateIndex
CREATE INDEX "rental_bookings_status_idx" ON "rental_bookings"("status");

-- CreateIndex
CREATE UNIQUE INDEX "provider_subscriptions_providerId_key" ON "provider_subscriptions"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_invites_token_key" ON "staff_invites"("token");

-- CreateIndex
CREATE INDEX "staff_invites_businessId_idx" ON "staff_invites"("businessId");

-- CreateIndex
CREATE INDEX "staff_invites_status_idx" ON "staff_invites"("status");

-- CreateIndex
CREATE INDEX "business_branches_businessId_idx" ON "business_branches"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "shopkeeper_profiles_tillSlug_key" ON "shopkeeper_profiles"("tillSlug");

-- CreateIndex
CREATE INDEX "shopkeeper_profiles_userId_idx" ON "shopkeeper_profiles"("userId");

-- CreateIndex
CREATE INDEX "shopkeeper_profiles_latitude_longitude_idx" ON "shopkeeper_profiles"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "blocked_shop_customers_shopkeeperId_idx" ON "blocked_shop_customers"("shopkeeperId");

-- CreateIndex
CREATE UNIQUE INDEX "blocked_shop_customers_shopkeeperId_customerId_key" ON "blocked_shop_customers"("shopkeeperId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "distributor_profiles_userId_key" ON "distributor_profiles"("userId");

-- CreateIndex
CREATE INDEX "distributor_locations_distributorId_idx" ON "distributor_locations"("distributorId");

-- CreateIndex
CREATE UNIQUE INDEX "distributor_products_sku_key" ON "distributor_products"("sku");

-- CreateIndex
CREATE INDEX "distributor_products_distributorId_idx" ON "distributor_products"("distributorId");

-- CreateIndex
CREATE INDEX "distributor_products_categoryId_idx" ON "distributor_products"("categoryId");

-- CreateIndex
CREATE INDEX "distributor_inventories_locationId_idx" ON "distributor_inventories"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "distributor_inventories_distributorProductId_locationId_key" ON "distributor_inventories"("distributorProductId", "locationId");

-- CreateIndex
CREATE INDEX "stock_transfers_distributorId_idx" ON "stock_transfers"("distributorId");

-- CreateIndex
CREATE INDEX "stock_transfers_distributorProductId_idx" ON "stock_transfers"("distributorProductId");

-- CreateIndex
CREATE UNIQUE INDEX "wholesale_orders_orderNumber_key" ON "wholesale_orders"("orderNumber");

-- CreateIndex
CREATE INDEX "wholesale_orders_buyerShopkeeperId_idx" ON "wholesale_orders"("buyerShopkeeperId");

-- CreateIndex
CREATE INDEX "wholesale_orders_distributorId_idx" ON "wholesale_orders"("distributorId");

-- CreateIndex
CREATE INDEX "wholesale_orders_status_idx" ON "wholesale_orders"("status");

-- CreateIndex
CREATE INDEX "wholesale_order_items_wholesaleOrderId_idx" ON "wholesale_order_items"("wholesaleOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "team_member_profiles_userId_key" ON "team_member_profiles"("userId");

-- CreateIndex
CREATE INDEX "kyc_documents_userId_idx" ON "kyc_documents"("userId");

-- CreateIndex
CREATE INDEX "kyc_documents_status_idx" ON "kyc_documents"("status");

-- CreateIndex
CREATE INDEX "kyc_documents_documentNumberNormalized_idx" ON "kyc_documents"("documentNumberNormalized");

-- CreateIndex
CREATE INDEX "kyc_documents_idFileHash_idx" ON "kyc_documents"("idFileHash");

-- CreateIndex
CREATE INDEX "kyc_documents_idBackFileHash_idx" ON "kyc_documents"("idBackFileHash");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_type_idx" ON "categories"("type");

-- CreateIndex
CREATE INDEX "categories_isActive_idx" ON "categories"("isActive");

-- CreateIndex
CREATE INDEX "category_attributes_categoryId_idx" ON "category_attributes"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "category_attributes_categoryId_key_key" ON "category_attributes"("categoryId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "counties_name_key" ON "counties"("name");

-- CreateIndex
CREATE INDEX "counties_isActive_idx" ON "counties"("isActive");

-- CreateIndex
CREATE INDEX "services_providerId_idx" ON "services"("providerId");

-- CreateIndex
CREATE INDEX "services_categoryId_idx" ON "services"("categoryId");

-- CreateIndex
CREATE INDEX "services_isActive_approvalStatus_rating_idx" ON "services"("isActive", "approvalStatus", "rating");

-- CreateIndex
CREATE INDEX "service_packages_serviceId_idx" ON "service_packages"("serviceId");

-- CreateIndex
CREATE INDEX "products_shopkeeperId_idx" ON "products"("shopkeeperId");

-- CreateIndex
CREATE INDEX "products_categoryId_idx" ON "products"("categoryId");

-- CreateIndex
CREATE INDEX "products_isActive_createdAt_idx" ON "products"("isActive", "createdAt");

-- CreateIndex
CREATE INDEX "products_isActive_rating_idx" ON "products"("isActive", "rating");

-- CreateIndex
CREATE INDEX "products_shopkeeperId_barcode_idx" ON "products"("shopkeeperId", "barcode");

-- CreateIndex
CREATE UNIQUE INDEX "products_shopkeeperId_sku_key" ON "products"("shopkeeperId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_productId_key" ON "inventory"("productId");

-- CreateIndex
CREATE INDEX "portfolio_items_providerId_idx" ON "portfolio_items"("providerId");

-- CreateIndex
CREATE INDEX "shop_portfolio_items_shopkeeperId_idx" ON "shop_portfolio_items"("shopkeeperId");

-- CreateIndex
CREATE INDEX "certifications_providerId_idx" ON "certifications"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "provider_availability_providerId_key" ON "provider_availability"("providerId");

-- CreateIndex
CREATE INDEX "blocked_dates_providerId_idx" ON "blocked_dates"("providerId");

-- CreateIndex
CREATE INDEX "jobs_customerId_idx" ON "jobs"("customerId");

-- CreateIndex
CREATE INDEX "jobs_providerId_idx" ON "jobs"("providerId");

-- CreateIndex
CREATE INDEX "jobs_status_idx" ON "jobs"("status");

-- CreateIndex
CREATE INDEX "jobs_scheduledDate_idx" ON "jobs"("scheduledDate");

-- CreateIndex
CREATE INDEX "recurring_maintenances_customerId_idx" ON "recurring_maintenances"("customerId");

-- CreateIndex
CREATE INDEX "recurring_maintenances_nextDueAt_idx" ON "recurring_maintenances"("nextDueAt");

-- CreateIndex
CREATE UNIQUE INDEX "driver_profiles_userId_key" ON "driver_profiles"("userId");

-- CreateIndex
CREATE INDEX "safety_incidents_jobId_idx" ON "safety_incidents"("jobId");

-- CreateIndex
CREATE INDEX "safety_incidents_status_idx" ON "safety_incidents"("status");

-- CreateIndex
CREATE INDEX "identity_verifications_jobId_idx" ON "identity_verifications"("jobId");

-- CreateIndex
CREATE INDEX "identity_verifications_providerId_idx" ON "identity_verifications"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "households_ownerUserId_key" ON "households"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "household_members_userId_key" ON "household_members"("userId");

-- CreateIndex
CREATE INDEX "household_members_householdId_idx" ON "household_members"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "household_invites_token_key" ON "household_invites"("token");

-- CreateIndex
CREATE INDEX "household_invites_householdId_idx" ON "household_invites"("householdId");

-- CreateIndex
CREATE INDEX "procurement_requests_businessUserId_idx" ON "procurement_requests"("businessUserId");

-- CreateIndex
CREATE INDEX "procurement_requests_status_idx" ON "procurement_requests"("status");

-- CreateIndex
CREATE INDEX "supplier_quotes_procurementRequestId_idx" ON "supplier_quotes"("procurementRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_procurementRequestId_key" ON "purchase_orders"("procurementRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_confirmations_purchaseOrderId_key" ON "delivery_confirmations"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "provider_opportunities_postedByProviderId_idx" ON "provider_opportunities"("postedByProviderId");

-- CreateIndex
CREATE INDEX "provider_opportunities_categoryId_idx" ON "provider_opportunities"("categoryId");

-- CreateIndex
CREATE INDEX "provider_opportunities_status_idx" ON "provider_opportunities"("status");

-- CreateIndex
CREATE INDEX "opportunity_responses_opportunityId_idx" ON "opportunity_responses"("opportunityId");

-- CreateIndex
CREATE UNIQUE INDEX "warranties_jobId_key" ON "warranties"("jobId");

-- CreateIndex
CREATE INDEX "warranties_providerId_idx" ON "warranties"("providerId");

-- CreateIndex
CREATE INDEX "warranty_claims_warrantyId_idx" ON "warranty_claims"("warrantyId");

-- CreateIndex
CREATE UNIQUE INDEX "qr_handshakes_token_key" ON "qr_handshakes"("token");

-- CreateIndex
CREATE INDEX "qr_handshakes_jobId_idx" ON "qr_handshakes"("jobId");

-- CreateIndex
CREATE INDEX "qr_handshakes_token_idx" ON "qr_handshakes"("token");

-- CreateIndex
CREATE INDEX "change_orders_jobId_idx" ON "change_orders"("jobId");

-- CreateIndex
CREATE INDEX "change_orders_status_idx" ON "change_orders"("status");

-- CreateIndex
CREATE INDEX "job_events_jobId_idx" ON "job_events"("jobId");

-- CreateIndex
CREATE INDEX "job_events_jobId_createdAt_idx" ON "job_events"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "job_events_contractId_idx" ON "job_events"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "service_contracts_jobId_key" ON "service_contracts"("jobId");

-- CreateIndex
CREATE INDEX "service_contracts_customerId_idx" ON "service_contracts"("customerId");

-- CreateIndex
CREATE INDEX "service_contracts_providerId_idx" ON "service_contracts"("providerId");

-- CreateIndex
CREATE INDEX "service_contracts_status_idx" ON "service_contracts"("status");

-- CreateIndex
CREATE INDEX "contract_milestones_contractId_idx" ON "contract_milestones"("contractId");

-- CreateIndex
CREATE INDEX "job_expenses_jobId_idx" ON "job_expenses"("jobId");

-- CreateIndex
CREATE INDEX "customer_requests_customerId_idx" ON "customer_requests"("customerId");

-- CreateIndex
CREATE INDEX "customer_requests_categoryId_idx" ON "customer_requests"("categoryId");

-- CreateIndex
CREATE INDEX "customer_requests_status_idx" ON "customer_requests"("status");

-- CreateIndex
CREATE INDEX "customer_requests_latitude_longitude_idx" ON "customer_requests"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "customer_request_photos_requestId_idx" ON "customer_request_photos"("requestId");

-- CreateIndex
CREATE INDEX "request_responses_requestId_idx" ON "request_responses"("requestId");

-- CreateIndex
CREATE INDEX "request_responses_responderId_idx" ON "request_responses"("responderId");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_jobId_key" ON "reviews"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_orderId_key" ON "reviews"("orderId");

-- CreateIndex
CREATE INDEX "reviews_providerId_idx" ON "reviews"("providerId");

-- CreateIndex
CREATE INDEX "reviews_shopkeeperId_idx" ON "reviews"("shopkeeperId");

-- CreateIndex
CREATE INDEX "reviews_productId_idx" ON "reviews"("productId");

-- CreateIndex
CREATE INDEX "reviews_customerId_idx" ON "reviews"("customerId");

-- CreateIndex
CREATE INDEX "addresses_userId_idx" ON "addresses"("userId");

-- CreateIndex
CREATE INDEX "cart_items_customerId_serviceId_idx" ON "cart_items"("customerId", "serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "cart_items_customerId_productId_key" ON "cart_items"("customerId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "cart_items_customerId_offerId_key" ON "cart_items"("customerId", "offerId");

-- CreateIndex
CREATE INDEX "wishlist_items_customerId_idx" ON "wishlist_items"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "orders_orderNumber_key" ON "orders"("orderNumber");

-- CreateIndex
CREATE INDEX "orders_customerId_idx" ON "orders"("customerId");

-- CreateIndex
CREATE INDEX "orders_shopkeeperId_idx" ON "orders"("shopkeeperId");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "order_items_orderId_idx" ON "order_items"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_userId_key" ON "wallets"("userId");

-- CreateIndex
CREATE INDEX "transactions_walletId_idx" ON "transactions"("walletId");

-- CreateIndex
CREATE INDEX "transactions_type_idx" ON "transactions"("type");

-- CreateIndex
CREATE INDEX "transactions_createdAt_idx" ON "transactions"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_accounts_userId_key" ON "loyalty_accounts"("userId");

-- CreateIndex
CREATE INDEX "loyalty_transactions_accountId_idx" ON "loyalty_transactions"("accountId");

-- CreateIndex
CREATE INDEX "payment_methods_userId_idx" ON "payment_methods"("userId");

-- CreateIndex
CREATE INDEX "payments_payerId_idx" ON "payments"("payerId");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payments_jobId_idx" ON "payments"("jobId");

-- CreateIndex
CREATE INDEX "payments_orderId_idx" ON "payments"("orderId");

-- CreateIndex
CREATE INDEX "payments_wholesaleOrderId_idx" ON "payments"("wholesaleOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "withdrawal_requests_b2cConversationId_key" ON "withdrawal_requests"("b2cConversationId");

-- CreateIndex
CREATE INDEX "withdrawal_requests_userId_idx" ON "withdrawal_requests"("userId");

-- CreateIndex
CREATE INDEX "withdrawal_requests_status_idx" ON "withdrawal_requests"("status");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_receiptNumber_key" ON "receipts"("receiptNumber");

-- CreateIndex
CREATE INDEX "receipts_userId_idx" ON "receipts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoiceNumber_key" ON "invoices"("invoiceNumber");

-- CreateIndex
CREATE INDEX "invoices_providerId_idx" ON "invoices"("providerId");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE INDEX "invoice_items_invoiceId_idx" ON "invoice_items"("invoiceId");

-- CreateIndex
CREATE INDEX "quotes_providerId_idx" ON "quotes"("providerId");

-- CreateIndex
CREATE INDEX "quotes_status_idx" ON "quotes"("status");

-- CreateIndex
CREATE INDEX "quote_items_quoteId_idx" ON "quote_items"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_jobId_key" ON "conversations"("jobId");

-- CreateIndex
CREATE INDEX "conversations_participantAId_idx" ON "conversations"("participantAId");

-- CreateIndex
CREATE INDEX "conversations_participantBId_idx" ON "conversations"("participantBId");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_participantAId_participantBId_jobId_key" ON "conversations"("participantAId", "participantBId", "jobId");

-- CreateIndex
CREATE INDEX "messages_conversationId_idx" ON "messages"("conversationId");

-- CreateIndex
CREATE INDEX "messages_senderId_idx" ON "messages"("senderId");

-- CreateIndex
CREATE INDEX "call_logs_conversationId_createdAt_idx" ON "call_logs"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "call_logs_callerId_idx" ON "call_logs"("callerId");

-- CreateIndex
CREATE INDEX "call_logs_calleeId_idx" ON "call_logs"("calleeId");

-- CreateIndex
CREATE INDEX "call_signals_conversationId_createdAt_idx" ON "call_signals"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "call_signals_toUserId_idx" ON "call_signals"("toUserId");

-- CreateIndex
CREATE INDEX "notifications_userId_idx" ON "notifications"("userId");

-- CreateIndex
CREATE INDEX "notifications_isRead_idx" ON "notifications"("isRead");

-- CreateIndex
CREATE UNIQUE INDEX "disputes_disputeNumber_key" ON "disputes"("disputeNumber");

-- CreateIndex
CREATE INDEX "disputes_customerId_idx" ON "disputes"("customerId");

-- CreateIndex
CREATE INDEX "disputes_providerId_idx" ON "disputes"("providerId");

-- CreateIndex
CREATE INDEX "disputes_status_idx" ON "disputes"("status");

-- CreateIndex
CREATE INDEX "dispute_messages_disputeId_idx" ON "dispute_messages"("disputeId");

-- CreateIndex
CREATE INDEX "commission_tiers_role_idx" ON "commission_tiers"("role");

-- CreateIndex
CREATE INDEX "commission_tiers_status_idx" ON "commission_tiers"("status");

-- CreateIndex
CREATE UNIQUE INDEX "platform_revenue_sourceId_key" ON "platform_revenue"("sourceId");

-- CreateIndex
CREATE INDEX "platform_revenue_userId_idx" ON "platform_revenue"("userId");

-- CreateIndex
CREATE INDEX "platform_revenue_role_idx" ON "platform_revenue"("role");

-- CreateIndex
CREATE INDEX "announcements_status_idx" ON "announcements"("status");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_idx" ON "audit_logs"("entityType");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "subscribers_email_key" ON "subscribers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "subscribers_unsubscribeToken_key" ON "subscribers"("unsubscribeToken");

-- CreateIndex
CREATE UNIQUE INDEX "platform_settings_key_key" ON "platform_settings"("key");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_code_key" ON "exchange_rates"("code");

-- CreateIndex
CREATE INDEX "banners_placement_isActive_idx" ON "banners"("placement", "isActive");

-- CreateIndex
CREATE INDEX "chat_blocks_blockedId_idx" ON "chat_blocks"("blockedId");

-- CreateIndex
CREATE UNIQUE INDEX "chat_blocks_blockerId_blockedId_key" ON "chat_blocks"("blockerId", "blockedId");

-- CreateIndex
CREATE INDEX "policy_violations_userId_idx" ON "policy_violations"("userId");

-- CreateIndex
CREATE INDEX "policy_violations_reviewed_idx" ON "policy_violations"("reviewed");

-- CreateIndex
CREATE INDEX "content_reports_targetType_targetId_idx" ON "content_reports"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "content_reports_status_idx" ON "content_reports"("status");

-- CreateIndex
CREATE INDEX "reconciliations_status_idx" ON "reconciliations"("status");

-- CreateIndex
CREATE INDEX "reconciliation_discrepancies_reconciliationId_idx" ON "reconciliation_discrepancies"("reconciliationId");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_referredUserId_key" ON "referrals"("referredUserId");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_referralCode_key" ON "referrals"("referralCode");

-- CreateIndex
CREATE INDEX "referrals_referrerId_idx" ON "referrals"("referrerId");

-- CreateIndex
CREATE INDEX "endorsements_toUserId_idx" ON "endorsements"("toUserId");

-- CreateIndex
CREATE INDEX "endorsements_toShopId_idx" ON "endorsements"("toShopId");

-- CreateIndex
CREATE UNIQUE INDEX "promotions_code_key" ON "promotions"("code");

-- CreateIndex
CREATE INDEX "promotions_shopkeeperId_idx" ON "promotions"("shopkeeperId");

-- CreateIndex
CREATE INDEX "promotions_status_idx" ON "promotions"("status");

-- CreateIndex
CREATE INDEX "posts_authorId_idx" ON "posts"("authorId");

-- CreateIndex
CREATE INDEX "posts_createdAt_idx" ON "posts"("createdAt");

-- CreateIndex
CREATE INDEX "post_likes_postId_idx" ON "post_likes"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "post_likes_postId_userId_key" ON "post_likes"("postId", "userId");

-- CreateIndex
CREATE INDEX "post_saves_postId_idx" ON "post_saves"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "post_saves_postId_userId_key" ON "post_saves"("postId", "userId");

-- CreateIndex
CREATE INDEX "post_comments_postId_idx" ON "post_comments"("postId");

-- CreateIndex
CREATE INDEX "provider_statuses_providerId_idx" ON "provider_statuses"("providerId");

-- CreateIndex
CREATE INDEX "provider_statuses_createdAt_idx" ON "provider_statuses"("createdAt");

-- CreateIndex
CREATE INDEX "provider_status_views_statusId_idx" ON "provider_status_views"("statusId");

-- CreateIndex
CREATE UNIQUE INDEX "provider_status_views_statusId_userId_key" ON "provider_status_views"("statusId", "userId");

-- CreateIndex
CREATE INDEX "provider_status_likes_statusId_idx" ON "provider_status_likes"("statusId");

-- CreateIndex
CREATE UNIQUE INDEX "provider_status_likes_statusId_userId_key" ON "provider_status_likes"("statusId", "userId");

-- CreateIndex
CREATE INDEX "follows_followerId_idx" ON "follows"("followerId");

-- CreateIndex
CREATE INDEX "follows_followingId_idx" ON "follows"("followingId");

-- CreateIndex
CREATE UNIQUE INDEX "follows_followerId_followingId_key" ON "follows"("followerId", "followingId");

-- CreateIndex
CREATE INDEX "blocked_clients_providerId_idx" ON "blocked_clients"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "blocked_clients_providerId_customerId_key" ON "blocked_clients"("providerId", "customerId");

-- CreateIndex
CREATE INDEX "group_memberships_groupId_idx" ON "group_memberships"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "group_memberships_groupId_userId_key" ON "group_memberships"("groupId", "userId");

-- CreateIndex
CREATE INDEX "group_posts_groupId_idx" ON "group_posts"("groupId");

-- CreateIndex
CREATE INDEX "group_post_likes_groupPostId_idx" ON "group_post_likes"("groupPostId");

-- CreateIndex
CREATE UNIQUE INDEX "group_post_likes_groupPostId_userId_key" ON "group_post_likes"("groupPostId", "userId");

-- CreateIndex
CREATE INDEX "group_post_comments_groupPostId_idx" ON "group_post_comments"("groupPostId");

-- CreateIndex
CREATE INDEX "support_tickets_userId_idx" ON "support_tickets"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "chatbot_conversations_escalatedTicketId_key" ON "chatbot_conversations"("escalatedTicketId");

-- CreateIndex
CREATE INDEX "chatbot_conversations_userId_idx" ON "chatbot_conversations"("userId");

-- CreateIndex
CREATE INDEX "chatbot_messages_conversationId_idx" ON "chatbot_messages"("conversationId");

-- CreateIndex
CREATE INDEX "recently_viewed_userId_viewedAt_idx" ON "recently_viewed"("userId", "viewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "recently_viewed_userId_targetType_targetId_key" ON "recently_viewed"("userId", "targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_userId_idx" ON "push_subscriptions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "live_sessions_roomName_key" ON "live_sessions"("roomName");

-- CreateIndex
CREATE INDEX "live_sessions_providerId_idx" ON "live_sessions"("providerId");

-- CreateIndex
CREATE INDEX "live_sessions_shopkeeperId_idx" ON "live_sessions"("shopkeeperId");

-- CreateIndex
CREATE INDEX "live_sessions_status_idx" ON "live_sessions"("status");

-- CreateIndex
CREATE INDEX "live_chat_messages_liveSessionId_idx" ON "live_chat_messages"("liveSessionId");

-- CreateIndex
CREATE INDEX "live_session_products_liveSessionId_idx" ON "live_session_products"("liveSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "live_session_products_liveSessionId_productId_key" ON "live_session_products"("liveSessionId", "productId");

-- CreateIndex
CREATE INDEX "live_gifts_liveSessionId_idx" ON "live_gifts"("liveSessionId");

-- CreateIndex
CREATE INDEX "live_gifts_senderId_idx" ON "live_gifts"("senderId");

-- CreateIndex
CREATE INDEX "coin_transactions_userId_idx" ON "coin_transactions"("userId");

-- CreateIndex
CREATE INDEX "pro_capabilities_status_idx" ON "pro_capabilities"("status");

-- CreateIndex
CREATE INDEX "pro_capabilities_userId_idx" ON "pro_capabilities"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "pro_capabilities_userId_type_key" ON "pro_capabilities"("userId", "type");

-- CreateIndex
CREATE INDEX "pro_module_settings_businessType_idx" ON "pro_module_settings"("businessType");

-- CreateIndex
CREATE UNIQUE INDEX "pro_module_settings_businessType_moduleKey_key" ON "pro_module_settings"("businessType", "moduleKey");

-- CreateIndex
CREATE INDEX "stock_movements_shopkeeperId_batchId_occurredAt_idx" ON "stock_movements"("shopkeeperId", "batchId", "occurredAt");

-- CreateIndex
CREATE INDEX "stock_movements_shopkeeperId_variantId_occurredAt_idx" ON "stock_movements"("shopkeeperId", "variantId", "occurredAt");

-- CreateIndex
CREATE INDEX "stock_movements_shopkeeperId_productId_occurredAt_idx" ON "stock_movements"("shopkeeperId", "productId", "occurredAt");

-- CreateIndex
CREATE INDEX "stock_movements_shopkeeperId_occurredAt_idx" ON "stock_movements"("shopkeeperId", "occurredAt");

-- CreateIndex
CREATE INDEX "stock_movements_shopkeeperId_kind_occurredAt_idx" ON "stock_movements"("shopkeeperId", "kind", "occurredAt");

-- CreateIndex
CREATE INDEX "stock_movements_posSaleId_idx" ON "stock_movements"("posSaleId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_shopkeeperId_idempotencyKey_key" ON "stock_movements"("shopkeeperId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "pos_sales_shopkeeperId_occurredAt_idx" ON "pos_sales"("shopkeeperId", "occurredAt");

-- CreateIndex
CREATE INDEX "pos_sales_shopkeeperId_status_occurredAt_idx" ON "pos_sales"("shopkeeperId", "status", "occurredAt");

-- CreateIndex
CREATE INDEX "pos_sales_tillSessionId_idx" ON "pos_sales"("tillSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "pos_sales_shopkeeperId_saleNumber_key" ON "pos_sales"("shopkeeperId", "saleNumber");

-- CreateIndex
CREATE UNIQUE INDEX "pos_sales_shopkeeperId_idempotencyKey_key" ON "pos_sales"("shopkeeperId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "pos_sale_items_saleId_idx" ON "pos_sale_items"("saleId");

-- CreateIndex
CREATE INDEX "pos_sale_items_batchId_idx" ON "pos_sale_items"("batchId");

-- CreateIndex
CREATE INDEX "pos_sale_items_productId_idx" ON "pos_sale_items"("productId");

-- CreateIndex
CREATE INDEX "pos_payments_saleId_idx" ON "pos_payments"("saleId");

-- CreateIndex
CREATE INDEX "till_sessions_shopkeeperId_openedAt_idx" ON "till_sessions"("shopkeeperId", "openedAt");

-- CreateIndex
CREATE INDEX "till_sessions_shopkeeperId_closedAt_idx" ON "till_sessions"("shopkeeperId", "closedAt");

-- CreateIndex
CREATE UNIQUE INDEX "pos_businesses_ownerUserId_key" ON "pos_businesses"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "pos_stores_shopkeeperId_key" ON "pos_stores"("shopkeeperId");

-- CreateIndex
CREATE INDEX "pos_stores_businessId_idx" ON "pos_stores"("businessId");

-- CreateIndex
CREATE INDEX "pos_staff_businessId_idx" ON "pos_staff"("businessId");

-- CreateIndex
CREATE INDEX "pos_staff_storeId_idx" ON "pos_staff"("storeId");

-- CreateIndex
CREATE INDEX "pos_staff_userId_idx" ON "pos_staff"("userId");

-- CreateIndex
CREATE INDEX "pos_audit_events_businessId_createdAt_idx" ON "pos_audit_events"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "pos_audit_events_businessId_action_idx" ON "pos_audit_events"("businessId", "action");

-- CreateIndex
CREATE INDEX "pos_returns_shopkeeperId_occurredAt_idx" ON "pos_returns"("shopkeeperId", "occurredAt");

-- CreateIndex
CREATE INDEX "pos_returns_saleId_idx" ON "pos_returns"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "pos_returns_shopkeeperId_returnNumber_key" ON "pos_returns"("shopkeeperId", "returnNumber");

-- CreateIndex
CREATE INDEX "pos_return_items_returnId_idx" ON "pos_return_items"("returnId");

-- CreateIndex
CREATE INDEX "pos_return_items_saleItemId_idx" ON "pos_return_items"("saleItemId");

-- CreateIndex
CREATE INDEX "pos_suppliers_shopkeeperId_idx" ON "pos_suppliers"("shopkeeperId");

-- CreateIndex
CREATE UNIQUE INDEX "pos_suppliers_shopkeeperId_name_key" ON "pos_suppliers"("shopkeeperId", "name");

-- CreateIndex
CREATE INDEX "pos_purchase_orders_shopkeeperId_status_idx" ON "pos_purchase_orders"("shopkeeperId", "status");

-- CreateIndex
CREATE INDEX "pos_purchase_orders_supplierId_idx" ON "pos_purchase_orders"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "pos_purchase_orders_shopkeeperId_orderNumber_key" ON "pos_purchase_orders"("shopkeeperId", "orderNumber");

-- CreateIndex
CREATE INDEX "pos_purchase_order_items_orderId_idx" ON "pos_purchase_order_items"("orderId");

-- CreateIndex
CREATE INDEX "pos_goods_receipts_shopkeeperId_occurredAt_idx" ON "pos_goods_receipts"("shopkeeperId", "occurredAt");

-- CreateIndex
CREATE INDEX "pos_goods_receipts_orderId_idx" ON "pos_goods_receipts"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "pos_goods_receipts_shopkeeperId_receiptNumber_key" ON "pos_goods_receipts"("shopkeeperId", "receiptNumber");

-- CreateIndex
CREATE INDEX "pos_goods_receipt_items_receiptId_idx" ON "pos_goods_receipt_items"("receiptId");

-- CreateIndex
CREATE INDEX "pos_customers_shopkeeperId_idx" ON "pos_customers"("shopkeeperId");

-- CreateIndex
CREATE INDEX "pos_customers_shopkeeperId_name_idx" ON "pos_customers"("shopkeeperId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "pos_customers_shopkeeperId_phone_key" ON "pos_customers"("shopkeeperId", "phone");

-- CreateIndex
CREATE INDEX "pos_loyalty_entries_customerId_occurredAt_idx" ON "pos_loyalty_entries"("customerId", "occurredAt");

-- CreateIndex
CREATE INDEX "pos_loyalty_entries_shopkeeperId_occurredAt_idx" ON "pos_loyalty_entries"("shopkeeperId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "pos_loyalty_entries_shopkeeperId_idempotencyKey_key" ON "pos_loyalty_entries"("shopkeeperId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "pos_devices_tokenHash_key" ON "pos_devices"("tokenHash");

-- CreateIndex
CREATE INDEX "pos_devices_shopkeeperId_idx" ON "pos_devices"("shopkeeperId");

-- CreateIndex
CREATE INDEX "pos_cashiers_shopkeeperId_isActive_idx" ON "pos_cashiers"("shopkeeperId", "isActive");

-- CreateIndex
CREATE INDEX "product_variants_productId_position_idx" ON "product_variants"("productId", "position");

-- CreateIndex
CREATE INDEX "product_variants_shopkeeperId_barcode_idx" ON "product_variants"("shopkeeperId", "barcode");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_shopkeeperId_sku_key" ON "product_variants"("shopkeeperId", "sku");

-- CreateIndex
CREATE INDEX "product_batches_shopkeeperId_productId_expiryDate_idx" ON "product_batches"("shopkeeperId", "productId", "expiryDate");

-- CreateIndex
CREATE INDEX "product_batches_shopkeeperId_expiryDate_idx" ON "product_batches"("shopkeeperId", "expiryDate");

-- CreateIndex
CREATE INDEX "product_batches_variantId_idx" ON "product_batches"("variantId");

-- CreateIndex
CREATE INDEX "product_serials_shopkeeperId_productId_status_idx" ON "product_serials"("shopkeeperId", "productId", "status");

-- CreateIndex
CREATE INDEX "product_serials_posSaleItemId_idx" ON "product_serials"("posSaleItemId");

-- CreateIndex
CREATE UNIQUE INDEX "product_serials_shopkeeperId_serial_key" ON "product_serials"("shopkeeperId", "serial");

-- CreateIndex
CREATE INDEX "controlled_sale_records_shopkeeperId_occurredAt_idx" ON "controlled_sale_records"("shopkeeperId", "occurredAt");

-- CreateIndex
CREATE INDEX "controlled_sale_records_shopkeeperId_productName_idx" ON "controlled_sale_records"("shopkeeperId", "productName");

-- CreateIndex
CREATE INDEX "controlled_sale_records_posSaleId_idx" ON "controlled_sale_records"("posSaleId");

-- CreateIndex
CREATE INDEX "pos_expenses_shopkeeperId_occurredAt_idx" ON "pos_expenses"("shopkeeperId", "occurredAt");

-- CreateIndex
CREATE INDEX "pos_expenses_shopkeeperId_category_occurredAt_idx" ON "pos_expenses"("shopkeeperId", "category", "occurredAt");

-- CreateIndex
CREATE INDEX "pos_etims_invoices_shopkeeperId_status_idx" ON "pos_etims_invoices"("shopkeeperId", "status");

-- CreateIndex
CREATE INDEX "pos_etims_invoices_shopkeeperId_createdAt_idx" ON "pos_etims_invoices"("shopkeeperId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "pos_etims_invoices_posSaleId_kind_key" ON "pos_etims_invoices"("posSaleId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "pos_subscriptions_businessId_key" ON "pos_subscriptions"("businessId");

-- CreateIndex
CREATE INDEX "pos_subscriptions_status_idx" ON "pos_subscriptions"("status");

-- CreateIndex
CREATE INDEX "pos_billing_charges_businessId_createdAt_idx" ON "pos_billing_charges"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "pos_billing_charges_status_idx" ON "pos_billing_charges"("status");

-- CreateIndex
CREATE INDEX "pos_cash_movements_shopkeeperId_occurredAt_idx" ON "pos_cash_movements"("shopkeeperId", "occurredAt");

-- CreateIndex
CREATE INDEX "pos_cash_movements_tillSessionId_idx" ON "pos_cash_movements"("tillSessionId");

-- CreateIndex
CREATE INDEX "pos_stock_counts_shopkeeperId_status_startedAt_idx" ON "pos_stock_counts"("shopkeeperId", "status", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "pos_stock_counts_shopkeeperId_reference_key" ON "pos_stock_counts"("shopkeeperId", "reference");

-- CreateIndex
CREATE INDEX "pos_stock_count_lines_countId_idx" ON "pos_stock_count_lines"("countId");

-- CreateIndex
CREATE INDEX "pos_stock_count_lines_productId_idx" ON "pos_stock_count_lines"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "pos_stock_count_lines_countId_productId_variantId_key" ON "pos_stock_count_lines"("countId", "productId", "variantId");

-- CreateIndex
CREATE INDEX "pos_job_cards_shopkeeperId_status_receivedAt_idx" ON "pos_job_cards"("shopkeeperId", "status", "receivedAt");

-- CreateIndex
CREATE INDEX "pos_job_cards_shopkeeperId_itemIdentifier_idx" ON "pos_job_cards"("shopkeeperId", "itemIdentifier");

-- CreateIndex
CREATE UNIQUE INDEX "pos_job_cards_shopkeeperId_reference_key" ON "pos_job_cards"("shopkeeperId", "reference");

-- CreateIndex
CREATE INDEX "pos_job_lines_jobId_idx" ON "pos_job_lines"("jobId");

-- CreateIndex
CREATE INDEX "pos_job_lines_productId_idx" ON "pos_job_lines"("productId");

-- CreateIndex
CREATE INDEX "pos_credit_entries_shopkeeperId_occurredAt_idx" ON "pos_credit_entries"("shopkeeperId", "occurredAt");

-- CreateIndex
CREATE INDEX "pos_credit_entries_posCustomerId_occurredAt_idx" ON "pos_credit_entries"("posCustomerId", "occurredAt");

-- CreateIndex
CREATE INDEX "pos_credit_entries_shopkeeperId_dueOn_idx" ON "pos_credit_entries"("shopkeeperId", "dueOn");

-- CreateIndex
CREATE INDEX "pos_stock_transfers_fromShopkeeperId_status_idx" ON "pos_stock_transfers"("fromShopkeeperId", "status");

-- CreateIndex
CREATE INDEX "pos_stock_transfers_toShopkeeperId_status_idx" ON "pos_stock_transfers"("toShopkeeperId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "pos_stock_transfers_businessId_reference_key" ON "pos_stock_transfers"("businessId", "reference");

-- CreateIndex
CREATE INDEX "pos_stock_transfer_lines_transferId_idx" ON "pos_stock_transfer_lines"("transferId");

-- CreateIndex
CREATE INDEX "pos_stock_transfer_lines_productId_idx" ON "pos_stock_transfer_lines"("productId");

-- CreateIndex
CREATE INDEX "pos_price_lists_shopkeeperId_isActive_idx" ON "pos_price_lists"("shopkeeperId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "pos_price_lists_shopkeeperId_name_key" ON "pos_price_lists"("shopkeeperId", "name");

-- CreateIndex
CREATE INDEX "pos_price_list_items_priceListId_idx" ON "pos_price_list_items"("priceListId");

-- CreateIndex
CREATE UNIQUE INDEX "pos_price_list_items_priceListId_productId_minQuantity_key" ON "pos_price_list_items"("priceListId", "productId", "minQuantity");

-- CreateIndex
CREATE INDEX "pos_promotions_shopkeeperId_isActive_idx" ON "pos_promotions"("shopkeeperId", "isActive");

-- CreateIndex
CREATE INDEX "pos_promotions_shopkeeperId_productId_idx" ON "pos_promotions"("shopkeeperId", "productId");

-- CreateIndex
CREATE INDEX "pos_gift_cards_shopkeeperId_isActive_idx" ON "pos_gift_cards"("shopkeeperId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "pos_gift_cards_shopkeeperId_code_key" ON "pos_gift_cards"("shopkeeperId", "code");

-- CreateIndex
CREATE INDEX "pos_gift_card_entries_cardId_occurredAt_idx" ON "pos_gift_card_entries"("cardId", "occurredAt");

-- CreateIndex
CREATE INDEX "pos_quotes_shopkeeperId_status_createdAt_idx" ON "pos_quotes"("shopkeeperId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "pos_quotes_shopkeeperId_reference_key" ON "pos_quotes"("shopkeeperId", "reference");

-- CreateIndex
CREATE INDEX "pos_quote_lines_quoteId_idx" ON "pos_quote_lines"("quoteId");

-- CreateIndex
CREATE INDEX "pos_tables_shopkeeperId_isActive_idx" ON "pos_tables"("shopkeeperId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "pos_tables_shopkeeperId_name_key" ON "pos_tables"("shopkeeperId", "name");

-- CreateIndex
CREATE INDEX "pos_table_orders_shopkeeperId_status_openedAt_idx" ON "pos_table_orders"("shopkeeperId", "status", "openedAt");

-- CreateIndex
CREATE INDEX "pos_table_orders_tableId_status_idx" ON "pos_table_orders"("tableId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "pos_table_orders_shopkeeperId_reference_key" ON "pos_table_orders"("shopkeeperId", "reference");

-- CreateIndex
CREATE INDEX "pos_table_order_lines_orderId_idx" ON "pos_table_order_lines"("orderId");

-- CreateIndex
CREATE INDEX "pos_table_order_lines_sentToKitchenAt_idx" ON "pos_table_order_lines"("sentToKitchenAt");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_profiles" ADD CONSTRAINT "provider_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_profiles" ADD CONSTRAINT "provider_profiles_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_profiles" ADD CONSTRAINT "provider_profiles_affiliatedShopId_fkey" FOREIGN KEY ("affiliatedShopId") REFERENCES "shopkeeper_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_profiles" ADD CONSTRAINT "provider_profiles_parentBusinessId_fkey" FOREIGN KEY ("parentBusinessId") REFERENCES "provider_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "provider_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_bookings" ADD CONSTRAINT "rental_bookings_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_bookings" ADD CONSTRAINT "rental_bookings_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_bookings" ADD CONSTRAINT "rental_bookings_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "provider_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_subscriptions" ADD CONSTRAINT "provider_subscriptions_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "provider_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_invites" ADD CONSTRAINT "staff_invites_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "provider_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_invites" ADD CONSTRAINT "staff_invites_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_branches" ADD CONSTRAINT "business_branches_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "provider_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopkeeper_profiles" ADD CONSTRAINT "shopkeeper_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_shop_customers" ADD CONSTRAINT "blocked_shop_customers_shopkeeperId_fkey" FOREIGN KEY ("shopkeeperId") REFERENCES "shopkeeper_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_shop_customers" ADD CONSTRAINT "blocked_shop_customers_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributor_profiles" ADD CONSTRAINT "distributor_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributor_locations" ADD CONSTRAINT "distributor_locations_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "distributor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributor_products" ADD CONSTRAINT "distributor_products_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "distributor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributor_products" ADD CONSTRAINT "distributor_products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributor_inventories" ADD CONSTRAINT "distributor_inventories_distributorProductId_fkey" FOREIGN KEY ("distributorProductId") REFERENCES "distributor_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributor_inventories" ADD CONSTRAINT "distributor_inventories_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "distributor_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "distributor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_distributorProductId_fkey" FOREIGN KEY ("distributorProductId") REFERENCES "distributor_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "distributor_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "distributor_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wholesale_orders" ADD CONSTRAINT "wholesale_orders_buyerShopkeeperId_fkey" FOREIGN KEY ("buyerShopkeeperId") REFERENCES "shopkeeper_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wholesale_orders" ADD CONSTRAINT "wholesale_orders_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "distributor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wholesale_orders" ADD CONSTRAINT "wholesale_orders_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "distributor_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wholesale_order_items" ADD CONSTRAINT "wholesale_order_items_wholesaleOrderId_fkey" FOREIGN KEY ("wholesaleOrderId") REFERENCES "wholesale_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wholesale_order_items" ADD CONSTRAINT "wholesale_order_items_distributorProductId_fkey" FOREIGN KEY ("distributorProductId") REFERENCES "distributor_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wholesale_order_items" ADD CONSTRAINT "wholesale_order_items_restockProductId_fkey" FOREIGN KEY ("restockProductId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_member_profiles" ADD CONSTRAINT "team_member_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_member_profiles" ADD CONSTRAINT "team_member_profiles_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "team_member_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_documents" ADD CONSTRAINT "kyc_documents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_documents" ADD CONSTRAINT "kyc_documents_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_attributes" ADD CONSTRAINT "category_attributes_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "provider_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_packages" ADD CONSTRAINT "service_packages_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_shopkeeperId_fkey" FOREIGN KEY ("shopkeeperId") REFERENCES "shopkeeper_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_items" ADD CONSTRAINT "portfolio_items_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "provider_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_portfolio_items" ADD CONSTRAINT "shop_portfolio_items_shopkeeperId_fkey" FOREIGN KEY ("shopkeeperId") REFERENCES "shopkeeper_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "provider_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_availability" ADD CONSTRAINT "provider_availability_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "provider_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_dates" ADD CONSTRAINT "blocked_dates_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "provider_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "provider_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_servicePackageId_fkey" FOREIGN KEY ("servicePackageId") REFERENCES "service_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "customer_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_warrantyFollowUpForId_fkey" FOREIGN KEY ("warrantyFollowUpForId") REFERENCES "warranties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_profiles" ADD CONSTRAINT "driver_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_incidents" ADD CONSTRAINT "safety_incidents_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_verifications" ADD CONSTRAINT "identity_verifications_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_invites" ADD CONSTRAINT "household_invites_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_quotes" ADD CONSTRAINT "supplier_quotes_procurementRequestId_fkey" FOREIGN KEY ("procurementRequestId") REFERENCES "procurement_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_procurementRequestId_fkey" FOREIGN KEY ("procurementRequestId") REFERENCES "procurement_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_confirmations" ADD CONSTRAINT "delivery_confirmations_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_opportunities" ADD CONSTRAINT "provider_opportunities_postedByProviderId_fkey" FOREIGN KEY ("postedByProviderId") REFERENCES "provider_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_opportunities" ADD CONSTRAINT "provider_opportunities_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_responses" ADD CONSTRAINT "opportunity_responses_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "provider_opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_responses" ADD CONSTRAINT "opportunity_responses_responderProviderId_fkey" FOREIGN KEY ("responderProviderId") REFERENCES "provider_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "provider_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_warrantyId_fkey" FOREIGN KEY ("warrantyId") REFERENCES "warranties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_handshakes" ADD CONSTRAINT "qr_handshakes_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_orders" ADD CONSTRAINT "change_orders_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_events" ADD CONSTRAINT "job_events_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_events" ADD CONSTRAINT "job_events_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "service_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_contracts" ADD CONSTRAINT "service_contracts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_contracts" ADD CONSTRAINT "service_contracts_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "provider_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_contracts" ADD CONSTRAINT "service_contracts_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_contracts" ADD CONSTRAINT "service_contracts_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_milestones" ADD CONSTRAINT "contract_milestones_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "service_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_expenses" ADD CONSTRAINT "job_expenses_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_requests" ADD CONSTRAINT "customer_requests_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_requests" ADD CONSTRAINT "customer_requests_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_request_photos" ADD CONSTRAINT "customer_request_photos_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "customer_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_responses" ADD CONSTRAINT "request_responses_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "customer_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_responses" ADD CONSTRAINT "request_responses_responderId_fkey" FOREIGN KEY ("responderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_responses" ADD CONSTRAINT "request_responses_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "provider_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_shopkeeperId_fkey" FOREIGN KEY ("shopkeeperId") REFERENCES "shopkeeper_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_servicePackageId_fkey" FOREIGN KEY ("servicePackageId") REFERENCES "service_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "provider_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shopkeeper_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_shopkeeperId_fkey" FOREIGN KEY ("shopkeeperId") REFERENCES "shopkeeper_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "customer_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_accounts" ADD CONSTRAINT "loyalty_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "loyalty_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_wholesaleOrderId_fkey" FOREIGN KEY ("wholesaleOrderId") REFERENCES "wholesale_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_rentalBookingId_fkey" FOREIGN KEY ("rentalBookingId") REFERENCES "rental_bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_payeeId_fkey" FOREIGN KEY ("payeeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "payment_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "provider_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "provider_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_participantAId_fkey" FOREIGN KEY ("participantAId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_participantBId_fkey" FOREIGN KEY ("participantBId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_relatedStatusId_fkey" FOREIGN KEY ("relatedStatusId") REFERENCES "provider_statuses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_callerId_fkey" FOREIGN KEY ("callerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_calleeId_fkey" FOREIGN KEY ("calleeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_signals" ADD CONSTRAINT "call_signals_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "provider_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_messages" ADD CONSTRAINT "dispute_messages_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "disputes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_messages" ADD CONSTRAINT "dispute_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_tiers" ADD CONSTRAINT "commission_tiers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_revenue" ADD CONSTRAINT "platform_revenue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "banners" ADD CONSTRAINT "banners_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_blocks" ADD CONSTRAINT "chat_blocks_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_blocks" ADD CONSTRAINT "chat_blocks_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_violations" ADD CONSTRAINT "policy_violations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_reportedUserId_fkey" FOREIGN KEY ("reportedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_discrepancies" ADD CONSTRAINT "reconciliation_discrepancies_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "reconciliations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "endorsements" ADD CONSTRAINT "endorsements_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "endorsements" ADD CONSTRAINT "endorsements_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "endorsements" ADD CONSTRAINT "endorsements_toShopId_fkey" FOREIGN KEY ("toShopId") REFERENCES "shopkeeper_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_shopkeeperId_fkey" FOREIGN KEY ("shopkeeperId") REFERENCES "shopkeeper_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_saves" ADD CONSTRAINT "post_saves_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_saves" ADD CONSTRAINT "post_saves_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_statuses" ADD CONSTRAINT "provider_statuses_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_status_views" ADD CONSTRAINT "provider_status_views_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "provider_statuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_status_views" ADD CONSTRAINT "provider_status_views_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_status_likes" ADD CONSTRAINT "provider_status_likes_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "provider_statuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_status_likes" ADD CONSTRAINT "provider_status_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_clients" ADD CONSTRAINT "blocked_clients_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "provider_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_clients" ADD CONSTRAINT "blocked_clients_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_posts" ADD CONSTRAINT "group_posts_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_posts" ADD CONSTRAINT "group_posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_post_likes" ADD CONSTRAINT "group_post_likes_groupPostId_fkey" FOREIGN KEY ("groupPostId") REFERENCES "group_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_post_likes" ADD CONSTRAINT "group_post_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_post_comments" ADD CONSTRAINT "group_post_comments_groupPostId_fkey" FOREIGN KEY ("groupPostId") REFERENCES "group_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_post_comments" ADD CONSTRAINT "group_post_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_conversations" ADD CONSTRAINT "chatbot_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_conversations" ADD CONSTRAINT "chatbot_conversations_escalatedTicketId_fkey" FOREIGN KEY ("escalatedTicketId") REFERENCES "support_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_conversations" ADD CONSTRAINT "chatbot_conversations_assignedStaffId_fkey" FOREIGN KEY ("assignedStaffId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_messages" ADD CONSTRAINT "chatbot_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "chatbot_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_messages" ADD CONSTRAINT "chatbot_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recently_viewed" ADD CONSTRAINT "recently_viewed_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "provider_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_shopkeeperId_fkey" FOREIGN KEY ("shopkeeperId") REFERENCES "shopkeeper_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_chat_messages" ADD CONSTRAINT "live_chat_messages_liveSessionId_fkey" FOREIGN KEY ("liveSessionId") REFERENCES "live_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_chat_messages" ADD CONSTRAINT "live_chat_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_session_products" ADD CONSTRAINT "live_session_products_liveSessionId_fkey" FOREIGN KEY ("liveSessionId") REFERENCES "live_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_session_products" ADD CONSTRAINT "live_session_products_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_gifts" ADD CONSTRAINT "live_gifts_liveSessionId_fkey" FOREIGN KEY ("liveSessionId") REFERENCES "live_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_gifts" ADD CONSTRAINT "live_gifts_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_gifts" ADD CONSTRAINT "live_gifts_giftId_fkey" FOREIGN KEY ("giftId") REFERENCES "gifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coin_transactions" ADD CONSTRAINT "coin_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pro_capabilities" ADD CONSTRAINT "pro_capabilities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pro_capabilities" ADD CONSTRAINT "pro_capabilities_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pro_module_settings" ADD CONSTRAINT "pro_module_settings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_shopkeeperId_fkey" FOREIGN KEY ("shopkeeperId") REFERENCES "shopkeeper_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "product_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_sales" ADD CONSTRAINT "pos_sales_shopkeeperId_fkey" FOREIGN KEY ("shopkeeperId") REFERENCES "shopkeeper_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_sales" ADD CONSTRAINT "pos_sales_tillSessionId_fkey" FOREIGN KEY ("tillSessionId") REFERENCES "till_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_sales" ADD CONSTRAINT "pos_sales_posCustomerId_fkey" FOREIGN KEY ("posCustomerId") REFERENCES "pos_customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_sale_items" ADD CONSTRAINT "pos_sale_items_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "pos_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_sale_items" ADD CONSTRAINT "pos_sale_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_sale_items" ADD CONSTRAINT "pos_sale_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_sale_items" ADD CONSTRAINT "pos_sale_items_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "product_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_payments" ADD CONSTRAINT "pos_payments_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "pos_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "till_sessions" ADD CONSTRAINT "till_sessions_shopkeeperId_fkey" FOREIGN KEY ("shopkeeperId") REFERENCES "shopkeeper_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_businesses" ADD CONSTRAINT "pos_businesses_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_stores" ADD CONSTRAINT "pos_stores_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "pos_businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_stores" ADD CONSTRAINT "pos_stores_shopkeeperId_fkey" FOREIGN KEY ("shopkeeperId") REFERENCES "shopkeeper_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_staff" ADD CONSTRAINT "pos_staff_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "pos_businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_staff" ADD CONSTRAINT "pos_staff_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "pos_stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_staff" ADD CONSTRAINT "pos_staff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_returns" ADD CONSTRAINT "pos_returns_shopkeeperId_fkey" FOREIGN KEY ("shopkeeperId") REFERENCES "shopkeeper_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_returns" ADD CONSTRAINT "pos_returns_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "pos_sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_return_items" ADD CONSTRAINT "pos_return_items_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "pos_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_return_items" ADD CONSTRAINT "pos_return_items_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "pos_sale_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_suppliers" ADD CONSTRAINT "pos_suppliers_shopkeeperId_fkey" FOREIGN KEY ("shopkeeperId") REFERENCES "shopkeeper_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_purchase_orders" ADD CONSTRAINT "pos_purchase_orders_shopkeeperId_fkey" FOREIGN KEY ("shopkeeperId") REFERENCES "shopkeeper_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_purchase_orders" ADD CONSTRAINT "pos_purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "pos_suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_purchase_order_items" ADD CONSTRAINT "pos_purchase_order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "pos_purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_goods_receipts" ADD CONSTRAINT "pos_goods_receipts_shopkeeperId_fkey" FOREIGN KEY ("shopkeeperId") REFERENCES "shopkeeper_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_goods_receipts" ADD CONSTRAINT "pos_goods_receipts_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "pos_suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_goods_receipts" ADD CONSTRAINT "pos_goods_receipts_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "pos_purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_goods_receipt_items" ADD CONSTRAINT "pos_goods_receipt_items_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "pos_goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_customers" ADD CONSTRAINT "pos_customers_shopkeeperId_fkey" FOREIGN KEY ("shopkeeperId") REFERENCES "shopkeeper_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_customers" ADD CONSTRAINT "pos_customers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_customers" ADD CONSTRAINT "pos_customers_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "pos_price_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_loyalty_entries" ADD CONSTRAINT "pos_loyalty_entries_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "pos_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_devices" ADD CONSTRAINT "pos_devices_shopkeeperId_fkey" FOREIGN KEY ("shopkeeperId") REFERENCES "shopkeeper_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_cashiers" ADD CONSTRAINT "pos_cashiers_shopkeeperId_fkey" FOREIGN KEY ("shopkeeperId") REFERENCES "shopkeeper_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_serials" ADD CONSTRAINT "product_serials_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_serials" ADD CONSTRAINT "product_serials_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "controlled_sale_records" ADD CONSTRAINT "controlled_sale_records_shopkeeperId_fkey" FOREIGN KEY ("shopkeeperId") REFERENCES "shopkeeper_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_expenses" ADD CONSTRAINT "pos_expenses_shopkeeperId_fkey" FOREIGN KEY ("shopkeeperId") REFERENCES "shopkeeper_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_etims_invoices" ADD CONSTRAINT "pos_etims_invoices_shopkeeperId_fkey" FOREIGN KEY ("shopkeeperId") REFERENCES "shopkeeper_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_etims_invoices" ADD CONSTRAINT "pos_etims_invoices_posSaleId_fkey" FOREIGN KEY ("posSaleId") REFERENCES "pos_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_subscriptions" ADD CONSTRAINT "pos_subscriptions_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "pos_businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_billing_charges" ADD CONSTRAINT "pos_billing_charges_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "pos_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_cash_movements" ADD CONSTRAINT "pos_cash_movements_shopkeeperId_fkey" FOREIGN KEY ("shopkeeperId") REFERENCES "shopkeeper_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_cash_movements" ADD CONSTRAINT "pos_cash_movements_tillSessionId_fkey" FOREIGN KEY ("tillSessionId") REFERENCES "till_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_stock_counts" ADD CONSTRAINT "pos_stock_counts_shopkeeperId_fkey" FOREIGN KEY ("shopkeeperId") REFERENCES "shopkeeper_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_stock_count_lines" ADD CONSTRAINT "pos_stock_count_lines_countId_fkey" FOREIGN KEY ("countId") REFERENCES "pos_stock_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_stock_count_lines" ADD CONSTRAINT "pos_stock_count_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_stock_count_lines" ADD CONSTRAINT "pos_stock_count_lines_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_job_cards" ADD CONSTRAINT "pos_job_cards_shopkeeperId_fkey" FOREIGN KEY ("shopkeeperId") REFERENCES "shopkeeper_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_job_lines" ADD CONSTRAINT "pos_job_lines_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "pos_job_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_job_lines" ADD CONSTRAINT "pos_job_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_credit_entries" ADD CONSTRAINT "pos_credit_entries_shopkeeperId_fkey" FOREIGN KEY ("shopkeeperId") REFERENCES "shopkeeper_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_credit_entries" ADD CONSTRAINT "pos_credit_entries_posCustomerId_fkey" FOREIGN KEY ("posCustomerId") REFERENCES "pos_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_stock_transfers" ADD CONSTRAINT "pos_stock_transfers_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "pos_businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_stock_transfers" ADD CONSTRAINT "pos_stock_transfers_fromShopkeeperId_fkey" FOREIGN KEY ("fromShopkeeperId") REFERENCES "shopkeeper_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_stock_transfers" ADD CONSTRAINT "pos_stock_transfers_toShopkeeperId_fkey" FOREIGN KEY ("toShopkeeperId") REFERENCES "shopkeeper_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_stock_transfer_lines" ADD CONSTRAINT "pos_stock_transfer_lines_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "pos_stock_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_stock_transfer_lines" ADD CONSTRAINT "pos_stock_transfer_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_stock_transfer_lines" ADD CONSTRAINT "pos_stock_transfer_lines_toProductId_fkey" FOREIGN KEY ("toProductId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_price_lists" ADD CONSTRAINT "pos_price_lists_shopkeeperId_fkey" FOREIGN KEY ("shopkeeperId") REFERENCES "shopkeeper_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_price_list_items" ADD CONSTRAINT "pos_price_list_items_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "pos_price_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_price_list_items" ADD CONSTRAINT "pos_price_list_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_promotions" ADD CONSTRAINT "pos_promotions_shopkeeperId_fkey" FOREIGN KEY ("shopkeeperId") REFERENCES "shopkeeper_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_promotions" ADD CONSTRAINT "pos_promotions_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_gift_cards" ADD CONSTRAINT "pos_gift_cards_shopkeeperId_fkey" FOREIGN KEY ("shopkeeperId") REFERENCES "shopkeeper_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_gift_cards" ADD CONSTRAINT "pos_gift_cards_posCustomerId_fkey" FOREIGN KEY ("posCustomerId") REFERENCES "pos_customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_gift_card_entries" ADD CONSTRAINT "pos_gift_card_entries_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "pos_gift_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_quotes" ADD CONSTRAINT "pos_quotes_shopkeeperId_fkey" FOREIGN KEY ("shopkeeperId") REFERENCES "shopkeeper_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_quote_lines" ADD CONSTRAINT "pos_quote_lines_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "pos_quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_quote_lines" ADD CONSTRAINT "pos_quote_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_tables" ADD CONSTRAINT "pos_tables_shopkeeperId_fkey" FOREIGN KEY ("shopkeeperId") REFERENCES "shopkeeper_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_table_orders" ADD CONSTRAINT "pos_table_orders_shopkeeperId_fkey" FOREIGN KEY ("shopkeeperId") REFERENCES "shopkeeper_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_table_orders" ADD CONSTRAINT "pos_table_orders_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "pos_tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_table_order_lines" ADD CONSTRAINT "pos_table_order_lines_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "pos_table_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_table_order_lines" ADD CONSTRAINT "pos_table_order_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;


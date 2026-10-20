# SAJI Marketplace - Comprehensive Database Schema Analysis

## Executive Summary
This document outlines all database tables, entities, relationships, and data structures required for the SAJI marketplace platform. The analysis is based on TypeScript interface definitions, localStorage keys, API endpoints, and component data structures throughout the codebase.

---

## 1. CORE/SHARED TABLES (Authentication & User Management)

### 1.1 Users Table
**Purpose:** Core user account information for all user types
**Primary Key:** `id` (UUID/String)
**Storage Key:** `saji_users` (localStorage)

| Field | Type | Required | Unique | Nullable | Description |
|-------|------|----------|--------|----------|-------------|
| id | String (UUID) | Yes | Yes | No | Unique user identifier |
| name | String | Yes | No | No | Full name |
| email | String | Yes | Yes | No | Email address (unique) |
| phone | String | Yes | Yes | No | Phone number (unique) |
| password | String (hashed) | Yes | No | No | Bcrypt-hashed password |
| role | Enum: "customer", "provider", "admin", "sub-admin", "secretary", "agent" | Yes | No | No | User role/type |
| avatar | String (URL) | No | No | Yes | Profile picture URL |
| createdAt | DateTime | Yes | No | No | Account creation timestamp |
| kycStatus | Enum: "pending", "approved", "rejected" | No | No | Yes | KYC verification status |
| teamRole | Enum: "sub-admin", "secretary", "agent" | No | No | Yes | Team-specific role (for admin portal users) |

**Indexes:** `email`, `phone`, `role`, `kycStatus`
**Relationships:** 
- 1:1 with CustomerProfile
- 1:1 with ProviderProfile
- 1:1 with AdminProfile

---

### 1.2 KYC Documents Table
**Purpose:** Store identity verification documents
**Primary Key:** `id` (UUID/String)
**Storage Key:** `saji_kyc_docs` (localStorage)

| Field | Type | Required | Unique | Nullable | Description |
|-------|------|----------|--------|----------|-------------|
| id | String (UUID) | Yes | Yes | No | Document identifier |
| userId | String (FK: Users.id) | Yes | No | No | Reference to user |
| idType | String: "National ID", "Passport", "Driver License" | Yes | No | No | Type of ID document |
| idNumber | String | Yes | No | No | ID document number |
| idFile | String (URL/Base64) | Yes | No | No | Scanned ID document |
| selfieFile | String (URL/Base64) | Yes | No | No | Selfie with ID for verification |
| status | Enum: "pending", "approved", "rejected" | Yes | No | No | Verification status |
| uploadedAt | DateTime | Yes | No | No | Upload timestamp |
| verifiedAt | DateTime | No | No | Yes | Verification completion timestamp |
| verifiedBy | String (FK: Users.id) | No | No | Yes | Admin/Verifier user ID |

**Indexes:** `userId`, `status`, `uploadedAt`
**Relationships:**
- Many:1 with Users

---

### 1.3 Team Members Table
**Purpose:** Team management for admin accounts (Sub-admins, Secretaries, Agents)
**Primary Key:** `id` (UUID/String)
**Storage Key:** `team_credentials` (localStorage)

| Field | Type | Required | Unique | Nullable | Description |
|-------|------|----------|--------|----------|-------------|
| id | String (UUID) | Yes | Yes | No | Team member ID |
| adminId | String (FK: Users.id) | Yes | No | No | Parent admin user |
| name | String | Yes | No | No | Team member name |
| email | String | Yes | Yes | No | Unique email |
| teamRole | Enum: "sub-admin", "secretary", "agent" | Yes | No | No | Role within team |
| status | Enum: "active", "inactive" | Yes | No | No | Current status |
| joinedDate | Date | Yes | No | No | Onboarding date |
| password | String (hashed) | Yes | No | No | Temporary password |
| credentialsSent | Boolean | Yes | No | No | Email sent flag |
| permissions | Array[String] | No | No | Yes | Role-based permissions |

**Indexes:** `adminId`, `email`, `teamRole`, `status`
**Relationships:**
- Many:1 with Users (admin)
- Many:1 with Users (team member)

---

## 2. PROVIDER-RELATED TABLES (Services, Qualifications, Verification)

### 2.1 Provider Profile Table
**Purpose:** Extended profile information for service providers
**Primary Key:** `id` (FK: Users.id)
**Inherits from:** Users

| Field | Type | Required | Unique | Nullable | Description |
|-------|------|----------|--------|----------|-------------|
| id | String (UUID/FK) | Yes | Yes | No | Foreign key to Users.id |
| bio | String | Yes | No | No | Professional biography |
| category | String | Yes | No | No | Primary service category |
| rating | Float (0-5) | Yes | No | No | Average rating |
| reviewCount | Integer | Yes | No | No | Total reviews received |
| completedJobs | Integer | Yes | No | No | Total completed jobs |
| hourlyRate | Number | No | No | Yes | Hourly rate (KES) |
| responseTime | String | No | No | Yes | Average response time (e.g., "2 hours") |
| verified | Boolean | Yes | No | No | Verification status |

**Indexes:** `category`, `rating`, `verified`
**Relationships:**
- 1:1 with Users
- 1:Many with Services
- 1:Many with PortfolioItems
- 1:Many with Jobs (as provider)

---

### 2.2 Services Table
**Purpose:** Services offered by providers
**Primary Key:** `id` (UUID/String)

| Field | Type | Required | Unique | Nullable | Description |
|-------|------|----------|--------|----------|-------------|
| id | String (UUID) | Yes | Yes | No | Service identifier |
| providerId | String (FK: ProviderProfile.id) | Yes | No | No | Provider who offers service |
| title | String | Yes | No | No | Service name |
| description | String | Yes | No | No | Detailed description |
| category | String | Yes | No | No | Service category |
| skillLevel | Enum: "skilled", "semi-skilled", "non-skilled" | Yes | No | No | Required skill level |
| basePrice | Number | Yes | No | No | Base price (KES) |
| currency | String | Yes | No | No | Currency code (KES, USD, etc.) |
| rating | Float (0-5) | No | No | Yes | Service rating |
| image | String (URL) | No | No | Yes | Service thumbnail |
| createdAt | DateTime | Yes | No | No | Creation timestamp |
| isActive | Boolean | Yes | No | No | Service availability status |

**Indexes:** `providerId`, `category`, `skillLevel`
**Relationships:**
- Many:1 with ProviderProfile
- 1:Many with ServicePackages
- 1:Many with Jobs (as service)

---

### 2.3 Service Packages Table
**Purpose:** Tiered pricing/options for services
**Primary Key:** `id` (UUID/String)

| Field | Type | Required | Unique | Nullable | Description |
|-------|------|----------|--------|----------|-------------|
| id | String (UUID) | Yes | Yes | No | Package identifier |
| serviceId | String (FK: Services.id) | Yes | No | No | Parent service |
| name | String | Yes | No | No | Package name (e.g., "Basic", "Premium") |
| description | String | Yes | No | No | What's included |
| price | Number | Yes | No | No | Package price (KES) |
| duration | String | No | No | Yes | Estimated duration (e.g., "2 hours") |
| features | Array[String] | Yes | No | No | List of included features |

**Indexes:** `serviceId`
**Relationships:**
- Many:1 with Services

---

### 2.4 Portfolio Items Table
**Purpose:** Provider's past work/portfolio
**Primary Key:** `id` (UUID/String)

| Field | Type | Required | Unique | Nullable | Description |
|-------|------|----------|--------|----------|-------------|
| id | String (UUID) | Yes | Yes | No | Portfolio item ID |
| providerId | String (FK: ProviderProfile.id) | Yes | No | No | Provider |
| title | String | Yes | No | No | Project title |
| description | String | Yes | No | No | Project details |
| image | String (URL) | Yes | No | No | Project image |
| category | String | Yes | No | No | Project category |
| date | Date | Yes | No | No | Project completion date |
| clientName | String | No | No | Yes | Client name (optional for privacy) |

**Indexes:** `providerId`, `category`, `date`
**Relationships:**
- Many:1 with ProviderProfile

---

### 2.5 Provider Qualifications Table
**Purpose:** Certifications and qualifications
**Primary Key:** `id` (UUID/String)

| Field | Type | Required | Unique | Nullable | Description |
|-------|------|----------|--------|----------|-------------|
| id | String (UUID) | Yes | Yes | No | Qualification ID |
| providerId | String (FK: ProviderProfile.id) | Yes | No | No | Provider reference |
| title | String | Yes | No | No | Certification/qualification name |
| issuer | String | Yes | No | No | Issuing organization |
| issueDate | Date | Yes | No | No | Date received |
| expiryDate | Date | No | No | Yes | Expiration date (if applicable) |
| credentialUrl | String (URL) | No | No | Yes | Certificate image/document |
| verified | Boolean | Yes | No | No | Admin verification status |

**Indexes:** `providerId`, `verified`
**Relationships:**
- Many:1 with ProviderProfile

---

## 3. CUSTOMER-RELATED TABLES (Bookings, Reviews, Wallet)

### 3.1 Customer Profile Table
**Purpose:** Extended profile information for customers
**Primary Key:** `id` (FK: Users.id)
**Inherits from:** Users

| Field | Type | Required | Unique | Nullable | Description |
|-------|------|----------|--------|----------|-------------|
| id | String (UUID/FK) | Yes | Yes | No | Foreign key to Users.id |
| location | String | No | No | Yes | Primary location/address |
| savedProviders | Array[String] (FK: ProviderProfile.id) | No | No | Yes | Favorited providers |

**Indexes:** `location`
**Relationships:**
- 1:1 with Users
- Many:Many with ProviderProfile (through Favorites)
- 1:Many with Jobs (as customer)
- 1:1 with Wallet

---

### 3.2 Jobs/Bookings Table
**Purpose:** Service bookings created by customers
**Primary Key:** `id` (UUID/String)

| Field | Type | Required | Unique | Nullable | Description |
|-------|------|----------|--------|----------|-------------|
| id | String (UUID) | Yes | Yes | No | Booking identifier |
| customerId | String (FK: CustomerProfile.id) | Yes | No | No | Customer who booked |
| providerId | String (FK: ProviderProfile.id) | Yes | No | No | Assigned provider |
| serviceId | String (FK: Services.id) | Yes | No | No | Service being booked |
| title | String | Yes | No | No | Booking title/name |
| description | String | Yes | No | No | Service details/notes |
| status | Enum: "pending", "accepted", "in-progress", "completed", "cancelled" | Yes | No | No | Current booking status |
| price | Number | Yes | No | No | Agreed price (KES) |
| currency | String | Yes | No | No | Currency code |
| scheduledDate | DateTime | Yes | No | No | Scheduled service date/time |
| location | String | Yes | No | No | Service location/address |
| notes | String | No | No | Yes | Additional notes |
| createdAt | DateTime | Yes | No | No | Booking creation time |
| acceptedAt | DateTime | No | No | Yes | Provider acceptance time |
| completedAt | DateTime | No | No | Yes | Service completion time |
| quantity | Integer | No | No | Yes | Duration/quantity units |
| bookingType | Enum: "skilled", "quick" | No | No | Yes | Type of booking |

**Indexes:** `customerId`, `providerId`, `status`, `scheduledDate`, `createdAt`
**Foreign Keys:** Composite index on (customerId, providerId, status)
**Relationships:**
- Many:1 with CustomerProfile
- Many:1 with ProviderProfile
- Many:1 with Services
- 1:1 with Review (optional)
- 1:1 with Dispute (optional)
- 1:Many with Payments

---

### 3.3 Reviews Table
**Purpose:** Customer reviews and ratings for completed services
**Primary Key:** `id` (UUID/String)

| Field | Type | Required | Unique | Nullable | Description |
|-------|------|----------|--------|----------|-------------|
| id | String (UUID) | Yes | Yes | No | Review identifier |
| jobId | String (FK: Jobs.id) | Yes | Yes | No | Associated job (unique) |
| customerId | String (FK: CustomerProfile.id) | Yes | No | No | Review author |
| providerId | String (FK: ProviderProfile.id) | Yes | No | No | Provider being reviewed |
| rating | Integer (1-5) | Yes | No | No | Star rating |
| title | String | Yes | No | No | Review title |
| comment | String | Yes | No | No | Review text |
| photos | Array[String] (URLs) | No | No | Yes | Review photos |
| createdAt | DateTime | Yes | No | No | Review date |
| verified | Boolean | Yes | No | No | Verified purchase |
| helpful | Integer | No | No | Yes | Helpful votes count |
| reported | Boolean | Yes | No | No | Content violation flag |
| reportReason | String | No | No | Yes | Reason if reported |

**Indexes:** `jobId`, `customerId`, `providerId`, `rating`, `createdAt`, `reported`
**Relationships:**
- 1:1 with Jobs
- Many:1 with CustomerProfile
- Many:1 with ProviderProfile

---

### 3.4 Favorites Table
**Purpose:** Track customer's favorite providers
**Primary Key:** Composite (customerId, providerId)

| Field | Type | Required | Unique | Nullable | Description |
|-------|------|----------|--------|----------|-------------|
| customerId | String (FK: CustomerProfile.id) | Yes | Part | No | Customer |
| providerId | String (FK: ProviderProfile.id) | Yes | Part | No | Favorite provider |
| savedAt | DateTime | Yes | No | No | When added to favorites |
| notes | String | No | No | Yes | Personal notes about provider |

**Indexes:** `customerId`, `providerId`
**Relationships:**
- Many:1 with CustomerProfile
- Many:1 with ProviderProfile

---

### 3.5 Saved Addresses Table
**Purpose:** Customer's saved delivery/service addresses
**Primary Key:** `id` (UUID/String)

| Field | Type | Required | Unique | Nullable | Description |
|-------|------|----------|--------|----------|-------------|
| id | String (UUID) | Yes | Yes | No | Address identifier |
| customerId | String (FK: CustomerProfile.id) | Yes | No | No | Owner customer |
| label | String | Yes | No | No | Address label (e.g., "Home") |
| type | Enum: "home", "office", "other" | Yes | No | No | Address type |
| address | String | Yes | No | No | Full address |
| isDefault | Boolean | Yes | No | No | Default delivery address |
| coordinates | Object: {lat, lng} | No | No | Yes | GPS coordinates |

**Indexes:** `customerId`, `isDefault`
**Relationships:**
- Many:1 with CustomerProfile

---

### 3.6 Cart Table
**Purpose:** Shopping cart for marketplace products
**Primary Key:** Composite (customerId, productId)
**Storage Key:** `saji-customer-cart` (localStorage)

| Field | Type | Required | Unique | Nullable | Description |
|-------|------|----------|--------|----------|-------------|
| id | String/Integer (FK: Product.id) | Yes | Part | No | Product ID |
| customerId | String (FK: CustomerProfile.id) | Yes | Part | No | Customer |
| name | String | Yes | No | No | Product name |
| price | Number | Yes | No | No | Product price (KES) |
| image | String (URL) | Yes | No | No | Product image |
| shop | String | Yes | No | No | Shop/seller name |
| quantity | Integer | Yes | No | No | Quantity in cart |
| stock | Integer | Yes | No | No | Available stock |
| description | String | No | No | Yes | Product description |
| addedAt | DateTime | Yes | No | No | When added to cart |

**Indexes:** `customerId`
**Relationships:**
- Many:1 with CustomerProfile
- Many:1 with Product

---

## 4. SHOPKEEPER-RELATED TABLES (Products, Inventory, Orders)

### 4.1 Product Table
**Purpose:** Marketplace products offered by shopkeepers
**Primary Key:** `id` (Integer/UUID)

| Field | Type | Required | Unique | Nullable | Description |
|-------|------|----------|--------|----------|-------------|
| id | Integer/UUID | Yes | Yes | No | Product identifier |
| shopkeeperId | String (FK: ShopkeeperProfile.id) | Yes | No | No | Shop owner |
| name | String | Yes | No | No | Product name |
| price | Number | Yes | No | No | Product price (KES) |
| category | String | Yes | No | No | Product category |
| shop | String | Yes | No | No | Shop name |
| rating | Float (0-5) | No | No | Yes | Product rating |
| image | String (URL) | Yes | No | No | Primary product image |
| images | Array[String] (URLs) | No | No | Yes | Additional product images |
| discount | Integer (0-100) | No | No | Yes | Discount percentage |
| stock | Integer | Yes | No | No | Available stock |
| description | String | Yes | No | No | Detailed description |
| reviews | Array[{name, comment}] | No | No | Yes | Customer reviews |
| createdAt | DateTime | Yes | No | No | Listing creation date |
| updatedAt | DateTime | Yes | No | No | Last update |
| isActive | Boolean | Yes | No | No | Listing status |

**Indexes:** `shopkeeperId`, `category`, `name`, `price`, `rating`
**Relationships:**
- Many:1 with ShopkeeperProfile
- 1:Many with CartItems
- 1:Many with Orders (as ordered product)

---

### 4.2 Shopkeeper Profile Table
**Purpose:** Extended profile for product sellers
**Primary Key:** `id` (UUID/String)

| Field | Type | Required | Unique | Nullable | Description |
|-------|------|----------|--------|----------|-------------|
| id | String (UUID) | Yes | Yes | No | Shopkeeper ID |
| userId | String (FK: Users.id) | Yes | Yes | No | User account |
| shopName | String | Yes | Yes | No | Official shop name |
| shopDescription | String | Yes | No | No | Shop description |
| shopLogo | String (URL) | No | No | Yes | Shop logo |
| shopBanner | String (URL) | No | No | Yes | Shop banner image |
| rating | Float (0-5) | No | No | Yes | Shop rating |
| totalSales | Integer | Yes | No | No | Total orders |
| followers | Integer | Yes | No | No | Shop followers |
| verified | Boolean | Yes | No | No | Verification status |
| businessRegistration | String | No | No | Yes | Business reg number |
| taxId | String | No | No | Yes | Tax identification |

**Indexes:** `userId`, `shopName`, `verified`
**Relationships:**
- 1:1 with Users
- 1:Many with Products
- 1:Many with Orders (as seller)

---

### 4.3 Orders Table
**Purpose:** Customer orders for products
**Primary Key:** `id` (UUID/String)

| Field | Type | Required | Unique | Nullable | Description |
|-------|------|----------|--------|----------|-------------|
| id | String (UUID) | Yes | Yes | No | Order identifier |
| customerId | String (FK: CustomerProfile.id) | Yes | No | No | Ordering customer |
| shopkeeperId | String (FK: ShopkeeperProfile.id) | Yes | No | No | Seller |
| orderNumber | String | Yes | Yes | No | Unique order number |
| items | Array[{productId, quantity, price}] | Yes | No | No | Ordered items |
| totalAmount | Number | Yes | No | No | Total order value (KES) |
| subtotal | Number | Yes | No | No | Subtotal |
| shippingCost | Number | Yes | No | No | Shipping charge |
| tax | Number | No | No | Yes | Tax amount |
| discount | Number | No | No | Yes | Applied discount |
| status | Enum: "pending", "confirmed", "shipped", "delivered", "cancelled" | Yes | No | No | Order status |
| shippingAddress | Object | Yes | No | No | Delivery address |
| shippingPhone | String | Yes | No | No | Recipient phone |
| notes | String | No | No | Yes | Order notes |
| createdAt | DateTime | Yes | No | No | Order date |
| shippedAt | DateTime | No | No | Yes | Shipment date |
| deliveredAt | DateTime | No | No | Yes | Delivery date |
| trackingNumber | String | No | No | Yes | Tracking reference |

**Indexes:** `customerId`, `shopkeeperId`, `status`, `createdAt`, `orderNumber`
**Relationships:**
- Many:1 with CustomerProfile
- Many:1 with ShopkeeperProfile
- 1:Many with OrderItems

---

### 4.4 Order Items Table
**Purpose:** Individual items in orders
**Primary Key:** Composite (orderId, productId)

| Field | Type | Required | Unique | Nullable | Description |
|-------|------|----------|--------|----------|-------------|
| orderId | String (FK: Orders.id) | Yes | Part | No | Parent order |
| productId | Integer/UUID (FK: Product.id) | Yes | Part | No | Product ordered |
| productName | String | Yes | No | No | Product name at purchase |
| quantity | Integer | Yes | No | No | Quantity ordered |
| pricePerUnit | Number | Yes | No | No | Price per unit |
| totalPrice | Number | Yes | No | No | Item total |

**Indexes:** `orderId`, `productId`
**Relationships:**
- Many:1 with Orders
- Many:1 with Product

---

### 4.5 Inventory Table
**Purpose:** Track product stock levels
**Primary Key:** `id` (UUID/String)

| Field | Type | Required | Unique | Nullable | Description |
|-------|------|----------|--------|----------|-------------|
| id | String (UUID) | Yes | Yes | No | Inventory record ID |
| productId | Integer/UUID (FK: Product.id) | Yes | Yes | No | Product reference |
| currentStock | Integer | Yes | No | No | Available quantity |
| reserved | Integer | Yes | No | No | Reserved for pending orders |
| sold | Integer | Yes | No | No | Total units sold |
| reorderLevel | Integer | Yes | No | No | Low stock alert threshold |
| lastRestocked | DateTime | No | No | Yes | Last inventory update |
| location | String | No | No | Yes | Warehouse/storage location |

**Indexes:** `productId`
**Relationships:**
- 1:1 with Product

---

## 5. PAYMENT/WALLET TABLES

### 5.1 Wallet Table
**Purpose:** Customer wallet balance and payment methods
**Primary Key:** `id` (UUID/String)
**Storage Key:** `saji-wallet-balance` (localStorage)

| Field | Type | Required | Unique | Nullable | Description |
|-------|------|----------|--------|----------|-------------|
| id | String (UUID) | Yes | Yes | No | Wallet identifier |
| userId | String (FK: Users.id) | Yes | Yes | No | Wallet owner |
| balance | Number | Yes | No | No | Current balance (KES) |
| currency | String | Yes | No | No | Currency code |
| totalEarned | Number | Yes | No | No | Cumulative earnings |
| totalSpent | Number | Yes | No | No | Cumulative spending |
| lastUpdated | DateTime | Yes | No | No | Last update timestamp |
| isActive | Boolean | Yes | No | No | Account status |

**Indexes:** `userId`
**Relationships:**
- 1:1 with Users
- 1:Many with Transactions
- 1:Many with PaymentMethods

---

### 5.2 Transactions Table
**Purpose:** Wallet transaction history
**Primary Key:** `id` (UUID/String)

| Field | Type | Required | Unique | Nullable | Description |
|-------|------|----------|--------|----------|-------------|
| id | String (UUID) | Yes | Yes | No | Transaction identifier |
| walletId | String (FK: Wallet.id) | Yes | No | No | Associated wallet |
| userId | String (FK: Users.id) | Yes | No | No | User involved |
| type | Enum: "payment", "refund", "withdrawal", "deposit" | Yes | No | No | Transaction type |
| description | String | Yes | No | No | Transaction description |
| amount | Number | Yes | No | No | Amount (KES) |
| status | Enum: "completed", "pending", "failed" | Yes | No | No | Transaction status |
| referenceId | String | No | No | Yes | External reference |
| date | DateTime | Yes | No | No | Transaction date |
| relatedJobId | String (FK: Jobs.id) | No | No | Yes | Associated job (if any) |
| relatedOrderId | String (FK: Orders.id) | No | No | Yes | Associated order (if any) |

**Indexes:** `walletId`, `userId`, `type`, `status`, `date`
**Relationships:**
- Many:1 with Wallet
- Many:1 with Users
- Many:1 with Jobs (optional)
- Many:1 with Orders (optional)

---

### 5.3 Payment Methods Table
**Purpose:** Saved payment methods for transactions
**Primary Key:** `id` (UUID/String)

| Field | Type | Required | Unique | Nullable | Description |
|-------|------|----------|--------|----------|-------------|
| id | String (UUID) | Yes | Yes | No | Payment method ID |
| userId | String (FK: Users.id) | Yes | No | No | User who owns method |
| type | Enum: "mpesa", "card", "paypal", "bank_transfer" | Yes | No | No | Payment method type |
| name | String | Yes | No | No | Display name |
| number | String (encrypted/masked) | Yes | No | No | Account/card number (masked) |
| isPrimary | Boolean | Yes | No | No | Default payment method |
| expiryDate | String | No | No | Yes | Card expiry (MM/YY) |
| cvv | String (encrypted) | No | No | Yes | Card CVV (encrypted) |
| bankName | String | No | No | Yes | Bank name (for bank transfers) |
| bankAccount | String (encrypted/masked) | No | No | Yes | Bank account number |
| createdAt | DateTime | Yes | No | No | When added |
| isActive | Boolean | Yes | No | No | Whether active/usable |

**Indexes:** `userId`, `isPrimary`
**Relationships:**
- Many:1 with Users

---

### 5.4 Payments Table
**Purpose:** Individual payment transactions
**Primary Key:** `id` (UUID/String)

| Field | Type | Required | Unique | Nullable | Description |
|-------|------|----------|--------|----------|-------------|
| id | String (UUID) | Yes | Yes | No | Payment identifier |
| paymentId | String (from transactionId) | Yes | Yes | No | Unique payment reference |
| userId | String (FK: Users.id) | Yes | No | No | Payer |
| job | String | No | No | Yes | Associated job description |
| amount | Number | Yes | No | No | Payment amount (KES) |
| method | String: "Bank Transfer", "Mobile Money", "Card" | Yes | No | No | Payment method used |
| status | Enum: "Completed", "Pending", "Processing", "Failed" | Yes | No | No | Payment status |
| date | DateTime | Yes | No | No | Payment date |
| fee | Number | Yes | No | No | Platform fee charged |
| netAmount | Number | Yes | No | No | Amount after fees |

**Indexes:** `paymentId`, `userId`, `status`, `date`
**Relationships:**
- Many:1 with Users

---

## 6. TEAM/ADMIN MANAGEMENT TABLES

### 6.1 Commissions Table
**Purpose:** Commission rates and tiers for different user types
**Primary Key:** `id` (Integer/UUID)

| Field | Type | Required | Unique | Nullable | Description |
|-------|------|----------|--------|----------|-------------|
| id | Integer/UUID | Yes | Yes | No | Commission tier ID |
| name | String | Yes | No | No | Tier name (e.g., "Gold Provider") |
| role | Enum: "Provider", "Shopkeeper", "Agent" | Yes | No | No | User type |
| rate | Number (0-50) | Yes | No | No | Commission rate (%) |
| minJobs | Integer | Yes | No | No | Minimum jobs to qualify |
| description | String | Yes | No | No | Tier description |
| status | Enum: "active", "paused" | Yes | No | No | Whether active |
| createdAt | DateTime | Yes | No | No | Creation date |
| updatedAt | DateTime | Yes | No | No | Last modification |
| updatedBy | String (FK: Users.id) | No | No | Yes | Last updated by |

**Indexes:** `role`, `status`, `rate`
**Relationships:**
- Many:1 with Users (updatedBy)

---

### 6.2 Audit Log Table
**Purpose:** Track all admin actions and changes
**Primary Key:** `id` (UUID/String)

| Field | Type | Required | Unique | Nullable | Description |
|-------|------|----------|--------|----------|-------------|
| id | String (UUID) | Yes | Yes | No | Log entry ID |
| userId | String (FK: Users.id) | Yes | No | No | Admin who performed action |
| role | String | Yes | No | No | Admin role |
| action | String | Yes | No | No | Action performed |
| target | String | Yes | No | No | What was affected |
| category | Enum: "verification", "user", "moderation", "settings", "payment", "dispute", "security", "system" | Yes | No | No | Log category |
| severity | Enum: "low", "medium", "high", "critical" | Yes | No | No | Severity level |
| timestamp | DateTime | Yes | No | No | When action occurred |
| ip | String | No | No | Yes | IP address |
| device | String | No | No | Yes | Device/browser info |
| location | String | No | No | Yes | Geographic location |
| reversible | Boolean | Yes | No | No | Whether action can be undone |
| reverted | Boolean | Yes | No | No | Whether already reverted |
| flagged | Boolean | Yes | No | No | Flagged for review |

**Indexes:** `userId`, `category`, `severity`, `timestamp`, `flagged`
**Relationships:**
- Many:1 with Users (userId)

---

### 6.3 Announcements Table
**Purpose:** Platform-wide announcements
**Primary Key:** `id` (UUID/String)

| Field | Type | Required | Unique | Nullable | Description |
|-------|------|----------|--------|----------|-------------|
| id | String (UUID) | Yes | Yes | No | Announcement ID |
| title | String | Yes | No | No | Announcement title |
| message | String | Yes | No | No | Announcement content |
| audience | String: "All Users", "Customers", "Providers", "Admins" | Yes | No | No | Target audience |
| priority | Enum: "low", "medium", "high" | Yes | No | No | Display priority |
| status | Enum: "draft", "published", "archived" | Yes | No | No | Publication status |
| createdBy | String (FK: Users.id) | Yes | No | No | Creator admin |
| createdAt | DateTime | Yes | No | No | Creation date |
| publishedAt | DateTime | No | No | Yes | Publication date |
| expiresAt | DateTime | No | No | Yes | Expiration date |
| readBy | Array[String] (FK: Users.id) | No | No | Yes | Users who read |

**Indexes:** `audience`, `status`, `priority`
**Relationships:**
- Many:1 with Users (createdBy)

---

## 7. MESSAGING/NOTIFICATIONS TABLES

### 7.1 Conversations Table
**Purpose:** Message threads between users
**Primary Key:** `id` (UUID/String)

| Field | Type | Required | Unique | Nullable | Description |
|-------|------|----------|--------|----------|-------------|
| id | String (UUID) | Yes | Yes | No | Conversation ID |
| participant1Id | String (FK: Users.id) | Yes | No | No | First participant |
| participant2Id | String (FK: Users.id) | Yes | No | No | Second participant |
| lastMessage | String | No | No | Yes | Most recent message text |
| lastMessageAt | DateTime | No | No | Yes | Timestamp of last message |
| unreadCount1 | Integer | Yes | No | No | Unread count for participant1 |
| unreadCount2 | Integer | Yes | No | No | Unread count for participant2 |
| status | Enum: "active", "archived", "muted" | Yes | No | No | Conversation status |
| createdAt | DateTime | Yes | No | No | Conversation start |

**Indexes:** `participant1Id`, `participant2Id`, `lastMessageAt`
**Unique Composite:** (participant1Id, participant2Id)
**Relationships:**
- Many:1 with Users (participant1Id)
- Many:1 with Users (participant2Id)
- 1:Many with Messages

---

### 7.2 Messages Table
**Purpose:** Individual messages in conversations
**Primary Key:** `id` (UUID/String)

| Field | Type | Required | Unique | Nullable | Description |
|-------|------|----------|--------|----------|-------------|
| id | String (UUID) | Yes | Yes | No | Message ID |
| conversationId | String (FK: Conversations.id) | Yes | No | No | Parent conversation |
| senderId | String (FK: Users.id) | Yes | No | No | Message sender |
| type | Enum: "text", "image", "file", "location", "voice" | Yes | No | No | Message type |
| text | String | No | No | Yes | Text content |
| content | String | No | No | Yes | Additional content |
| imageUrl | String (URL) | No | No | Yes | Image URL |
| fileUrl | String (URL) | No | No | Yes | File URL |
| duration | Number | No | No | Yes | Voice message duration (seconds) |
| timestamp | DateTime | Yes | No | No | Message time |
| status | Enum: "sent", "delivered", "read" | Yes | No | No | Delivery status |
| readAt | DateTime | No | No | Yes | When read by recipient |

**Indexes:** `conversationId`, `senderId`, `timestamp`, `status`
**Relationships:**
- Many:1 with Conversations
- Many:1 with Users (senderId)

---

### 7.3 Notifications Table
**Purpose:** System and activity notifications
**Primary Key:** `id` (UUID/String)

| Field | Type | Required | Unique | Nullable | Description |
|-------|------|----------|--------|----------|-------------|
| id | String (UUID) | Yes | Yes | No | Notification ID |
| userId | String (FK: Users.id) | Yes | No | No | Recipient user |
| type | Enum: "job", "message", "payment", "system", "review", "promo" | Yes | No | No | Notification type |
| title | String | Yes | No | No | Notification title |
| message | String | Yes | No | No | Notification body |
| timestamp | DateTime | Yes | No | No | When sent |
| read | Boolean | Yes | No | No | Whether read |
| actionLabel | String | No | No | Yes | Call-to-action text |
| actionHref | String (URL) | No | No | Yes | Action link |
| relatedEntityId | String | No | No | Yes | Related entity ID (job, order, etc) |
| relatedEntityType | String | No | No | Yes | Type of related entity |

**Indexes:** `userId`, `type`, `read`, `timestamp`
**Relationships:**
- Many:1 with Users

---

## 8. DISPUTE/CONFLICT RESOLUTION TABLES

### 8.1 Disputes Table
**Purpose:** Service disputes and conflict resolution
**Primary Key:** `id` (UUID/String)

| Field | Type | Required | Unique | Nullable | Description |
|-------|------|----------|--------|----------|-------------|
| id | String (UUID) | Yes | Yes | No | Dispute ID |
| disputeId | String | Yes | Yes | No | Unique dispute reference |
| jobId | String (FK: Jobs.id) | Yes | Yes | No | Related job |
| customerId | String (FK: CustomerProfile.id) | Yes | No | No | Dispute initiator |
| providerId | String (FK: ProviderProfile.id) | Yes | No | No | Service provider |
| amount | Number | Yes | No | No | Amount at stake (KES) |
| reason | String | Yes | No | No | Dispute reason |
| description | String | Yes | No | No | Detailed explanation |
| status | Enum: "Open", "In Review", "Resolved" | Yes | No | No | Current status |
| severity | Enum: "Low", "Medium", "High" | Yes | No | No | Severity level |
| resolution | String | No | No | Yes | How it was resolved |
| assignedTo | String (FK: Users.id) | No | No | Yes | Assigned agent/sub-admin |
| createdAt | DateTime | Yes | No | No | Dispute creation |
| resolvedAt | DateTime | No | No | Yes | Resolution date |
| evidence | Array[{type, url, description}] | No | No | Yes | Supporting documents/images |

**Indexes:** `jobId`, `customerId`, `providerId`, `status`, `severity`, `createdAt`
**Relationships:**
- 1:1 with Jobs
- Many:1 with CustomerProfile
- Many:1 with ProviderProfile
- Many:1 with Users (assignedTo)
- 1:Many with DisputeMessages
- 1:Many with DisputeActions

---

### 8.2 Dispute Messages Table
**Purpose:** Communication thread in dispute resolution
**Primary Key:** `id` (UUID/String)

| Field | Type | Required | Unique | Nullable | Description |
|-------|------|----------|--------|----------|-------------|
| id | String (UUID) | Yes | Yes | No | Message ID |
| disputeId | String (FK: Disputes.id) | Yes | No | No | Parent dispute |
| senderId | String (FK: Users.id) | Yes | No | No | Message author |
| message | String | Yes | No | No | Message content |
| attachments | Array[String] (URLs) | No | No | Yes | Document/image attachments |
| timestamp | DateTime | Yes | No | No | When sent |
| isInternal | Boolean | Yes | No | No | Admin-only message |

**Indexes:** `disputeId`, `senderId`, `timestamp`
**Relationships:**
- Many:1 with Disputes
- Many:1 with Users

---

## 9. VERIFICATION/MODERATION TABLES

### 9.1 Verifications Table
**Purpose:** Pending verification requests
**Primary Key:** `id` (UUID/String)

| Field | Type | Required | Unique | Nullable | Description |
|-------|------|----------|--------|----------|-------------|
| id | String (UUID) | Yes | Yes | No | Verification request ID |
| userId | String (FK: Users.id) | Yes | No | No | User requesting verification |
| type | String: "KYC", "Document", "Business" | Yes | No | No | Verification type |
| status | Enum: "Pending", "Approved", "Rejected" | Yes | No | No | Current status |
| documents | Array[{type, url}] | Yes | No | No | Submitted documents |
| submittedAt | DateTime | Yes | No | No | Submission date |
| reviewedAt | DateTime | No | No | Yes | Review completion date |
| reviewedBy | String (FK: Users.id) | No | No | Yes | Reviewing admin |
| rejectionReason | String | No | No | Yes | If rejected, why |

**Indexes:** `userId`, `status`, `type`, `submittedAt`
**Relationships:**
- Many:1 with Users
- Many:1 with Users (reviewedBy)

---

### 9.2 Content Moderation Table
**Purpose:** Track flagged content for review
**Primary Key:** `id` (UUID/String)

| Field | Type | Required | Unique | Nullable | Description |
|-------|------|----------|--------|----------|-------------|
| id | String (UUID) | Yes | Yes | No | Moderation case ID |
| type | Enum: "review", "message", "image", "profile" | Yes | No | No | Content type |
| entityId | String | Yes | No | No | ID of flagged content |
| userId | String (FK: Users.id) | Yes | No | No | Content creator |
| content | String | Yes | No | No | Flagged content |
| reason | String | Yes | No | No | Violation reason |
| severity | Enum: "low", "medium", "high" | Yes | No | No | Severity level |
| reports | Integer | Yes | No | No | Number of reports |
| status | Enum: "pending", "approved", "rejected" | Yes | No | No | Review status |
| action | String | No | No | Yes | Action taken (warning, removal, ban) |
| reviewedBy | String (FK: Users.id) | No | No | Yes | Reviewer |
| reviewedAt | DateTime | No | No | Yes | Review timestamp |

**Indexes:** `type`, `entityId`, `userId`, `status`, `severity`
**Relationships:**
- Many:1 with Users (userId)
- Many:1 with Users (reviewedBy)

---

## 10. COMMUNITY/SOCIAL FEATURES TABLES

### 10.1 Community Posts Table
**Purpose:** User-generated content in community feed
**Primary Key:** `id` (UUID/String)

| Field | Type | Required | Unique | Nullable | Description |
|-------|------|----------|--------|----------|-------------|
| id | String (UUID) | Yes | Yes | No | Post ID |
| authorId | String (FK: Users.id) | Yes | No | No | Content creator |
| content | String | Yes | No | No | Post text |
| images | Array[String] (URLs) | No | No | Yes | Post images (max 4) |
| video | String (URL) | No | No | Yes | Post video |
| location | String | No | No | Yes | Post location |
| hashtags | Array[String] | No | No | Yes | Associated hashtags |
| likes | Integer | Yes | No | No | Like count |
| comments | Integer | Yes | No | No | Comment count |
| shares | Integer | Yes | No | No | Share count |
| timestamp | DateTime | Yes | No | No | Post creation |
| edited | Boolean | Yes | No | No | Whether edited |
| editedAt | DateTime | No | No | Yes | Last edit time |
| visibility | Enum: "public", "followers", "private" | Yes | No | No | Post visibility |
| reported | Boolean | Yes | No | No | Flagged for review |

**Indexes:** `authorId`, `timestamp`, `reported`, `likes`
**Relationships:**
- Many:1 with Users (authorId)
- 1:Many with Comments
- 1:Many with PostLikes

---

### 10.2 Community Comments Table
**Purpose:** Comments on community posts
**Primary Key:** `id` (UUID/String)

| Field | Type | Required | Unique | Nullable | Description |
|-------|------|----------|--------|----------|-------------|
| id | String (UUID) | Yes | Yes | No | Comment ID |
| postId | String (FK: Posts.id) | Yes | No | No | Parent post |
| authorId | String (FK: Users.id) | Yes | No | No | Comment author |
| text | String | Yes | No | No | Comment text |
| likes | Integer | Yes | No | No | Like count |
| timestamp | DateTime | Yes | No | No | Posted when |
| reported | Boolean | Yes | No | No | Flagged for review |

**Indexes:** `postId`, `authorId`, `timestamp`
**Relationships:**
- Many:1 with Posts
- Many:1 with Users

---

### 10.3 Community Groups Table
**Purpose:** User groups/communities
**Primary Key:** `id` (UUID/String)

| Field | Type | Required | Unique | Nullable | Description |
|-------|------|----------|--------|----------|-------------|
| id | String (UUID) | Yes | Yes | No | Group ID |
| name | String | Yes | No | No | Group name |
| description | String | Yes | No | No | Group description |
| image | String (URL) | No | No | Yes | Group image |
| createdBy | String (FK: Users.id) | Yes | No | No | Group creator |
| members | Integer | Yes | No | No | Member count |
| isPublic | Boolean | Yes | No | No | Public or private group |
| createdAt | DateTime | Yes | No | No | Creation date |

**Indexes:** `createdBy`, `isPublic`, `members`
**Relationships:**
- Many:1 with Users (createdBy)
- Many:Many with Users (through GroupMembers)

---

## 11. REFERRAL/LOYALTY TABLES

### 11.1 Referrals Table
**Purpose:** Track referral programs and rewards
**Primary Key:** `id` (UUID/String)

| Field | Type | Required | Unique | Nullable | Description |
|-------|------|----------|--------|----------|-------------|
| id | String (UUID) | Yes | Yes | No | Referral ID |
| referrerId | String (FK: Users.id) | Yes | No | No | Person who referred |
| referredUserId | String (FK: Users.id) | Yes | No | No | New user referred |
| referralCode | String | Yes | Yes | No | Unique referral code |
| status | Enum: "pending", "completed" | Yes | No | No | Referral status |
| earnedAmount | Number | Yes | No | No | Reward earned (KES) |
| rewardAmount | Number | Yes | No | No | Friend's discount (KES) |
| date | DateTime | Yes | No | No | Referral date |
| completedAt | DateTime | No | No | Yes | When friend completed first booking |

**Indexes:** `referrerId`, `referralCode`, `status`, `date`
**Unique Constraint:** referralCode
**Relationships:**
- Many:1 with Users (referrerId)
- Many:1 with Users (referredUserId)

---

## 12. ANALYTICS/REPORTING TABLES

### 12.1 Provider Analytics Table
**Purpose:** Track provider performance metrics
**Primary Key:** `id` (UUID/String)

| Field | Type | Required | Unique | Nullable | Description |
|-------|------|----------|--------|----------|-------------|
| id | String (UUID) | Yes | Yes | No | Analytics record ID |
| providerId | String (FK: ProviderProfile.id) | Yes | No | No | Provider |
| period | Enum: "7d", "30d", "90d", "12m" | Yes | No | No | Reporting period |
| totalEarnings | Number | Yes | No | No | Total revenue (KES) |
| jobsCompleted | Integer | Yes | No | No | Completed jobs |
| avgRating | Float (0-5) | Yes | No | No | Average rating |
| repeatClients | Integer | Yes | No | No | Repeat customer count |
| totalJobs | Integer | Yes | No | No | Total jobs handled |
| jobsByCategory | Object | No | No | Yes | Breakdown by service category |
| peakHours | Object | No | No | Yes | Peak booking hours |
| topCustomers | Array | No | No | Yes | Top 5 customers |
| generatedAt | DateTime | Yes | No | No | Report generation time |

**Indexes:** `providerId`, `period`, `generatedAt`
**Relationships:**
- Many:1 with ProviderProfile

---

## Data Type Specifications

### Common Types:
- **UUID**: `String` format: `"123e4567-e89b-12d3-a456-426614174000"`
- **DateTime**: ISO 8601 format: `"2026-02-21T14:30:00Z"`
- **Date**: ISO 8601 date: `"2026-02-21"`
- **Money/Amount**: Number type (stored as integer cents or decimal KES): `15000` (KES 150.00)
- **URL**: String format: `"https://example.com/image.jpg"`
- **Phone**: String with country code: `"+254712345678"`
- **Email**: String format: `"user@example.com"`
- **Array**: JSON array format
- **Object/JSON**: Nested JSON structures

---

## Constraints & Validations

### Required Validations:
1. **Email**: Valid email format, unique per system
2. **Phone**: Valid phone format, minimum 10 digits, unique per system
3. **Dates**: Must be valid ISO 8601 format
4. **Amounts**: Must be non-negative numbers
5. **Ratings**: Must be between 0-5
6. **Percentages**: Must be between 0-100
7. **Enums**: Only allowed values from predefined sets
8. **Foreign Keys**: Must reference existing parent records
9. **Status fields**: Only allowed status values per table
10. **Passwords**: Minimum 8 characters, hashed with bcrypt

### Unique Constraints:
- Users.email
- Users.phone
- ProviderProfile.userId
- CustomerProfile.userId
- Referrals.referralCode
- Orders.orderNumber
- Disputes.disputeId
- PaymentMethods.id (unique per user + type combination)

### Check Constraints:
- Balance >= 0
- Amount >= 0
- Rating >= 0 AND Rating <= 5
- Commission rate >= 0 AND Commission rate <= 50
- Discount >= 0 AND Discount <= 100

---

## Indexing Strategy

### High-Priority Indexes (Performance Critical):
- Users.email, Users.phone, Users.role
- Jobs.customerId, Jobs.providerId, Jobs.status
- Payments.userId, Payments.status
- Transactions.userId, Transactions.walletId
- Messages.conversationId, Messages.timestamp
- Products.shopkeeperId, Products.category

### Medium-Priority Indexes (Frequently Queried):
- Jobs.scheduledDate, Jobs.createdAt
- Orders.customerId, Orders.status
- Disputes.status, Disputes.severity
- Posts.authorId, Posts.timestamp
- Notifications.userId, Notifications.read

### Composite Indexes (Multi-column):
- (customerId, providerId, status) on Jobs
- (customerId, productId) on Cart
- (participant1Id, participant2Id) on Conversations
- (orderId, productId) on OrderItems
- (userId, type) on PaymentMethods

---

## Relationships Summary

### One-to-One:
- User ↔ CustomerProfile
- User ↔ ProviderProfile
- User ↔ AdminProfile
- Service ↔ ServicePackage (conceptually, but multiple in practice)
- Job ↔ Review
- Job ↔ Dispute
- Product ↔ Inventory
- Wallet ↔ User

### One-to-Many:
- ProviderProfile → Services
- ProviderProfile → PortfolioItems
- ProviderProfile → Qualifications
- Service → ServicePackages
- CustomerProfile → Jobs
- CustomerProfile → Addresses
- ShopkeeperProfile → Products
- ShopkeeperProfile → Orders
- User → TeamMembers
- Orders → OrderItems
- Disputes → DisputeMessages
- Posts → Comments
- Wallet → Transactions
- Conversations → Messages

### Many-to-Many:
- Customer ↔ Provider (through Favorites)
- User ↔ Groups (through GroupMembers)
- Jobs → Payments (through Transactions)

---

## Access Patterns & Query Patterns

### Most Common Queries:
1. Get all jobs for customer (customerId, status filter)
2. Get provider's completed jobs and rating
3. Get customer's wallet balance and recent transactions
4. Get messages in a conversation
5. Get product listings by category/shop
6. Get all notifications for user (unread count)
7. Get provider analytics for given period
8. Get all disputes with status filter
9. Get community posts in feed
10. Get user's favorites/saved items

### Expected Query Volumes:
- User authentication: Very High (every session)
- Job queries: Very High (real-time booking)
- Message queries: High (chat interactions)
- Payment queries: High (frequent transactions)
- Notification queries: Very High (push alerts)
- Analytics queries: Medium (periodic reports)

---

## Migration Considerations

### Phase 1 - MVP Tables:
Users, CustomerProfile, ProviderProfile, Jobs, Payments, Wallet, Transactions

### Phase 2 - Marketplace:
Products, ShopkeeperProfile, Orders, Cart, Inventory

### Phase 3 - Community:
Posts, Comments, Conversations, Messages, Groups

### Phase 4 - Advanced:
Analytics, Referrals, Disputes, Moderation, AuditLog

---

## Security Notes

### Sensitive Data Encryption:
- passwords (bcrypt)
- cvv, card numbers (AES-256)
- bank account numbers (AES-256)
- tax IDs, business registration
- payment tokens

### Audit Trail:
- All admin actions logged to AuditLog
- All payment transactions logged
- User login/logout events
- Sensitive data access logged

### PII Handling:
- Personal data masked in logs
- GDPR compliance for data deletion
- Right to be forgotten implementation
- Data retention policies (typically 7 years for financial records)

---

## Future Enhancements

1. **Subscription/Recurring Billing**: SubscriptionPlans, SubscriptionBillings tables
2. **Advanced Analytics**: Detailed analytics tables per feature
3. **Loyalty Program**: Points, Badges, Achievements tables
4. **Insurance/Escrow**: EscrowAccounts table
5. **Ratings History**: Detailed ratings tracking per transaction
6. **Skill Endorsements**: SkillEndorsements, SkillVerifications tables
7. **Chatbot History**: ChatbotConversations, ChatbotMessages tables
8. **User Preferences**: UserPreferences, NotificationSettings tables
9. **Geo-fencing**: UserLocation, LocationHistory tables
10. **Advanced Search**: SearchIndexes, SearchHistory tables


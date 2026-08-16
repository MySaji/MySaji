# SAJI Platform - Database Schema

> Comprehensive database table requirements for all portals: Admin, Customer, Provider, Shopkeeper, Sub-Admin, Agent, Secretary

**Last Updated:** 2026-07-07  
**Total Tables:** 60+  
**Status:** Analysis Complete

---

## Table of Contents

1. [Core/Shared Tables](#corshared-tables)
2. [Provider Portal Tables](#provider-portal-tables)
3. [Customer Portal Tables](#customer-portal-tables)
4. [Shopkeeper Portal Tables](#shopkeeper-portal-tables)
5. [Payment & Wallet Tables](#payment--wallet-tables)
6. [Team & Admin Tables](#team--admin-tables)
7. [Messaging & Notifications](#messaging--notifications)
8. [Dispute & Moderation Tables](#dispute--moderation-tables)
9. [Verification & Quality Tables](#verification--quality-tables)
10. [Community & Social Tables](#community--social-tables)
11. [Referral & Analytics Tables](#referral--analytics-tables)

---

## 1. CORE/SHARED TABLES

### users
**Description:** Main user table for all roles (Customer, Provider, Shopkeeper, Admin, SubAdmin, Agent, Secretary)

```
Fields:
- id (PK, UUID/String)
- name (String, required)
- email (String, unique, required)
- phone (String, unique, required)
- password_hash (String, required)
- role (Enum: 'customer', 'provider', 'shopkeeper', 'admin', 'sub_admin', 'agent', 'secretary')
- profile_image (String, nullable)
- bio (Text, nullable)
- location (String, nullable)
- kyc_status (Enum: 'pending', 'approved', 'rejected', nullable)
- kyc_verified_at (DateTime, nullable)
- is_active (Boolean, default: true)
- is_verified (Boolean, default: false)
- created_at (DateTime)
- updated_at (DateTime)
- deleted_at (DateTime, nullable - soft delete)

Indexes:
- email (unique)
- phone (unique)
- role
- kyc_status
```

### kyc_documents
**Description:** Stores KYC verification documents for providers and agents

```
Fields:
- id (PK, UUID/String)
- user_id (FK → users.id)
- document_type (Enum: 'national_id', 'drivers_license', 'passport')
- document_number (String)
- id_file_url (String) - stored image/PDF
- selfie_file_url (String) - selfie image
- submitted_at (DateTime)
- verified_at (DateTime, nullable)
- verified_by (FK → users.id, nullable) - admin/sub-admin who verified
- status (Enum: 'pending', 'approved', 'rejected')
- rejection_reason (Text, nullable)
- created_at (DateTime)
- updated_at (DateTime)

Indexes:
- user_id
- status
- document_type
```

### user_roles
**Description:** Role-based access control for users

```
Fields:
- id (PK, UUID/String)
- user_id (FK → users.id)
- role (String) - 'admin', 'moderator', 'support'
- permissions (JSON) - array of permission strings
- assigned_at (DateTime)
- assigned_by (FK → users.id)
- active (Boolean, default: true)
- created_at (DateTime)

Indexes:
- user_id
- role
```

### team_members
**Description:** Team structure for sub-admin, agents, and secretaries

```
Fields:
- id (PK, UUID/String)
- user_id (FK → users.id)
- team_name (String) - e.g., 'Marketing Team', 'Support Team'
- team_role (Enum: 'sub_admin', 'agent', 'secretary')
- manager_id (FK → users.id, nullable) - who manages this team member
- department (String, nullable)
- reporting_to (FK → team_members.id, nullable)
- performance_score (Decimal, default: 0)
- assigned_at (DateTime)
- is_active (Boolean, default: true)
- created_at (DateTime)
- updated_at (DateTime)

Indexes:
- user_id
- team_role
- manager_id
```

---

## 2. PROVIDER PORTAL TABLES

### provider_profiles
**Description:** Detailed provider/agent profile information

```
Fields:
- id (PK, UUID/String)
- user_id (FK → users.id, unique)
- business_name (String, nullable)
- business_registration (String, nullable)
- experience_years (Integer, nullable)
- hourly_rate (Decimal, nullable)
- daily_rate (Decimal, nullable)
- response_time (Integer, nullable) - in minutes
- total_jobs (Integer, default: 0)
- total_earnings (Decimal, default: 0)
- rating (Decimal, default: 0) - 0-5 stars
- rating_count (Integer, default: 0)
- about (Text, nullable)
- verified_by_admin (Boolean, default: false)
- is_premium (Boolean, default: false)
- subscription_type (Enum: 'free', 'premium', nullable)
- subscription_valid_until (DateTime, nullable)
- created_at (DateTime)
- updated_at (DateTime)

Indexes:
- user_id (unique)
- is_premium
- rating
```

### services
**Description:** Services offered by providers

```
Fields:
- id (PK, UUID/String)
- provider_id (FK → provider_profiles.id)
- service_name (String, required)
- service_category (String) - e.g., 'Plumbing', 'Cleaning', 'Repair'
- description (Text)
- base_price (Decimal)
- price_unit (Enum: 'per_hour', 'per_day', 'fixed')
- availability (JSON) - time slots
- thumbnail_url (String, nullable)
- service_images (JSON array) - multiple images
- is_active (Boolean, default: true)
- rating (Decimal, default: 0)
- rating_count (Integer, default: 0)
- total_bookings (Integer, default: 0)
- created_at (DateTime)
- updated_at (DateTime)

Indexes:
- provider_id
- service_category
- is_active
```

### service_packages
**Description:** Bundled service packages or tiers

```
Fields:
- id (PK, UUID/String)
- service_id (FK → services.id)
- package_name (String) - e.g., 'Basic', 'Standard', 'Premium'
- description (Text, nullable)
- price (Decimal)
- duration (String) - e.g., '2 hours', '1 day'
- included_features (JSON array)
- priority_level (Integer) - 1=standard, 2=priority, 3=urgent
- created_at (DateTime)
- updated_at (DateTime)

Indexes:
- service_id
```

### provider_portfolio
**Description:** Portfolio/work samples for providers

```
Fields:
- id (PK, UUID/String)
- provider_id (FK → provider_profiles.id)
- title (String)
- description (Text)
- image_url (String)
- project_date (Date)
- category (String)
- featured (Boolean, default: false)
- created_at (DateTime)

Indexes:
- provider_id
- featured
```

### provider_qualifications
**Description:** Certifications and qualifications

```
Fields:
- id (PK, UUID/String)
- provider_id (FK → provider_profiles.id)
- qualification_name (String)
- issuing_body (String)
- issue_date (Date)
- expiry_date (Date, nullable)
- certificate_url (String, nullable)
- verified (Boolean, default: false)
- created_at (DateTime)

Indexes:
- provider_id
- verified
```

### provider_availability
**Description:** Working hours and availability calendar

```
Fields:
- id (PK, UUID/String)
- provider_id (FK → provider_profiles.id)
- day_of_week (Enum: 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')
- start_time (Time)
- end_time (Time)
- is_available (Boolean)
- break_start (Time, nullable)
- break_end (Time, nullable)
- created_at (DateTime)
- updated_at (DateTime)

Indexes:
- provider_id
- day_of_week
```

---

## 3. CUSTOMER PORTAL TABLES

### customer_profiles
**Description:** Extended customer profile information

```
Fields:
- id (PK, UUID/String)
- user_id (FK → users.id, unique)
- date_of_birth (Date, nullable)
- gender (Enum: 'male', 'female', 'other', nullable)
- company_name (String, nullable)
- emergency_contact (String, nullable)
- emergency_phone (String, nullable)
- preferred_providers (JSON array) - list of provider IDs
- preferences (JSON) - notification, payment, service preferences
- created_at (DateTime)
- updated_at (DateTime)

Indexes:
- user_id (unique)
```

### jobs
**Description:** Booking/job requests from customers

```
Fields:
- id (PK, UUID/String)
- customer_id (FK → users.id)
- service_id (FK → services.id, nullable)
- provider_id (FK → provider_profiles.id, nullable) - assigned provider
- service_category (String)
- description (Text)
- location (String)
- latitude (Decimal, nullable)
- longitude (Decimal, nullable)
- scheduled_date (DateTime)
- estimated_duration (String) - e.g., '2 hours'
- status (Enum: 'open', 'assigned', 'in_progress', 'completed', 'cancelled')
- budget (Decimal, nullable)
- urgency (Enum: 'low', 'medium', 'high', 'urgent')
- attachments (JSON array) - images/files
- created_at (DateTime)
- updated_at (DateTime)
- completed_at (DateTime, nullable)

Indexes:
- customer_id
- provider_id
- status
- service_category
- scheduled_date
```

### bookings
**Description:** Confirmed service bookings

```
Fields:
- id (PK, UUID/String)
- job_id (FK → jobs.id, nullable)
- customer_id (FK → users.id)
- provider_id (FK → provider_profiles.id)
- service_id (FK → services.id)
- service_package_id (FK → service_packages.id, nullable)
- booking_date (DateTime)
- start_time (DateTime)
- end_time (DateTime, nullable)
- actual_end_time (DateTime, nullable)
- location (String)
- service_address (Text)
- special_instructions (Text, nullable)
- total_price (Decimal)
- discount (Decimal, default: 0)
- final_price (Decimal)
- payment_status (Enum: 'pending', 'paid', 'refunded')
- booking_status (Enum: 'confirmed', 'in_progress', 'completed', 'cancelled')
- cancellation_reason (Text, nullable)
- cancelled_by (Enum: 'customer', 'provider', nullable)
- cancelled_at (DateTime, nullable)
- created_at (DateTime)
- updated_at (DateTime)

Indexes:
- customer_id
- provider_id
- booking_date
- booking_status
- payment_status
```

### reviews
**Description:** Customer reviews and ratings for providers/services

```
Fields:
- id (PK, UUID/String)
- booking_id (FK → bookings.id)
- customer_id (FK → users.id)
- provider_id (FK → provider_profiles.id)
- service_id (FK → services.id, nullable)
- rating (Decimal) - 1-5 stars
- review_text (Text)
- professionalism (Integer, 1-5)
- communication (Integer, 1-5)
- punctuality (Integer, 1-5)
- quality_of_work (Integer, 1-5)
- would_recommend (Boolean)
- photos (JSON array)
- is_verified_purchase (Boolean, default: true)
- helpful_count (Integer, default: 0)
- response_from_provider (Text, nullable)
- response_date (DateTime, nullable)
- published (Boolean, default: true)
- created_at (DateTime)
- updated_at (DateTime)

Indexes:
- booking_id
- provider_id
- customer_id
- rating
```

### favorites
**Description:** Customers' favorite providers/services

```
Fields:
- id (PK, UUID/String)
- customer_id (FK → users.id)
- provider_id (FK → provider_profiles.id, nullable)
- service_id (FK → services.id, nullable)
- added_at (DateTime)

Indexes:
- customer_id
- provider_id
- service_id
```

### saved_addresses
**Description:** Saved service locations for customers

```
Fields:
- id (PK, UUID/String)
- customer_id (FK → users.id)
- label (String) - e.g., 'Home', 'Office', 'Gym'
- address (String)
- latitude (Decimal)
- longitude (Decimal)
- is_primary (Boolean, default: false)
- created_at (DateTime)

Indexes:
- customer_id
- is_primary
```

### customer_cart
**Description:** Shopping cart for service bookings

```
Fields:
- id (PK, UUID/String)
- customer_id (FK → users.id)
- service_id (FK → services.id)
- service_package_id (FK → service_packages.id, nullable)
- provider_id (FK → provider_profiles.id)
- quantity (Integer, default: 1)
- scheduled_date (DateTime, nullable)
- notes (Text, nullable)
- added_at (DateTime)
- expires_at (DateTime)

Indexes:
- customer_id
- expires_at
```

---

## 4. SHOPKEEPER PORTAL TABLES

### shopkeeper_profiles
**Description:** Shopkeeper business profile

```
Fields:
- id (PK, UUID/String)
- user_id (FK → users.id, unique)
- shop_name (String, required)
- shop_description (Text, nullable)
- shop_logo_url (String, nullable)
- shop_banner_url (String, nullable)
- business_license (String, nullable)
- tax_id (String, nullable)
- shop_category (String)
- rating (Decimal, default: 0)
- rating_count (Integer, default: 0)
- total_sales (Decimal, default: 0)
- total_products (Integer, default: 0)
- is_verified (Boolean, default: false)
- is_premium (Boolean, default: false)
- opening_time (Time, nullable)
- closing_time (Time, nullable)
- created_at (DateTime)
- updated_at (DateTime)

Indexes:
- user_id (unique)
- shop_category
- is_verified
```

### products
**Description:** E-commerce products

```
Fields:
- id (PK, UUID/String)
- shopkeeper_id (FK → shopkeeper_profiles.id)
- product_name (String, required)
- description (Text)
- category (String)
- subcategory (String, nullable)
- sku (String, unique)
- price (Decimal)
- original_price (Decimal, nullable)
- discount_percentage (Decimal, default: 0)
- discount_price (Decimal, nullable)
- tax_rate (Decimal, default: 0)
- tax_amount (Decimal, nullable)
- images (JSON array) - multiple product images
- thumbnail_url (String)
- rating (Decimal, default: 0)
- rating_count (Integer, default: 0)
- total_sold (Integer, default: 0)
- in_stock (Boolean, default: true)
- stock_quantity (Integer)
- minimum_order_quantity (Integer, default: 1)
- shipping_weight (Decimal, nullable) - in kg
- shipping_dimensions (JSON, nullable)
- tags (JSON array)
- is_featured (Boolean, default: false)
- is_active (Boolean, default: true)
- created_at (DateTime)
- updated_at (DateTime)

Indexes:
- shopkeeper_id
- category
- sku (unique)
- is_active
- in_stock
```

### inventory
**Description:** Product inventory tracking

```
Fields:
- id (PK, UUID/String)
- product_id (FK → products.id)
- current_stock (Integer)
- reserved_stock (Integer, default: 0)
- available_stock (Integer)
- low_stock_threshold (Integer)
- reorder_level (Integer)
- last_restocked_at (DateTime, nullable)
- supplier_id (String, nullable)
- last_updated_at (DateTime)

Indexes:
- product_id
```

### shopkeeper_orders
**Description:** E-commerce orders

```
Fields:
- id (PK, UUID/String)
- customer_id (FK → users.id)
- shopkeeper_id (FK → shopkeeper_profiles.id)
- order_number (String, unique)
- status (Enum: 'pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')
- subtotal (Decimal)
- discount (Decimal, default: 0)
- shipping_cost (Decimal, default: 0)
- tax (Decimal, default: 0)
- total (Decimal)
- payment_status (Enum: 'pending', 'paid', 'failed', 'refunded')
- shipping_address (Text)
- billing_address (Text)
- estimated_delivery (Date)
- actual_delivery (Date, nullable)
- tracking_number (String, nullable)
- notes (Text, nullable)
- created_at (DateTime)
- updated_at (DateTime)

Indexes:
- customer_id
- shopkeeper_id
- status
- order_number (unique)
```

### order_items
**Description:** Individual items in orders

```
Fields:
- id (PK, UUID/String)
- order_id (FK → shopkeeper_orders.id)
- product_id (FK → products.id)
- quantity (Integer)
- unit_price (Decimal)
- discount_per_item (Decimal, default: 0)
- tax_per_item (Decimal, default: 0)
- total_price (Decimal)
- created_at (DateTime)

Indexes:
- order_id
- product_id
```

---

## 5. PAYMENT & WALLET TABLES

### wallets
**Description:** User wallet balances

```
Fields:
- id (PK, UUID/String)
- user_id (FK → users.id, unique)
- balance (Decimal, default: 0)
- currency (String, default: 'KES')
- total_earned (Decimal, default: 0)
- total_withdrawn (Decimal, default: 0)
- pending_balance (Decimal, default: 0)
- held_balance (Decimal, default: 0)
- last_payout_date (DateTime, nullable)
- next_payout_date (DateTime, nullable)
- withdrawal_method (Enum: 'bank_transfer', 'mobile_money', 'crypto', nullable)
- updated_at (DateTime)

Indexes:
- user_id (unique)
```

### transactions
**Description:** All financial transactions

```
Fields:
- id (PK, UUID/String)
- user_id (FK → users.id)
- transaction_type (Enum: 'credit', 'debit', 'refund', 'commission', 'payout')
- amount (Decimal)
- currency (String, default: 'KES')
- description (String)
- reference_id (String, nullable) - booking_id, order_id, etc
- reference_type (Enum: 'booking', 'order', 'withdrawal', 'deposit', nullable)
- related_user_id (FK → users.id, nullable) - who the transaction involved
- status (Enum: 'pending', 'completed', 'failed', 'refunded')
- payment_method (String, nullable)
- balance_before (Decimal)
- balance_after (Decimal)
- created_at (DateTime)
- completed_at (DateTime, nullable)

Indexes:
- user_id
- transaction_type
- status
- created_at
```

### payment_methods
**Description:** Saved payment methods

```
Fields:
- id (PK, UUID/String)
- user_id (FK → users.id)
- payment_type (Enum: 'credit_card', 'debit_card', 'mobile_money', 'bank_account', 'wallet')
- provider (String) - e.g., 'Stripe', 'M-Pesa', 'Equity Bank'
- account_number (String, encrypted)
- cardholder_name (String, nullable)
- card_last_four (String, nullable)
- expiry_month (Integer, nullable)
- expiry_year (Integer, nullable)
- is_default (Boolean, default: false)
- is_verified (Boolean, default: false)
- verified_at (DateTime, nullable)
- is_active (Boolean, default: true)
- created_at (DateTime)
- updated_at (DateTime)

Indexes:
- user_id
- is_default
- is_active
```

### payments
**Description:** Payment transactions for bookings/orders

```
Fields:
- id (PK, UUID/String)
- amount (Decimal)
- currency (String, default: 'KES')
- status (Enum: 'pending', 'completed', 'failed', 'refunded')
- payment_type (Enum: 'booking', 'order', 'subscription')
- booking_id (FK → bookings.id, nullable)
- order_id (FK → shopkeeper_orders.id, nullable)
- payer_id (FK → users.id)
- payee_id (FK → users.id, nullable)
- payment_method_id (FK → payment_methods.id, nullable)
- transaction_id (String, nullable) - external payment gateway ID
- receipt_url (String, nullable)
- refund_amount (Decimal, default: 0)
- refund_reason (String, nullable)
- created_at (DateTime)
- paid_at (DateTime, nullable)
- refunded_at (DateTime, nullable)

Indexes:
- payer_id
- payee_id
- status
- payment_type
```

### withdrawal_requests
**Description:** Withdrawal requests from wallets

```
Fields:
- id (PK, UUID/String)
- user_id (FK → users.id)
- amount (Decimal)
- currency (String, default: 'KES')
- withdrawal_method (Enum: 'bank_transfer', 'mobile_money', 'crypto')
- recipient_details (JSON) - account number, phone, wallet address
- status (Enum: 'pending', 'processing', 'completed', 'failed', 'rejected')
- rejection_reason (String, nullable)
- processing_fee (Decimal, default: 0)
- net_amount (Decimal)
- transaction_id (String, nullable)
- estimated_completion_date (DateTime)
- completed_at (DateTime, nullable)
- created_at (DateTime)
- updated_at (DateTime)

Indexes:
- user_id
- status
- created_at
```

---

## 6. TEAM & ADMIN TABLES

### commission_tiers
**Description:** Tiered commission rates for different roles/platforms

```
Fields:
- id (PK, UUID/String)
- commission_name (String) - e.g., 'Service Commission', 'Product Commission'
- tier_level (Integer) - 1, 2, 3, etc.
- min_amount (Decimal, nullable)
- max_amount (Decimal, nullable)
- commission_rate (Decimal) - percentage
- role (Enum: 'provider', 'shopkeeper', 'agent')
- status (Enum: 'pending', 'active')
- effective_from (DateTime)
- effective_to (DateTime, nullable)
- created_by (FK → users.id)
- created_at (DateTime)
- updated_at (DateTime)

Indexes:
- role
- status
```

### audit_logs
**Description:** System audit trail

```
Fields:
- id (PK, UUID/String)
- user_id (FK → users.id, nullable)
- action (String) - 'create', 'update', 'delete', 'approve', 'reject'
- entity_type (String) - 'user', 'booking', 'product', 'payment'
- entity_id (String)
- old_values (JSON, nullable)
- new_values (JSON, nullable)
- ip_address (String, nullable)
- user_agent (String, nullable)
- status (String)
- created_at (DateTime)

Indexes:
- user_id
- entity_type
- action
- created_at
```

### announcements
**Description:** Platform announcements and notifications

```
Fields:
- id (PK, UUID/String)
- title (String)
- description (Text)
- content (Text)
- image_url (String, nullable)
- announcement_type (Enum: 'update', 'promotion', 'alert', 'maintenance')
- target_roles (JSON array) - which roles see this
- priority (Enum: 'low', 'medium', 'high')
- is_published (Boolean, default: false)
- published_at (DateTime, nullable)
- start_date (DateTime)
- end_date (DateTime, nullable)
- created_by (FK → users.id)
- created_at (DateTime)
- updated_at (DateTime)

Indexes:
- is_published
- start_date
```

---

## 7. MESSAGING & NOTIFICATIONS

### conversations
**Description:** Direct message conversations

```
Fields:
- id (PK, UUID/String)
- participant_1_id (FK → users.id)
- participant_2_id (FK → users.id)
- last_message_id (FK → messages.id, nullable)
- last_message_at (DateTime, nullable)
- is_archived (Boolean, default: false)
- created_at (DateTime)
- updated_at (DateTime)

Indexes:
- participant_1_id
- participant_2_id
- last_message_at
```

### messages
**Description:** Individual messages in conversations

```
Fields:
- id (PK, UUID/String)
- conversation_id (FK → conversations.id)
- sender_id (FK → users.id)
- content (Text)
- message_type (Enum: 'text', 'image', 'file', 'attachment')
- attachments (JSON array)
- is_read (Boolean, default: false)
- read_at (DateTime, nullable)
- is_edited (Boolean, default: false)
- edited_at (DateTime, nullable)
- is_deleted (Boolean, default: false)
- deleted_at (DateTime, nullable)
- created_at (DateTime)

Indexes:
- conversation_id
- sender_id
- is_read
- created_at
```

### notifications
**Description:** Push/in-app notifications

```
Fields:
- id (PK, UUID/String)
- user_id (FK → users.id)
- title (String)
- message (String)
- notification_type (Enum: 'booking', 'message', 'payment', 'review', 'system', 'announcement')
- related_id (String, nullable) - booking_id, message_id, etc
- related_type (Enum: 'booking', 'message', 'payment', 'review', nullable)
- icon (String, nullable)
- action_url (String, nullable)
- is_read (Boolean, default: false)
- read_at (DateTime, nullable)
- is_deleted (Boolean, default: false)
- created_at (DateTime)

Indexes:
- user_id
- is_read
- notification_type
- created_at
```

---

## 8. DISPUTE & MODERATION TABLES

### disputes
**Description:** Service/order disputes

```
Fields:
- id (PK, UUID/String)
- dispute_number (String, unique)
- booking_id (FK → bookings.id, nullable)
- order_id (FK → shopkeeper_orders.id, nullable)
- customer_id (FK → users.id)
- provider_id (FK → users.id)
- dispute_reason (Enum: 'quality_issue', 'payment_issue', 'no_show', 'customer_no_show', 'other')
- description (Text)
- attachments (JSON array)
- status (Enum: 'open', 'in_review', 'resolved', 'escalated', 'closed')
- priority (Enum: 'low', 'medium', 'high')
- assigned_to (FK → users.id, nullable)
- refund_amount (Decimal, nullable)
- resolution (Text, nullable)
- resolved_at (DateTime, nullable)
- created_at (DateTime)
- updated_at (DateTime)

Indexes:
- customer_id
- provider_id
- status
- created_at
```

### dispute_messages
**Description:** Messages within dispute resolution

```
Fields:
- id (PK, UUID/String)
- dispute_id (FK → disputes.id)
- sender_id (FK → users.id)
- message (Text)
- attachments (JSON array, nullable)
- created_at (DateTime)

Indexes:
- dispute_id
- sender_id
```

### content_moderation
**Description:** Content flagged for moderation

```
Fields:
- id (PK, UUID/String)
- content_type (Enum: 'review', 'message', 'comment', 'post', 'profile_bio')
- content_id (String)
- reported_by (FK → users.id)
- reported_reason (Enum: 'inappropriate', 'spam', 'harassment', 'fraud', 'other')
- moderation_status (Enum: 'pending', 'approved', 'rejected', 'removed')
- moderation_notes (Text, nullable)
- moderated_by (FK → users.id, nullable)
- moderated_at (DateTime, nullable)
- created_at (DateTime)

Indexes:
- content_type
- moderation_status
- reported_by
```

---

## 9. VERIFICATION & QUALITY TABLES

### verifications
**Description:** Verification submissions for admin review

```
Fields:
- id (PK, UUID/String)
- user_id (FK → users.id)
- verification_type (Enum: 'kyc', 'business_license', 'certification')
- status (Enum: 'pending', 'approved', 'rejected')
- document_id (FK → kyc_documents.id, nullable)
- submitted_at (DateTime)
- reviewed_at (DateTime, nullable)
- reviewed_by (FK → users.id, nullable)
- rejection_reason (Text, nullable)
- resubmit_allowed (Boolean, default: true)
- resubmitted_count (Integer, default: 0)
- created_at (DateTime)
- updated_at (DateTime)

Indexes:
- user_id
- status
- verification_type
```

### service_quality_metrics
**Description:** Quality metrics for services

```
Fields:
- id (PK, UUID/String)
- service_id (FK → services.id)
- total_bookings (Integer)
- completed_bookings (Integer)
- cancelled_bookings (Integer)
- cancellation_rate (Decimal)
- average_rating (Decimal)
- rating_count (Integer)
- customer_satisfaction (Decimal) - percentage
- completion_rate (Decimal) - percentage
- on_time_rate (Decimal) - percentage
- quality_score (Decimal) - composite score
- calculated_at (DateTime)
- updated_at (DateTime)

Indexes:
- service_id
- quality_score
```

---

## 10. COMMUNITY & SOCIAL TABLES

### community_posts
**Description:** User-generated content in community section

```
Fields:
- id (PK, UUID/String)
- author_id (FK → users.id)
- title (String)
- content (Text)
- category (String, nullable)
- tags (JSON array)
- image_url (String, nullable)
- images (JSON array)
- is_published (Boolean, default: false)
- published_at (DateTime, nullable)
- view_count (Integer, default: 0)
- like_count (Integer, default: 0)
- comment_count (Integer, default: 0)
- is_featured (Boolean, default: false)
- is_pinned (Boolean, default: false)
- is_deleted (Boolean, default: false)
- deleted_at (DateTime, nullable)
- created_at (DateTime)
- updated_at (DateTime)

Indexes:
- author_id
- is_published
- created_at
```

### community_comments
**Description:** Comments on community posts

```
Fields:
- id (PK, UUID/String)
- post_id (FK → community_posts.id)
- author_id (FK → users.id)
- content (Text)
- like_count (Integer, default: 0)
- is_deleted (Boolean, default: false)
- created_at (DateTime)
- updated_at (DateTime)

Indexes:
- post_id
- author_id
- created_at
```

### community_groups
**Description:** Community groups for specific interests/services

```
Fields:
- id (PK, UUID/String)
- group_name (String)
- description (Text)
- category (String)
- image_url (String, nullable)
- member_count (Integer, default: 0)
- is_public (Boolean, default: true)
- created_by (FK → users.id)
- created_at (DateTime)
- updated_at (DateTime)

Indexes:
- category
- is_public
- created_by
```

---

## 11. REFERRAL & LOYALTY TABLES

### referrals
**Description:** Referral program tracking

```
Fields:
- id (PK, UUID/String)
- referrer_id (FK → users.id)
- referred_user_id (FK → users.id, unique)
- referral_code (String, unique)
- status (Enum: 'pending', 'activated', 'rewarded', 'cancelled')
- reward_amount (Decimal, nullable)
- reward_given_at (DateTime, nullable)
- referred_at (DateTime)
- activated_at (DateTime, nullable)
- created_at (DateTime)

Indexes:
- referrer_id
- referred_user_id (unique)
- referral_code (unique)
- status
```

---

## 12. ANALYTICS TABLES

### provider_analytics
**Description:** Analytics data for provider performance

```
Fields:
- id (PK, UUID/String)
- provider_id (FK → provider_profiles.id)
- period (Enum: 'daily', 'weekly', 'monthly')
- period_date (Date)
- total_bookings (Integer)
- completed_bookings (Integer)
- cancelled_bookings (Integer)
- total_revenue (Decimal)
- average_rating (Decimal)
- new_customers (Integer)
- repeat_customers (Integer)
- hours_worked (Decimal)
- messages_sent (Integer)
- created_at (DateTime)

Indexes:
- provider_id
- period_date
```

### customer_analytics
**Description:** Analytics for customer behavior

```
Fields:
- id (PK, UUID/String)
- customer_id (FK → users.id)
- period_date (Date)
- bookings_made (Integer)
- amount_spent (Decimal)
- services_used (JSON array)
- providers_worked_with (Integer)
- reviews_given (Integer)
- average_rating_given (Decimal)
- created_at (DateTime)

Indexes:
- customer_id
- period_date
```

---

## Database Relationships Summary

```
Users (1) -------- (1) KYC Documents
Users (1) -------- (1) Customer Profiles
Users (1) -------- (1) Provider Profiles
Users (1) -------- (1) Shopkeeper Profiles
Users (1) -------- (1) Wallets
Provider Profiles (1) -------- (N) Services
Services (1) -------- (N) Service Packages
Services (1) -------- (N) Bookings
Customers (1) -------- (N) Jobs
Customers (1) -------- (N) Bookings
Bookings (1) -------- (N) Reviews
Bookings (1) -------- (1) Payments
Shopkeepers (1) -------- (N) Products
Products (1) -------- (N) Order Items
Shopkeeper Orders (1) -------- (N) Order Items
Wallets (1) -------- (N) Transactions
Wallets (1) -------- (N) Withdrawal Requests
Conversations (1) -------- (N) Messages
Disputes (1) -------- (N) Dispute Messages
```

---

## Implementation Phases

### Phase 1: Core Tables (Priority High)
- users
- kyc_documents
- customer_profiles
- provider_profiles
- shopkeeper_profiles
- wallets
- services
- bookings
- payments
- transactions

### Phase 2: Extended Features (Priority Medium)
- service_packages
- product catalog
- orders & inventory
- messages & conversations
- reviews & ratings
- favorites & cart

### Phase 3: Advanced Features (Priority Medium)
- disputes & moderation
- community posts
- analytics
- referrals
- withdrawal requests
- audit logs

### Phase 4: Optional Enhancements (Priority Low)
- service quality metrics
- community groups
- team members management
- announcements

---

## Storage Considerations

### Current localStorage Keys (Frontend)
- `saji_users` - all registered users
- `saji_kyc_docs` - KYC documents
- `team_credentials` - team login info
- `customer-cart` - shopping cart
- `wallet-balance` - user wallet balances

### Migration to Database
These localStorage keys will be replaced by actual database tables with proper:
- Indexing for fast queries
- Relationships between tables
- Transaction support
- Backup & recovery
- Audit trails

---

## Security Notes

1. **Encryption Required:**
   - Password hashes (bcrypt/argon2)
   - Sensitive payment info
   - KYC documents
   - Personal identification data

2. **Access Control:**
   - Role-based permissions
   - Data isolation by user/tenant
   - Admin audit trails

3. **Compliance:**
   - GDPR/Data protection
   - Payment card industry (PCI) standards
   - Know Your Customer (KYC) regulations

---

**Document Version:** 1.0  
**Last Updated:** 2026-07-07  
**Total Tables:** 62  
**Status:** Complete Analysis

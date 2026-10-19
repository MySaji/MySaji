# SAJI Platform - Complete Database Schema

## Overview
This document defines all database tables, columns, relationships, and constraints needed to store SAJI platform data. All schemas use PostgreSQL with proper indexing for performance.

---

## Authentication & User Management

### Table: `users`
**Purpose**: Core user account information
**Indexes**: email (UNIQUE), id (PRIMARY)

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  phone_number VARCHAR(20),
  profile_picture_url TEXT,
  bio TEXT,
  role VARCHAR(50) NOT NULL, -- 'customer' | 'provider' | 'shopkeeper' | 'admin' | 'sub-admin' | 'secretary' | 'agent'
  is_verified BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL
);

-- Indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_created_at ON users(created_at);
```

---

### Table: `user_roles` (for users with multiple roles)
**Purpose**: Allow users to have multiple roles (e.g., provider + shopkeeper)

```sql
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL, -- Secondary role
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, role)
);
```

---

### Table: `team_members`
**Purpose**: Team access for admin staff (sub-admin, secretary, agent)

```sql
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_role VARCHAR(50) NOT NULL, -- 'sub-admin' | 'secretary' | 'agent'
  department VARCHAR(100),
  manager_id UUID REFERENCES team_members(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_team_members_user_id ON team_members(user_id);
CREATE INDEX idx_team_members_team_role ON team_members(team_role);
```

---

### Table: `sessions`
**Purpose**: Track active user sessions

```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(500) NOT NULL UNIQUE,
  device_id VARCHAR(255),
  device_type VARCHAR(50), -- 'mobile' | 'desktop' | 'tablet'
  browser_name VARCHAR(100),
  ip_address VARCHAR(45),
  is_active BOOLEAN DEFAULT true,
  last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
```

---

## Customer Portal

### Table: `customers`
**Purpose**: Customer-specific profile data

```sql
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  date_of_birth DATE,
  gender VARCHAR(20),
  preferred_language VARCHAR(10),
  total_spent DECIMAL(10, 2) DEFAULT 0,
  total_bookings INT DEFAULT 0,
  loyalty_points INT DEFAULT 0,
  is_premium BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

### Table: `saved_addresses`
**Purpose**: Customer's saved service locations

```sql
CREATE TABLE saved_addresses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  address_line_1 VARCHAR(255) NOT NULL,
  address_line_2 VARCHAR(255),
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  postal_code VARCHAR(20) NOT NULL,
  country VARCHAR(100) NOT NULL,
  label VARCHAR(50), -- 'home' | 'work' | 'other'
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_saved_addresses_user_id ON saved_addresses(user_id);
```

---

### Table: `favorites`
**Purpose**: Customer's favorite providers and services

```sql
CREATE TABLE favorites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES users(id) ON DELETE CASCADE,
  service_id UUID, -- Reference to services table
  bookmarked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, provider_id, service_id)
);

CREATE INDEX idx_favorites_user_id ON favorites(user_id);
```

---

### Table: `bookings` (Orders for customers)
**Purpose**: Track customer bookings/orders

```sql
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_number VARCHAR(50) NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES users(id),
  provider_id UUID NOT NULL REFERENCES users(id),
  service_id UUID NOT NULL,
  scheduled_date DATE NOT NULL,
  scheduled_time TIME NOT NULL,
  duration_minutes INT NOT NULL,
  status VARCHAR(50) DEFAULT 'pending', -- pending | accepted | in_progress | completed | cancelled
  total_amount DECIMAL(10, 2) NOT NULL,
  commission_amount DECIMAL(10, 2),
  payment_method VARCHAR(50), -- 'credit_card' | 'wallet' | 'bank_transfer'
  payment_status VARCHAR(50) DEFAULT 'unpaid', -- unpaid | paid | refunded
  notes TEXT,
  cancelled_reason TEXT,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_bookings_customer_id ON bookings(customer_id);
CREATE INDEX idx_bookings_provider_id ON bookings(provider_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_scheduled_date ON bookings(scheduled_date);
```

---

## Provider Portal

### Table: `providers`
**Purpose**: Provider-specific profile data

```sql
CREATE TABLE providers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  business_name VARCHAR(255),
  business_registration_number VARCHAR(100),
  tax_id VARCHAR(50),
  years_of_experience INT,
  total_earnings DECIMAL(15, 2) DEFAULT 0,
  completed_jobs INT DEFAULT 0,
  average_rating DECIMAL(3, 2) DEFAULT 0,
  total_reviews INT DEFAULT 0,
  response_time_minutes INT,
  is_verified BOOLEAN DEFAULT false,
  verification_status VARCHAR(50), -- 'pending' | 'approved' | 'rejected'
  verification_date TIMESTAMP NULL,
  is_live_streaming BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_providers_user_id ON providers(user_id);
CREATE INDEX idx_providers_is_verified ON providers(is_verified);
```

---

### Table: `services`
**Purpose**: Services offered by providers

```sql
CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id UUID NOT NULL, -- Reference to service categories
  name VARCHAR(255) NOT NULL,
  description TEXT,
  image_url TEXT,
  base_price DECIMAL(10, 2) NOT NULL,
  duration_minutes INT NOT NULL,
  max_clients_per_session INT DEFAULT 1,
  is_available BOOLEAN DEFAULT true,
  rating DECIMAL(3, 2) DEFAULT 0,
  total_bookings INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_services_provider_id ON services(provider_id);
CREATE INDEX idx_services_category_id ON services(category_id);
CREATE INDEX idx_services_is_available ON services(is_available);
```

---

### Table: `provider_skills`
**Purpose**: Skills and expertise of providers

```sql
CREATE TABLE provider_skills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_name VARCHAR(255) NOT NULL,
  proficiency_level VARCHAR(20), -- 'beginner' | 'intermediate' | 'advanced' | 'expert'
  years_of_experience INT,
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider_id, skill_name)
);

CREATE INDEX idx_provider_skills_provider_id ON provider_skills(provider_id);
```

---

### Table: `certifications`
**Purpose**: Provider certifications and credentials

```sql
CREATE TABLE certifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  certificate_name VARCHAR(255) NOT NULL,
  issuing_organization VARCHAR(255) NOT NULL,
  issue_date DATE NOT NULL,
  expiry_date DATE,
  certificate_number VARCHAR(100),
  document_url TEXT,
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_certifications_provider_id ON certifications(provider_id);
```

---

### Table: `availability`
**Purpose**: Provider working hours and availability

```sql
CREATE TABLE availability (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_of_week INT, -- 0-6 for Monday-Sunday, NULL for specific date
  specific_date DATE NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_available BOOLEAN DEFAULT true,
  break_start_time TIME NULL,
  break_end_time TIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_availability_provider_id ON availability(provider_id);
CREATE INDEX idx_availability_specific_date ON availability(specific_date);
```

---

### Table: `provider_reviews`
**Purpose**: Customer reviews for providers

```sql
CREATE TABLE provider_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES users(id),
  booking_id UUID REFERENCES bookings(id),
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,
  pros TEXT[],
  cons TEXT[],
  helpful_count INT DEFAULT 0,
  verified_booking BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_provider_reviews_provider_id ON provider_reviews(provider_id);
CREATE INDEX idx_provider_reviews_rating ON provider_reviews(rating);
```

---

## Shopkeeper Portal

### Table: `shopkeepers`
**Purpose**: Shopkeeper/seller profile data

```sql
CREATE TABLE shopkeepers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  shop_name VARCHAR(255) NOT NULL,
  shop_description TEXT,
  shop_logo_url TEXT,
  shop_banner_url TEXT,
  registration_number VARCHAR(100),
  tax_id VARCHAR(50),
  total_sales DECIMAL(15, 2) DEFAULT 0,
  total_orders INT DEFAULT 0,
  average_rating DECIMAL(3, 2) DEFAULT 0,
  total_reviews INT DEFAULT 0,
  followers INT DEFAULT 0,
  is_verified BOOLEAN DEFAULT false,
  verification_status VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_shopkeepers_user_id ON shopkeepers(user_id);
```

---

### Table: `products`
**Purpose**: Shopkeeper product listings

```sql
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shopkeeper_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id UUID, -- Product category
  name VARCHAR(255) NOT NULL,
  description TEXT,
  sku VARCHAR(100) UNIQUE,
  images_url TEXT[],
  price DECIMAL(10, 2) NOT NULL,
  cost_price DECIMAL(10, 2),
  discount_percentage DECIMAL(5, 2) DEFAULT 0,
  stock_quantity INT NOT NULL DEFAULT 0,
  low_stock_alert INT,
  rating DECIMAL(3, 2) DEFAULT 0,
  total_sold INT DEFAULT 0,
  status VARCHAR(50) DEFAULT 'active', -- active | draft | discontinued
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_products_shopkeeper_id ON products(shopkeeper_id);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_category_id ON products(category_id);
```

---

### Table: `orders`
**Purpose**: Shopkeeper orders/purchases

```sql
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number VARCHAR(50) NOT NULL UNIQUE,
  shopkeeper_id UUID NOT NULL REFERENCES users(id),
  customer_id UUID NOT NULL REFERENCES users(id),
  status VARCHAR(50) DEFAULT 'pending', -- pending | confirmed | shipped | delivered | cancelled
  total_amount DECIMAL(10, 2) NOT NULL,
  tax_amount DECIMAL(10, 2) DEFAULT 0,
  discount_amount DECIMAL(10, 2) DEFAULT 0,
  shipping_cost DECIMAL(10, 2) DEFAULT 0,
  payment_status VARCHAR(50) DEFAULT 'unpaid', -- unpaid | paid | refunded
  shipping_address_id UUID REFERENCES saved_addresses(id),
  tracking_number VARCHAR(100),
  shipped_date TIMESTAMP NULL,
  delivered_date TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_orders_shopkeeper_id ON orders(shopkeeper_id);
CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
```

---

### Table: `order_items`
**Purpose**: Line items in orders

```sql
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity INT NOT NULL,
  unit_price DECIMAL(10, 2) NOT NULL,
  discount_amount DECIMAL(10, 2) DEFAULT 0,
  total_amount DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_order_items_order_id ON order_items(order_id);
```

---

### Table: `promotions`
**Purpose**: Coupons and promotional campaigns

```sql
CREATE TABLE promotions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shopkeeper_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL UNIQUE,
  discount_type VARCHAR(20), -- 'percentage' | 'fixed'
  discount_value DECIMAL(10, 2) NOT NULL,
  min_purchase_amount DECIMAL(10, 2) DEFAULT 0,
  max_uses INT,
  current_uses INT DEFAULT 0,
  applicable_categories UUID[],
  applicable_products UUID[],
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_promotions_shopkeeper_id ON promotions(shopkeeper_id);
CREATE INDEX idx_promotions_code ON promotions(code);
```

---

### Table: `shop_reviews`
**Purpose**: Customer reviews for shops

```sql
CREATE TABLE shop_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shopkeeper_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES users(id),
  order_id UUID REFERENCES orders(id),
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,
  helpful_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_shop_reviews_shopkeeper_id ON shop_reviews(shopkeeper_id);
```

---

## Financial Management

### Table: `payments`
**Purpose**: All platform payments

```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id VARCHAR(100) UNIQUE, -- Stripe payment ID
  user_id UUID NOT NULL REFERENCES users(id),
  booking_id UUID REFERENCES bookings(id),
  order_id UUID REFERENCES orders(id),
  payment_type VARCHAR(50), -- 'booking' | 'product_order' | 'subscription'
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  payment_method VARCHAR(50), -- 'credit_card' | 'debit_card' | 'wallet' | 'bank_transfer'
  status VARCHAR(50) DEFAULT 'pending', -- pending | success | failed | refunded
  stripe_payment_intent_id VARCHAR(255),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_transaction_id ON payments(transaction_id);
CREATE INDEX idx_payments_status ON payments(status);
```

---

### Table: `wallets`
**Purpose**: User wallet balances

```sql
CREATE TABLE wallets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  balance DECIMAL(15, 2) DEFAULT 0,
  currency VARCHAR(3) DEFAULT 'USD',
  total_earned DECIMAL(15, 2) DEFAULT 0,
  total_spent DECIMAL(15, 2) DEFAULT 0,
  total_withdrawn DECIMAL(15, 2) DEFAULT 0,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_wallets_user_id ON wallets(user_id);
```

---

### Table: `wallet_transactions`
**Purpose**: Transaction history for wallets

```sql
CREATE TABLE wallet_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  transaction_type VARCHAR(50), -- 'credit' | 'debit' | 'withdrawal' | 'refund'
  amount DECIMAL(15, 2) NOT NULL,
  description VARCHAR(255),
  reference_id VARCHAR(100), -- Payment ID or booking ID
  balance_before DECIMAL(15, 2),
  balance_after DECIMAL(15, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_wallet_transactions_wallet_id ON wallet_transactions(wallet_id);
CREATE INDEX idx_wallet_transactions_created_at ON wallet_transactions(created_at);
```

---

### Table: `payouts`
**Purpose**: Payout requests and processing

```sql
CREATE TABLE payouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  amount DECIMAL(15, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  payout_method VARCHAR(50), -- 'bank_transfer' | 'wallet' | 'check'
  bank_account_id UUID,
  status VARCHAR(50) DEFAULT 'pending', -- pending | processing | completed | failed
  stripe_payout_id VARCHAR(255),
  requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP NULL,
  failed_reason TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payouts_user_id ON payouts(user_id);
CREATE INDEX idx_payouts_status ON payouts(status);
```

---

### Table: `invoices`
**Purpose**: Generated invoices

```sql
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number VARCHAR(50) NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id),
  booking_id UUID REFERENCES bookings(id),
  order_id UUID REFERENCES orders(id),
  invoice_date DATE NOT NULL,
  due_date DATE,
  subtotal DECIMAL(10, 2) NOT NULL,
  tax_amount DECIMAL(10, 2) DEFAULT 0,
  discount_amount DECIMAL(10, 2) DEFAULT 0,
  total_amount DECIMAL(10, 2) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending', -- pending | paid | overdue
  payment_date TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_invoices_user_id ON invoices(user_id);
CREATE INDEX idx_invoices_status ON invoices(status);
```

---

### Table: `commission_tiers`
**Purpose**: Commission rate configuration by role

```sql
CREATE TABLE commission_tiers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE,
  role VARCHAR(50) NOT NULL, -- 'provider' | 'shopkeeper' | 'agent'
  min_monthly_transactions DECIMAL(15, 2),
  commission_percentage DECIMAL(5, 2) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_commission_tiers_role ON commission_tiers(role);
```

---

## Communication & Support

### Table: `messages`
**Purpose**: In-app messaging between users

```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id UUID NOT NULL REFERENCES users(id),
  recipient_id UUID NOT NULL REFERENCES users(id),
  conversation_id VARCHAR(100) NOT NULL, -- Derived from sorted user IDs
  message_text TEXT NOT NULL,
  attachment_url TEXT,
  message_type VARCHAR(50) DEFAULT 'text', -- text | image | file | system
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_sender_id ON messages(sender_id);
CREATE INDEX idx_messages_recipient_id ON messages(recipient_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);
```

---

### Table: `email_subscribers`
**Purpose**: Newsletter subscription list

```sql
CREATE TABLE email_subscribers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) NOT NULL UNIQUE,
  device_id VARCHAR(255),
  subscription_status VARCHAR(50) DEFAULT 'active', -- active | unsubscribed
  subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  unsubscribed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_email_subscribers_email ON email_subscribers(email);
CREATE INDEX idx_email_subscribers_device_id ON email_subscribers(device_id);
```

---

### Table: `chatbot_conversations`
**Purpose**: AI chatbot conversation history

```sql
CREATE TABLE chatbot_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  device_id VARCHAR(255),
  status VARCHAR(50) DEFAULT 'active', -- active | escalated | closed
  escalated_to_agent BOOLEAN DEFAULT false,
  agent_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  escalated_at TIMESTAMP NULL,
  ended_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_chatbot_conversations_user_id ON chatbot_conversations(user_id);
CREATE INDEX idx_chatbot_conversations_status ON chatbot_conversations(status);
```

---

### Table: `chatbot_messages`
**Purpose**: Messages in chatbot conversations

```sql
CREATE TABLE chatbot_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES chatbot_conversations(id) ON DELETE CASCADE,
  sender_type VARCHAR(20), -- 'user' | 'ai' | 'agent'
  sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
  message_text TEXT NOT NULL,
  message_category VARCHAR(50), -- 'greeting' | 'order_issue' | 'payment' | 'refund' | etc
  response_generated_by VARCHAR(50), -- 'gpt-4' | 'claude' | 'human_agent'
  is_resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_chatbot_messages_conversation_id ON chatbot_messages(conversation_id);
```

---

### Table: `support_tickets`
**Purpose**: User support requests

```sql
CREATE TABLE support_tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_number VARCHAR(50) NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id),
  assigned_to UUID REFERENCES team_members(id),
  subject VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(50), -- 'billing' | 'technical' | 'account' | 'other'
  priority VARCHAR(20), -- 'low' | 'medium' | 'high' | 'urgent'
  status VARCHAR(50) DEFAULT 'open', -- open | in_progress | waiting | closed
  resolution_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_support_tickets_user_id ON support_tickets(user_id);
CREATE INDEX idx_support_tickets_status ON support_tickets(status);
```

---

## Disputes & Moderation

### Table: `disputes`
**Purpose**: Track customer disputes

```sql
CREATE TABLE disputes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dispute_number VARCHAR(50) NOT NULL UNIQUE,
  booking_id UUID REFERENCES bookings(id),
  order_id UUID REFERENCES orders(id),
  complainant_id UUID NOT NULL REFERENCES users(id), -- Customer
  respondent_id UUID NOT NULL REFERENCES users(id), -- Provider/Shopkeeper
  assigned_agent_id UUID REFERENCES team_members(id),
  reason VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  evidence_urls TEXT[],
  status VARCHAR(50) DEFAULT 'open', -- open | under_review | resolved | escalated
  resolution_type VARCHAR(50), -- 'refund' | 'rework' | 'credit' | 'no_fault'
  resolution_amount DECIMAL(10, 2),
  priority VARCHAR(20) DEFAULT 'normal',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_disputes_complainant_id ON disputes(complainant_id);
CREATE INDEX idx_disputes_respondent_id ON disputes(respondent_id);
CREATE INDEX idx_disputes_status ON disputes(status);
```

---

### Table: `reports`
**Purpose**: User-submitted reports for moderation

```sql
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_number VARCHAR(50) NOT NULL UNIQUE,
  reporter_id UUID NOT NULL REFERENCES users(id),
  reported_user_id UUID NOT NULL REFERENCES users(id),
  report_type VARCHAR(50), -- 'inappropriate_content' | 'fraud' | 'harassment' | 'spam'
  description TEXT NOT NULL,
  evidence_urls TEXT[],
  status VARCHAR(50) DEFAULT 'pending', -- pending | investigating | actioned | dismissed
  assigned_to UUID REFERENCES team_members(id),
  action_taken VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL
);

CREATE INDEX idx_reports_reporter_id ON reports(reporter_id);
CREATE INDEX idx_reports_reported_user_id ON reports(reported_user_id);
CREATE INDEX idx_reports_status ON reports(status);
```

---

### Table: `content_moderation`
**Purpose**: Track moderated content

```sql
CREATE TABLE content_moderation (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content_type VARCHAR(50), -- 'review' | 'profile_bio' | 'listing_description' | 'message'
  content_id UUID NOT NULL,
  content_text TEXT,
  user_id UUID NOT NULL REFERENCES users(id),
  flagged_by VARCHAR(50), -- 'system' | 'human' | 'ai'
  reason VARCHAR(255),
  status VARCHAR(50) DEFAULT 'pending', -- pending | approved | removed | edited
  moderator_id UUID REFERENCES team_members(id),
  moderation_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  actioned_at TIMESTAMP NULL
);

CREATE INDEX idx_content_moderation_user_id ON content_moderation(user_id);
CREATE INDEX idx_content_moderation_status ON content_moderation(status);
```

---

## Analytics & Logging

### Table: `audit_logs`
**Purpose**: Track all system actions for compliance

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(255) NOT NULL,
  entity_type VARCHAR(50), -- 'user' | 'booking' | 'payment' | 'dispute'
  entity_id UUID,
  changes JSONB,
  ip_address VARCHAR(45),
  device_id VARCHAR(255),
  severity VARCHAR(20), -- 'info' | 'warning' | 'error' | 'critical'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_severity ON audit_logs(severity);
```

---

### Table: `analytics_events`
**Purpose**: Track user events for analytics

```sql
CREATE TABLE analytics_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  device_id VARCHAR(255),
  event_type VARCHAR(100), -- 'page_view' | 'button_click' | 'form_submit'
  event_data JSONB,
  session_id VARCHAR(255),
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_analytics_events_user_id ON analytics_events(user_id);
CREATE INDEX idx_analytics_events_event_type ON analytics_events(event_type);
CREATE INDEX idx_analytics_events_created_at ON analytics_events(created_at);
```

---

## Payment & Transaction Tables (Kenya-Focused)

### Table: `payments`
**Purpose**: Track all payment transactions (M-Pesa, Airtel Money, Bank)

```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id),
  user_id UUID NOT NULL REFERENCES users(id),
  amount DECIMAL(15, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'KES',
  payment_method VARCHAR(50) NOT NULL, -- 'mpesa' | 'airtel_money' | 'bank_transfer' | 'wallet'
  provider_name VARCHAR(100), -- 'Safaricom' | 'Airtel' | 'Bank of Kenya', etc.
  status VARCHAR(50) NOT NULL, -- 'pending' | 'processing' | 'completed' | 'failed' | 'refunded'
  transaction_reference VARCHAR(255) UNIQUE, -- M-Pesa receipt number or bank ref
  mpesa_receipt_number VARCHAR(100),
  mpesa_balance_amount DECIMAL(15, 2), -- Account balance after transaction
  airtel_transaction_id VARCHAR(255),
  phone_number VARCHAR(20), -- Customer's M-Pesa/Airtel registered phone
  external_transaction_id VARCHAR(255), -- Third-party API transaction ID
  payment_gateway_response JSONB, -- Store full API response
  metadata JSONB, -- Additional payment data
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payments_order_id ON payments(order_id);
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_payment_method ON payments(payment_method);
CREATE INDEX idx_payments_transaction_reference ON payments(transaction_reference);
CREATE INDEX idx_payments_created_at ON payments(created_at);
```

---

### Table: `payment_methods`
**Purpose**: Store user's saved payment methods

```sql
CREATE TABLE payment_methods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payment_method VARCHAR(50) NOT NULL, -- 'mpesa' | 'airtel_money' | 'bank'
  phone_number VARCHAR(20), -- For mobile money
  account_name VARCHAR(255), -- For bank transfers
  bank_account_number VARCHAR(50), -- For bank transfers
  bank_code VARCHAR(10), -- Swift code or bank identifier
  is_default BOOLEAN DEFAULT false,
  is_verified BOOLEAN DEFAULT false,
  last_used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payment_methods_user_id ON payment_methods(user_id);
CREATE UNIQUE INDEX idx_default_payment_method ON payment_methods(user_id) WHERE is_default = true;
```

---

### Table: `mpesa_callbacks`
**Purpose**: Store M-Pesa API callbacks for debugging and reconciliation

```sql
CREATE TABLE mpesa_callbacks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_reference VARCHAR(255),
  result_code INT,
  result_description TEXT,
  callback_data JSONB, -- Full callback JSON from Daraja API
  merchant_request_id VARCHAR(255),
  checkout_request_id VARCHAR(255),
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_mpesa_callbacks_transaction_reference ON mpesa_callbacks(transaction_reference);
CREATE INDEX idx_mpesa_callbacks_result_code ON mpesa_callbacks(result_code);
```

---

### Table: `airtel_callbacks`
**Purpose**: Store Airtel Money API callbacks for debugging and reconciliation

```sql
CREATE TABLE airtel_callbacks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id VARCHAR(255) UNIQUE,
  status VARCHAR(50),
  callback_data JSONB, -- Full callback JSON from Airtel API
  merchant_id VARCHAR(100),
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_airtel_callbacks_transaction_id ON airtel_callbacks(transaction_id);
CREATE INDEX idx_airtel_callbacks_status ON airtel_callbacks(status);
```

---

### Table: `payouts`
**Purpose**: Track money sent to providers and shopkeepers via M-Pesa B2C

```sql
CREATE TABLE payouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID NOT NULL REFERENCES users(id),
  amount DECIMAL(15, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'KES',
  payout_method VARCHAR(50) NOT NULL, -- 'mpesa' | 'bank_transfer'
  phone_number VARCHAR(20),
  bank_account_number VARCHAR(50),
  status VARCHAR(50) NOT NULL, -- 'pending' | 'initiated' | 'completed' | 'failed' | 'reversed'
  conversion_id VARCHAR(255), -- M-Pesa B2C conversion ID
  originator_conversation_id VARCHAR(255),
  external_reference VARCHAR(255),
  reason VARCHAR(255), -- 'earnings_payout' | 'refund' | 'bonus'
  initiated_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payouts_provider_id ON payouts(provider_id);
CREATE INDEX idx_payouts_status ON payouts(status);
CREATE INDEX idx_payouts_created_at ON payouts(created_at);
```

---

### Table: `invoices`
**Purpose**: Store invoices for transactions (needed for audit trail)

```sql
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id),
  invoice_number VARCHAR(100) NOT NULL UNIQUE,
  issue_date TIMESTAMP NOT NULL,
  due_date TIMESTAMP,
  amount DECIMAL(15, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'KES',
  status VARCHAR(50) NOT NULL, -- 'draft' | 'issued' | 'paid' | 'cancelled'
  payment_status VARCHAR(50), -- 'unpaid' | 'partial' | 'paid'
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_invoices_order_id ON invoices(order_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE UNIQUE INDEX idx_invoices_number ON invoices(invoice_number);
```

---

## Reference Tables

### Table: `service_categories`
**Purpose**: Service type categories

```sql
CREATE TABLE service_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  icon_url TEXT,
  is_active BOOLEAN DEFAULT true,
  display_order INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

### Table: `product_categories`
**Purpose**: Product type categories

```sql
CREATE TABLE product_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  icon_url TEXT,
  is_active BOOLEAN DEFAULT true,
  display_order INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Indexes Summary
All critical tables have indexes on:
- Primary keys (UUID)
- Foreign keys (for joins)
- Status/state columns (for filtering)
- Date columns (for range queries)
- User IDs (for ownership queries)

---

## Data Integrity Rules
- Cascade deletes for user_roles and orders
- Soft deletes for users (deleted_at column)
- Unique constraints on emails, phone numbers
- Check constraints on ratings (1-5), percentages (0-100)
- Status enums to prevent invalid states

---

## Performance Considerations
- Partition large tables by date (payments, messages, analytics_events)
- Archive old data (>1 year) to separate tables
- Use materialized views for frequently accessed aggregations
- Regular vacuum and analyze for PostgreSQL optimization

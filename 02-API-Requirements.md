# SAJI Platform - API Requirements & Third-Party Integration Guide

## Overview
This document outlines all external APIs and services required to convert SAJI from a frontend-only prototype to a fully functional backend system with data persistence and real-time features.

---

## 1. Core Backend Infrastructure

### 1.1 Database (Required - CRITICAL)
**Purpose**: Store all user data, transactions, and platform information

#### Options:
- **PostgreSQL** (Recommended)
  - Provider: Neon, Supabase, AWS RDS, DigitalOcean
  - Pros: Relational, scalable, reliable, JSON support
  - Cons: Requires schema management
  - Cost: $5-50/month depending on provider

- **MongoDB**
  - Provider: MongoDB Atlas, AWS DocumentDB
  - Pros: Flexible schema, document-based
  - Cons: Higher costs, eventual consistency
  - Cost: $10-200/month

- **Firebase/Firestore**
  - Pros: Real-time, managed, automatic scaling
  - Cons: Vendor lock-in, higher costs at scale
  - Cost: Pay-per-use, typically $25-300/month

**Recommendation**: **PostgreSQL with Supabase** or **Neon**
- Supabase: Includes auth, real-time, file storage
- Neon: Serverless PostgreSQL, very scalable

---

### 1.2 File Storage (Required)
**Purpose**: Store user profile pictures, portfolio images, product photos, documents

#### Options:
- **AWS S3**
  - Cost: $0.023/GB stored + transfer fees
  - Pros: Industry standard, highly scalable
  - Integration: AWS SDK, pre-signed URLs

- **Vercel Blob** (Recommended for this project)
  - Cost: $0.50/GB/month
  - Pros: Built for Vercel, simple API, CDN included
  - Integration: Already available in project

- **Google Cloud Storage**
  - Cost: $0.020/GB/month
  - Pros: Good pricing, reliable
  - Integration: Google Cloud SDK

- **Cloudinary**
  - Cost: $0.01-0.05/image based on operations
  - Pros: Image optimization, transformations included
  - Integration: Simple upload widget

**Recommendation**: **Vercel Blob** (already in project stack)

---

### 1.3 Authentication & User Management
**Purpose**: Secure user login, password management, role-based access

#### Options:
- **Supabase Auth** (Recommended)
  - Pros: PostgreSQL built-in, OAuth support, Passwordless options
  - Cons: Tied to Supabase
  - Cost: Included with Supabase plan

- **Auth0**
  - Pros: Universal, enterprise-grade, many integrations
  - Cons: More expensive
  - Cost: $0-600+/month

- **Firebase Authentication**
  - Pros: Free tier, multiple auth methods
  - Cons: Firebase lock-in
  - Cost: Included with Firebase plan

- **Custom JWT** (Not recommended)
  - Pros: Full control
  - Cons: Security risks if not implemented correctly
  - Cost: Free but requires security expertise

**Recommendation**: **Supabase Auth** (integrates with PostgreSQL backend)

---

## 2. Payment Processing (Critical for Revenue - Kenyan Focus)

### 2.1 Mobile Money Payment Gateway - M-Pesa
**Purpose**: Accept payments from M-Pesa users (Kenya's largest mobile payment system)

#### M-Pesa API Options:

- **Daraja API by Safaricom** (Recommended - Official)
  - Cost: Pay-per-transaction (no fixed fees for app integrations)
  - Pros: Official Safaricom API, highest adoption in Kenya (~40M users)
  - Features: STK Push, C2B, B2C, B2B, Account Balance
  - Integration: REST API, excellent documentation
  - Coverage: Kenya only
  - Implementation:
  ```typescript
  import axios from 'axios';
  
  const initiateSTKPush = async (phoneNumber: string, amount: number) => {
    const auth = Buffer.from(
      `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
    ).toString('base64');
    
    const accessTokenResponse = await axios.get(
      'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
      { headers: { Authorization: `Basic ${auth}` } }
    );
    
    const accessToken = accessTokenResponse.data.access_token;
    
    const response = await axios.post(
      'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      {
        BusinessShortCode: process.env.MPESA_SHORTCODE,
        Password: Buffer.from(
          `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`
        ).toString('base64'),
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: amount,
        PartyA: phoneNumber,
        PartyB: process.env.MPESA_SHORTCODE,
        PhoneNumber: phoneNumber,
        CallBackURL: `${process.env.CALLBACK_URL}/api/mpesa/callback`,
        AccountReference: 'SAJI-ORDER',
        TransactionDesc: 'SAJI Service Payment',
      },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    
    return response.data;
  };
  ```

- **Pesapal** (Multi-method alternative)
  - Cost: 2.5% + 15 KES per transaction
  - Pros: Supports M-Pesa, Airtel Money, Bank transfers all in one
  - Features: Webhook support, easy integration
  - Coverage: Kenya, Uganda, Tanzania
  - Documentation: Good

- **Flutterwave** (Multi-method)
  - Cost: 1.5% - 3% depending on method
  - Pros: Pan-African, handles multiple currencies
  - Features: Built-in M-Pesa, good dashboard
  - Coverage: 33 African countries including Kenya
  - Documentation: Excellent

**Recommendation**: **Daraja API by Safaricom** (official, highest adoption)

---

### 2.2 Mobile Money Payment Gateway - Airtel Money
**Purpose**: Accept payments from Airtel Money users (Kenya's 2nd largest mobile money)

#### Airtel Money API:

- **Airtel Money API** (Official - Recommended)
  - Cost: Pay-per-transaction
  - Pros: Direct from Airtel, ~10M users in Kenya
  - Features: Collect API, Inquiry, Refund
  - Integration: REST API
  - Coverage: Kenya, Tanzania, Uganda, Democratic Republic of Congo
  - Implementation:
  ```typescript
  const initiateAirtelPayment = async (phoneNumber: string, amount: number) => {
    const response = await axios.post(
      'https://api.airtel.co.ke/standard/v1/payments/mobile/checkout',
      {
        reference: `SAJI-${Date.now()}`,
        subscriber: {
          phone: phoneNumber,
        },
        transaction: {
          amount: amount,
          currency: 'KES',
        },
        merchant: {
          name: 'SAJI Platform',
          category: 'E-Services',
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.AIRTEL_API_KEY}`,
          'X-Country': 'KE',
          'Content-Type': 'application/json',
        },
      }
    );
    
    return response.data;
  };
  ```

- **Pesapal** (Covers both M-Pesa and Airtel Money)
  - Cost: 2.5% + 15 KES per transaction
  - Pros: Single integration for both payment methods
  - Features: Dashboard, webhook support
  - Recommended if supporting both simultaneously

**Recommendation**: **Daraja API (M-Pesa) + Airtel Money API (direct)**
- Use both for maximum coverage (covers ~80% of Kenya's mobile money market)
- Alternatively: **Pesapal** for single integration managing both

---

### 2.3 Bank Transfer Integration
**Purpose**: For users without mobile money or large transactions

#### Options:
- **PesaLink** (Safaricom's bank-to-bank transfer)
  - Cost: Free for customers, platform handles bank fees (~1-3%)
  - Pros: Instant inter-bank transfers, works with all Kenyan banks
  - Integration: Via Safaricom API

- **USSD Banking**
  - Cost: Per transaction (varies by bank)
  - Pros: Works on any phone, basic USSD codes
  - Cons: Manual, slower

**Recommendation**: **PesaLink for high-value transfers** (>50,000 KES)

---

### 2.4 Payout System - Sending Money to Providers/Shopkeepers
**Purpose**: Daily/weekly payouts to providers and shopkeepers

#### Options:

- **Daraja B2C (Business to Customer)**
  - Cost: Per transaction payout fees
  - Pros: Direct M-Pesa payouts to providers, instant
  - Features: Reverse capability, high success rate
  - Implementation:
  ```typescript
  const sendPayoutToProvider = async (providerPhone: string, amount: number) => {
    const auth = Buffer.from(
      `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
    ).toString('base64');
    
    const accessToken = await getAccessToken(auth);
    
    const response = await axios.post(
      'https://sandbox.safaricom.co.ke/mpesa/b2c/v1/paymentrequest',
      {
        OriginatorConversationID: `SAJI-${Date.now()}`,
        InitiatorName: process.env.MPESA_INITIATOR_NAME,
        InitiatorPassword: process.env.MPESA_INITIATOR_PASSWORD,
        CommandID: 'BusinessPayment', // or 'SalaryPayment', 'PromotionPayment'
        Amount: amount,
        PartyA: process.env.MPESA_SHORTCODE,
        PartyB: providerPhone,
        Remarks: 'SAJI Provider Payout',
        QueueTimeOutURL: `${process.env.CALLBACK_URL}/api/mpesa/b2c/timeout`,
        ResultURL: `${process.env.CALLBACK_URL}/api/mpesa/b2c/result`,
      },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    
    return response.data;
  };
  ```

- **Airtel Money Disbursements**
  - Cost: Per transaction
  - Pros: Alternative if M-Pesa fails or for Airtel Money subscribers
  - Features: Bulk disbursements supported

- **Bank Transfers via PesaLink**
  - Cost: Bank fees (~1-3%)
  - Pros: Works for all providers with bank accounts
  - Cons: Slower (takes 1-2 hours)

**Recommendation**: **M-Pesa B2C for primary payouts** (instant, reliable)
- Fallback: **Bank transfers** for accounts preferring bank deposits

---

### 2.5 Webhook & Callback Handling
**Implementation for payment callbacks**:

```typescript
// M-Pesa STK Push Callback
export async function POST(req: Request) {
  const body = await req.json();
  const { Body } = body;
  const { stkCallback } = Body;
  const { ResultCode, CallbackMetadata } = stkCallback;
  
  if (ResultCode === 0) {
    // Payment successful
    const metadata = CallbackMetadata.item;
    const amount = metadata.find((item: any) => item.Name === 'Amount').Value;
    const transactionId = metadata.find((item: any) => item.Name === 'MpesaReceiptNumber').Value;
    
    // Update database with payment
    await updateOrderPayment(transactionId, amount);
  }
  
  return Response.json({ ResultCode: 0 });
}
```

---

## 2.6 Payment Integration Comparison Table

| Feature | M-Pesa (Daraja) | Airtel Money | Pesapal | Flutterwave |
|---------|-----------------|--------------|---------|-------------|
| User Base (KE) | ~40M | ~10M | N/A | N/A |
| Cost | Per-txn | Per-txn | 2.5% + 15 KES | 1.5-3% |
| Integration | REST API | REST API | Single | Single |
| Settlement Speed | Instant | Instant | 24-48h | 24-48h |
| Multi-Country | No | Limited | Yes | Yes |
| Payout to Users | Yes (B2C) | Yes | Limited | Yes |
| Webhook Support | Yes | Yes | Yes | Yes |
| Documentation | Excellent | Good | Good | Excellent |

**Recommendation for SAJI**: Start with **M-Pesa Daraja API** for customer collections and B2C payouts, add **Airtel Money** for secondary coverage. Use **Pesapal** only if simplification is needed over 2 API integrations.

---

## 3. Real-Time Communication

### 3.1 Messaging & Chat
**Purpose**: Real-time messaging between customers and providers

#### Options:
- **WebSocket** (Custom)
  - Pros: Full control, no third-party costs
  - Cons: Complex to manage at scale
  - Tools: Socket.io, ws library

- **Firebase Realtime Database**
  - Cost: Included with Firebase
  - Pros: Managed real-time, easy setup
  - Cons: Limited scalability for large platforms

- **Pusher**
  - Cost: $0-200+/month depending on concurrent connections
  - Pros: Fully managed, excellent documentation
  - Features: Channels, presence, webhooks

- **Supabase Realtime**
  - Cost: Included with Supabase
  - Pros: PostgreSQL integration, managed
  - Features: Channel-based, built-in auth

**Recommendation**: **Supabase Realtime** (already integrated with PostgreSQL)

---

### 3.2 Push Notifications
**Purpose**: Alert users about orders, messages, job updates

#### Options:
- **Firebase Cloud Messaging (FCM)**
  - Cost: Free
  - Pros: Built-in with Firebase, good documentation
  - Support: Web, Android, iOS

- **OneSignal**
  - Cost: Free up to 30,000 users, then $0-120+/month
  - Pros: Multi-platform, excellent dashboard
  - Support: Web, mobile, email

- **Pusher Beams**
  - Cost: Similar to Pusher, $0-200+/month
  - Pros: Multi-platform, integrated with Pusher
  - Support: Web, iOS, Android

**Recommendation**: **OneSignal**
- Implementation:
  ```typescript
  import OneSignal from 'onesignal-node';
  
  const client = new OneSignal.Client({
    userAuthKey: process.env.ONESIGNAL_USER_KEY,
    app: { appAuthKey: process.env.ONESIGNAL_APP_KEY, id: process.env.ONESIGNAL_APP_ID }
  });
  
  await client.createNotification({
    contents: { en: 'New order received' },
    big_picture: orderImage,
    include_external_user_ids: [userId]
  });
  ```

---

### 3.3 Email Service
**Purpose**: Send transactional emails, newsletters, notifications

#### Options:
- **SendGrid**
  - Cost: Free up to 100/day, then $9.95-299+/month
  - Pros: Excellent deliverability, templates
  - Features: A/B testing, analytics

- **Brevo (formerly Sendinblue)**
  - Cost: Free up to 300/day, then €20+/month
  - Pros: EU-friendly, good pricing
  - Features: Email and SMS bundled

- **Mailgun**
  - Cost: $0.35+ per 1000 emails, $5 minimum/month
  - Pros: Developer-friendly, webhooks
  - Features: SMTP relay, API

- **Resend** (Next.js friendly)
  - Cost: $0.20/1000 emails
  - Pros: Built for Next.js, modern API
  - Features: React components, webhooks

**Recommendation**: **Resend** (Next.js native)
- Implementation:
  ```typescript
  import { Resend } from 'resend';
  const resend = new Resend(process.env.RESEND_API_KEY);
  
  await resend.emails.send({
    from: 'noreply@saji.com',
    to: userEmail,
    subject: 'Order Confirmed',
    html: emailHtmlTemplate,
  });
  ```

---

## 4. Analytics & Monitoring

### 4.1 Analytics Platform
**Purpose**: Track user behavior, conversions, usage patterns

#### Options:
- **Google Analytics 4**
  - Cost: Free
  - Pros: Industry standard, detailed insights
  - Integration: gtag.js library

- **Mixpanel**
  - Cost: Free up to 20M events/month, then $999+/month
  - Pros: User-focused analytics, cohort analysis
  - Features: Funnels, retention, user journeys

- **Segment**
  - Cost: $120+/month
  - Pros: Central data hub, routes to multiple platforms
  - Features: Data collection, routing

- **PostHog**
  - Cost: Free up to 1M events, then $450+/month
  - Pros: Self-hosted option, product analytics
  - Features: Feature flags, funnels, retention

**Recommendation**: **Google Analytics 4** (free) + **Mixpanel** for advanced analytics

---

### 4.2 Error Tracking & Monitoring
**Purpose**: Catch bugs, monitor server health, track performance

#### Options:
- **Sentry**
  - Cost: Free tier available, $29+/month paid
  - Pros: Excellent for error tracking, performance monitoring
  - Integration: @sentry/next SDK

- **LogRocket**
  - Cost: $99+/month
  - Pros: Session replay, console logs, network requests
  - Features: Very detailed debugging

- **DataDog**
  - Cost: $15+/month per host
  - Pros: Complete observability, enterprise features
  - Features: APM, logs, synthetics

**Recommendation**: **Sentry** (excellent error tracking, good free tier)

---

## 5. Search & Discovery

### 5.1 Search Engine
**Purpose**: Fast, relevant search across services and products

#### Options:
- **Elasticsearch**
  - Cost: Self-hosted (free) or managed ($25-500+/month)
  - Pros: Most powerful, flexible filtering
  - Cons: Complex setup

- **Meilisearch**
  - Cost: Self-hosted (free) or managed ($10-99+/month)
  - Pros: Simple setup, great UX
  - Cons: Less powerful than Elasticsearch

- **Algolia**
  - Cost: $0-20+/month
  - Pros: Fully managed, instant search, great API
  - Features: Typo tolerance, faceting, synonyms

- **Supabase Full Text Search**
  - Cost: Included with Supabase
  - Pros: No additional service, integrated
  - Cons: Less powerful than specialized solutions

**Recommendation**: **Supabase Full Text Search** (included) for MVP, upgrade to **Algolia** at scale

---

## 6. Map & Location Services

### 6.1 Maps & Geocoding
**Purpose**: Show service areas, store locations, delivery zones

#### Options:
- **Google Maps API**
  - Cost: $0.007 per map load, $5-15 per 1000 requests
  - Pros: Industry standard, excellent coverage
  - Features: Maps, directions, geolocation

- **Mapbox**
  - Cost: $0-200+/month based on usage
  - Pros: Modern design, great documentation
  - Features: Maps, routing, geocoding

- **OpenStreetMap / Leaflet**
  - Cost: Free
  - Pros: No API costs
  - Cons: Less features than Google Maps
  - Alternative: Can use third-party tiles

**Recommendation**: **Google Maps API** (best for India coverage)

---

## 7. Verification & Compliance

### 7.1 Identity Verification
**Purpose**: Verify provider credentials, prevent fraud

#### Options:
- **IDology**
  - Cost: $2-5 per verification
  - Pros: KYC/AML compliant, document verification

- **Veriff**
  - Cost: $1-5 per verification
  - Pros: Liveness checks, document verification
  - Features: Multi-country support

- **Onfido**
  - Cost: $0.50-2 per check
  - Pros: Fast, accurate, AML screening
  - Features: Video verification, document checks

**Recommendation**: **Onfido** (best for India, competitive pricing)

---

### 7.2 Background Checks
**Purpose**: Screen providers for safety

#### Options:
- **Checkr**
  - Cost: $10-50 per check
  - Pros: Comprehensive, USA-focused
  - Cons: Limited India coverage

- **Safescore** (India)
  - Cost: Varies by check type
  - Pros: India-specific data
  - Features: Criminal, employment verification

**Recommendation**: **Safescore** for India market

---

## 8. SMS & Voice

### 8.1 SMS Notifications
**Purpose**: Send OTP, delivery updates, alerts via SMS

#### Options:
- **Twilio**
  - Cost: $0.0075 per SMS + $1/month per number
  - Pros: Global, reliable, WhatsApp Business integration
  - Features: SMS, voice, WhatsApp

- **AWS SNS**
  - Cost: $0.00645 per SMS
  - Pros: Cheap, integrated with AWS
  - Cons: Limited features

- **Brevo SMS**
  - Cost: €0.04-0.08 per SMS
  - Pros: EU-friendly, bundled with email
  - Features: SMS + Email

**Recommendation**: **Twilio** (best for global, WhatsApp support)

---

## 9. Video & Media

### 9.1 Video Streaming / Live
**Purpose**: Provider live streams, video content

#### Options:
- **Agora.io**
  - Cost: $0.0130 per 1000 min for HD
  - Pros: Low latency, global coverage
  - Features: WebRTC, recording, real-time transcription

- **Jitsi**
  - Cost: Free self-hosted
  - Pros: Open source, no licensing costs
  - Cons: Requires self-hosting

- **Twilio Video**
  - Cost: $0.01 per participant per minute
  - Pros: Reliable, good SDKs
  - Features: Recording, transcription

**Recommendation**: **Agora.io** (best for live streaming, competitive pricing)

---

## 10. AI & Chatbot

### 10.1 AI Chatbot Service
**Purpose**: Intelligent customer support with escalation

#### Options:
- **OpenAI API** (GPT-4)
  - Cost: $0.03-0.10 per 1K tokens
  - Pros: Most capable AI, excellent quality
  - Features: Chat, completions, embeddings

- **Anthropic Claude**
  - Cost: $0.80-2.40 per 1M input tokens
  - Pros: Safety-focused, good at instructions
  - Features: Large context window

- **Google Vertex AI**
  - Cost: $0.005 per 1K requests
  - Pros: Cheaper, good quality
  - Features: Multiple models available

- **AWS Bedrock**
  - Cost: $0.50-5 per 1M tokens
  - Pros: Multiple models, AWS integration
  - Features: Fine-tuning, custom models

**Recommendation**: **OpenAI GPT-4** (best quality, most documentation)

---

## Implementation Priority

### Phase 1 (MVP - Weeks 1-4) - Kenyan Focus
1. PostgreSQL Database (Supabase or Neon)
2. Authentication (Supabase Auth)
3. File Storage (Vercel Blob)
4. Email Service (Resend)
5. Payment (M-Pesa Daraja API + Airtel Money API)

### Phase 2 (Core Features - Weeks 5-8)
6. Real-time Messaging (Supabase Realtime)
7. Push Notifications (OneSignal)
8. AI Chatbot (OpenAI API)
9. Analytics (Google Analytics 4)

### Phase 3 (Growth - Weeks 9-12)
10. Maps (Google Maps)
11. SMS (Twilio)
12. Error Monitoring (Sentry)
13. Advanced Search (Algolia)

### Phase 4 (Scale - Weeks 13+)
14. Video Streaming (Agora.io)
15. Background Checks (Safescore)
16. Identity Verification (Onfido)

---

## Cost Estimation (Kenya-Focused)

### Minimum Viable Product (MVP)
- PostgreSQL: $20/month
- Auth: Included
- Email: $20/month (10K emails)
- Payment Processing (M-Pesa): Per-transaction (typically 1-2% or flat fee)
- Blob Storage: $20/month
- M-Pesa API Integration: Included with Safaricom registration
- Airtel Money API: Included with Airtel registration
- **Total: ~$60/month + M-Pesa transaction fees**

### Small Scale (1000 daily users in Kenya)
- PostgreSQL: $50/month
- Email: $50/month (100K emails)
- SMS (Twilio for OTP): $50/month
- Push Notifications: Free-$50/month
- AI Chatbot: $100/month (1M tokens)
- Maps: $100/month
- M-Pesa Processing: ~2-3% per transaction (covers ~60% of transactions)
- Airtel Money Processing: ~2-3% per transaction (covers ~20% of transactions)
- **Total: ~$400/month + payment transaction fees**

### Growth Scale (10,000 daily users in Kenya)
- PostgreSQL: $200/month
- Email: $200/month
- SMS: $200/month
- Push Notifications: $100/month
- AI Chatbot: $500/month
- Maps: $300/month
- Analytics: $200/month
- Error Monitoring: $50/month
- M-Pesa Volume Pricing: ~1.5-2% per transaction (volume discount)
- Airtel Money: ~1.5-2% per transaction
- **Total: ~$1,750/month + payment transaction fees**

---

## Kenya-Specific Implementation Notes

1. **M-Pesa Daraja API Setup**:
   - Register at https://developer.safaricom.co.ke/
   - Get Consumer Key and Consumer Secret
   - Create Till Number (Shortcode) or use Pay Bill Number
   - Test in sandbox environment first
   - Production requires Safaricom approval

2. **Airtel Money Setup**:
   - Register at Airtel Money merchant portal
   - Get API Key and Merchant ID
   - Configure webhook callback URLs
   - Test API endpoints in staging

3. **Compliance Requirements**:
   - Store payment data securely (PCI-DSS compliance)
   - Implement 3D Secure for card payments (if supported)
   - Follow CBK (Central Bank of Kenya) regulations for money transmission
   - Maintain transaction audit logs
   - KYC/AML compliance for payout amounts >5M KES

4. **Recommended Payment Flow**:
   - Customer selects M-Pesa first (highest adoption)
   - Fallback to Airtel Money if M-Pesa fails
   - Bank transfer option for large amounts
   - For payouts: M-Pesa B2C → Airtel Disbursements → Bank Transfer

---

## Configuration Examples

### .env Configuration Template (Kenya-Focused)
```env
# Database
DATABASE_URL=postgresql://user:password@host/dbname

# Auth
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_KEY=xxx

# M-Pesa Payment (Daraja API)
MPESA_CONSUMER_KEY=your_consumer_key
MPESA_CONSUMER_SECRET=your_consumer_secret
MPESA_SHORTCODE=your_shortcode
MPESA_PASSKEY=your_passkey
MPESA_INITIATOR_NAME=your_initiator_name
MPESA_INITIATOR_PASSWORD=your_initiator_password
MPESA_ENVIRONMENT=sandbox # or production

# Airtel Money Payment
AIRTEL_API_KEY=your_airtel_api_key
AIRTEL_MERCHANT_ID=your_merchant_id
AIRTEL_ENVIRONMENT=sandbox # or production

# Payment Callbacks
CALLBACK_URL=https://yourdomain.com/api # for M-Pesa and Airtel webhooks

# Email
RESEND_API_KEY=re_xxx

# Storage
BLOB_READ_WRITE_TOKEN=xxx

# AI
OPENAI_API_KEY=sk-xxx

# Notifications
ONESIGNAL_APP_ID=xxx
ONESIGNAL_APP_KEY=xxx
ONESIGNAL_USER_KEY=xxx

# Maps
GOOGLE_MAPS_API_KEY=AIzaSyxxx

# SMS (Twilio for Kenya)
TWILIO_ACCOUNT_SID=ACxxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_PHONE_NUMBER=+254xxx # Kenya number

# Analytics
NEXT_PUBLIC_GA_ID=G-xxx

# Monitoring
SENTRY_AUTH_TOKEN=xxx
```

---

## Notes
- Prioritize data security and privacy compliance (GDPR, local regulations)
- Use environment variables for all API keys (never commit)
- Implement rate limiting on all API calls
- Set up monitoring and alerts before going to production
- Plan for scale early - use managed services rather than self-hosting
- Consider regional data residency requirements

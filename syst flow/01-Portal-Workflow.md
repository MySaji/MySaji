# SAJI Platform - Complete System Workflow

## System Overview
SAJI is a multi-role service platform with 6 user types, each with unique portals and functionalities. The system uses a centralized authentication system with role-based access control (RBAC).

---

## User Roles & Portal Structure

### 1. **Customer Portal**
**Role**: `customer` | **Access**: Public booking and service discovery

#### Key Features:
- **Home**: Browse services, trending providers, categories
- **Find Specialists**: Search, filter, and book service providers
- **Services**: Browse all available services by category
- **Booking**: Reserve services with date/time selection
- **Booking Confirmation**: Payment and confirmation details
- **Jobs**: View active and past jobs/bookings
- **Messages**: Chat with providers about bookings
- **Notifications**: Real-time alerts for job updates
- **Favorites**: Save preferred providers and services
- **Wallet**: Payment method management and history
- **Saved Addresses**: Store delivery/service locations
- **Referrals**: Share platform and earn rewards
- **Community**: Connect with other users
- **Help**: FAQs and support articles
- **Profile**: User information and preferences
- **Settings**: Privacy, notifications, security
- **Chatbot**: AI support with escalation to human agents

#### User Flow:
```
Landing Page → Sign Up/Login → Browse Services → Add to Favorites → 
Book Service → Make Payment → Message Provider → Complete Job → Leave Review
```

---

### 2. **Provider Portal** (Service Professionals)
**Role**: `provider` | **Access**: Manage services and client relationships

#### Key Features:
- **Dashboard**: Performance metrics, active jobs, earnings overview
- **Jobs**: View available, accepted, and completed jobs
- **Clients**: Directory of all customers they've worked with
- **Services**: Create, edit, and manage service offerings
- **Shop**: Sell physical products alongside services
- **Availability**: Set working hours and calendar
- **Quotes**: Create and manage service quotes
- **Messages**: Communicate with clients
- **Analytics**: Performance data, earnings trends, client satisfaction
- **Content**: Manage portfolio, photos, and work samples
- **Invoices**: Generate and track invoices
- **Wallet**: Earnings, withdrawals, payment methods
- **Referrals**: Share profile link and earn commissions
- **Profile**: Account settings, skills, certifications, verification, payments
- **Live Stream**: Go live to showcase services
- **Chatbot**: Quick support access

#### User Flow:
```
Sign Up → Complete Profile → Add Services → Set Availability → 
Accept Jobs → Communicate → Complete Work → Get Paid → Build Reputation
```

---

### 3. **Shopkeeper Portal** (Product Sellers)
**Role**: `shopkeeper` | **Access**: Manage product inventory and sales

#### Key Features:
- **Dashboard**: Sales overview, revenue, order stats
- **Products**: Add, edit, delete product listings
- **Orders**: View, manage, and fulfill orders
- **Analytics**: Sales trends, popular products, customer demographics
- **Messages**: Customer inquiries and support
- **Earnings**: Revenue tracking and financial reports
- **Reviews**: Customer feedback and response management
- **Endorsements**: Brand partnerships and collaborations
- **Promotions**: Create coupons, discounts, and sales campaigns
- **Profile**: Shop information and branding
- **Settings**: Payment methods, policies, preferences
- **Chatbot**: Customer support access

#### User Flow:
```
Sign Up → Create Shop Profile → Add Products → Set Pricing → 
Manage Inventory → Process Orders → Handle Payments → Track Analytics
```

---

### 4. **Agent Portal** (Dispute Resolutions & Support)
**Role**: `agent` | **Access**: Manage disputes and customer support

#### Key Features:
- **Dashboard**: Active disputes, case queue, performance metrics
- **Disputes**: View, investigate, and resolve customer conflicts
- **Stats**: Personal performance, resolution rates, average handling time
- **Commissions**: Performance-based commission tracking
- **Withdrawals**: Request and manage payment withdrawals
- **Analytics**: Performance trends and metrics
- **Messages**: Communicate with customers and admins
- **Leaderboard**: Rank against other agents
- **Profile**: Agent information and credentials

#### User Flow:
```
Sign In → Review Assigned Cases → Investigate Issues → 
Communicate with Parties → Propose Resolution → Escalate if Needed → Close Case
```

---

### 5. **Sub-Admin Portal** (Platform Moderators)
**Role**: `sub-admin` | **Access**: Monitor and manage platform content

#### Key Features:
- **Dashboard**: System overview, user statistics, alerts
- **Users**: Manage user accounts, suspend, verify
- **Verifications**: Review and approve provider credentials
- **Reports**: User reports, complaints, content violations
- **Analytics**: Platform statistics and trends
- **Messages**: Internal communications
- **Settings**: Portal preferences

#### User Flow:
```
Sign In → Monitor Reports → Verify Users → Manage Content → 
Generate Reports → Escalate to Admin → Document Actions
```

---

### 6. **Secretary Portal** (Financial Management)
**Role**: `secretary` | **Access**: Manage platform finances and reconciliation

#### Key Features:
- **Dashboard**: Financial overview, balance, transactions
- **Payments**: Track all platform payments and settlements
- **Invoicing**: Generate invoices and payment receipts
- **Reconciliation**: Match bank statements with platform records
- **Analytics**: Financial trends, revenue reports
- **Messages**: Coordinate with finance team
- **Tax Reports**: Generate tax-ready financial statements
- **Settings**: Financial preferences

#### User Flow:
```
Sign In → Review Daily Transactions → Reconcile Accounts → 
Generate Reports → Process Payouts → File Documentation
```

---

### 7. **Admin Portal** (Full Platform Control)
**Role**: `admin` | **Access**: Complete platform management

#### Key Features:
- **Dashboard**: Real-time platform metrics and alerts
- **Users**: Full user management and moderation
- **Providers**: Monitor and manage all providers
- **Shopkeepers**: Oversight of product sellers
- **Disputes**: Monitor and escalate complex cases
- **Payments**: Payment settlement and processing
- **Analytics**: Comprehensive platform analytics
- **Verifications**: Approve/reject provider credentials
- **Messages**: Internal admin communications
- **Commissions**: Configure commission structures and rates
- **Moderation**: Content moderation and removal
- **Announcements**: Broadcast system-wide messages
- **Audit Log**: Track all system actions and changes
- **Subscribers**: Email list management and campaigns
- **Pricing**: Platform pricing and fee configuration
- **Team**: Manage admin team members
- **Settings**: Platform configuration

#### User Flow:
```
Sign In → Monitor Dashboards → Review Reports → Configure Settings → 
Manage Team → Send Announcements → Audit Logs → Manage Finances
```

---

## Cross-Portal Shared Features

### 1. **Authentication System**
- Email/password-based authentication
- Role-based automatic routing to correct portal
- Team login for multiple roles (agents, sub-admins, secretaries)
- Persistent sessions with auth context

### 2. **Global Components**
- **Email Subscription Popup**: Captures emails with duplicate prevention
- **Floating Chat Button**: AI chatbot with human escalation in all portals
- **Notification System**: Real-time alerts for relevant events
- **Search**: Global search across platform
- **Dark Mode Toggle**: Theme switching across all portals

### 3. **Communication**
- **In-App Messaging**: Direct chat between users
- **AI Chatbot**: Intelligent support with escalation to human agents
- **Email Notifications**: System alerts via email
- **Announcements**: Admin can broadcast to all users

### 4. **Payment Processing**
- **Wallet System**: Balance management for customers and providers
- **Payment Methods**: Save and manage payment instruments
- **Transaction History**: Track all financial activity
- **Invoice Generation**: Professional invoice documents
- **Payout Processing**: Automated payment settlements

### 5. **Analytics & Reporting**
- Each portal has role-specific analytics
- Charts show trends, performance, and key metrics
- Export capabilities for reports
- Audit trail for administrative actions

---

## Key Data Flows

### Flow 1: Customer Booking
```
Browse → Cart → Checkout → Payment → Confirmation → 
Job Assigned → Messaging → Completion → Review
```

### Flow 2: Provider Payment
```
Job Complete → Calculate Commission → Process Payment → 
Notification → Withdrawal Request → Settlement
```

### Flow 3: Platform Moderation
```
Report Submitted → Sub-Admin Review → Escalate → 
Admin Action → Audit Log → Resolution
```

### Flow 4: Email Campaign
```
Subscribe → Store → Admin Creates → Send → Track → Analytics
```

---

## Notes
- All portals are fully responsive (mobile & desktop)
- Dark mode support across all portals
- Universal AI chatbot with human escalation
- Comprehensive audit logging for compliance
- Real-time notifications system

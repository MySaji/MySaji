# SAJI

Multi-Service Marketplace & Escrow Platform

Joshua Project is a full-featured multi-service marketplace and escrow platform that connects customers with verified service providers while ensuring secure payments, transparent workflows, and dispute protection.

The platform is designed to handle real-world service transactions, from job posting and provider selection to escrow-protected payments, verification, and dispute resolution — all managed through a powerful admin dashboard.

🌟 Key Features
👤 User Roles

Customers – Post jobs, chat with providers, make escrow payments, and verify job completion.

Service Providers – Receive job requests, communicate with customers, complete jobs, and receive payments.

Administrators – Fully manage users, jobs, payments, disputes, verifications, site content, and branding.

🏗️ Core Modules
🏠 Public Website (Before Login)

Modern landing page with service search

Category browsing

Clear onboarding (Sign Up / Log In)

Trust indicators (secure escrow, verified providers)

👥 User Management

Customer & provider registration

Profile management

Provider verification workflow

Account status control (active, suspended, banned)

💼 Jobs Management

Customers post jobs with requirements

Providers apply or receive direct job offers

Job lifecycle states:

Pending

Active

Completed

Disputed

Real-time job status tracking

💬 Real-Time Chat System

Secure in-platform messaging

Separate chat interfaces for:

Customers

Service Providers

Job-linked conversations

Admin visibility for dispute investigations

💰 Payments & Escrow System

Secure escrow-based payment flow

Payment modes:

Deposit

Balance payments

Funds held until job completion is verified

Automatic release after approval

Refund and reversal handling

⚠️ Disputes Management

Customers or providers can raise disputes

Admin review and resolution panel

Evidence and chat history access

Controlled fund release or refund decisions

✅ Verification System

Provider identity verification

Job completion verification

Admin approval & rejection workflows

Fraud prevention controls

🛠️ Pricing & Services

Service category management

Admin-defined pricing models

Enable/disable services dynamically

Commission and platform fee configuration

⚙️ Admin Settings (Full Control)

Admins can control every aspect of the platform, including:

Branding (logo, colors, favicon)

Website content (contact info, about text, footer content)

Currency & localization

Notification rules

Payment rules

System preferences

Feature toggles

👤 Admin Profile & Security

Profile management

Password updates

Two-Factor Authentication (2FA)

Notification preferences

Appearance customization

Session & security controls

📊 Admin Dashboard

A powerful dashboard with:

User statistics

Active jobs overview

Pending verifications

Open disputes

Revenue & escrow summaries

Alerts and system activity logs

🖥️ Technology Stack
Frontend

Next.js 16 (App Router) / React 19 / TypeScript

Tailwind CSS v4

shadcn/ui + Radix UI primitives

Recharts (analytics/dashboards), Lucide icons

Backend

Currently a frontend-only prototype — all data (auth session, cart, wallet balance, KYC docs, etc.) is persisted to `localStorage`, and the only two API routes (`send-newsletter`, `subscribers`) are non-functional stubs.

Planned: PostgreSQL via Supabase (Auth + Storage included) with M-Pesa Daraja API for Kenyan mobile payments — see `02-API-Requirements.md` and `DATABASE_SCHEMA_ANALYSIS.md` for the full migration spec.

Security

Role-based access control (client-side today; server-side enforcement pending backend migration)

Escrow protection logic

Secure authentication

Data validation and sanitization

🎨 Design Philosophy

Clean, modern UI

Admin-friendly layouts

Mobile-responsive

User-focused workflows

Scalable architecture

📦 Project Status

Core features implemented across all 7 portals (frontend)

Admin panel fully designed

Chat, escrow, disputes, and verification workflows defined

Currently frontend-only (localStorage-backed); real database/backend integration not yet started

Actively evolving with future enhancements planned

🚧 Future Enhancements

Backend integration (Supabase + M-Pesa Daraja API) — the next major milestone

Mobile app version

Advanced analytics & reporting

AI-powered provider matching

Multi-currency support

Automated dispute resolution assistance

📜 License

This project is currently under private development.
License details will be added upon public release.

🤝 Contribution

Contributions, suggestions, and feedback are welcome.
Please open an issue or submit a pull request.

✨ Author
OliverYoung-dev(githubusername)
ver-otieno-potfolio.vercel.app
Developed with passion as a real-world service marketplace solution.
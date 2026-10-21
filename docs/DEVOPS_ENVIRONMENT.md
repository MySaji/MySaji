# Environment variable inventory

Static source references only; no secret values. Auth.js also accepts AUTH_URL/AUTH_SECRET/AUTH_TRUST_HOST. Prisma requires DATABASE_URL and DIRECT_URL. Sentry configuration additionally uses SENTRY_DSN/SENTRY_AUTH_TOKEN and NEXT_PUBLIC_SENTRY_DSN. Optional integrations must be deliberately configured and tested; absence may enable mock/fallback behavior. Some provider settings are database-backed. Both MPESA_ENV and MPESA_ENVIRONMENT occur and need consistent sandbox settings.

| Variable | Source references |
|---|---|
| AIRTEL_API_KEY | `backend/actions/payments.ts` |
| AIRTEL_API_SECRET | `backend/actions/payments.ts` |
| ANTHROPIC_API_KEY | `backend/services/ai/chatbot.ts`, `backend/services/ai/credentials.ts`, `backend/services/ai/offer-enhancement.ts`, `backend/services/ai/offer-extraction.ts` |
| AUTH_SECRET | `backend/actions/secretary-payments.ts` |
| CALLBACK_URL | `backend/actions/payments.ts`, `backend/actions/secretary-payments.ts`, `backend/services/email-templates.ts` |
| CRON_SECRET | `app/api/cron/email-digest/route.ts`, `app/api/cron/expire-provider-stories/route.ts`, `app/api/cron/subscriber-digest/route.ts` |
| DATABASE_URL | `backend/scripts/backfill-pos-businesses.js`, `backend/scripts/seed-demo-presence.js`, `backend/scripts/seed-james-bond-till.js`, `backend/scripts/seed-pos-demo.js` |
| DIRECT_URL | `backend/scripts/backfill-pos-businesses.js`, `backend/scripts/seed-demo-presence.js`, `backend/scripts/seed-james-bond-till.js`, `backend/scripts/seed-pos-demo.js` |
| ETIMS_BASE_URL | `backend/services/etims-client.ts` |
| ETIMS_INIT_PATH | `backend/services/etims-client.ts` |
| ETIMS_SALES_PATH | `backend/services/etims-client.ts` |
| ETIMS_SANDBOX_BASE_URL | `backend/services/etims-client.ts` |
| ETIMS_SANDBOX_VERIFY_URL | `backend/services/etims-client.ts` |
| ETIMS_TIMEOUT_MS | `backend/services/etims-client.ts` |
| ETIMS_VERIFY_URL | `backend/services/etims-client.ts` |
| GEMINI_API_KEY | `backend/services/ai/credentials.ts`, `backend/services/ai/gemini-client.ts` |
| GOOGLE_CLIENT_ID | `backend/auth.ts` |
| GOOGLE_CLIENT_SECRET | `backend/auth.ts` |
| INFOBIP_2FA_APPLICATION_ID | `backend/services/sms.ts` |
| INFOBIP_2FA_MESSAGE_ID | `backend/services/sms.ts` |
| INFOBIP_API_KEY | `backend/services/sms.ts` |
| INFOBIP_BASE_URL | `backend/services/sms.ts` |
| JAMES_BOND_PASSWORD | `backend/scripts/seed-james-bond-till.js` |
| MPESA_B2C_CERT | `backend/actions/payments.ts`, `backend/services/mpesa-config.ts` |
| MPESA_B2C_COMMAND_ID | `backend/actions/payments.ts` |
| MPESA_B2C_SHORTCODE | `backend/actions/payments.ts`, `backend/services/mpesa-config.ts` |
| MPESA_CONSUMER_KEY | `backend/actions/payments.ts`, `backend/actions/pos-mpesa.ts`, `backend/scripts/seed-james-bond-till.js`, `backend/services/mpesa-config.ts` |
| MPESA_CONSUMER_SECRET | `backend/actions/payments.ts`, `backend/actions/pos-mpesa.ts`, `backend/scripts/seed-james-bond-till.js`, `backend/services/mpesa-config.ts` |
| MPESA_ENV | `backend/actions/pos-mpesa.ts`, `backend/scripts/seed-james-bond-till.js` |
| MPESA_ENVIRONMENT | `backend/actions/payments.ts` |
| MPESA_INITIATOR_NAME | `backend/actions/payments.ts`, `backend/services/mpesa-config.ts` |
| MPESA_INITIATOR_PASSWORD | `backend/actions/payments.ts`, `backend/services/mpesa-config.ts` |
| MPESA_PASSKEY | `backend/actions/payments.ts`, `backend/actions/pos-mpesa.ts`, `backend/scripts/seed-james-bond-till.js` |
| MPESA_SHORTCODE | `backend/actions/payments.ts`, `backend/actions/pos-mpesa.ts`, `backend/scripts/seed-james-bond-till.js` |
| NEXTAUTH_URL | `backend/actions/pos-install.ts`, `backend/actions/pos-mpesa.ts` |
| NEXT_PUBLIC_GOOGLE_MAPS_API_KEY | `backend/services/google-maps.ts`, `frontend/components/geo/nearby-map.tsx`, `frontend/components/maps/address-autocomplete-input.tsx`, `frontend/components/maps/live-tracking-map.tsx`, `frontend/components/maps/static-location-map.tsx`, `frontend/components/maps/technician-roster-map.tsx`, `frontend/components/pages/customer-saved-addresses-page.tsx`, `frontend/components/pages/customer-services-page.tsx` |
| NEXT_PUBLIC_SITE_URL | `backend/actions/pos-install.ts` |
| NEXT_PUBLIC_VAPID_PUBLIC_KEY | `backend/actions/push.ts`, `backend/services/push.ts` |
| NODE_ENV | `backend/db.ts` |
| PAYMENT_METHOD_ENCRYPTION_KEY | `backend/scripts/seed-james-bond-till.js`, `backend/services/payment-method-crypto.ts` |
| PAYPAL_CLIENT_ID | `backend/actions/payments.ts` |
| PAYPAL_CLIENT_SECRET | `backend/actions/payments.ts` |
| PAYPAL_ENVIRONMENT | `backend/actions/payments.ts` |
| PLATFORM_BANK_ACCOUNT_NAME | `backend/actions/wallet.ts` |
| PLATFORM_BANK_ACCOUNT_NUMBER | `backend/actions/wallet.ts` |
| PLATFORM_BANK_NAME | `backend/actions/wallet.ts` |
| POS_DEMO_PASSWORD | `backend/scripts/seed-pos-demo.js` |
| SMTP_FROM | `backend/services/email.ts` |
| SMTP_HOST | `backend/services/email.ts` |
| SMTP_PASS | `backend/services/email.ts` |
| SMTP_PORT | `backend/services/email.ts` |
| SMTP_USER | `backend/services/email.ts` |
| STRIPE_SECRET_KEY | `backend/actions/payments.ts` |
| STRIPE_WEBHOOK_SECRET | `backend/actions/payments.ts` |
| VAPID_PRIVATE_KEY | `backend/services/push.ts` |
| VAPID_SUBJECT | `backend/services/push.ts` |
| X_API_KEY | `backend/services/ai/credentials.ts` |

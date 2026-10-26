# Customer payments, receipt layout and authentication

Updated 26 October 2026. These changes extend the existing payment system; they do not remove gateways, wallets for customers/Saji Pro, callbacks or platform-funded refunds.

## Admin switch

Open **Admin > Settings > Platform**, change **Enable customer payments inside MySaji**, then **Save**. It defaults to off where no setting exists. Enabling it preserves the existing in-app payment routes; the job payment mode can be Direct, In-app or Both. Disabling the master switch makes the effective job mode Direct without erasing the saved mode. Turning it back on from Direct selects Both in the form; owners can retain direct arrangements while app checkout is available again.

The setting is validated, persisted and audited on the server. Previously `jobPaymentMode` and `commissionDebtCap` were stripped by save validation; both now persist. New cart wallet charges and job/rental gateway requests check the switch on the server. Customer and Saji Pro personal wallets still exist. Business subscriptions, wallet funding and Till merchant payments remain separate from this marketplace checkout switch.

The administrator's personal wallet link is removed from workspace shortcuts/search. `/admin/wallet` redirects to payment management. Wallet summary/creation, funding and restricted wallet actions reject administrators. Existing financial records are retained.

## Direct payment flow

Customers can review a cart without loading or funding a wallet. When enabled by admin, they can explicitly select wallet payment instead. Each checkout creates the normal tracked orders/jobs. A direct order records a pending `DIRECT:` payment arrangement, without a gateway request, paid timestamp, customer debit, owner wallet credit, platform revenue payout or paid receipt. Seller notifications and order details identify direct payment. Checkout is serialized per customer and wallet debits use conditional balance checks.

Customers confirm the owner's M-Pesa phone/till/paybill, bank or cash arrangement in Messages. MySaji cannot verify an outside transfer merely because a customer says they paid. No external recipient details are invented.

With app payments off, rental dates are reserved without an app deposit. Rental charges and any owner's security deposit are displayed as amounts to arrange directly. The server locks/rechecks availability; dates use East Africa Time. With app payments enabled, the existing rental checkout remains available.

Disabling new payments does **not** cancel or erase genuine historical app payments. Those retain their callback/reconciliation and refund paths. Direct orders cannot create wallet refunds, and rental refunds are limited to actual completed platform collections. Status transitions prevent two simultaneous cancellation/return requests issuing duplicate refunds. Accepted direct-payment returns do not claim an app-verified refund. Admin dispute wallet refunds cannot exceed platform collections.

## Receipts

The thermal receipt prints the business name in a bold centered title, custom header and receipt label above line items. A centered QR code sits below the receipt. It encodes business name, receipt number and total only; no customer contact or loyalty account is encoded. It is labelled receipt details, not independent payment or tax verification. Existing signed tax invoice details, VAT and points are retained. The existing PDF payment receipt already has a centered title and receipt QR.

## Session policy

Sessions expire after **one hour without real activity**, with a two-minute warning, and have a server-enforced **12-hour absolute limit**. Choosing Continue working renews activity; polling and visibility changes do not. Activity is scoped to the account and shared across tabs. Waking a phone or pausing a background tab for 45 seconds no longer signs the user out. The old unused Remember me checkbox is replaced with an accurate policy notice.

The signed JWT holds server timestamps. Expired JWTs cannot be revived through a client update. Automatic logout suspends offline Till scope and attempts device-push cleanup before completing sign-out. It awaits cookie clearing before navigation; a failed request leaves the screen blocked and retries. Automatic expiry routes Till users to Till login and other roles to the main login. Storage restrictions do not prevent logout. A fresh login clears old local inactivity before Auth.js broadcasts the new session, preventing an immediate sign-out loop. Unsynced sales are preserved.

## WhatsApp OTP

Main Customer/Saji Pro signup and login offer **SMS** or **WhatsApp** for phone verification. SMS and email remain supported. Kenyan local/international input is normalized consistently. WhatsApp is an explicit user choice, not an unsolicited message to an account.

WhatsApp uses the existing Infobip account and an approved Authentication copy-code template. Set these server-only variables on the deployment:

```dotenv
INFOBIP_BASE_URL=https://YOUR_ACCOUNT.api.infobip.com
INFOBIP_API_KEY=YOUR_EXISTING_SECRET
INFOBIP_WHATSAPP_SENDER=YOUR_REGISTERED_SENDER
INFOBIP_WHATSAPP_OTP_TEMPLATE=YOUR_APPROVED_AUTHENTICATION_TEMPLATE
INFOBIP_WHATSAPP_OTP_LANGUAGE=en
```

The sender/template must match the registered language and approved format. The code is supplied both as the body placeholder and URL/copy-code button parameter, as required by [Infobip's authentication template documentation](https://www.infobip.com/docs/whatsapp/message-types-and-templates/message-templates). A provider queued response is not proof of handset delivery.

Six-digit WhatsApp challenges expire in ten minutes. Only a salted hash is stored, verification is rate-limited, and the exact verified token is consumed once before an authentication/signup proof is issued. Failed sends remove their own challenge. Missing configuration or provider rejection produces an honest error and lets the user choose SMS/email. The local Infobip base URL and API key are present, but the WhatsApp sender and authentication template are not configured. No WhatsApp sender was provisioned and no real user OTP was sent during tests.

## Verification

Focused tests cover the admin switch, disabled/enabled API and checkout paths, actual historical refunds, rental conflicts, JWT expiry, one-time OTP use and QR placement. Browser fixtures mount actual components with explicit action fixtures: cart at 320/390/1280px, direct and re-enabled wallet checkout, sleep/warning/continue/expiry, and a QR decoded from the rendered SVG. This does not replace a physical printer or live merchant/provider acceptance test. No deployment or merge is included.

Final checks: 173 tests passed, one optional local PostgreSQL integration test skipped; targeted ESLint passed; the final production webpack build and its TypeScript check passed. The compiled browser bundle includes the bounded sign-out safeguard. No deployment, merge, real payment, real OTP send or physical printing was performed.

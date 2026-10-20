# Wallets, communications and device alerts

Implemented 18 October 2026 for the non-Till portals.

## Wallets

- Customer, Saji Pro and distributor wallets share searchable activity with direction/status/date filters, references, loaded-record totals and filtered CSV export. Exported text is escaped for quotes and spreadsheet formulas.
- Failed and reversed transactions retain their actual status. They are not labelled as completed and are excluded from completed-activity totals.
- Account wallets are available to administrators, secretaries, agents, sub-admins and legacy shopkeepers. An active user's missing wallet is initialised with the database's zero-balance defaults. Existing balances and platform finance permissions are unchanged. A team member's personal wallet is distinguished from platform funds.
- Payment return paths stay within the caller's wallet workspace. Existing top-up verification, withdrawal authorisation, commission and escrow flows are retained. Failed requests release busy state and advise checking activity before retrying.
- Activity filters and exports cover the recent records returned by existing summary actions (currently twenty), not a claimed full financial statement.

## Messages and media

All message pages use the shared chat. Failed text sends keep drafts; in-memory drafts survive conversation changes. Attachments and voice notes have a preview and explicit send action. File size is limited to 5 MB, supported media is validated server-side, and voice recording is limited to two minutes with browser-supported MIME selection. Recordings can be discarded. Streams stop on cancellation, conversation change and unmount.

Files have real download links. Existing inline attachments are served through authenticated, private, non-cached routes with byte-range responses for audio seeking. Message polling returns attachment references instead of retransmitting base64 file bodies. Conversation unread counts are fetched in one grouped query rather than one query per conversation.

The inbox refreshes while visible, and conversations refresh on focus. Thread search, readable controls, draft retry feedback and a jump-to-latest control are shared across roles. Reading older messages does not force a jump to new arrivals. Notification settings are available within chat; the previous pretend mute action has been replaced by actual account/device controls. Clearing messages has an explicit confirmation explaining its effect on both participants.

## Audio and video calls

Audio/video calls use WebRTC with microphone, camera, local preview, remote video, mute, camera toggle, acceptance, decline and hangup. The call timer begins on media connection. ICE candidates wait until the corresponding offer/answer has been sent. Call identifiers separate successive sessions; expired and terminated offers are not presented as new incoming calls. Fresh termination signals remain available for the peer to receive.

Participants are checked server-side. Inactive/deleted accounts and blocked pairs cannot place calls. Incoming call banners are available elsewhere in the signed-in portals, and Web Push links back to the correct conversation. Answering requires opening the app; this is not native phone/CallKit integration.

## Notification center and device setup

Each notification page offers search, category filters, unread controls, device subscription status, enable/disable on this device, in-app sound controls, a sound test and a self-addressed device test alert. A saved account preference is distinguished from a working subscription on this particular device. Browser permission is requested only following an explicit user action.

Push payloads are bound to the recipient account. The push-only service worker stores the current account/session expiry, rejects expired or mismatched delivery, constrains click destinations to this origin, and does not cache pages or application chunks. Signing out clears the device binding, unsubscribes this browser and closes its existing app notifications. Notification/message caches are scoped to account IDs. Read/delete actions refresh all notification views for the current account.

System push remains best-effort: browser permission, network access, battery/background policies, operating-system sound settings and Focus/Do Not Disturb affect delivery and sound. On iPhone/iPad, Web Push requires a supported Home Screen web app context. Existing session-expiration policies still apply.

## Configuration

- Local VAPID public/private keys are present and were checked to match, without exposing or changing their values. Production needs its own matching `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and appropriate `VAPID_SUBJECT`. Do not casually rotate keys: existing device subscriptions depend on them.
- `TURN_URL` and `TURN_SHARED_SECRET` are absent locally. Current calls can use STUN and direct connections, but reliable operation across restrictive networks requires a compatible TURN relay. The existing credential endpoint expects shared-secret/HMAC TURN credentials; an arbitrary provider API key is not interchangeable with that secret.
- HTTPS is needed for production media permissions, service workers and device notifications. No relay service was provisioned and no hosting settings were changed.

## Verification

The full automated suite passed 73 tests, with one optional PostgreSQL integration test skipped. Lint and TypeScript checks passed. Unit checks cover media type/size limits, wallet filtering and CSV escaping, real financial status mapping, session-owned wallet initialisation, private attachment access and byte ranges, lightweight message metadata, push recipient/expiry/click safety, and protected call cleanup.

Browser fixtures cover wallet filters, notification search/device controls, draft failure/retry, attachment preview/send/download links, thread search and call controls across eight role types (including legacy shopkeeper accounts) at desktop and narrow mobile widths. A two-browser WebRTC test established actual audio and video peer connections using synthetic devices and intercepted signalling, checking received audio tracks, remote video frames, mute, camera controls and remote hangup. A recording test exercised actual browser MediaRecorder, supported MIME selection, preview, failed-send retry and the voice player with synthetic audio.

These are not live money-transfer tests or physical-device delivery tests. Real production push with the app closed, iOS/Android permissions and two-party calls across different networks still need device acceptance testing after deployment and TURN setup. No live financial record, message or push subscription was created by browser fixtures.

References: [MDN Notifications API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API/Using_the_Notifications_API), [Apple Web Push](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers), [MediaRecorder MIME support](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static).

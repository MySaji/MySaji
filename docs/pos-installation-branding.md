# Till launch, logout and business icons

The generic installed app retains its existing identity (`id: /pos/sell`) so a changed start URL does not create an accidental second generic app. Its start URL is now `/pos/open`: the server sends authenticated users to their workspace and signed-out users to Till login. Existing installations that still launch `/pos/sell` also redirect signed-out users to Till login.

The register previously waited for `usePosOffline().available` before loading anything. A signed-out user never acquires an offline scope, so this left the screen spinning indefinitely. Register startup now follows the authenticated session, works independently of offline-store availability, bounds its initial network wait, and provides a timed recovery screen with retry/sign-in links. Account and store checks still run on the server.

Successful logout clears the session and heartbeat, purges only `saji-till-shell-*` caches and performs a full navigation to the public Saji Till landing page (`/pos`). IndexedDB queued sales are preserved, and logout does not close a shift. The v4 worker retires older Till caches, precaches the public landing instead of a signed-in register, bounds navigation fetches, avoids caching redirect responses and never uses a cached register to answer a login navigation.

## Owner setup

1. Open **Settings → Till appearance**.
2. Under **Your business logo on the installed Till**, choose a PNG, JPEG or WebP image smaller than 2 MB.
3. Review the square preview and save. The original proportions are retained within a white 512px icon.
4. Open **Prepare branded installation**. The page is also linked from the existing installation screen.
5. Install using the browser's offered prompt/menu. Public shop links and printed `/till/<slug>` QR addresses now lead to the branded welcome page within `/pos/`.

Each shop's public manifest has a stable shop-specific identity, shop name, session-aware start URL and 192/512px PNG icons. Its logo remains retrievable while signed out so browsers can install or refresh the app. Only public branding is exposed: no account IDs, payment credentials, staff records or configuration payloads are returned. The `saji-till-shop` cookie remembers branding, not authentication or permissions. The welcome page's sign-in button explicitly requests login rather than returning repeatedly to the welcome page.

Only the real business owner can upload/remove an installation logo. The generic settings action rejects direct `installLogo` updates; the dedicated action checks ownership, validates PNG content/dimensions, decodes and re-encodes it, preserves the other settings and records an audit event. No remote image URL is fetched. No schema migration or external image API is needed.

Existing generic installations may need reinstalling from the branded page to adopt the shop-specific identity/icon. Sync pending sales first and retain site data if the browser offers to delete it. Browser/OS icon-update behaviour varies; an immediate change to an existing launcher icon cannot be forced. See [PWA updates](https://web.dev/learn/pwa/update).

## Validation

- Unit tests cover session-aware launch routing, invalid branding/redirect input, ownership, settings preservation, logo removal, PNG validation/decoding, manifest/PNG route responses, cache isolation and logout/offline worker behaviour.
- Four real browser tests pass: manifest/worker installation identity, anonymous launch redirect, old register URL recovery without offline storage, and printed-address routing.
- A read-only smoke check against an existing public shop passes through its welcome page, manifest/icons and sign-in button to Till login, without writing records.
- A browser component fixture verifies logo upload, a square 512px preview from a wide source image, save/remove, invalid-image rejection, employee restrictions and a 390px layout. This uses sample component data rather than an authenticated owner's production account.
- TypeScript and changed-file ESLint pass. No deployment or merge is performed. A real device install and authenticated upload remain release smoke checks for the owner.

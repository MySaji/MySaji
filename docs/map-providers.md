# Platform map providers

## Administrator workflow

Open **Admin > Settings > Maps**. Choose **Google Maps** or **OpenStreetMap / Leaflet**, optionally preview it, then **Save map provider**. Only platform administrators can read or change the admin form. Changes are audited under `map_provider.update`.

Google remains the default for an existing installation. No production selection is changed by installing this code. Settings are stored in the existing `PlatformSetting` JSON record with key `maps`, independently of general payment, fee and maintenance settings. No schema migration is required.

The selected provider applies to embedded nearby-business maps, saved-address previews, service/shop/provider address fields, provider-to-destination tracking, technician rosters and the administrator operations map. Existing latitude/longitude records are retained. External navigation links can still open Google Maps when a user chooses to leave MySaji for directions.

The settings screen refreshes its current tab immediately after saving. Other visible map screens revalidate on focus or within a minute. The Google SDK is requested only after configuration identifies Google as the active provider. An explicit Google preview can also request it. A Google script already loaded earlier in a browser session is not forcibly removed; the OSM renderer replaces the embedded map when the setting changes.

## Capabilities

| Feature | Google | OpenStreetMap / Leaflet |
| --- | --- | --- |
| Saved coordinates, map pins and previews | Yes | Yes |
| Nearby business pins and existing privacy scope | Yes | Yes |
| Tracking positions and connecting straight line | Yes | Yes |
| Admin filters, clusters, results, viewport and radius | Yes | Yes |
| Device location | Browser permission required | Browser permission required |
| Place search and reverse address lookup | Existing Google APIs/key required | Optional separately hosted geocoder required |
| Manual address, map pin and coordinate selection | Existing address flow | Available without a geocoder |
| Traffic, satellite and terrain controls | Google API availability applies | Disabled; not represented as available |

The tracking line is a straight connection between known positions, not road routing or a turn-by-turn navigation service. Provider base locations on public discovery and the admin operations map keep the existing approximate-location treatment. No new location collection or customer-home access is introduced.

## Configuration

The existing `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` remains in use. The admin cannot select Google without a configured browser key. A configured key is not proof that all Google APIs, billing and domain restrictions are valid; use the preview and Google Cloud checks. Changes to a Next.js public browser key require an appropriate rebuild.

Optional server environment settings are documented in `.env.example`:

- `OSM_TILE_URL`: defaults to `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. A replacement must be a browser-accessible HTTPS raster tile template. Its URL is public, including any embedded browser token; never put a private server credential here.
- `OSM_TILE_ATTRIBUTION`: extra plain-text attribution required by a tile host. The linked OpenStreetMap copyright attribution stays visible.
- `OSM_GEOCODER_URL`: optional HTTPS base URL of a self-hosted or contracted Nominatim-compatible server, exposing `/search` and `/reverse`. Do not include query parameters, fragments or embedded credentials.
- `OSM_GEOCODER_API_KEY`: optional bearer authorization sent from the server to that geocoder. It is never included in public map configuration.

The shared public Nominatim endpoint is deliberately not used. With no geocoder configured, users can type the address and choose a pin, device location or coordinates. Place search is explicit, never search-as-you-type. GPS successes remain usable as coordinates when address lookup fails. Late lookups cannot overwrite edits in the saved-address form.

The geocoding proxy requires a signed-in user, validates query/coordinate inputs, checks that OSM is selected, and applies a database-backed limit of 30 requests per user per minute. Requests go only to the server-configured upstream; the browser cannot provide an upstream URL. It has an eight-second upstream timeout, rejects redirects and does not cache personal addresses in shared responses. Check the contracted host's quotas and privacy terms before enabling it.

## Tile service requirements

Leaflet is open-source software, and OSM map data is open. Public tile hosting is capacity-limited and has no service-level guarantee. The implementation keeps linked attribution, uses HTTPS, requests tiles for displayed maps and preserves normal browser caching. It does not implement bulk, prefetch or offline tile downloads. The existing site referrer policy sends the origin on cross-origin tile requests.

As platform usage grows, configure suitable tile hosting or operate your own infrastructure. Review the [OSMF tile usage policy](https://operations.osmfoundation.org/policies/tiles/), the [public Nominatim policy](https://operations.osmfoundation.org/policies/nominatim/) and [Leaflet documentation](https://leafletjs.com/reference-1.9.4.html). Third-party hosts may require additional attribution or fees.

## Verification

Six server tests verify defaults, administrator-only writes, independent persistence, audit entries, missing-key rejection, retryable database errors, optional geocoding, public endpoint exclusion, authentication, input validation, rate limits and server-only credential handling. Eight new responsive browser cases at 390px and 1280px mount actual map components and Leaflet with explicit tile/action/SDK fixtures. They verify the provider gate, attribution, previews, switching, coordinates, admin results and Google-only controls. Six saved-address browser regressions also pass.

The full repository suite passed 193 tests with one optional PostgreSQL integration test skipped. Browser fixtures do not claim a live Google billing/API authorization check, a contracted geocoder check or a production settings change. No deployment, live administrator selection or database migration is part of this implementation.

The admin map also has a focused switch regression at both viewport sizes: selecting Google satellite/traffic and then switching to OSM restores the displayed road-map state and disables/unchecks unsupported traffic. All eight new browser cases were rerun after the zoom-control adjustment, and the two admin cases passed again after the final control-state change. Targeted ESLint completed without errors; three existing hook warnings remain in the nearby section and customer services page.

The final Next.js production build passed, including TypeScript validation and generation of 274 static pages. Existing metadataBase warnings remain outside this map-provider change.

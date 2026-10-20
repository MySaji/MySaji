# Admin operations map

The dashboard places a large operations map immediately after the revenue/dispute chart row. It uses the existing Google Maps JavaScript integration and the MySaji blue/orange styling.

## Business data and meaning

- POS and marketplace locations come from `ShopkeeperProfile`. POS branches also use their linked `PosStore` business/branch name, town, county and active flag. One branch produces one record, even when it also sells on the marketplace.
- Independent provider business bases come from `ProviderProfile`, with coordinates rounded to two decimal places on the server and public work areas used for the description. Employee profiles attached to another business are excluded. Remote providers appear in the list without a physical pin.
- Distributor warehouses and branches come from `DistributorLocation`.
- Missing or invalid coordinates remain unmapped. A zero latitude/longitude is a valid location; missing values are never replaced with a guessed city-centre pin.
- Active/inactive describes account/branch status. It is not an online-device, open-shop, successful-payment or subscription-health indicator. The displayed timestamp is a profile update time, not a GPS observation time.

No new GPS collection or location-history storage is added. Customer addresses, user-device/IP positions, employee movements and job travel coordinates are not queried. This is a business operations directory, not a law-enforcement surveillance system.

## Controls

Search business/owner/area/record ID; toggle four layers; filter active, verified or missing-location records; select a record to see its source and details; use a straight-line radius around a selected mapped record; fit results; return to Kenya; switch road/satellite/hybrid/terrain; toggle traffic, density circles or current-viewport filtering; expand with keyboard focus containment and Escape to close.

Screen-sized Mercator clusters combine nearby loaded records. Clicking a cluster limits the results list to its members, allowing coincident pins to be selected individually. Density circles show loaded record concentration rather than population, risk or crime predictions. The current Google heatmap API is not used.

The list has 30 records per page. The backend uses independent cursor pagination (250 records per source per request). “Load more locations” appends the next source pages and preserves exact loaded/registered counts. All geographic filters apply to the loaded records. The backend never silently claims that a partial load is the complete network.

## Permissions and configuration

Every data request requires the existing active ADMIN guard. Queries exclude deleted owners and use narrow field selections; no payment credentials, email addresses or identity documents are returned. Cache keys include the account ID. Data refreshes every 60 seconds while enabled and visible, with manual refresh, a pause control and stale/error feedback.

Maps uses the existing `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, shared SDK loader ID and Places library configuration. Production needs Maps JavaScript API enabled, appropriate billing and HTTP-referrer restrictions permitting the intended MySaji domain. No environment variables, keys or billing configuration were changed. If the SDK cannot load, the searchable results list stays available and the map explains the issue.

Business owners must have saved coordinates for a map pin to exist. This change does not geocode free-text addresses automatically or add a new Till-location editor. The missing-location filter makes these records explicit for follow-up.

## Checks

Unit tests cover invalid/missing/equator coordinates, provider coarsening, clustering counts, radius and dateline bounds, ADMIN access, safe payload fields, exclusion of deleted owners/employee profiles and independent pagination. Browser fixtures cover search, radius, status/missing-location filters, layer toggles, pagination, expanded view and Escape, responsive widths and navigation to filtered POS management.

The sandbox blocks Google network requests. A network-enabled check loaded the real SDK and exercised HTML clusters, fit, satellite selection and traffic controls. It also identified `BillingNotEnabledMapError` from the configured Google project: full basemap rendering remains blocked until its owner enables Google Maps billing. The component handles Google's authentication-failure callback and keeps the searchable records available with an actionable message. No billing settings were changed. Test fixtures do not write live business or payment records.

References: [Google Maps release notes](https://developers.google.com/maps/documentation/javascript/releases), [Google Maps deprecations](https://developers.google.com/maps/deprecations), [Google Maps error messages](https://developers.google.com/maps/documentation/javascript/error-messages), [authentication failure events](https://developers.google.com/maps/documentation/javascript/events#auth-errors). These informed the use of HTML overlays and circles rather than the removed heatmap API, and the configuration-failure handling.

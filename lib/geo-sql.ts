import { Prisma } from "@prisma/client"

/**
 * PostGIS fragments for geofence queries.
 *
 * These exist so distance work happens where the data is. Previously a
 * radius search fetched every row inside a bounding box and measured each
 * one in JavaScript; that is correct but it ships rows across the wire only
 * to discard them, and it cannot use an index for ordering. With PostGIS the
 * database takes the incoming coordinates as query parameters, filters with
 * `ST_DWithin` against a GiST index, computes the distance, and returns the
 * rows already sorted and already limited.
 *
 * Every call is schema-qualified to `extensions` because that is where
 * Supabase installs PostGIS, and the connection's search_path is not
 * guaranteed to include it.
 *
 * The point expression here MUST stay identical to pointExpression() in
 * scripts/enable-postgis.js. The GiST indexes are built over that exact
 * expression, and the planner only uses an expression index when the query
 * spells the expression the same way.
 */

/**
 * How long a go-online position stays trustworthy. Past this the provider
 * has almost certainly moved and their declared base is the better guess.
 *
 * This bound is the whole feature. Without it a one-shot fix from two
 * months ago silently outranks a current profile address — measured on
 * real rows here, that pushed providers whose base is 3.4 km away out to
 * 10.6 km and dropped them from a 5 km search entirely. A stale snapshot
 * is worse than no snapshot, because it looks authoritative.
 */
const POSITION_FRESH_HOURS = 12

/**
 * A provider's best-known position: where they were when they last went
 * online *recently*, falling back to the base they declared in settings.
 *
 * The snapshot is a one-shot fix taken at "Go Online" (not continuous
 * tracking — that exists only for an active job), so within its freshness
 * window it answers "where did this person start work today" rather than
 * "where are they right now". Outside that window it answers nothing
 * useful and is ignored.
 *
 * Caveat worth knowing before this scales: because the COALESCE spans two
 * tables, no single-table expression index covers it, so a fence using this
 * scans providers rather than using the GiST index. That is the right trade
 * at this size and the wrong one at tens of thousands of providers — at
 * which point the snapshot wants denormalising onto provider_profiles so
 * the existing index applies again.
 */
/** True only while the go-online snapshot is recent enough to believe. A
 *  snapshot with no timestamp is treated as stale, not as fresh. */
export const PROVIDER_POSITION_IS_FRESH = Prisma.sql`
  (a."lastKnownLatitude" IS NOT NULL
   AND a."lastKnownLongitude" IS NOT NULL
   AND a."lastLocationUpdatedAt" IS NOT NULL
   AND a."lastLocationUpdatedAt" > NOW() - INTERVAL '${Prisma.raw(String(POSITION_FRESH_HOURS))} hours')
`

export const PROVIDER_LATITUDE = Prisma.sql`
  (CASE WHEN ${PROVIDER_POSITION_IS_FRESH} THEN a."lastKnownLatitude" ELSE p."latitude" END)
`
export const PROVIDER_LONGITUDE = Prisma.sql`
  (CASE WHEN ${PROVIDER_POSITION_IS_FRESH} THEN a."lastKnownLongitude" ELSE p."longitude" END)
`

export const PROVIDER_GEO_POINT = Prisma.sql`
  (extensions.ST_SetSRID(extensions.ST_MakePoint(
     ${PROVIDER_LONGITUDE}::double precision,
     ${PROVIDER_LATITUDE}::double precision
   ), 4326)::extensions.geography)
`

/** True when a provider has any usable position at all. */
export const PROVIDER_HAS_POSITION = Prisma.sql`
  ${PROVIDER_LATITUDE} IS NOT NULL AND ${PROVIDER_LONGITUDE} IS NOT NULL
`

/** A row's position, built from its own latitude/longitude columns. */
export const GEO_POINT = Prisma.sql`
  (extensions.ST_SetSRID(extensions.ST_MakePoint("longitude"::double precision, "latitude"::double precision), 4326)::extensions.geography)
`

/** The caller's position, as query parameters rather than interpolated text
 *  — these come from a browser and must never be spliced into SQL. */
export function geoOrigin(latitude: number, longitude: number) {
  return Prisma.sql`
    (extensions.ST_SetSRID(extensions.ST_MakePoint(${longitude}::double precision, ${latitude}::double precision), 4326)::extensions.geography)
  `
}

/**
 * True for rows within `radiusKm` of the origin.
 *
 * `ST_DWithin` on a geography is an index-assisted true-distance test, so
 * this replaces both halves of the old approach at once: the bounding-box
 * prefilter and the exact haversine refine that had to follow it. There are
 * no box corners to discard, because there is no box.
 */
export function withinRadiusSql(latitude: number, longitude: number, radiusKm: number) {
  return Prisma.sql`
    "latitude" IS NOT NULL AND "longitude" IS NOT NULL
    AND extensions.ST_DWithin(${GEO_POINT}, ${geoOrigin(latitude, longitude)}, ${radiusKm * 1000}::double precision)
  `
}

/** Distance in kilometres, computed by the database. Aliased as
 *  "distanceKm" so the row maps straight onto the API types. */
export function distanceKmSql(latitude: number, longitude: number) {
  return Prisma.sql`
    (extensions.ST_Distance(${GEO_POINT}, ${geoOrigin(latitude, longitude)}) / 1000.0)
  `
}


// ---------------------------------------------------------------------------
// Capability detection
//
// PostGIS is database state, not code: it ships with this repo only as
// scripts/enable-postgis.js, so a deploy can reach an instance where the
// extension was never enabled. Rather than let every radius search 500 there,
// each spatial query is attempted optimistically and falls back to the
// bounding-box-plus-haversine path on the one error that means "PostGIS is
// not here". Same convention as the rest of this codebase's optional
// integrations: fully live when configured, honestly degraded when not.
// ---------------------------------------------------------------------------

/** Null until something has actually tried a spatial query. Cached per
 *  process, so the fallback costs one failed query per cold start at most,
 *  and nothing at all once PostGIS is present.
 *
 *  Deliberately never re-probed: a process that decided PostGIS is missing
 *  stays on the fallback for its whole life. On serverless that self-heals
 *  within minutes as instances recycle, and the alternative — a TTL and a
 *  periodic retry — is machinery for a condition that is fixed once, by
 *  hand, and then never recurs. A long-running server picks the fast path
 *  back up on restart. */
let postgisAvailable: boolean | null = null

/** True once a spatial query has failed in the specific way that means the
 *  extension is missing. Callers skip straight to the fallback. */
export function postgisUnavailable(): boolean {
  return postgisAvailable === false
}

/**
 * Postgres reports a missing function as SQLSTATE 42883 and a missing schema
 * as 3F000; Prisma surfaces both as P2010 with the driver message attached.
 * Matching the text as well keeps this working if the wrapping changes —
 * and anything that is not one of these is a real failure that must not be
 * silently swallowed behind a fallback.
 */
export function isMissingPostgisError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase()
  const looksLikeMissing =
    message.includes("42883") ||
    message.includes("3f000") ||
    message.includes("does not exist") ||
    message.includes("schema \"extensions\"")
  return looksLikeMissing && (message.includes("st_") || message.includes("extensions"))
}

/** Records that PostGIS is missing, if that is what the error says. Returns
 *  whether the caller should fall back (true) or rethrow (false). */
export function noteSpatialFailure(error: unknown): boolean {
  if (!isMissingPostgisError(error)) return false
  if (postgisAvailable !== false) {
    console.warn(
      "[geo] PostGIS is not enabled on this database - falling back to " +
        "bounding-box distance filtering. Run: node scripts/enable-postgis.js",
    )
  }
  postgisAvailable = false
  return true
}

/** Records a successful spatial query. */
export function noteSpatialSuccess(): void {
  postgisAvailable = true
}


/**
 * A provider counts as online only while their device is still checking
 * in. The flag alone goes stale: somebody who closed the tab, lost signal
 * or logged out would otherwise stay green forever, and then the green
 * dot stops carrying information. Mirrors isLiveOnline() in
 * lib/provider-presence.ts — change the window in one place and both
 * follow, because this takes the cutoff as a parameter.
 */
export function providerIsLiveOnline(staleCutoff: Date) {
  return Prisma.sql`
    (COALESCE(a."isOnline", false) = true
     AND a."lastSeenAt" IS NOT NULL
     AND a."lastSeenAt" > ${staleCutoff})
  `
}

/**
 * Whether the customer is inside the distance this provider is willing to
 * travel.
 *
 * Nearby has to mean mutually nearby. A plumber who set a 5 km radius has
 * said they will not cross town, so surfacing them to someone 12 km away
 * produces a booking they decline — worse for both sides than not showing
 * them. `travelRadiusKm` already existed and was already editable by
 * providers; it simply was not consulted by discovery until now.
 *
 * A provider with no availability row has not expressed a limit, so the
 * default applies rather than excluding them.
 */
export function withinProviderServiceRadius(latitude: number, longitude: number, fallbackKm: number) {
  return Prisma.sql`
    extensions.ST_DWithin(
      ${PROVIDER_GEO_POINT},
      ${geoOrigin(latitude, longitude)},
      (COALESCE(a."travelRadiusKm", ${fallbackKm}) * 1000)::double precision
    )
  `
}

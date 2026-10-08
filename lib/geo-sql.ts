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

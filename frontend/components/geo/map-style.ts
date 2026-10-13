/**
 * How the base map is drawn, so the pins are the thing you see.
 *
 * A default Google map is a busy picture: every café, bus stop, park label
 * and petrol station competes with the markers that are the actual answer.
 * Turning that noise down is most of what makes a map look considered rather
 * than embedded, and it is the difference between a customer finding the
 * nearest duka in a second and hunting for it among a hundred other labels.
 *
 * What stays: roads, because a person reads a map by the road they know;
 * place names at suburb level, for orientation; and water and parks as
 * shapes, because they are landmarks.
 *
 * What goes: every commercial point of interest, transit clutter, and the
 * saturated green and yellow that fight with the marker colours.
 */

type MapStyle = google.maps.MapTypeStyle[]

export const MAP_STYLE_LIGHT: MapStyle = [
  // Other people's businesses are not this map's subject.
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "poi.attraction", stylers: [{ visibility: "off" }] },
  { featureType: "poi.place_of_worship", stylers: [{ visibility: "off" }] },
  { featureType: "poi.government", stylers: [{ visibility: "off" }] },
  { featureType: "poi.medical", stylers: [{ visibility: "off" }] },
  { featureType: "poi.school", stylers: [{ visibility: "off" }] },
  { featureType: "poi.sports_complex", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },

  // Landmarks kept, but quiet.
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#e8f1e8" }] },
  { featureType: "poi.park", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#d8e6f0" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#f6f6f4" }] },

  // Roads legible, in grey rather than the default yellow and white, so an
  // amber shop pin is never mistaken for a main road.
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#e4e4e2" }] },
  { featureType: "road.highway", elementType: "geometry.fill", stylers: [{ color: "#f0efed" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#dcdbd8" }] },
  { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "road.local", elementType: "labels", stylers: [{ visibility: "simplified" }] },

  // Place names, dark enough to read and light enough not to shout.
  { elementType: "labels.text.fill", stylers: [{ color: "#6b6b6b" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }, { weight: 2 }] },
  { featureType: "administrative.land_parcel", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.neighborhood", elementType: "labels.text.fill", stylers: [{ color: "#8a8a8a" }] },
]

/**
 * The same map at night.
 *
 * Not an inversion: a dark map with bright roads is harder to read than a
 * light one. The land goes dark, the roads come up only enough to trace, and
 * the marker colours are left untouched so a pin means the same thing in
 * either theme.
 */
export const MAP_STYLE_DARK: MapStyle = [
  { elementType: "geometry", stylers: [{ color: "#1f2430" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9aa3b2" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1f2430" }, { weight: 2 }] },

  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "poi.attraction", stylers: [{ visibility: "off" }] },
  { featureType: "poi.place_of_worship", stylers: [{ visibility: "off" }] },
  { featureType: "poi.government", stylers: [{ visibility: "off" }] },
  { featureType: "poi.medical", stylers: [{ visibility: "off" }] },
  { featureType: "poi.school", stylers: [{ visibility: "off" }] },
  { featureType: "poi.sports_complex", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },

  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#243027" }] },
  { featureType: "poi.park", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#17202e" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#1f2430" }] },

  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#2b3242" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#232936" }] },
  { featureType: "road.highway", elementType: "geometry.fill", stylers: [{ color: "#39414f" }] },
  { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "road.local", elementType: "labels", stylers: [{ visibility: "simplified" }] },

  { featureType: "administrative.land_parcel", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.neighborhood", elementType: "labels.text.fill", stylers: [{ color: "#7b8494" }] },
]

/**
 * A map pin, as a path rather than an image.
 *
 * Drawn rather than loaded so it is sharp at any zoom and on any screen,
 * needs no network round trip, and can be recoloured per result without
 * shipping a sprite for each combination. The shape is the teardrop everyone
 * already reads as "a place", anchored at its point.
 */
export const PIN_PATH =
  "M 0,0 C -2,-8 -9,-10 -9,-17 a 9,9 0 1,1 18,0 C 9,-10 2,-8 0,0 z"

/** Where the pin's point sits relative to its coordinate. */
export const PIN_ANCHOR = { x: 0, y: 0 }
/** Where a label sits inside the head of the pin. */
export const PIN_LABEL_ORIGIN = { x: 0, y: -17 }

/**
 * What photos to take for a given kind of offer.
 *
 * This is the honest form of "recommend images": it tells the provider which
 * shots earn a customer's trust, rather than supplying pictures. Generated or
 * stock imagery on a listing reads to a customer as the provider's own work,
 * and on a marketplace with escrow and disputes that is a misrepresentation
 * risk, not a convenience.
 *
 * Keyed by category slug, falling back to the parent's slug and then to a
 * generic list per CategoryType — the same fallback shape
 * lib/offer-attribute-schema.ts uses for attribute fields. Kept in code rather
 * than the database because it is guidance text, not per-category
 * configuration an admin needs to tune; if that changes it can graduate to a
 * column the way CategoryAttribute did.
 */

export const GENERIC_SERVICE_SHOTS = [
  "A completed job you are proud of",
  "Before and after, side by side",
  "You or your team actually working",
  "Your tools or equipment",
]

export const GENERIC_PRODUCT_SHOTS = [
  "The product on a plain background",
  "A close-up of the detail or finish",
  "Something next to it for scale",
  "The packaging it arrives in",
]

const BY_SLUG: Record<string, string[]> = {
  // ---- trades: the work is physical, so show it -------------------
  plumbers: ["A finished installation", "Before and after of a repair", "Your tools laid out", "Your van or work vehicle"],
  electricians: ["A tidy finished consumer unit or board", "Before and after of a rewire", "Your testing equipment", "Certification or licence document"],
  carpenters: ["A finished piece in place", "Joinery detail close up", "Your workshop", "A build in progress"],
  cleaners: ["A room before and after", "Detail on a hard-to-clean surface", "Your products and equipment", "Your team in uniform"],
  painting: ["A finished wall or room", "Cut-in and edge detail", "Surface prep in progress", "Colour samples you work with"],
  "ac-repair": ["A completed installation", "A serviced unit, cleaned", "Your gauges and tools", "Your certification"],
  movers: ["Your vehicle", "Items packed and secured", "Your team at work", "Protective materials you use"],
  roofing: ["A completed roof", "Before and after of a repair", "Safety equipment in use", "Detail of flashing or guttering"],
  "welding-metal-work": ["A finished fabrication", "Weld detail close up", "Your workshop", "A piece mid-fabrication"],
  "solar-installation": ["A completed array", "The inverter and wiring, tidy", "Installation in progress", "Your certification"],

  // ---- creative: the portfolio IS the product ---------------------
  photography: ["Your strongest single image", "A set from one shoot", "Your setup or lighting rig", "A before/after of your editing"],
  videography: ["A frame from your best work", "Your camera setup", "Behind the scenes on a shoot", "A before/after grade"],
  "graphic-design": ["A finished piece in context (mockup)", "The brief and the outcome side by side", "A range showing your style", "Detail at full resolution"],
  "ui-ux-design": ["A finished screen", "The flow across several screens", "Before and after of a redesign", "Your design system or components"],
  "video-editing": ["A frame from your best edit", "A before/after of a colour grade", "Your timeline or workspace", "A range of styles you work in"],
  "freelance-designers": ["A finished piece in context", "A range showing your style", "Before and after of a redesign", "Detail at full resolution"],

  // ---- technology: screenshots, not stock photos ------------------
  "web-app-development": ["A screenshot of something you built", "The same product on mobile", "A code snippet you are proud of", "An architecture or flow diagram"],
  "web-development": ["A live site you built", "The same site on mobile", "A performance or Lighthouse score", "Your stack, visually"],
  "mobile-app-development": ["App screens on a device frame", "The app listing in a store", "A short flow across screens", "Your stack, visually"],
  "software-engineering": ["A dashboard or interface you built", "A code snippet you are proud of", "An architecture diagram", "A test suite passing"],
  "ai-machine-learning": ["A result or output your model produces", "An evaluation chart", "A notebook or pipeline diagram", "A before/after of accuracy"],
  "data-analytics": ["A dashboard you built", "A chart that changed a decision", "Your data pipeline, drawn", "A cleaned-up dataset before and after"],

  // ---- teaching: the environment reassures a parent ---------------
  "tutoring-lessons": ["Your teaching space", "Materials or worksheets you use", "A student's progress, anonymised", "Your qualification certificate"],
  "education-training": ["Your training room", "Materials you provide", "A session in progress", "Your certification"],
  "career-coaching": ["Your session space or video setup", "A framework or worksheet you use", "Your credentials", "An anonymised outcome"],

  // ---- regulated: the credential is the proof --------------------
  "legal-services": ["Your practising certificate", "Your office or consultation room", "You, professionally photographed", "Your firm's signage"],
  "health-medical": ["Your practising licence", "Your consultation room", "You in professional dress", "Your clinic exterior"],
  "general-practice": ["Your practising licence", "Your consultation room", "Your clinic exterior", "You in professional dress"],
  architecture: ["A completed building", "Drawings or renders", "A model or plan", "Your registration certificate"],
  "civil-structural-engineering": ["A completed project", "Drawings or calculations", "Site supervision in progress", "Your EBK registration"],

  // ---- consulting & office work ----------------------------------
  "accounting-bookkeeping": ["Your workspace", "A report or statement you produce, anonymised", "Your CPA certificate", "You, professionally photographed"],
  "business-consulting": ["A workshop or session you ran", "A framework or deliverable, anonymised", "Your credentials", "You, professionally photographed"],
  "marketing-communications": ["A campaign you ran", "Before and after of the numbers", "Creative you produced", "A content calendar"],
  "social-media-management": ["A feed you manage", "Growth before and after", "Content you created", "A reporting dashboard"],
  "writing-translation": ["A published piece with your byline", "A before/after of an edit", "Your certification", "The range of formats you write"],

  // ---- rentals: condition is what the customer is buying ---------
  "equipment-rental": ["The item, clean and complete", "It running or in use", "Any accessories included", "The serial plate or condition detail"],
  "vehicle-rental": ["The exterior, all angles", "The interior", "The odometer", "Any damage, honestly shown"],
  "event-venue-rental": ["The empty space", "The space set up for an event", "The entrance and parking", "Facilities: kitchen, washrooms, power"],
}

export type ImageGuidance = { shots: string[]; source: "category" | "parent" | "generic" }

/**
 * Resolves guidance for a category, walking to the parent before falling back
 * to the generic list — so "Mobile App Development" inherits the technology
 * shots if it has no entry of its own.
 */
export function getImageGuidance(
  categorySlug: string | null | undefined,
  parentSlug: string | null | undefined,
  categoryType: "SERVICE" | "PRODUCT",
): ImageGuidance {
  const own = categorySlug ? BY_SLUG[categorySlug] : undefined
  if (own) return { shots: own, source: "category" }

  const inherited = parentSlug ? BY_SLUG[parentSlug] : undefined
  if (inherited) return { shots: inherited, source: "parent" }

  return {
    shots: categoryType === "PRODUCT" ? GENERIC_PRODUCT_SHOTS : GENERIC_SERVICE_SHOTS,
    source: "generic",
  }
}

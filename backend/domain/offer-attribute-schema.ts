// Generic Step-3 attribute fields, used only as a fallback when a category
// has zero admin-defined CategoryAttribute rows (see schema.prisma's doc
// comment on that model, and getOfferAttributeFields in
// lib/actions/offers.ts). The real, authoritative per-category field
// definitions now live in the database and are managed from Admin >
// Categories — this file no longer hardcodes them, so a new category is
// never permanently stuck with only these generic fields; an admin can add
// tailored ones at any time without a code change.

export type OfferAttributeFieldType = "text" | "textarea" | "number" | "tags" | "select"

export type OfferAttributeFieldDef = {
  key: string
  label: string
  type: OfferAttributeFieldType
  placeholder?: string
  /** For "select": the fixed choice list. For "tags": suggested chips (free text is still allowed). */
  options?: string[]
}

export const GENERIC_SERVICE_ATTRIBUTE_FIELDS: OfferAttributeFieldDef[] = [
  { key: "serviceType", label: "What do you offer?", type: "tags", placeholder: "Select or type your own" },
]

export const GENERIC_PRODUCT_ATTRIBUTE_FIELDS: OfferAttributeFieldDef[] = [
  { key: "brands", label: "Brands (optional)", type: "tags", placeholder: "e.g. Dangote, Bamburi, ARM" },
  { key: "condition", label: "Condition", type: "select", options: ["New", "Used", "Refurbished"] },
]

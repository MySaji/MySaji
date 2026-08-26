#!/usr/bin/env node
/**
 * Seeds the professional categories and field sets that SAJI's taxonomy is
 * missing, so the platform covers white-collar and creative professions rather
 * than only field services.
 *
 * Why a script and not the admin UI: this is ~30 categories and ~60 attribute
 * rows. Doing it by hand through Admin > Categories is the same writes, just
 * slower and harder to review. Everything here goes through the same tables the
 * admin screens write to, and anything it creates can be edited or deactivated
 * there afterwards.
 *
 * Safety properties:
 *   - Idempotent. Keyed on category slug and on (categoryId, key) for
 *     attributes, so re-running updates rather than duplicating.
 *   - Additive only. It never deletes a category, never deactivates one, and
 *     never touches a CategoryAttribute row it did not create — the 17 existing
 *     trade attributes are left exactly as they are.
 *   - Existing categories are only touched to set `requiresLicense` on
 *     regulated ones, and only when RELICENSE is enabled below.
 *
 *   node scripts/seed-professional-categories.js --dry-run    # report only
 *   node scripts/seed-professional-categories.js              # apply
 */

require("dotenv").config()

const { PrismaClient } = require("@prisma/client")

const db = new PrismaClient()
const DRY_RUN = process.argv.includes("--dry-run")

/* ------------------------------------------------------------------ *
 * Field sets
 *
 * Only five field types exist (CategoryAttributeFieldType): TEXT, TEXTAREA,
 * NUMBER, TAGS, SELECT. Following the conventions already in the table:
 * camelCase keys, yes/no questions as SELECT ["Yes","No"], sortOrder from 1.
 *
 * Deliberately NOT included, because the Offer model already carries them as
 * real columns and duplicating them into the attribute bag would mean two
 * sources of truth for the same answer:
 *   - security deposit    -> Offer.depositAmount
 *   - pickup / delivery   -> Offer.fulfilmentMethods
 *   - minimum order       -> Offer.minimumOrder
 *   - availability        -> Offer.availabilityStatus
 * ------------------------------------------------------------------ */

const EDUCATION = [
  { key: "subject", label: "Subjects you teach", type: "TAGS", options: ["Mathematics", "English", "Kiswahili", "Sciences", "Business", "Computer Studies"] },
  { key: "gradeLevel", label: "Grade level", type: "SELECT", options: ["Primary", "Secondary", "Undergraduate", "Postgraduate", "Professional"] },
  { key: "curriculum", label: "Curriculum", type: "SELECT", options: ["CBC", "8-4-4", "IGCSE", "IB", "American", "Other"] },
  { key: "teachingMode", label: "Teaching method", type: "TAGS", options: ["One-on-one", "Group", "Online", "In-person"] },
  { key: "sessionMinutes", label: "Typical session length (minutes)", type: "NUMBER" },
  { key: "qualification", label: "Your qualification", type: "TEXT", placeholder: "e.g. BEd Mathematics, TSC registered" },
]

const TECHNOLOGY = [
  { key: "languages", label: "Programming languages", type: "TAGS", options: ["JavaScript", "TypeScript", "Python", "Java", "Go", "PHP", "C#", "Kotlin", "Swift", "Dart", "SQL"] },
  { key: "frameworks", label: "Frameworks & tools", type: "TAGS", options: ["React", "Next.js", "Vue", "Angular", "Node.js", "Django", "Laravel", "Spring", "Flutter", "React Native", ".NET"] },
  { key: "projectTypes", label: "Project types", type: "TAGS", options: ["Web app", "Mobile app", "API / backend", "E-commerce", "Data / AI", "DevOps", "Bug fix", "Code review"] },
  { key: "yearsExperience", label: "Years of experience", type: "NUMBER" },
  { key: "portfolioUrl", label: "Portfolio link", type: "TEXT", placeholder: "https://" },
  { key: "githubUrl", label: "GitHub", type: "TEXT", placeholder: "https://github.com/yourname" },
]

const CREATIVE = [
  { key: "deliverables", label: "Deliverables", type: "TAGS", options: ["Logo", "Brand identity", "Print", "Web / UI", "Illustration", "Motion graphics", "Social media assets"] },
  { key: "fileFormats", label: "Files the client receives", type: "TAGS", options: ["Source files", "Print-ready PDF", "PNG / JPG", "SVG", "Figma"] },
  { key: "revisionsIncluded", label: "Revisions included", type: "NUMBER" },
  { key: "turnaroundDays", label: "Typical turnaround (days)", type: "NUMBER" },
  { key: "portfolioUrl", label: "Portfolio link", type: "TEXT", placeholder: "https://" },
]

const LEGAL = [
  { key: "practiceArea", label: "Practice area", type: "SELECT", options: ["Corporate & Commercial", "Family", "Criminal", "Property & Conveyancing", "Employment", "Immigration", "Intellectual Property", "Tax"] },
  { key: "licenceNumber", label: "Practising certificate number", type: "TEXT", placeholder: "As issued by the LSK" },
  { key: "jurisdiction", label: "Jurisdiction", type: "TEXT", placeholder: "Kenya" },
  { key: "consultationType", label: "Consultation type", type: "TAGS", options: ["In person", "Video call", "Phone", "Written opinion"] },
]

const HEALTHCARE = [
  { key: "specialisation", label: "Specialisation", type: "TEXT", placeholder: "e.g. General practice, Paediatrics" },
  { key: "licenceNumber", label: "Practising licence number", type: "TEXT" },
  { key: "regulator", label: "Regulating body", type: "TEXT", placeholder: "e.g. KMPDC, Nursing Council of Kenya" },
  { key: "consultationType", label: "Consultation type", type: "TAGS", options: ["In person", "Video call", "Phone", "Home visit"] },
  { key: "sessionMinutes", label: "Typical appointment length (minutes)", type: "NUMBER" },
]

const CONSULTING = [
  { key: "expertise", label: "Areas of expertise", type: "TAGS", options: ["Strategy", "Operations", "Finance", "HR & People", "Risk & Compliance", "Market research"] },
  { key: "engagementType", label: "Engagement type", type: "TAGS", options: ["One-off session", "Retainer", "Project", "Audit / report"] },
  { key: "sessionMinutes", label: "Typical session length (minutes)", type: "NUMBER" },
  { key: "credentials", label: "Relevant credentials", type: "TEXT", placeholder: "e.g. CPA(K), CFA, MBA" },
]

const WRITING = [
  { key: "workTypes", label: "What you write", type: "TAGS", options: ["Web copy", "Blog & articles", "Technical documentation", "Grant & proposal", "Academic", "Scripts", "CV & cover letters"] },
  { key: "languagePairs", label: "Languages", type: "TAGS", options: ["English", "Kiswahili", "French", "Arabic", "Somali", "German", "Chinese"] },
  { key: "turnaroundDays", label: "Typical turnaround (days)", type: "NUMBER" },
  { key: "wordRate", label: "Priced by", type: "SELECT", options: ["Per word", "Per page", "Per project", "Per hour"] },
]

const MARKETING = [
  { key: "channels", label: "Channels", type: "TAGS", options: ["Instagram", "Facebook", "TikTok", "X / Twitter", "LinkedIn", "Google Ads", "Email", "SEO"] },
  { key: "servicesOffered", label: "What you offer", type: "TAGS", options: ["Strategy", "Content creation", "Paid ads", "Community management", "Analytics & reporting", "Influencer outreach"] },
  { key: "reportingFrequency", label: "Reporting frequency", type: "SELECT", options: ["Weekly", "Fortnightly", "Monthly", "On request"] },
  { key: "minimumEngagementMonths", label: "Minimum engagement (months)", type: "NUMBER" },
]

const COACHING = [
  { key: "focusArea", label: "Focus area", type: "TAGS", options: ["Career", "Leadership", "Business growth", "Life & wellbeing", "Public speaking", "Exam preparation"] },
  { key: "sessionFormat", label: "Session format", type: "TAGS", options: ["One-on-one", "Group", "Online", "In-person"] },
  { key: "sessionMinutes", label: "Session length (minutes)", type: "NUMBER" },
  { key: "programLength", label: "Programme length", type: "SELECT", options: ["Single session", "4 weeks", "8 weeks", "12 weeks", "Ongoing"] },
]

const ENGINEERING = [
  { key: "discipline", label: "Discipline", type: "SELECT", options: ["Architecture", "Civil & Structural", "Mechanical", "Electrical", "Quantity Surveying", "Land Surveying"] },
  { key: "registrationNumber", label: "Professional registration number", type: "TEXT", placeholder: "e.g. BORAQS / EBK registration" },
  { key: "projectTypes", label: "Project types", type: "TAGS", options: ["Residential", "Commercial", "Industrial", "Infrastructure", "Renovation"] },
  { key: "deliverables", label: "Deliverables", type: "TAGS", options: ["Drawings", "Structural design", "BoQ", "Site supervision", "Approvals & permits"] },
]

const RENTAL = [
  // deposit / pickup-delivery / availability deliberately omitted — real Offer columns
  { key: "rentalPeriod", label: "Rented by", type: "SELECT", options: ["Hour", "Day", "Week", "Month"] },
  { key: "minimumPeriod", label: "Minimum rental period", type: "NUMBER" },
  { key: "condition", label: "Condition", type: "SELECT", options: ["New", "Excellent", "Good", "Fair"] },
  { key: "operatorIncluded", label: "Operator included?", type: "SELECT", options: ["Yes", "No", "Optional"] },
]

/* ------------------------------------------------------------------ *
 * Categories
 *
 * `parent` refers to another entry's slug, or to an existing category's slug
 * already in the database (e.g. "web-app-development").
 * ------------------------------------------------------------------ */

const CATEGORIES = [
  // ---- Healthcare: entirely absent today ----------------------------
  { slug: "health-medical", name: "Health & Medical", type: "SERVICE", icon: "Stethoscope", tier: "Professional", attrs: HEALTHCARE },
  { slug: "general-practice", name: "General Practice", type: "SERVICE", parent: "health-medical", requiresLicense: true, licenseName: "Practising Licence" },
  { slug: "dentistry", name: "Dentistry", type: "SERVICE", parent: "health-medical", requiresLicense: true, licenseName: "Practising Licence" },
  { slug: "physiotherapy", name: "Physiotherapy", type: "SERVICE", parent: "health-medical", requiresLicense: true, licenseName: "Practising Licence" },
  { slug: "mental-health-counselling", name: "Mental Health & Counselling", type: "SERVICE", parent: "health-medical", requiresLicense: true, licenseName: "Practising Licence" },
  { slug: "nutrition-dietetics", name: "Nutrition & Dietetics", type: "SERVICE", parent: "health-medical" },

  // ---- Architecture & Engineering: absent ---------------------------
  { slug: "architecture-engineering", name: "Architecture & Engineering", type: "SERVICE", icon: "Ruler", tier: "Professional", attrs: ENGINEERING },
  { slug: "architecture", name: "Architecture", type: "SERVICE", parent: "architecture-engineering", requiresLicense: true, licenseName: "BORAQS Registration" },
  { slug: "civil-structural-engineering", name: "Civil & Structural Engineering", type: "SERVICE", parent: "architecture-engineering", requiresLicense: true, licenseName: "EBK Registration" },
  { slug: "quantity-surveying", name: "Quantity Surveying", type: "SERVICE", parent: "architecture-engineering" },

  // ---- Writing & Translation: absent -------------------------------
  { slug: "writing-translation", name: "Writing & Translation", type: "SERVICE", icon: "PenLine", tier: "Professional", attrs: WRITING },
  { slug: "copywriting-content", name: "Copywriting & Content", type: "SERVICE", parent: "writing-translation" },
  { slug: "translation-interpretation", name: "Translation & Interpretation", type: "SERVICE", parent: "writing-translation" },
  { slug: "technical-writing", name: "Technical Writing", type: "SERVICE", parent: "writing-translation" },

  // ---- Marketing: absent -------------------------------------------
  { slug: "marketing-communications", name: "Marketing & Communications", type: "SERVICE", icon: "Megaphone", tier: "Professional", attrs: MARKETING },
  { slug: "digital-marketing", name: "Digital Marketing", type: "SERVICE", parent: "marketing-communications" },
  { slug: "social-media-management", name: "Social Media Management", type: "SERVICE", parent: "marketing-communications" },
  { slug: "seo-content-marketing", name: "SEO & Content Marketing", type: "SERVICE", parent: "marketing-communications" },

  // ---- Consulting & research: absent -------------------------------
  { slug: "business-consulting", name: "Business Consulting", type: "SERVICE", icon: "Briefcase", tier: "Professional", attrs: CONSULTING },
  { slug: "management-consulting", name: "Management Consulting", type: "SERVICE", parent: "business-consulting" },
  { slug: "financial-advisory", name: "Financial Advisory", type: "SERVICE", parent: "business-consulting" },
  { slug: "research-analysis", name: "Research & Analysis", type: "SERVICE", parent: "business-consulting" },

  // ---- Coaching: only Fitness Training exists today ----------------
  { slug: "coaching-mentoring", name: "Coaching & Mentoring", type: "SERVICE", icon: "Target", tier: "Professional", attrs: COACHING },
  { slug: "career-coaching", name: "Career & Life Coaching", type: "SERVICE", parent: "coaching-mentoring" },
  { slug: "business-coaching", name: "Business Coaching", type: "SERVICE", parent: "coaching-mentoring" },

  // ---- Split the overloaded technology bucket ----------------------
  // Parent already exists as "Web & App Development" (root, no children).
  { slug: "web-development", name: "Web Development", type: "SERVICE", parent: "web-app-development" },
  { slug: "mobile-app-development", name: "Mobile App Development", type: "SERVICE", parent: "web-app-development" },
  { slug: "software-engineering", name: "Software Engineering", type: "SERVICE", parent: "web-app-development" },
  { slug: "ai-machine-learning", name: "AI & Machine Learning", type: "SERVICE", parent: "web-app-development" },
  { slug: "data-analytics", name: "Data & Analytics", type: "SERVICE", parent: "web-app-development" },

  // ---- Split the overloaded design bucket --------------------------
  { slug: "ui-ux-design", name: "UI/UX Design", type: "SERVICE", parent: "freelance-designers" },
  { slug: "graphic-design", name: "Graphic Design", type: "SERVICE", parent: "freelance-designers" },
  { slug: "video-editing", name: "Video Editing", type: "SERVICE", parent: "freelance-designers" },

  // ---- Rentals: RENT offers have no rental-shaped category ---------
  // Filed under PRODUCT because CategoryType is SERVICE | PRODUCT only and
  // these are physical things. See the note in the summary output.
  { slug: "equipment-rental", name: "Equipment Rental", type: "PRODUCT", icon: "Wrench", attrs: RENTAL },
  { slug: "vehicle-rental", name: "Vehicle Rental", type: "PRODUCT", icon: "Car", attrs: RENTAL },
  { slug: "event-venue-rental", name: "Venues & Event Spaces", type: "PRODUCT", icon: "Building", attrs: RENTAL },
]

/* Field sets applied to categories that already exist and have none. */
const ATTRS_FOR_EXISTING = [
  { slug: "tutoring-lessons", attrs: EDUCATION },
  { slug: "web-app-development", attrs: TECHNOLOGY },
  { slug: "legal-services", attrs: LEGAL },
  { slug: "accounting-bookkeeping", attrs: CONSULTING },
  { slug: "freelance-designers", attrs: CREATIVE },
  { slug: "photography", attrs: CREATIVE },
  { slug: "videography", attrs: CREATIVE },
]

/**
 * Existing categories to put behind a licence check. Kept separate and
 * off by default because switching this on changes who can publish.
 * Already-LIVE offers are not pulled down (publishOffer only runs the check
 * on publish), but new publishes in these categories will require an
 * APPROVED, unexpired Certification whose name matches.
 */
/**
 * Parent links in the live data that are not taxonomy — Carpenters is filed
 * under AC Repair and AC Repair under Carpenters (a two-node cycle), and
 * Cleaners under Electricians. Nothing walked ancestors before, so these were
 * harmless; getOfferAttributeFields now does, and while it is cycle-guarded,
 * a Carpenter inheriting AC Repair's fields would still be wrong. Clearing
 * these makes all three roots, like the other service categories.
 */
const REPARENT_TO_ROOT = ["carpenters", "ac-repair", "cleaners"]

const RELICENSE = [
  { slug: "legal-services", licenseName: "Practising Certificate" },
]
const APPLY_RELICENSE = process.argv.includes("--with-licensing")

/* ------------------------------------------------------------------ */

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
}

const stats = { catCreated: 0, catExisting: 0, attrCreated: 0, attrSkipped: 0, licensed: 0, reparented: 0 }
const notes = []

async function upsertCategory(entry, idBySlug) {
  const existing = await db.category.findUnique({ where: { slug: entry.slug }, select: { id: true, name: true } })

  if (existing) {
    idBySlug.set(entry.slug, existing.id)
    stats.catExisting += 1
    console.log(`  exists   ${entry.slug.padEnd(30)} ${existing.name}`)
    return existing.id
  }

  const parentId = entry.parent ? idBySlug.get(entry.parent) ?? null : null
  if (entry.parent && !parentId) {
    notes.push(`! ${entry.slug}: parent "${entry.parent}" not found — created as a root instead`)
  }

  if (DRY_RUN) {
    idBySlug.set(entry.slug, `dry-${entry.slug}`)
    stats.catCreated += 1
    console.log(`  CREATE   ${entry.slug.padEnd(30)} ${entry.name}${parentId ? `  (under ${entry.parent})` : ""}${entry.requiresLicense ? "  [licensed]" : ""}`)
    return `dry-${entry.slug}`
  }

  const row = await db.category.create({
    data: {
      name: entry.name,
      slug: entry.slug,
      type: entry.type,
      icon: entry.icon ?? null,
      tier: entry.tier ?? null,
      parentId,
      isActive: true,
      isEmergencyEligible: false,
      requiresLicense: entry.type === "SERVICE" ? Boolean(entry.requiresLicense) : false,
      licenseName: entry.type === "SERVICE" && entry.requiresLicense ? entry.licenseName ?? null : null,
    },
  })

  idBySlug.set(entry.slug, row.id)
  stats.catCreated += 1
  console.log(`  created  ${entry.slug.padEnd(30)} ${entry.name}`)
  return row.id
}

/**
 * Adds attribute rows. Never modifies or reorders a row that already exists —
 * the 17 trade attributes already in the table are left exactly as they are,
 * and new fields are appended after the highest existing sortOrder so they
 * cannot collide with them.
 */
async function addAttributes(categoryId, fields) {
  if (!fields || fields.length === 0) return

  // A category this run is only pretending to create can't have attributes yet.
  const isPendingCategory = String(categoryId).startsWith("dry-")

  let nextSort = 1
  if (!isPendingCategory) {
    const last = await db.categoryAttribute.findFirst({
      where: { categoryId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    })
    nextSort = (last?.sortOrder ?? 0) + 1
  }

  for (const field of fields) {
    if (!isPendingCategory) {
      const existing = await db.categoryAttribute.findUnique({
        where: { categoryId_key: { categoryId, key: field.key } },
        select: { id: true },
      })
      if (existing) {
        stats.attrSkipped += 1
        continue
      }
    }

    if (!DRY_RUN) {
      await db.categoryAttribute.create({
        data: {
          categoryId,
          key: field.key,
          label: field.label,
          type: field.type,
          options: field.options ?? [],
          placeholder: field.placeholder ?? null,
          sortOrder: nextSort,
        },
      })
    }

    nextSort += 1
    stats.attrCreated += 1
  }
}

async function main() {
  console.log(DRY_RUN ? "DRY RUN — nothing will be written\n" : "Seeding professional categories\n")

  const idBySlug = new Map()

  // Pre-load the slugs of existing categories the seed refers to as parents.
  const referenced = [...new Set(CATEGORIES.map((c) => c.parent).filter(Boolean))]
  const existingParents = await db.category.findMany({
    where: { slug: { in: referenced } },
    select: { id: true, slug: true },
  })
  existingParents.forEach((c) => idBySlug.set(c.slug, c.id))

  console.log("Parent links")
  for (const slug of REPARENT_TO_ROOT) {
    const cat = await db.category.findUnique({ where: { slug }, select: { id: true, name: true, parentId: true } })
    if (!cat) { console.log(`  missing  ${slug}`); continue }
    if (!cat.parentId) { console.log(`  ok       ${slug.padEnd(30)} already a root`); continue }
    if (!DRY_RUN) await db.category.update({ where: { id: cat.id }, data: { parentId: null } })
    stats.reparented += 1
    console.log(`  ${DRY_RUN ? "WOULD CLEAR" : "cleared   "} ${slug.padEnd(26)} ${cat.name} is now a root`)
  }

  console.log("")
  console.log("Categories")
  // Roots first so children can resolve their parent id.
  const roots = CATEGORIES.filter((c) => !c.parent)
  const children = CATEGORIES.filter((c) => c.parent)

  for (const entry of [...roots, ...children]) {
    const id = await upsertCategory(entry, idBySlug)
    await addAttributes(id, entry.attrs)
  }

  console.log("\nField sets for existing categories")
  for (const entry of ATTRS_FOR_EXISTING) {
    const cat = await db.category.findUnique({ where: { slug: entry.slug }, select: { id: true, name: true } })
    if (!cat) {
      notes.push(`! ${entry.slug}: not found — skipped`)
      console.log(`  missing  ${entry.slug}`)
      continue
    }
    const before = stats.attrCreated
    await addAttributes(cat.id, entry.attrs)
    console.log(`  ${String(stats.attrCreated - before).padStart(2)} new  ${entry.slug.padEnd(30)} ${cat.name}`)
  }

  if (APPLY_RELICENSE) {
    console.log("\nLicence gating on existing categories")
    for (const entry of RELICENSE) {
      const cat = await db.category.findUnique({ where: { slug: entry.slug }, select: { id: true, name: true, requiresLicense: true } })
      if (!cat) continue
      if (cat.requiresLicense) {
        console.log(`  already  ${entry.slug}`)
        continue
      }
      if (!DRY_RUN) {
        await db.category.update({
          where: { id: cat.id },
          data: { requiresLicense: true, licenseName: entry.licenseName },
        })
      }
      stats.licensed += 1
      console.log(`  ${DRY_RUN ? "WOULD SET" : "set     "} ${entry.slug.padEnd(28)} requires "${entry.licenseName}"`)
    }
  } else {
    console.log("\nLicence gating on existing categories: SKIPPED")
    console.log("  Pass --with-licensing to also require a certificate for Legal Services.")
    console.log("  New healthcare and engineering categories above are created licensed either way.")
  }

  console.log("\nSummary")
  console.log(`  categories created   ${stats.catCreated}`)
  console.log(`  categories already   ${stats.catExisting}`)
  console.log(`  attributes created   ${stats.attrCreated}`)
  console.log(`  attributes untouched ${stats.attrSkipped}   (existing rows are never modified)`)
  console.log(`  licence flags set    ${stats.licensed}`)
  console.log(`  parent links cleared ${stats.reparented}`)

  if (notes.length > 0) {
    console.log("\nNotes")
    notes.forEach((n) => console.log(`  ${n}`))
  }

  console.log("\nCategoryType is SERVICE | PRODUCT only, so the three rental categories are")
  console.log("filed under PRODUCT. If rentals deserve their own browse tab, that needs a")
  console.log("third enum value and a migration — worth deciding before customers see these.")

  if (DRY_RUN) console.log("\nDry run — re-run without --dry-run to write.")
}

main()
  .catch((error) => {
    console.error("\nseed-professional-categories failed:", error.message)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect().catch(() => {}))

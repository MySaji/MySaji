/**
 * What people actually call themselves, mapped to category slugs.
 *
 * Matching on category names alone fails in exactly the cases that matter:
 * a programmer types "programmer" and the category is "Software Engineering";
 * a lawyer types "lawyer" and it is "Legal Services"; a doctor types "doctor"
 * and it is "General Practice". Each of those returned nothing before this
 * existed, which is the worst possible first experience for a provider trying
 * to list their profession.
 *
 * Kept in code rather than a column for the same reason as
 * lib/offer-image-guidance.ts: this is search-quality tuning, not per-category
 * configuration an admin needs to change. If it ever needs to be editable, it
 * graduates to a column the way CategoryAttribute did.
 *
 * Includes Kenyan usage — "fundi", "mama fua", "shamba boy", "duka" — because
 * that is what a provider here would actually type.
 */
export const CATEGORY_SEARCH_TERMS: Record<string, string[]> = {
  // ---- technology -------------------------------------------------------
  "web-app-development": ["programmer", "coder", "developer", "software", "it", "tech", "engineer", "app"],
  "software-engineering": ["programmer", "coder", "software engineer", "backend", "full stack", "fullstack", "devops", "api"],
  "web-development": ["website", "web designer", "frontend", "wordpress", "react", "shopify", "landing page"],
  "mobile-app-development": ["android", "ios", "flutter", "app developer", "mobile"],
  "ai-machine-learning": ["ai", "ml", "machine learning", "data scientist", "chatbot", "automation"],
  "data-analytics": ["data analyst", "analytics", "dashboard", "power bi", "excel", "reporting", "sql"],
  "computer-phone-repair": ["laptop repair", "phone repair", "screen replacement", "technician"],

  // ---- creative ---------------------------------------------------------
  "freelance-designers": ["designer", "creative", "branding"],
  "graphic-design": ["graphic designer", "logo", "poster", "flyer", "branding", "canva", "illustrator"],
  "ui-ux-design": ["ui", "ux", "product designer", "figma", "app design", "web design"],
  "video-editing": ["video editor", "editing", "premiere", "capcut", "reels", "tiktok editor"],
  videography: ["videographer", "filming", "cinematographer", "video shoot", "wedding video"],
  photography: ["photographer", "photo", "shoot", "wedding photographer", "studio"],

  // ---- education & coaching --------------------------------------------
  "tutoring-lessons": ["teacher", "tutor", "lecturer", "lessons", "mwalimu", "homework", "exam prep", "cbc", "maths", "revision"],
  "driving-instruction": ["driving instructor", "driving school", "learn to drive"],
  "fitness-training": ["trainer", "personal trainer", "gym", "fitness coach", "yoga", "aerobics"],
  "coaching-mentoring": ["coach", "mentor", "mentoring"],
  "career-coaching": ["career coach", "life coach", "cv", "interview", "job search"],
  "business-coaching": ["business coach", "startup mentor", "sme"],

  // ---- professional services -------------------------------------------
  "legal-services": ["lawyer", "advocate", "attorney", "legal", "conveyancing", "wakili", "contract", "court"],
  "accounting-bookkeeping": ["accountant", "bookkeeper", "cpa", "audit", "tax", "payroll", "quickbooks"],
  "business-consulting": ["consultant", "consulting", "advisor", "strategy", "business plan"],
  "management-consulting": ["consultant", "operations", "process", "management"],
  "financial-advisory": ["financial advisor", "investment", "wealth", "sacco", "loans"],
  "research-analysis": ["researcher", "research", "data collection", "survey", "thesis", "analyst"],

  // ---- health -----------------------------------------------------------
  "health-medical": ["doctor", "medic", "clinic", "nurse", "health", "daktari", "hospital"],
  "general-practice": ["doctor", "gp", "physician", "daktari", "consultation", "clinic"],
  dentistry: ["dentist", "dental", "teeth", "orthodontist"],
  physiotherapy: ["physio", "physiotherapist", "rehab", "sports injury"],
  "mental-health-counselling": ["counsellor", "counselor", "therapist", "psychologist", "therapy", "mental health"],
  "nutrition-dietetics": ["nutritionist", "dietitian", "diet", "meal plan"],

  // ---- built environment ------------------------------------------------
  "architecture-engineering": ["architect", "engineer", "drawings", "plans"],
  architecture: ["architect", "building plans", "drawings", "boraqs"],
  "civil-structural-engineering": ["engineer", "structural", "civil", "ebk", "structural drawings"],
  "quantity-surveying": ["quantity surveyor", "qs", "boq", "costing", "bill of quantities"],
  "construction-renovation": ["contractor", "builder", "renovation", "fundi", "mjengo", "construction"],

  // ---- words & marketing ------------------------------------------------
  "writing-translation": ["writer", "translator", "copywriter", "content"],
  "copywriting-content": ["copywriter", "content writer", "blog", "articles", "seo writing"],
  "translation-interpretation": ["translator", "interpreter", "translation", "swahili translation", "french"],
  "technical-writing": ["technical writer", "documentation", "manuals", "proposals", "grant writing"],
  "marketing-communications": ["marketer", "marketing", "advertising", "pr", "brand"],
  "digital-marketing": ["digital marketer", "ads", "google ads", "facebook ads", "ppc", "campaigns"],
  "social-media-management": ["social media manager", "instagram", "tiktok", "facebook", "community manager", "content creator"],
  "seo-content-marketing": ["seo", "search engine", "content marketing", "blogging", "ranking"],

  // ---- trades (what people actually say) --------------------------------
  plumbers: ["plumber", "fundi wa maji", "pipes", "leak", "drainage", "borehole", "tank"],
  electricians: ["electrician", "fundi wa stima", "wiring", "power", "sockets", "rewiring"],
  carpenters: ["carpenter", "fundi wa mbao", "furniture", "wardrobe", "cabinets", "joinery"],
  handymen: ["handyman", "fundi", "repairs", "odd jobs", "maintenance"],
  painting: ["painter", "fundi wa rangi", "paint", "decorating"],
  "welding-metal-work": ["welder", "fundi wa chuma", "gate", "grill", "metal", "fabrication"],
  roofing: ["roofer", "mabati", "roof", "gutters"],
  "ac-repair": ["air conditioning", "ac", "hvac", "fridge repair", "cooling"],
  "solar-installation": ["solar", "panels", "inverter", "off grid", "power backup"],
  "cctv-alarm-installation": ["cctv", "cameras", "alarm", "security system", "access control"],
  cleaners: ["cleaner", "cleaning", "mama fua", "housekeeping", "deep clean", "fumigation"],
  "laundry-dry-cleaning": ["laundry", "dry cleaning", "mama fua", "washing", "ironing"],
  "landscaping-gardening": ["gardener", "landscaper", "shamba boy", "lawn", "garden", "trees"],
  "pest-control": ["pest", "fumigation", "bedbugs", "cockroach", "rats", "termites"],
  "auto-mechanics": ["mechanic", "fundi wa gari", "car repair", "garage", "service"],
  "car-wash-detailing": ["car wash", "detailing", "valet", "polish"],
  movers: ["mover", "moving", "relocation", "transport", "pickup", "lorry"],
  "tailoring-alterations": ["tailor", "fundi wa nguo", "dressmaker", "alterations", "sewing"],
  "beauty-hair-services": ["salon", "barber", "hairdresser", "kinyozi", "braids", "nails", "makeup", "beautician"],
  "massage-spa": ["masseuse", "massage", "spa", "therapist", "reflexology"],
  "security-services": ["guard", "askari", "security", "watchman", "bouncer"],
  "childcare-nanny-services": ["nanny", "house help", "babysitter", "au pair", "caregiver"],
  catering: ["caterer", "chef", "cook", "mpishi", "food", "events food"],
  "event-planning": ["event planner", "wedding planner", "mc", "decor", "events"],
  "dj-mc-services": ["dj", "mc", "sound", "entertainment", "public address"],

  // ---- commerce & rentals ----------------------------------------------
  "equipment-rental": ["hire", "rental", "generator", "tools hire", "machinery"],
  "vehicle-rental": ["car hire", "van hire", "rental car", "lorry hire", "matatu"],
  "event-venue-rental": ["venue", "hall", "conference", "grounds", "space hire", "wedding venue"],
  electronics: ["tv", "laptop", "phone", "duka", "gadgets", "speakers"],
  "mobile-phones-accessories": ["phone", "smartphone", "charger", "duka", "airtime"],
  "groceries-foodstuffs": ["duka", "shop", "food", "cereals", "supermarket"],
  "fashion-clothing": ["clothes", "mitumba", "boutique", "shoes", "apparel"],
  "building-construction-materials": ["cement", "hardware", "sand", "ballast", "steel", "mabati"],
  furniture: ["sofa", "bed", "table", "chairs", "furniture shop"],
  tools: ["hardware", "tools", "drill", "equipment"],
}

/** Extra words that should match a category, or [] if none are defined. */
export function searchTermsFor(slug: string | null | undefined): string[] {
  if (!slug) return []
  return CATEGORY_SEARCH_TERMS[slug] ?? []
}

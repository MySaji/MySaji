export type PublicOffering = {
  slug: string; label: string; title: string; description: string; eyebrow: string; heading: string; intro: string
  action: { label: string; href: string }
  features: { title: string; body: string }[]
  steps: string[]
  questions: { question: string; answer: string }[]
  guides: string[]; related: string[]
}

/** Scope is supported by the referenced repository workflows, not roadmap promises. */
export const PUBLIC_OFFERINGS: PublicOffering[] = [
  {
    slug: "shop", label: "Shop", title: "Shop products & manage orders", eyebrow: "FOR CUSTOMERS AND SHOPS",
    description: "Learn how to browse products, review prices and delivery details, and follow shop orders on MySaji. Explore tools for selling products online.",
    heading: "Shop products. Keep the order details together.",
    intro: "MySaji connects customers with shops selling products through their catalogues. Compare the item, available quantity and seller details, then use your account to review checkout and follow the order.",
    action: { label: "Create a customer account", href: "/auth/signup?role=customer" },
    features: [
      { title: "Browse a shop’s catalogue", body: "Product pages show the information supplied by the seller, including descriptions, prices, images and availability. Review these details for the particular item rather than assuming every shop offers the same selection." },
      { title: "Review your checkout", body: "The cart brings selected products and quantities together. Check the delivery address, contact number, delivery costs and payment summary before confirming an order. Availability and supported payment options are checked in the account workflow." },
      { title: "Follow an order", body: "Customer order records keep the items, supplier and fulfilment status together. Keep the order reference and use the available support or dispute options if something needs attention." },
      { title: "Bring your own products online", body: "A shop workspace supports product listings, stock records and customer orders. Businesses that also need a counter register can explore Saji Till, which has its own signup and workspace." },
    ],
    steps: ["Create or sign in to a customer account to browse the account catalogue.", "Compare product and shop details, quantities and fulfilment conditions.", "Confirm the total and available payment method in checkout.", "Follow the order in your account and keep its reference for support."],
    questions: [
      { question: "Can I buy without an account?", answer: "This public page explains the shopping workflow. Browsing the customer catalogue and managing your cart and orders use a customer account. Current stock and transaction details are confirmed there." },
      { question: "Who supplies and delivers my order?", answer: "The named shop supplies the products. Review the fulfilment and delivery details shown for that shop and order. MySaji does not promise one delivery price or delivery time for every seller." },
      { question: "Does a product listing guarantee availability?", answer: "No. Stock and prices can change. Review the current item and checkout information before confirming, and use the order record to resolve any issue." },
    ], guides: ["shops-orders", "payments-wallet", "cancellations-disputes"], related: ["work", "grow", "pro"],
  },
  {
    slug: "work", label: "Work", title: "Find services & offer your skills", eyebrow: "FOR CUSTOMERS AND PROFESSIONALS",
    description: "Explore service bookings and professional work on MySaji. Compare scope, profiles and availability, then manage quotes, bookings and communication in your account.",
    heading: "Find the right service. Agree on the work.",
    intro: "A useful booking starts with a clear description. MySaji brings customers and independent professionals into a workflow for comparing services, agreeing on scope and keeping track of the job.",
    action: { label: "Create an account to explore services", href: "/auth/signup?role=customer" },
    features: [
      { title: "Compare the details that matter", body: "Review the professional’s profile, work areas, service description and available reviews. Check what is included, how the price is calculated and whether the provider serves your location." },
      { title: "Request and agree on work", body: "Use the booking, offer or customer-request workflow available for the service. Quotes can record scope and line items before the work begins. Schedule and price changes should follow the relevant job workflow." },
      { title: "Coordinate with a shared record", body: "Messages help you discuss access, timing and practical requirements. The job record tracks the booking status; keep agreed changes there rather than treating an informal message as a revised price." },
      { title: "Offer your skills through Saji Pro", body: "Professionals can build a profile, publish supported offers, manage availability and follow customer work in Saji Pro. Account verification and capability settings can limit which activities are available." },
    ],
    steps: ["Explain what you need, including the location and scope.", "Compare suitable profiles and the service or quote details.", "Review the available schedule, price, payment and cancellation conditions.", "Follow the job, review the work and use the transaction’s support options when needed."],
    questions: [
      { question: "Is Work a salaried jobs board?", answer: "This page describes service requests and professional work managed through MySaji. It does not advertise guaranteed employment, salaries or job placement." },
      { question: "What does a verification badge mean?", answer: "Verification reflects the checks described for the account. It does not guarantee a provider’s work, safety or suitability. Review the scope and any relevant qualifications for your particular job." },
      { question: "Can I offer services as well as book them?", answer: "Customer and provider workflows serve different purposes. Choose the appropriate account and professional capabilities during setup; Saji Pro explains the provider workspace." },
    ], guides: ["customer-bookings", "provider-guide", "quotes-invoices"], related: ["pro", "rent", "shop"],
  },
  {
    slug: "rent", label: "Rent", title: "Equipment rentals & return workflows", eyebrow: "FOR CUSTOMERS AND RENTAL PROVIDERS",
    description: "Understand equipment rentals on MySaji: check available dates, rental fees, deposits, handover details and return expectations before confirming in your account.",
    heading: "The equipment you need. The rental terms made clear.",
    intro: "When you need equipment for a period rather than a purchase, the dates and return conditions matter. MySaji’s rental workflow keeps the item, rental period, charges and handover expectations connected.",
    action: { label: "Create an account for rental workflows", href: "/auth/signup?role=customer" },
    features: [
      { title: "Check the item and available dates", body: "Review the rental listing and the period you need. Availability depends on the item, provider and selected dates; this public page is not a live inventory of equipment currently available to hire." },
      { title: "Separate the fee from the deposit", body: "Read the rental charge and any deposit as separate parts of the agreement. Confirm payment requirements and the provider’s terms before committing. A deposit is not automatically the same as the hire price." },
      { title: "Record handover and condition", body: "Agree on collection or delivery arrangements and review the condition of the equipment. Keep useful evidence and the rental reference so both parties have a clear record of what was handed over." },
      { title: "Follow the return workflow", body: "Return timing, condition checks and any deductions depend on the particular rental and its terms. Use the available rental records and support workflow to handle a disagreement." },
    ],
    steps: ["Choose equipment and check the requested dates in the account workflow.", "Read the rental fee, deposit and collection or delivery conditions.", "Confirm the agreement and record the handover condition.", "Return the equipment as agreed and review the recorded outcome."],
    questions: [
      { question: "Is this a property rental service?", answer: "This page covers the equipment-rental workflows present in MySaji. It does not advertise property listings, tenancy management or accommodation services." },
      { question: "Is every item available in every area?", answer: "No. Availability, dates, service areas and fulfilment depend on the provider and listing. Confirm them in the rental workflow before payment." },
      { question: "Are deposits always refunded automatically?", answer: "Do not assume that. Check the rental’s return and condition terms, review its recorded outcome and use the available support options if you dispute a deduction." },
    ], guides: ["rentals", "payments-wallet", "cancellations-disputes"], related: ["work", "pro", "shop"],
  },
  {
    slug: "grow", label: "Grow", title: "Business tools for shops & professionals", eyebrow: "MAKE YOUR NEXT BUSINESS STEP CLEARER",
    description: "Explore MySaji’s business tools for product catalogues, professional services, wholesale orders, staff access and sales records. Choose Saji Pro or Saji Till.",
    heading: "Give your business a more organised working day.",
    intro: "Growth starts with knowing what is happening in the business you have. MySaji provides different workspaces for services, shops, counter sales and wholesale supply. Choose the workflow that matches your work rather than assuming every account has every tool.",
    action: { label: "Choose a business account", href: "/auth/signup" },
    features: [
      { title: "Services and customer work", body: "Saji Pro brings together professional profiles, offers, quotes and job records. Use supported availability and team tools according to the capabilities enabled for your business." },
      { title: "Shop and counter operations", body: "Shop tools support listings and customer orders. Saji Till adds a separate register workspace for sales, stock records, shifts and employee access. Its own signup keeps counter operations distinct from the services portal." },
      { title: "Wholesale supply workflows", body: "Distributor tools cover wholesale catalogues, supply locations and procurement or order records. Confirm stock, quantities, delivery details and commercial terms with the relevant supplier." },
      { title: "Records for better decisions", body: "Use the reports, wallet records and transaction histories available in your workspace to review actual activity. Figures depend on recorded and synchronised transactions; a report is not a promise of revenue or profit." },
    ],
    steps: ["Identify whether you need a services, shop, wholesale or counter-sales workflow.", "Read the relevant public overview and setup guide.", "Create the right account, complete required checks and configure the business.", "Keep transactions and staff permissions up to date, then review your recorded results."],
    questions: [
      { question: "Does Grow include funding or guaranteed customers?", answer: "No. Grow is an overview of the business-management workflows in MySaji. It does not promise finance, grants, investment returns, customer numbers or business success." },
      { question: "Do I need both Saji Pro and Saji Till?", answer: "They serve different workflows. Pro is the professional-services workspace; Till is the dedicated point of sale. Review what your business needs and the current plan or capability settings before subscribing." },
      { question: "Where can I find pricing?", answer: "Use the pricing guidance and the current plan information shown in the relevant account or Till contact flow. Fees and availability depend on the service and setup; this page does not invent a universal price." },
    ], guides: ["business-teams", "distributors", "pricing"], related: ["pro", "shop", "work"],
  },
  {
    slug: "pro", label: "Saji Pro", title: "Saji Pro: tools for service professionals", eyebrow: "YOUR PROFESSIONAL WORKSPACE",
    description: "Learn about Saji Pro for service professionals: business profiles, offers, quotes, availability, customer messages and job records, with capabilities suited to your setup.",
    heading: "Put your skills and customer work in one place.",
    intro: "Saji Pro is MySaji’s workspace for independent professionals and service businesses. Explain what you offer, agree on the work and follow the customer relationship from request to completed job.",
    action: { label: "Create a professional account", href: "/auth/signup?role=provider" },
    features: [
      { title: "A profile with useful evidence", body: "Add your business description, skills, work areas and portfolio material. Keep qualifications and images accurate, and complete verification for activities that require it." },
      { title: "Offers and customer requests", body: "Publish supported offers with clear scope and pricing. Review customer requests and respond through the workflows enabled for your account. A published profile does not guarantee bookings." },
      { title: "Quotes, availability and job records", body: "Keep scope and financial details in quotes, maintain your schedule and follow accepted work in the job workflow. Use recorded change processes when the price, timing or scope needs to change." },
      { title: "Communication and business responsibilities", body: "Coordinate with customers through messages and review the records available in your workspace. Business owners can use supported team tools and assign duties according to their setup and permissions." },
    ],
    steps: ["Choose a provider account and the professional capabilities you need.", "Complete your profile, work areas and any required verification.", "Publish a clear offer or respond to suitable customer work.", "Agree on scope, manage the booking and keep the job record current."],
    questions: [
      { question: "Is Pro the same as Saji Till?", answer: "No. Saji Pro manages professional service work. Saji Till has a separate signup, login and register for counter sales and stock operations. Review the Till overview if you need a point of sale." },
      { question: "Are all tools included for every provider?", answer: "No. Capabilities, eligibility, availability and current commercial terms determine which tools appear in your workspace. Check your account setup and plan details before relying on a feature." },
      { question: "Can a team use the same owner login?", answer: "Use the supported invitation and permissions workflows rather than sharing an owner’s password. Staff should use the access assigned to their duties and location." },
    ], guides: ["provider-guide", "quotes-invoices", "business-teams"], related: ["work", "grow", "rent"],
  },
]
export function publicOfferingBySlug(slug: string) { return PUBLIC_OFFERINGS.find(offering => offering.slug === slug) }

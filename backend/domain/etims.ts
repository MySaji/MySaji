/**
 * KRA's electronic tax invoice system, as this till understands it.
 *
 * WHAT eTIMS IS
 *
 * Since 2024 a VAT registered business in Kenya may not issue a tax invoice
 * from its own software alone. The invoice has to be sent to KRA, who sign
 * it and hand back a receipt number, a signature and a timestamp from their
 * control unit. Those three things are then printed on the customer's
 * receipt, with a QR code a buyer can scan to check the invoice is real.
 * An invoice without them is not a tax invoice.
 *
 * WHAT IS IN THIS FILE AND WHAT IS NOT
 *
 * Only the parts that are arithmetic and shape: the tax codes, how VAT is
 * split out of a price, and how a sale becomes the document KRA expects.
 * All of it is pure, so it can be tested without a network and without
 * credentials. The talking to KRA lives in services/etims-client.ts.
 *
 * ON THE FIELD NAMES
 *
 * The OSCU payload below uses KRA's own abbreviations, which are not ours to
 * improve: `trdInvcNo`, `rcptSign`, `intrlData` and the rest are what the
 * specification issues and what their validator reads. Renaming them to
 * something readable would simply fail. The comments say what each one is.
 */

export const ETIMS_TAX_CODES = ["A", "B", "C", "D", "E"] as const
export type EtimsTaxCodeKey = (typeof ETIMS_TAX_CODES)[number]

export type TaxCodeMeta = {
  /** What a shopkeeper would call it. */
  label: string
  /** The rate as a percentage. Zero rated and exempt are both 0 here and are
   *  NOT the same thing: see `note`. */
  rate: number
  note: string
}

/**
 * The rates as they currently stand.
 *
 * Rates change by Finance Act, and when one does it changes HERE, in one
 * place, rather than in every sale that has already been declared: a sale
 * keeps the rate it was declared at, because that is what KRA signed.
 */
export const ETIMS_TAX_CODE_META: Record<EtimsTaxCodeKey, TaxCodeMeta> = {
  A: {
    label: "Exempt",
    rate: 0,
    note: "No VAT, and outside taxable turnover. Unprocessed foods, some medicines.",
  },
  B: {
    label: "Standard rated (16%)",
    rate: 16,
    note: "What most goods are. The default unless a product says otherwise.",
  },
  C: {
    label: "Zero rated (0%)",
    rate: 0,
    note: "VAT applies, at nothing. Exports and a short official list. Not the same as exempt.",
  },
  D: {
    label: "Outside VAT",
    rate: 0,
    note: "Not a VAT supply at all.",
  },
  E: {
    label: "Reduced rate (8%)",
    rate: 8,
    note: "The lower band, for what it still covers.",
  },
}

export function taxRateFor(code: EtimsTaxCodeKey): number {
  return ETIMS_TAX_CODE_META[code]?.rate ?? 0
}

/**
 * Split a gross, VAT inclusive amount into what it is worth and what the tax
 * on it is.
 *
 * Kenyan shelf prices include VAT, so the amount on the receipt is the gross
 * and the tax is backed out of it rather than added to it. Rounded to two
 * places at the end only: rounding each line as it is computed makes the
 * declared total disagree with the sum of its own lines, which KRA's
 * validator notices.
 */
export function splitInclusive(gross: number, code: EtimsTaxCodeKey): { net: number; tax: number } {
  const rate = taxRateFor(code)
  if (rate === 0) return { net: round2(gross), tax: 0 }
  const net = gross / (1 + rate / 100)
  return { net: round2(net), tax: round2(gross - net) }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

// --------------------------------------------------------------- the payload

export type EtimsLine = {
  /** Position on the invoice, from 1. */
  itemSeq: number
  /** The shop's own code for the thing. */
  itemCd: string
  /** KRA's classification code, where the shop has one. */
  itemClsCd: string | null
  itemNm: string
  /** Unit of measure and packaging, KRA's code list. "U" is a piece. */
  qtyUnitCd: string
  pkgUnitCd: string
  qty: number
  prc: number
  splyAmt: number
  dcRt: number
  dcAmt: number
  taxTyCd: EtimsTaxCodeKey
  taxblAmt: number
  taxAmt: number
  totAmt: number
}

export type EtimsDocument = {
  /** The taxpayer and which of their branches. */
  tin: string
  bhfId: string
  /** The shop's own invoice number, which KRA echoes back against theirs. */
  trdInvcNo: string
  /** "S" for a sale, "R" for a credit note against one. */
  salesTyCd: "N" | "C"
  rcptTyCd: "S" | "R"
  /** The invoice this credit note cancels, where it is one. */
  orgInvcNo: string | null
  custTin: string | null
  custNm: string | null
  /** Totals, which must equal the sum of the lines. */
  totItemCnt: number
  taxblAmtA: number
  taxblAmtB: number
  taxblAmtC: number
  taxblAmtD: number
  taxblAmtE: number
  taxAmtA: number
  taxAmtB: number
  taxAmtC: number
  taxAmtD: number
  taxAmtE: number
  totTaxblAmt: number
  totTaxAmt: number
  totAmt: number
  /** When the sale happened, in KRA's format. */
  cfmDt: string
  salesDt: string
  /** Who served, for their audit trail. */
  regrNm: string
  modrNm: string
  itemList: EtimsLine[]
}

export type SaleForEtims = {
  invoiceNumber: string
  occurredAt: Date
  /** The buyer's PIN, where they asked for an invoice in a company's name. */
  customerTin?: string | null
  customerName?: string | null
  servedBy: string
  lines: {
    name: string
    sku: string
    itemClassCode?: string | null
    unit: string
    quantity: number
    /** Gross, VAT inclusive, per unit. */
    unitPrice: number
    /** Gross discount on the line, not per unit. */
    lineDiscount: number
    taxCode: EtimsTaxCodeKey
  }[]
}

/** KRA wants yyyyMMddHHmmss, in local time, with no separators. */
export function etimsTimestamp(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0")
  return (
    String(d.getFullYear()) + p(d.getMonth() + 1) + p(d.getDate()) +
    p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds())
  )
}

/**
 * Turn a sale into the document KRA signs.
 *
 * The totals are summed from the lines rather than taken from the sale, on
 * purpose. The sale's own total is rounded for the drawer and may have had
 * cash rounding taken off it; the declaration has to add up against its own
 * lines or it is refused, so the lines are the truth here and any difference
 * is a rounding line the shop can see.
 */
export function buildEtimsDocument(input: {
  sale: SaleForEtims
  tin: string
  branchId: string
  kind: "INVOICE" | "CREDIT_NOTE"
  /** The original invoice number, for a credit note. */
  originalInvoiceNumber?: string | null
}): EtimsDocument {
  const { sale } = input
  const isCredit = input.kind === "CREDIT_NOTE"

  const lines: EtimsLine[] = sale.lines.map((l, i) => {
    const gross = round2(l.quantity * l.unitPrice - l.lineDiscount)
    // A credit note is the same document with the signs reversed, which is
    // what KRA expects rather than a separate shape.
    const signed = isCredit ? -gross : gross
    const { net, tax } = splitInclusive(Math.abs(signed), l.taxCode)
    const sign = isCredit ? -1 : 1
    return {
      itemSeq: i + 1,
      itemCd: l.sku,
      itemClsCd: l.itemClassCode ?? null,
      itemNm: l.name,
      qtyUnitCd: unitCode(l.unit),
      pkgUnitCd: "NT",
      qty: sign * l.quantity,
      prc: l.unitPrice,
      splyAmt: sign * round2(l.quantity * l.unitPrice),
      dcRt: 0,
      dcAmt: sign * l.lineDiscount,
      taxTyCd: l.taxCode,
      taxblAmt: sign * net,
      taxAmt: sign * tax,
      totAmt: signed,
    }
  })

  const sumBy = (code: EtimsTaxCodeKey, field: "taxblAmt" | "taxAmt") =>
    round2(lines.filter((l) => l.taxTyCd === code).reduce((t, l) => t + l[field], 0))

  const totTaxblAmt = round2(lines.reduce((t, l) => t + l.taxblAmt, 0))
  const totTaxAmt = round2(lines.reduce((t, l) => t + l.taxAmt, 0))
  const totAmt = round2(lines.reduce((t, l) => t + l.totAmt, 0))

  return {
    tin: input.tin,
    bhfId: input.branchId,
    trdInvcNo: sale.invoiceNumber,
    salesTyCd: isCredit ? "C" : "N",
    rcptTyCd: isCredit ? "R" : "S",
    orgInvcNo: isCredit ? (input.originalInvoiceNumber ?? null) : null,
    custTin: sale.customerTin ?? null,
    custNm: sale.customerName ?? null,
    totItemCnt: lines.length,
    taxblAmtA: sumBy("A", "taxblAmt"),
    taxblAmtB: sumBy("B", "taxblAmt"),
    taxblAmtC: sumBy("C", "taxblAmt"),
    taxblAmtD: sumBy("D", "taxblAmt"),
    taxblAmtE: sumBy("E", "taxblAmt"),
    taxAmtA: sumBy("A", "taxAmt"),
    taxAmtB: sumBy("B", "taxAmt"),
    taxAmtC: sumBy("C", "taxAmt"),
    taxAmtD: sumBy("D", "taxAmt"),
    taxAmtE: sumBy("E", "taxAmt"),
    totTaxblAmt,
    totTaxAmt,
    totAmt,
    cfmDt: etimsTimestamp(sale.occurredAt),
    salesDt: etimsTimestamp(sale.occurredAt).slice(0, 8),
    regrNm: sale.servedBy,
    modrNm: sale.servedBy,
    itemList: lines,
  }
}

/**
 * KRA's unit-of-measure codes, for the units this till actually uses.
 *
 * Their list is long and mostly irrelevant to a duka. Anything unrecognised
 * falls back to "U", a piece, which is both the commonest case and the
 * safest guess: a wrong unit code is a rejected invoice, and "piece" is what
 * a shop selling an unclassified thing means.
 */
const UNIT_CODES: Record<string, string> = {
  piece: "U",
  pieces: "U",
  item: "U",
  kg: "KG",
  kilogram: "KG",
  g: "GRM",
  gram: "GRM",
  l: "L",
  litre: "L",
  liter: "L",
  ml: "MLT",
  m: "MTR",
  metre: "MTR",
  meter: "MTR",
  cm: "CMT",
  dozen: "DZN",
  box: "BOX",
  carton: "CTN",
  packet: "PKT",
  pack: "PKT",
  bale: "BLL",
  bag: "BG",
  crate: "CRT",
  tray: "TY",
  bottle: "BT",
  roll: "ROL",
  pair: "PR",
}

export function unitCode(unit: string): string {
  return UNIT_CODES[unit.trim().toLowerCase()] ?? "U"
}

/**
 * The URL a customer scans to check the invoice.
 *
 * KRA publish the checker's address; it differs between their test and live
 * environments, so it is configuration rather than a constant here.
 */
export function verificationUrl(base: string, tin: string, branchId: string, signature: string): string {
  const trimmed = base.replace(/\/+$/, "")
  return trimmed + "/" + encodeURIComponent(tin) + encodeURIComponent(branchId) + encodeURIComponent(signature)
}

/**
 * Whether a shop has told us enough to declare anything at all.
 *
 * Deliberately strict. A half configured integration that sends something is
 * worse than one that sends nothing: KRA record what they are given, and an
 * invoice filed under the wrong PIN belongs to somebody else.
 */
export function etimsSettingsComplete(s: {
  etimsEnabled: boolean
  etimsTin: string | null
  etimsBranchId: string | null
  etimsDeviceSerial: string | null
  etimsCmcKey: string | null
}): boolean {
  return Boolean(
    s.etimsEnabled && s.etimsTin && s.etimsBranchId && s.etimsDeviceSerial && s.etimsCmcKey,
  )
}

/** A Kenyan PIN: a letter, nine digits, a letter. */
export function isValidKraPin(pin: string): boolean {
  return /^[A-Z]\d{9}[A-Z]$/.test(pin.trim().toUpperCase())
}

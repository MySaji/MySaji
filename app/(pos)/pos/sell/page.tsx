"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import {
  AlertTriangle, ArrowLeft, ArrowRight, Banknote, Calculator, Camera, Check, Clock, CloudOff, CreditCard, Delete, FileLock, Gift, Hammer, HandCoins, Landmark, Loader2, LogOut, Maximize, Minimize, Minus, MonitorPlay, Package, Plus, RefreshCw, Search, ShieldCheck, ShoppingCart, SlidersHorizontal, Smartphone, Star, Store, Trash2, User, X,
} from "lucide-react"
import { PosLogoutButton } from "@/frontend/components/pos/logout-button"
import { MpesaPaymentPicker } from "@/frontend/components/pos/mpesa-inbox"
import { CatalogueBrowser } from "@/frontend/components/pos/catalogue-browser"
import { BusinessWorkspace, RegisterNavigation } from "@/frontend/components/pos/register-workspace"
import { getPosWhoAmI, type PosWhoAmI } from "@/backend/actions/pos-access"
import { PosCard as Card } from "@/frontend/components/pos/workspace-ui"
import { Button } from "@/frontend/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/frontend/components/ui/dialog"
import { Input } from "@/frontend/components/ui/input"
import {
  getTillState, findTillProducts, recordPosSale, openTillShift, closeTillShift, voidPosSale,
  type TillState, type TillProduct, type TillVariant, type Receipt, type ShiftCloseSummary,
} from "@/backend/actions/pos-sales"
import { getCashierMode, signInCashier } from "@/backend/actions/pos-cashiers"
import { registerTillDevice } from "@/backend/actions/pos-devices"
import { getShopMpesa, promptCustomerPayment, checkPromptStatus } from "@/backend/actions/pos-mpesa"
import {
  findCustomerForTill, saveCustomer, getLoyaltySettings,
  type CustomerRow, type LoyaltySettings,
} from "@/backend/actions/pos-customers"
import { getCurrentStore } from "@/backend/actions/pos-stores"
import { getTillBillingGate } from "@/backend/actions/pos-billing-shop"
import { useScannerKeys } from "@/frontend/lib/hooks/useScannerKeys"
import {
  createDisplayPublisher, openCustomerDisplay, type DisplayState,
} from "@/frontend/lib/pos/customer-display"
import { getDeviceSecret, guessDeviceName, guessPlatform } from "@/frontend/lib/pos-device"
import { TillReceipt } from "@/frontend/components/pos/till-receipt"
import { TillInstall } from "@/frontend/components/pos/till-install"
import { BarcodeScanner } from "@/frontend/components/pos/barcode-scanner"
import { usePosOffline } from "@/frontend/lib/hooks/usePosOffline"
import { searchCached, cacheTillState, readTillState } from "@/frontend/lib/pos-offline"

/**
 * The register.
 *
 * Built for one hand on a phone at a counter, which drives every layout
 * decision here. The catalogue and the cart cannot both be on screen at 390px,
 * so the catalogue owns the screen and the cart is a sticky bar that expands —
 * a cashier's thumb lives at the bottom of the phone, not the top. From
 * `lg` up the two sit side by side, because a shop with a counter machine has
 * the width and should not have to tap to see the basket.
 *
 * MONEY IS SHILLINGS, NOT THE VIEWER'S CURRENCY. See the note in
 * components/pos/till-receipt.tsx — this page deliberately does not use
 * useLocalization's formatMoney, which would convert.
 *
 * Offline catalogues and queued sales are scoped to the active POS account
 * and store. The server remains authoritative for prices and final stock.
 */

function sh(n: number): string {
  return n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
/** Totals, without the trailing zeros, for buttons and chips. */
function shShort(n: number): string {
  return n.toLocaleString("en-KE", { maximumFractionDigits: 2 })
}

type CartLine = {
  product: TillProduct
  /**
   * One serial per unit, for a product tracked individually.
   *
   * On the LINE rather than the product, because the same model can be in
   * the basket twice at different prices and the units have to stay with
   * the line they belong to.
   */
  serials?: string[]
  /** The chosen size or option, for a product that has them. */
  variant: TillVariant | null
  /** A string throughout, so "1.3" mid-typing is not coerced to 1.3 and back. */
  quantity: string
  unitPriceOverride?: number
  lineDiscount?: number
}

/** A cart line is identified by product AND variant: two sizes of the same
 *  shirt are two lines, not one with a quantity of two. */
const lineKey = (productId: string, variantId: string | null) => `${productId}::${variantId ?? ""}`

type PaymentDraft = { draftKey: string; mpesaTransactionId?: string; stkCheckoutId?: string; stkPhone?: string; method: "CASH" | "MPESA" | "CARD" | "BANK" | "CREDIT" | "GIFT_CARD"; amount: string; reference: string }

type ParkedSale = {
  key: string; savedAt: string; total: number; cart: CartLine[]; saleDiscount: string; customerName: string;
  payments: PaymentDraft[]; promptPhone: string; member: CustomerRow | null; redeem: string;
  buyer: { name: string; idNumber: string; phone: string; prescriberName: string; prescriptionRef: string };
  ageConfirmed: boolean; asDeposit: boolean; dueDate: string; cashierId: string | null;
}

const METHOD_META: Record<PaymentDraft["method"], { label: string; icon: typeof Banknote }> = {
  CASH: { label: "Cash", icon: Banknote },
  MPESA: { label: "M-Pesa", icon: Smartphone },
  CARD: { label: "Card", icon: CreditCard },
  BANK: { label: "Bank", icon: Landmark },
  CREDIT: { label: "Credit", icon: HandCoins },
  // The card number goes in the reference box, which is where a cashier
  // would type it anyway.
  GIFT_CARD: { label: "Gift card", icon: Gift },
}

/**
 * Plausible amounts a customer actually hands over for a given total.
 *
 * A fixed list of notes does not work: for a 1,462.50 sale, every note up to
 * 1,000 is too small and the cashier is left typing. Rounding the total up to
 * the next 100, 500 and 1,000 gives the three tenders that are actually
 * likely — 1,500 and 2,000 here — whatever the sale is worth.
 */
function quickCash(total: number): number[] {
  if (total <= 0) return []
  const up = (step: number) => Math.ceil(total / step) * step
  return [...new Set([up(100), up(500), up(1000)])]
    .filter((n) => n > total)
    .slice(0, 3)
}

export default function TillPage() {
  const [actor, setActor] = useState<PosWhoAmI | null>(null)
  useEffect(() => { getPosWhoAmI().then(setActor).catch(() => {}) }, [])
  const [state, setState] = useState<TillState | null>(null)
  /**
   * True when the settings on screen came from this device, not the server.
   *
   * Kept separate from `state` so nothing has to guess. A till that cannot
   * reach the server still knows what shop it is and how to price a sale,
   * but it does NOT know today's takings, and the screen has to say which of
   * those it is showing.
   */
  const [stateIsRemembered, setStateIsRemembered] = useState(false)
  /** The server answered, and the answer was that this account has no till. */
  const [noTillConfirmed, setNoTillConfirmed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<"sell" | "pay" | "receipt">("sell")

  const [query, setQuery] = useState("")
  const [results, setResults] = useState<TillProduct[]>([])
  const [searching, setSearching] = useState(false)
  const [hasMoreProducts, setHasMoreProducts] = useState(false)
  const catalogueRequest = useRef(0)
  const searchRef = useRef<HTMLInputElement>(null)

  const [cart, setCart] = useState<CartLine[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [saleDiscount, setSaleDiscount] = useState("")
  const [customerName, setCustomerName] = useState("")

  const [payments, setPayments] = useState<PaymentDraft[]>([{ draftKey: newKey(), method: "CASH", amount: "", reference: "" }])
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [busy, setBusy] = useState(false)
  const [autoPrintReceipt, setAutoPrintReceipt] = useState(false)
  const submitting = useRef(false)
  const autoAttempt = useRef("")
  const [error, setError] = useState("")

  // Generated once per sale attempt and resent unchanged on every retry, so a
  // dropped response cannot ring the same sale up twice. Replaced only after a
  // sale is successfully recorded.
  const [idempotencyKey, setIdempotencyKey] = useState(() => newKey())
  const activeSaleKey = useRef(idempotencyKey)
  activeSaleKey.current = idempotencyKey
  const { data: accountSession, status: accountStatus } = useSession()
  useEffect(() => {
    const watchdog = setTimeout(() => setLoading(false), 20_000)
    return () => clearTimeout(watchdog)
  }, [])
  const [parkedState, setParkedState] = useState<{ scope: string; sales: ParkedSale[] }>({ scope: "", sales: [] })
  const [showParked, setShowParked] = useState(false)
  const [manualCompletion, setManualCompletion] = useState(false)
  const [checkingParked, setCheckingParked] = useState(false)
  const parkedScope = accountSession?.user?.id && actor?.storeId ? `till-parked:v1:${accountSession.user.id}:${actor.storeId}` : ""
  const parkedSales = parkedState.scope === parkedScope ? parkedState.sales : []
  const parkedScopeRef = useRef(parkedScope)
  parkedScopeRef.current = parkedScope
  const parkedRef = useRef(parkedSales)
  parkedRef.current = parkedSales
  useEffect(() => {
    if (!parkedScope) return
    try {
      const saved = JSON.parse(sessionStorage.getItem(parkedScope) || "[]")
      setParkedState({ scope: parkedScope, sales: Array.isArray(saved) ? saved.filter((sale: ParkedSale) => typeof sale.key === "string" && Array.isArray(sale.cart) && Array.isArray(sale.payments)).slice(0, 30) : [] })
    } catch { setError("Could not restore parked sales from this browser tab.") }
  }, [parkedScope])

  const saveParked = (sales: ParkedSale[]) => {
    if (!parkedScope || parkedState.scope !== parkedScope) { setError("Wait for your store to finish loading before parking a sale."); return false }
    try {
      sessionStorage.setItem(parkedScope, JSON.stringify(sales))
      parkedRef.current = sales
      setParkedState({ scope: parkedScope, sales })
      return true
    } catch { setError("This browser could not save the parked sale. Keep this checkout open and retry."); return false }
  }

  const offline = usePosOffline()
  const { saveCatalogue: saveOfflineCatalogue } = offline
  // A sale that was queued rather than sent. The customer is standing
  // there and the sale DID happen, so a receipt is still shown — what
  // changes is the wording on it.
  const [queuedReceipt, setQueuedReceipt] = useState<{ total: number; change: number; items: number } | null>(null)
  /** The product whose size is being chosen, if any. */
  const [pickVariantFor, setPickVariantFor] = useState<TillProduct | null>(null)
  /** Ticked by the cashier when the buyer's age has been checked. Reset
   *  with every sale — a confirmation must never carry over. */
  const [ageConfirmed, setAgeConfirmed] = useState(false)
  /** The line whose units are being scanned, and the box being typed into. */
  const [scanSerialsFor, setScanSerialsFor] = useState<string | null>(null)
  const [serialDraft, setSerialDraft] = useState("")
  /** Who controlled goods are going to. Cleared with every sale — a
   *  register entry must never inherit the last customer's name. */
  const [buyer, setBuyer] = useState({ name: "", idNumber: "", phone: "", prescriberName: "", prescriptionRef: "" })
  /** Take this as a deposit rather than a full sale. */
  const [asDeposit, setAsDeposit] = useState(false)
  const [dueDate, setDueDate] = useState("")

  /**
   * Who is at the counter.
   *
   * Null means nobody has signed in, which is the normal state for a shop
   * run by one person: the server then records the sale under the account
   * holder's name. A shop that has added cashiers is asked, because the
   * whole point of adding them was to know which one served.
   */
  const [cashier, setCashier] = useState<{ id: string; name: string; role: string } | null>(null)
  const [mode, setMode] = useState<{
    anyCashiers: boolean; voidNeedsManager: boolean; requirePinPerSale: boolean; ownerName: string
  } | null>(null)
  const [pin, setPin] = useState("")
  const [pinError, setPinError] = useState("")
  const [pinBusy, setPinBusy] = useState(false)

  /**
   * This counter, as the shop knows it.
   *
   * The secret is read once and sent with every sale. Null where storage is
   * blocked, and the till sells anyway — a sale that cannot say which
   * counter it came from is a smaller problem than a shop that cannot sell.
   */
  const [deviceSecret, setDeviceSecret] = useState<string | null>(null)
  const [deviceRevoked, setDeviceRevoked] = useState<{ name: string } | null>(null)

  /**
   * How this shop takes M-Pesa, if it has said.
   *
   * Null while loading or where the shop has set nothing up, in which case
   * the payment screen behaves exactly as it did before: a box for a code
   * the cashier reads off the customer's phone.
   */
  const [mpesa, setMpesa] = useState<Awaited<ReturnType<typeof getShopMpesa>>>(null)
  /**
   * A prompt in flight, per payment row.
   *
   * Keyed by row because a split sale can have more than one M-Pesa line,
   * and a cashier who sent two prompts needs to see which one answered.
   */
  const [prompts, setPrompts] = useState<Record<number, {
    checkoutId: string
    phone: string
    state: "sending" | "waiting" | "paid" | "failed"
    message?: string
  }>>({})
  const [promptPhone, setPromptPhone] = useState("")

  /**
   * The camera scanner, for a counter with no scanner gun.
   *
   * A USB scanner just types into the search box and needs nothing. This is
   * for a shopkeeper working off a phone, which is most of them.
   */
  const [scanning, setScanning] = useState(false)

  /**
   * The loyalty member this sale is for, if anyone.
   *
   * Looked up by the number the customer reads out, which is the only thing
   * they reliably remember. Null for the overwhelming majority of sales,
   * and everything about the till works unchanged when it is.
   */
  const [member, setMember] = useState<CustomerRow | null>(null)
  const [memberQuery, setMemberQuery] = useState("")
  const [memberHits, setMemberHits] = useState<CustomerRow[]>([])
  const [memberSearching, setMemberSearching] = useState(false)
  const memberRequest = useRef(0)
  const [joinOpen, setJoinOpen] = useState(false)
  const [joinName, setJoinName] = useState("")
  const [redeem, setRedeem] = useState("")
  const [receiptCustomerOpen, setReceiptCustomerOpen] = useState(false)
  const [receiptCustomerPhone, setReceiptCustomerPhone] = useState("")
  const [receiptCustomer, setReceiptCustomer] = useState<CustomerRow | null>(null)
  const [receiptCustomerBusy, setReceiptCustomerBusy] = useState(false)
  const [receiptCustomerError, setReceiptCustomerError] = useState("")
  const receiptCustomerRequest = useRef(0)
  const [loyalty, setLoyalty] = useState<LoyaltySettings | null>(null)

  /**
   * Which branch this till is ringing up for.
   *
   * Null for a business with one, which is nearly all of them, and the badge
   * stays off the screen. Where there are several it is NOT optional
   * decoration: everything this screen does belongs to one branch, and a
   * cashier who did not notice the switch would sell one shop's stock from
   * another's counter.
   */
  const [branch, setBranch] = useState<{ name: string; isOnlyOne: boolean } | null>(null)

  /**
   * Whether the subscription lets this till sell.
   *
   * Shown so the shopkeeper learns about it from a banner rather than from a
   * refused sale with a customer standing there. The server refuses anyway,
   * which is what actually enforces it; this is only the warning.
   */
  const [billing, setBilling] = useState<{ canSell: boolean; status: string; message: string | null } | null>(null)

  /** Open while a void is being asked for: the reason, and a manager's PIN where one is needed. */
  const [voidAsk, setVoidAsk] = useState<{ reason: string; pin: string } | null>(null)

  const [shiftOpening, setShiftOpening] = useState("")
  const [shiftCounted, setShiftCounted] = useState("")
  const [shiftNote, setShiftNote] = useState("")
  const [showShift, setShowShift] = useState(false)
  const [closeSummary, setCloseSummary] = useState<ShiftCloseSummary | null>(null)

  const reload = useCallback(() => getTillState().then(setState), [])

  // Say hello, so the shop can see which counters are open and which have
  // gone quiet. A failure here is ignored: the till does not need the
  // server's permission to know which device it is.
  useEffect(() => {
    const secret = getDeviceSecret()
    if (!secret) return
    setDeviceSecret(secret)
    registerTillDevice({ secret, name: guessDeviceName(), platform: guessPlatform() })
      .then((r) => { if (r.success && r.revoked) setDeviceRevoked({ name: r.name }) })
      .catch(() => {})
  }, [])

  // What the subscription says. A failure here never blocks the till.
  useEffect(() => {
    getTillBillingGate().then(setBilling).catch(() => {})
  }, [])

  // Which branch, where the business has more than one.
  useEffect(() => {
    getCurrentStore().then(setBranch).catch(() => {})
  }, [])

  // Whether this shop runs a points scheme at all. A shop that does not
  // never sees any of it.
  useEffect(() => {
    getLoyaltySettings({}).then(setLoyalty).catch(() => {})
  }, [])

  // How this shop takes M-Pesa. Failing here leaves the payment screen as
  // it was, which is a working screen, so nothing is said about it.
  useEffect(() => {
    getShopMpesa().then(setMpesa).catch(() => {})
  }, [])

  // Who may work this till. Deliberately NOT part of getTillState: a till
  // that cannot reach the server must still sell, so a failure here leaves
  // mode null and no sign-in is asked for. A PIN says who served; it is not
  // a lock, and treating it as one would shut a shop.
  useEffect(() => {
    getCashierMode().then((m) => { if (m) setMode(m) }).catch(() => {})
  }, [])

  useEffect(() => {
    if (accountStatus === "unauthenticated") { window.location.replace("/pos/login"); return }
    if (accountStatus !== "authenticated") return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Till startup timed out")), 15_000) })
    const startup = Promise.all([
      getTillState().then((s) => {
        if (cancelled) return s
        setState(s)
        setStateIsRemembered(false)
        // The server answered. Null here is a real answer, not a failure.
        if (s === null) setNoTillConfirmed(true)
        else void cacheTillState(s)
        return s
      }),
      findTillProducts({ query: "", limit: 50 }).then((p) => { if (!cancelled) { setResults(p); setHasMoreProducts(p.length === 50) }; return p }),
    ])
    Promise.race([startup, timeout])
      .then(([, products]) => { if (!cancelled) void saveOfflineCatalogue(products) })
      .catch(async () => {
        // Unreachable. Fall back to what this device last knew, so the till
        // opens and sells. Without this the page showed "No till on this
        // account", which is a lie, and the worst possible thing to tell a
        // cashier standing at a cold machine in the morning.
        try {
          const { state: remembered } = await readTillState<TillState>()
          if (remembered && !cancelled) {
            setState(remembered)
            setStateIsRemembered(true)
          }
        } catch {
          // No local copy either. The empty state below is then correct,
          // because this device has genuinely never seen this till.
        }
      })
      .finally(() => { clearTimeout(timer); if (!cancelled) setLoading(false) })
    return () => { cancelled = true; clearTimeout(timer) }
  }, [accountStatus, saveOfflineCatalogue])

  // Ignore stale responses when a cashier types or scans another query.
  useEffect(() => {
    const request = ++catalogueRequest.current
    const id = setTimeout(() => {
      setSearching(true)
      findTillProducts({ query, limit: 50 })
        .then((products) => {
          if (request !== catalogueRequest.current) return
          setResults(products)
          setHasMoreProducts(products.length === 50)
          if (query.trim() === "") void offline.saveCatalogue(products)
        })
        .catch(() => {
          if (request !== catalogueRequest.current) return
          setResults(searchCached(offline.catalogue, query))
          setHasMoreProducts(false)
        })
        .finally(() => { if (request === catalogueRequest.current) setSearching(false) })
    }, 180)
    return () => { clearTimeout(id); catalogueRequest.current = request + 1 }
    // Cached catalogue changes are used on the next search or network failure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, offline.available])

  const loadMoreProducts = async () => {
    if (searching || !hasMoreProducts) return
    const request = catalogueRequest.current
    setSearching(true)
    try {
      const products = await findTillProducts({ query, limit: 50, offset: results.length })
      if (request !== catalogueRequest.current) return
      const combined = [...new Map([...results, ...products].map(product => [product.id, product])).values()]
      setResults(combined)
      setHasMoreProducts(products.length === 50 && combined.length > results.length)
      if (!query.trim()) void offline.saveCatalogue(combined)
    } catch {
      if (request === catalogueRequest.current) setError("Could not load more products. Your current basket is unchanged. Try again when connected.")
    } finally { if (request === catalogueRequest.current) setSearching(false) }
  }

  // ---- cart maths. Mirrors the server, which prices the sale for real. ----
  const lineTotal = (l: CartLine) => {
    const qty = Number(l.quantity || 0)
    // The variant's price where there is one — it may differ from the
    // product's, and charging the product's would undercharge silently.
    const price = l.unitPriceOverride ?? l.variant?.price ?? l.product.price
    return Math.max(0, qty * price - (l.lineDiscount ?? 0))
  }
  const subtotal = useMemo(() => cart.reduce((a, l) => a + lineTotal(l), 0), [cart])
  const discountNum = Math.min(Number(saleDiscount || 0), subtotal)

  /**
   * The bill, worked out in the same order the server works it out.
   *
   * Subtotal, then any discount, then points, then tax, then rounding. The
   * order is not a detail: the server is the one that decides what is owed,
   * and a screen that disagrees with it sends a cashier to collect the wrong
   * amount. The points and the rounding were both missing here, so a sale
   * where somebody spent points showed the full price on the payment screen
   * while the server recorded the discounted one.
   */
  const headroom = subtotal - discountNum
  const perPoint = loyalty?.shillingsPerPoint ?? 1
  const wantedPoints = member ? Math.floor(Number(redeem || 0)) : 0
  // Capped at what is left after any other discount, and what cannot be
  // spent is not spent: charging somebody points that bought nothing is the
  // worst possible rounding error.
  const pointsDiscount = Math.min(wantedPoints * perPoint, headroom)
  const spendablePoints = perPoint > 0 ? Math.floor(pointsDiscount / perPoint) : 0
  const net = headroom - pointsDiscount
  const taxRate = state?.taxRate ?? 0
  const taxInclusive = state?.taxInclusive ?? true
  const tax = taxRate === 0 ? 0 : taxInclusive ? net - net / (1 + taxRate / 100) : net * (taxRate / 100)
  const beforeRounding = taxInclusive ? net : net + tax
  // Rounded DOWN, never up, like the server. Rounding up is the shop taking
  // money nobody agreed to.
  const roundingStep = state?.cashRounding ?? 0
  const total = roundingStep > 0 ? Math.floor(beforeRounding / roundingStep) * roundingStep : beforeRounding
  const roundingOff = beforeRounding - total
  const paid = payments.reduce((a, p) => a + Number(p.amount || 0), 0)
  const hasCash = payments.some((p) => p.method === "CASH")
  const change = hasCash ? Math.max(0, paid - total) : 0
  const shortBy = Math.max(0, total - paid)

  const itemCount = cart.length
  /**
   * Lines that still need their units scanned.
   *
   * Checked in the page as well as on the server, so a cashier finds out
   * while the customer is at the counter rather than when payment is
   * refused.
   */
  const unscanned = cart.filter(
    (l) => l.product.tracksSerials && (l.serials?.length ?? 0) !== Math.floor(Number(l.quantity || 0)),
  )
  /** Any restricted line in the basket, in a shop that checks. */
  const needsAgeCheck = (state?.checksAge ?? false) && cart.some((l) => l.product.ageRestricted)
  /** Any controlled line in the basket, in a shop that keeps a register. */
  const needsRegister = (state?.keepsRegister ?? false) && cart.some((l) => l.product.controlled)
  /** Whether this basket could be taken as a deposit at all. */
  const canDeposit = (state?.takesDeposits ?? false) && cart.some((l) => l.product.madeToOrder)
  /** What is still owed, when taking it as a deposit. */
  const depositBalance = asDeposit ? Math.max(0, total - paid) : 0

  // ---- cart actions -------------------------------------------------------
  const addSerial = (key: string, raw: string) => {
    const value = raw.trim()
    if (!value) return
    setError("")
    setCart((prev) => prev.map((l) => {
      if (lineKey(l.product.id, l.variant?.id ?? null) !== key) return l
      const have = l.serials ?? []
      // Refused here as well as on the server: scanning the same box twice
      // happens, and catching it at the moment of the scan is far clearer
      // than having payment refused later.
      if (have.some((x) => x.toLowerCase() === value.toLowerCase())) {
        setError(value + " has already been scanned for this line.")
        return l
      }
      // The quantity FOLLOWS the scans for a serialised line. Typing a
      // number and then scanning a different count is the discrepancy the
      // register exists to prevent, so there is only one source of truth.
      return { ...l, serials: [...have, value], quantity: String(have.length + 1) }
    }))
    setSerialDraft("")
  }

  const removeSerial = (key: string, serial: string) => {
    setCart((prev) => prev.map((l) => {
      if (lineKey(l.product.id, l.variant?.id ?? null) !== key) return l
      const next = (l.serials ?? []).filter((x) => x !== serial)
      return { ...l, serials: next, quantity: next.length === 0 ? "" : String(next.length) }
    }))
  }

  const addProduct = (product: TillProduct, variant?: TillVariant | null) => {
    if (!state?.shift) { setError("Open a shift before starting a sale."); setShowShift(true); return }
    setError("")

    // A product sold in sizes cannot be added without one. If the scan
    // already identified the size, use it and skip the question; otherwise
    // ask, because "a shirt" is not something that can be handed over.
    if (product.variants.length > 0 && !variant) {
      const scanned = product.matchedVariantId
        ? product.variants.find((v) => v.id === product.matchedVariantId)
        : undefined
      if (scanned) return addProduct(product, scanned)
      setPickVariantFor(product)
      return
    }

    const chosen = variant ?? null
    setPickVariantFor(null)
    setCart((prev) => {
      const key = lineKey(product.id, chosen?.id ?? null)
      const at = prev.findIndex((l) => lineKey(l.product.id, l.variant?.id ?? null) === key)
      if (at === -1) return [...prev, { product, variant: chosen, quantity: "1" }]
      // A second scan of the same barcode means one more of it, which is what
      // a cashier scanning three identical tins expects. For a measured
      // product that is still +1 of the unit; they can type the weight after.
      const next = [...prev]
      next[at] = { ...next[at], quantity: String(Number(next[at].quantity || 0) + 1) }
      return next
    })
  }

  /**
   * A barcode from the counter scanner, wherever the cashier had tapped.
   *
   * The search box already handles a scan that lands in it. This is the rest
   * of the time: after tapping a tile, a quantity, or anything else, focus is
   * no longer in the box and the scanner's keystrokes would go nowhere. At a
   * counter with a queue that is the worst failure there is, because nothing
   * appears to happen and the cashier finds out when the total is wrong.
   *
   * An unambiguous scan is added straight to the sale. Anything else is put
   * in the search box for the cashier to choose from, rather than guessed at.
   */
  const onScannerCode = async (code: string) => {
    const trimmed = code.trim()
    if (trimmed.length === 0) return
    setError("")
    try {
      const found = await findTillProducts({ query: trimmed })
      if (found.length === 1) {
        addProduct(found[0])
        setQuery("")
        setResults(await findTillProducts({ query: "", limit: 50 }).then(products => { setHasMoreProducts(products.length === 50); return products }).catch(() => found))
        return
      }
      // Nothing, or more than one. Shown rather than decided: adding the
      // wrong tin is worse than asking.
      setQuery(trimmed)
      setResults(found)
      searchRef.current?.focus()
      if (found.length === 0) setError("Nothing in this shop has the barcode " + trimmed + ".")
    } catch {
      setQuery(trimmed)
      searchRef.current?.focus()
    }
  }

  // Only while actually selling. During payment the keyboard belongs to the
  // amounts, and on the receipt screen there is nothing to add to.
  useScannerKeys((code) => { void onScannerCode(code) }, {
    enabled: view === "sell" && !scanning && !pickVariantFor,
  })

  const setQuantity = (key: string, quantity: string) => {
    // Only digits and at most one dot, and only a dot at all where the shop
    // actually sells by measure.
    const cleaned = state?.canSellFractional
      ? quantity.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1")
      : quantity.replace(/\D/g, "")
    setCart((prev) => prev.map((l) => (lineKey(l.product.id, l.variant?.id ?? null) === key ? { ...l, quantity: cleaned } : l)))
  }

  const bumpQuantity = (key: string, by: number) => {
    setCart((prev) => prev.map((l) => {
      if (lineKey(l.product.id, l.variant?.id ?? null) !== key) return l
      const next = Math.max(0, Number(l.quantity || 0) + by)
      return { ...l, quantity: next === 0 ? "" : String(Number(next.toFixed(3))) }
    }))
  }

  const setOverride = (key: string, raw: string) => {
    const value = raw.replace(/[^\d.]/g, "")
    setCart((prev) => prev.map((l) =>
      lineKey(l.product.id, l.variant?.id ?? null) === key
        ? { ...l, unitPriceOverride: value === "" ? undefined : Number(value) }
        : l))
  }

  const removeLine = (key: string) =>
    setCart((prev) => prev.filter((l) => lineKey(l.product.id, l.variant?.id ?? null) !== key))

  const clearSale = () => {
    setReceiptCustomerOpen(false)
    receiptCustomerRequest.current++
    setReceiptCustomer(null); setReceiptCustomerPhone(""); setReceiptCustomerError(""); setReceiptCustomerBusy(false)
    memberRequest.current++
    setMemberSearching(false)
    setCart([]); setSaleDiscount(""); setCustomerName(""); setPickVariantFor(null)
    setAutoPrintReceipt(false)
    setManualCompletion(false)
    setPayments([{ draftKey: newKey(), method: "CASH", amount: "", reference: "" }])
    setPrompts({}); setPromptPhone("")
    setMember(null); setMemberQuery(""); setMemberHits([]); setRedeem(""); setJoinOpen(false); setJoinName("")
    setReceipt(null); setError(""); setCartOpen(false); setAgeConfirmed(false)
    setScanSerialsFor(null); setSerialDraft("")
    setBuyer({ name: "", idNumber: "", phone: "", prescriberName: "", prescriptionRef: "" })
    setAsDeposit(false); setDueDate("")
    const freshSaleKey = newKey()
    activeSaleKey.current = freshSaleKey
    setIdempotencyKey(freshSaleKey)
    // A counter several people share: whoever serves the next customer signs
    // in for it. Without this the first person to touch the till owns the
    // whole day's sales, which is the opposite of what the setting is for.
    if (mode?.requirePinPerSale) setCashier(null)
    setView("sell")
    searchRef.current?.focus()
  }

  const snapshotSale = (): ParkedSale => ({
    key: idempotencyKey, savedAt: new Date().toISOString(), total, cart, saleDiscount, customerName,
    payments, promptPhone, member, redeem, buyer, ageConfirmed, asDeposit, dueDate, cashierId: cashier?.id ?? null,
  })
  const parkSale = () => {
    if (!cart.length || busy || submitting.current || view === "receipt" || Object.values(prompts).some(prompt => prompt.state === "sending")) return
    if (parkedSales.length >= 30) { setError("Finish a parked sale before adding another. This tab can hold 30 sales."); return }
    if (!saveParked([...parkedSales, snapshotSale()])) return
    clearSale()
    setShowParked(true)
  }
  const resumeSale = (sale: ParkedSale) => {
    if (busy || submitting.current || Object.values(prompts).some(prompt => prompt.state === "sending")) return
    if (!state?.shift) { setError("Open a shift before resuming a sale."); setShowShift(true); return }
    if (mode?.anyCashiers && sale.cashierId !== (cashier?.id ?? null)) { setError("Sign in with the cashier PIN that parked this sale before resuming it."); return }
    // Swap the current basket into the queue, rather than losing it.
    const next = parkedSales.filter(entry => entry.key !== sale.key)
    if (cart.length && view !== "receipt") next.push(snapshotSale())
    if (!saveParked(next)) return
    clearSale()
    setCart(sale.cart); setSaleDiscount(sale.saleDiscount); setCustomerName(sale.customerName)
    setPayments(sale.payments); setPromptPhone(sale.promptPhone); setMember(sale.member); setRedeem(sale.redeem)
    setBuyer(sale.buyer); setAgeConfirmed(sale.ageConfirmed); setAsDeposit(sale.asDeposit); setDueDate(sale.dueDate)
    setIdempotencyKey(sale.key); activeSaleKey.current = sale.key
    setManualCompletion(true); setView("pay"); setShowParked(false)
    if (mode?.requirePinPerSale) setCashier(cashier)
  }
  const refreshParkedPayments = async () => {
    if (checkingParked || !parkedScope || !navigator.onLine) return
    const scope = parkedScope
    setCheckingParked(true)
    try {
      // Only provider-confirmed, exact payments are attached to a parked basket.
      // A paid parked sale stays parked until its cashier resumes and records it.
      const updates = new Map<string, PaymentDraft>()
      for (const sale of parkedRef.current) for (const payment of sale.payments) {
        if (!payment.stkCheckoutId || payment.mpesaTransactionId) continue
        const status = await checkPromptStatus({ checkoutId: payment.stkCheckoutId })
        if (status.state === "paid" && status.amount === Number(payment.amount)) updates.set(payment.draftKey, { ...payment, reference: status.receipt, mpesaTransactionId: status.transactionId })
      }
      if (parkedScopeRef.current !== scope) return
      if (updates.size) saveParked(parkedRef.current.map(sale => ({ ...sale, payments: sale.payments.map(payment => updates.get(payment.draftKey) ?? payment) })))
    } catch { setError("Could not check parked payments. Retry when connected.") }
    finally { setCheckingParked(false) }
  }

  const checkCurrentPayment = async () => {
    if (checkingParked || !navigator.onLine) return
    const key = idempotencyKey
    setCheckingParked(true)
    try {
      let matched = false
      for (const payment of payments) {
        if (!payment.stkCheckoutId || payment.mpesaTransactionId) continue
        const status = await checkPromptStatus({ checkoutId: payment.stkCheckoutId })
        if (activeSaleKey.current !== key) return
        if (status.state === "paid" && status.amount === Number(payment.amount)) {
          matched = true
          setPayments(current => current.map(row => row.draftKey === payment.draftKey ? { ...row, reference: status.receipt, mpesaTransactionId: status.transactionId } : row))
        }
      }
      setError(matched ? "" : "No new confirmed payment yet. Check again or use the received-payments inbox.")
    } catch { setError("Could not check this payment. Please retry.") }
    finally { setCheckingParked(false) }
  }

  // ---- counter machine controls ------------------------------------------
  //
  // Only ever shown on a wide screen. A phone has no second monitor to drive
  // and no chrome worth hiding, so offering either there is noise.
  const [fullscreen, setFullscreen] = useState(false)
  useEffect(() => {
    const onChange = () => {
      const on = !!document.fullscreenElement
      setFullscreen(on)
      // Tells the portal shell to get out of the way. The rules live in
      // globals.css so the sidebar and topbar need no knowledge of the till.
      if (on) document.documentElement.setAttribute("data-till-kiosk", "on")
      else document.documentElement.removeAttribute("data-till-kiosk")
    }
    document.addEventListener("fullscreenchange", onChange)
    // Leaving the till while still in full screen would otherwise strand the
    // rest of the portal with no navigation.
    return () => {
      document.removeEventListener("fullscreenchange", onChange)
      document.documentElement.removeAttribute("data-till-kiosk")
    }
  }, [])

  const toggleFullscreen = () => {
    // Both calls need a user gesture and both reject rather than throw when
    // the browser or an administrator has disallowed it, so neither is awaited
    // into an unhandled rejection.
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    else void document.documentElement.requestFullscreen().catch(() => {})
  }

  // Keys a counter cashier can reach without looking down.
  //
  // F2/F4/F8 only. F1, F3, F5, F11 and F12 are claimed by the browser itself
  // and cannot be reliably taken back, and anything on a plain letter would
  // collide with the barcode wedge, which types its digits straight into the
  // window (see useScannerKeys).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2") { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select() }
      else if (e.key === "F4") { e.preventDefault(); toggleFullscreen() }
      else if (e.key === "F8") { e.preventDefault(); void openCustomerDisplay() }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // ---- the screen the customer reads --------------------------------------
  //
  // A counter machine drives two monitors. Everything the customer sees is
  // derived here from the same figures the cashier is looking at, so the two
  // screens cannot disagree: there is no second calculation to drift.
  const displayState: DisplayState = useMemo(() => {
    const shopName = state?.shopName ?? "Saji"
    // The receipt view means the drawer has opened. Hold the total and the
    // change until the cashier starts the next sale, because that is exactly
    // when the customer wants to check it.
    if (view === "receipt") return { kind: "paid", shopName, total, paid, change }
    if (cart.length === 0) return { kind: "idle", shopName }
    return {
      kind: "sale",
      shopName,
      lines: cart.map((l) => ({
        id: lineKey(l.product.id, l.variant?.id ?? null),
        name: l.product.name,
        variant: l.variant?.label ?? null,
        quantity: Number(l.quantity || 0),
        unit: l.product.unit,
        unitPrice: l.unitPriceOverride ?? l.variant?.price ?? l.product.price,
        total: lineTotal(l),
      })),
      subtotal,
      discount: discountNum,
      points: pointsDiscount,
      tax,
      total,
    }
  }, [view, cart, state?.shopName, subtotal, discountNum, pointsDiscount, tax, total, paid, change])

  const displayRef = useRef<ReturnType<typeof createDisplayPublisher> | null>(null)
  useEffect(() => {
    const pub = createDisplayPublisher()
    displayRef.current = pub
    return () => { pub.close(); displayRef.current = null }
  }, [])
  useEffect(() => { displayRef.current?.publish(displayState) }, [displayState])

  // ---- submitting ---------------------------------------------------------
  const takePayment = async (customerConfirmed = false, selectedCustomer: CustomerRow | null = member) => {
    if (!state?.shift) { setError("Open a shift before starting a sale."); setShowShift(true); return }
    if (submitting.current) return
    if (loyalty?.enabled && !asDeposit && !customerConfirmed) {
      receiptCustomerRequest.current++
      setReceiptCustomerBusy(false)
      setReceiptCustomer(member); setReceiptCustomerPhone(member?.phone || "")
      setReceiptCustomerError(""); setReceiptCustomerOpen(true)
      return
    }
    setReceiptCustomerOpen(false)
    submitting.current = true
    try {
    setBusy(true); setError("")
    const payload = {
      idempotencyKey,
      lines: cart
        // A line left at empty or zero is a line the cashier backed out of.
        .filter((l) => Number(l.quantity || 0) > 0)
        .map((l) => ({
          productId: l.product.id,
          ...(l.variant ? { variantId: l.variant.id } : {}),
          quantity: String(Number(l.quantity)),
          ...(l.unitPriceOverride !== undefined ? { unitPriceOverride: l.unitPriceOverride } : {}),
          ...(l.serials && l.serials.length > 0 ? { serials: l.serials } : {}),
          ...(l.lineDiscount ? { lineDiscount: l.lineDiscount } : {}),
        })),
      payments: payments
        .filter((p) => Number(p.amount || 0) > 0)
        .map((p) => ({
          method: p.method,
          amount: Number(p.amount),
          ...(p.reference.trim() ? { reference: p.reference.trim() } : {}),
          // Only a prompt Safaricom said was paid. The server checks this
          // again before it writes anything, so sending it is a claim, not
          // a decision.
          ...(p.method === "MPESA" && p.mpesaTransactionId ? { mpesaTransactionId: p.mpesaTransactionId, ...(p.stkCheckoutId ? { stkCheckoutId: p.stkCheckoutId, stkPhone: p.stkPhone } : {}) } : {}),
        })),
      ...(discountNum > 0 ? { saleDiscount: discountNum } : {}),
      ...(needsAgeCheck ? { ageVerified: ageConfirmed } : {}),
      ...(asDeposit && canDeposit ? { deposit: dueDate ? { dueDate: new Date(dueDate).toISOString() } : {} } : {}),
      ...(needsRegister ? {
        controlledBuyer: {
          name: buyer.name.trim(),
          ...(buyer.idNumber.trim() ? { idNumber: buyer.idNumber.trim() } : {}),
          ...(buyer.phone.trim() ? { phone: buyer.phone.trim() } : {}),
          ...(buyer.prescriberName.trim() ? { prescriberName: buyer.prescriberName.trim() } : {}),
          ...(buyer.prescriptionRef.trim() ? { prescriptionRef: buyer.prescriptionRef.trim() } : {}),
        },
      } : {}),
      ...(customerName.trim() ? { customerName: customerName.trim() } : {}),
      // Who rang it up. Left off where nobody signed in, and the server
      // falls back to the account holder rather than refusing.
      ...(cashier?.id ? { cashierId: cashier.id } : {}),
      // Which counter. Goes into the offline queue with the rest of the
      // sale, so a sale that syncs tomorrow still says where it came from.
      ...(deviceSecret ? { deviceSecret } : {}),
      // Who is collecting points, and how many they are spending. Both are
      // requests: the server checks the balance and the shop's rules before
      // either becomes money.
      ...(selectedCustomer ? { posCustomerId: selectedCustomer.id } : {}),
      ...(selectedCustomer && selectedCustomer.id === member?.id && spendablePoints > 0 ? { redeemPoints: spendablePoints } : {}),
    }

    const r = await offline.submitSale(payload, { total, itemCount: cart.length })
    setBusy(false)

    if (!r.ok && !r.queued) { setError(r.error); return }

    if (r.ok) {
      setReceipt(r.receipt)
      setQueuedReceipt(null)
      void reload()
      void findTillProducts({ query }).then(setResults).catch(() => {})
    } else {
      // Queued. No receipt number yet — the server assigns those, and
      // inventing one here would collide with a real one later.
      setQueuedReceipt({ total, change, items: cart.length })
      setReceipt(null)
    }
    setView("receipt")
    // Rotated only once the sale is either confirmed OR safely queued under
    // this key. Rotating after a plain failure would turn the cashier's
    // retry into a second sale.
    setIdempotencyKey(newKey())    } catch { setError("Could not finish checkout. Your payment remains in the inbox until the sale is recorded. Retry this checkout to check its status.") }
    finally { submitting.current = false; setBusy(false) }

  }

  const findReceiptCustomer = async () => {
    const phone = receiptCustomerPhone.replace(/[\s()+-]/g, "")
    if (!/^(?:0[17]\d{8}|254[17]\d{8}|[17]\d{8})$/.test(phone)) { setReceiptCustomerError("Enter a complete customer number, such as 0712 345 678."); return }
    const request = ++receiptCustomerRequest.current
    setReceiptCustomerBusy(true); setReceiptCustomerError(""); setReceiptCustomer(null)
    try {
      const matches = await findCustomerForTill({ query: receiptCustomerPhone })
      if (request !== receiptCustomerRequest.current) return
      if (matches.length) setReceiptCustomer(matches[0])
      else setReceiptCustomerError("No active points account found for this number. Check it, or continue without points.")
    } catch { if (request === receiptCustomerRequest.current) setReceiptCustomerError("Could not check this account. Retry when connected, or continue without points.") }
    finally { if (request === receiptCustomerRequest.current) setReceiptCustomerBusy(false) }
  }

  /**
   * Push a PIN request to the customer's phone for one payment row.
   *
   * Polls afterwards, because Safaricom answers the push immediately and the
   * customer answers it in their own time. The cashier watches the row, not
   * a spinner over the whole screen: the rest of the sale stays usable, and
   * a prompt that is ignored can simply be abandoned for cash.
   */
  const liveCheckout = useRef({ payments, signature: "" })
  liveCheckout.current = { payments, signature: JSON.stringify({ cart: cart.map(line => [line.product.id, line.variant?.id, line.quantity, line.unitPriceOverride]), total, customer: member?.id, redeem, asDeposit }) }
  const latestTakePayment = useRef(takePayment)
  latestTakePayment.current = takePayment
  useEffect(() => {
    const payment = payments.length === 1 ? payments[0] : null
    if (manualCompletion || view !== "pay" || busy || !payment?.stkCheckoutId || !payment.mpesaTransactionId || payment.method !== "MPESA" || Number(payment.amount) !== total || total <= 0 || asDeposit || !navigator.onLine || (needsAgeCheck && !ageConfirmed) || (needsRegister && buyer.name.trim().length < 2)) return
    if (autoAttempt.current === payment.mpesaTransactionId) return
    autoAttempt.current = payment.mpesaTransactionId
    setAutoPrintReceipt(true)
    void latestTakePayment.current()
  }, [manualCompletion, payments, view, busy, total, asDeposit, needsAgeCheck, ageConfirmed, needsRegister, buyer.name])

  const sendPrompt = async (idx: number) => {
    const row = payments[idx]
    const saleKey = idempotencyKey
    const signature = liveCheckout.current.signature
    const draftKey = row?.draftKey
    const amount = Number(row?.amount || 0) || shortBy || total
    if (amount <= 0) return

    setPrompts((prev) => ({ ...prev, [idx]: { checkoutId: "", phone: promptPhone, state: "sending" } }))
    const r = await promptCustomerPayment({ phone: promptPhone, amount })
    if (!r.success) {
      setPrompts((prev) => ({ ...prev, [idx]: { checkoutId: "", phone: promptPhone, state: "failed", message: r.error } }))
      return
    }

    setPrompts((prev) => ({ ...prev, [idx]: { checkoutId: r.checkoutId, phone: r.phone, state: "waiting" } }))
    // The amount is pinned to what was actually prompted for, so a cashier
    // editing the box afterwards cannot leave a confirmed payment sitting
    // against a different figure.
    setPayments((prev) => prev.map((q, i) => (i === idx ? { ...q, amount: String(amount), stkCheckoutId: r.checkoutId, stkPhone: r.phone } : q)))

    // Up to about two minutes, which is how long Safaricom keeps the request
    // on the handset. Then it stops rather than polling forever.
    for (let attempt = 0; attempt < 40; attempt++) {
      await new Promise((res) => setTimeout(res, 3000))
      if (activeSaleKey.current !== saleKey) return
      let status: Awaited<ReturnType<typeof checkPromptStatus>>
      try {
        status = await checkPromptStatus({ checkoutId: r.checkoutId })
      } catch {
        continue
      }
      if (activeSaleKey.current !== saleKey) return
      if (status.state === "paid") {
        const current = liveCheckout.current.payments[idx]
        if (!current || current.draftKey !== draftKey || current.method !== "MPESA" || Number(current.amount) !== status.amount || signature !== liveCheckout.current.signature) {
          setError("M-Pesa payment received, but checkout changed. Find the payment in the inbox and confirm the correct basket.")
          return
        }
        setPrompts((prev) => ({ ...prev, [idx]: { checkoutId: r.checkoutId, phone: r.phone, state: "paid" } }))
        setPayments((prev) => prev.map((q, i) =>
          i === idx ? { ...q, amount: String(status.amount), reference: status.receipt, mpesaTransactionId: status.transactionId, stkCheckoutId: r.checkoutId, stkPhone: r.phone } : q))
        return
      }
      if (status.state === "failed") {
        setPrompts((prev) => ({ ...prev, [idx]: { checkoutId: r.checkoutId, phone: r.phone, state: "failed", message: status.reason } }))
        return
      }
    }
    setPrompts((prev) => ({
      ...prev,
      [idx]: { checkoutId: r.checkoutId, phone: r.phone, state: "failed", message: "No answer from the phone. Ask them to try again, or take cash." },
    }))
  }

  /** Find the member by the number they read out. */
  const lookupMember = async (q: string) => {
    const request = ++memberRequest.current
    if (q.trim().length < 2) { setMemberHits([]); setMemberSearching(false); return }
    setMemberSearching(true)
    const hits = await findCustomerForTill({ query: q }).catch(() => [])
    if (request !== memberRequest.current) return
    setMemberSearching(false)
    setMemberHits(hits)
  }

  /** Sign somebody up at the counter, in one field. */
  const joinMember = async () => {
    setBusy(true); setError("")
    const r = await saveCustomer({ name: joinName.trim(), phone: memberQuery.trim() })
    setBusy(false)
    if (!r.success) { setError(r.error); return }
    const hits = await findCustomerForTill({ query: memberQuery }).catch(() => [])
    const found = hits.find((h) => h.id === r.customerId) ?? hits[0] ?? null
    setMember(found)
    setJoinOpen(false); setJoinName(""); setMemberHits([])
  }

  const doSignIn = async (entered: string) => {
    setPinBusy(true); setPinError("")
    const r = await signInCashier({ pin: entered })
    setPinBusy(false)
    setPin("")
    if (!r.success) { setPinError(r.error); return }
    setCashier({ id: r.cashierId, name: r.name, role: r.role })
    searchRef.current?.focus()
  }

  const doSignOut = () => { setCashier(null); setPin(""); setPinError(""); clearSale() }

  const doVoid = async () => {
    if (!receipt) return
    if (!voidAsk) { setVoidAsk({ reason: "", pin: "" }); return }
    if (voidAsk.reason.trim().length < 3) return
    setBusy(true); setError("")
    const r = await voidPosSale({
      saleId: receipt.saleId,
      reason: voidAsk.reason.trim(),
      ...(voidAsk.pin ? { managerPin: voidAsk.pin } : {}),
    })
    setBusy(false)
    if (!r.success) { setError(r.error); return }
    setVoidAsk(null)
    void reload()
    clearSale()
  }

  const doOpenShift = async () => {
    setBusy(true); setError("")
    const r = await openTillShift({
      openingFloat: Number(shiftOpening || 0),
      // Who opened it and from where, so a shift that ends short can be
      // traced to a person and a counter rather than to the account.
      ...(cashier?.name ? { cashierName: cashier.name } : {}),
      ...(deviceSecret ? { deviceSecret } : {}),
    })
    setBusy(false)
    if (!r.success) { setError(r.error); return }
    setShiftOpening(""); setShowShift(false); void reload()
  }

  const doCloseShift = async () => {
    setBusy(true); setError("")
    const r = await closeTillShift({ countedCash: Number(shiftCounted || 0), note: shiftNote.trim() || undefined })
    setBusy(false)
    if (!r.success) { setError(r.error); return }
    setCloseSummary(r.data)
    setShiftCounted(""); setShiftNote(""); setShowShift(false); void reload()
  }

  // ---- render -------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  // Never reached the server, and nothing remembered on this device. Say
  // exactly that, rather than making a claim about the account.
  if (!state && !noTillConfirmed) {
    return (
      <div className="p-4 max-w-2xl mx-auto">
        <Card className="p-6 text-center rounded-2xl">
          <CloudOff className="w-10 h-10 mx-auto text-amber-400" />
          <h1 className="mt-3 text-lg font-bold text-gray-900 dark:text-white">
            The till cannot open yet
          </h1>
          <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            Till could not finish loading your workspace. Check your connection and sign-in.
            If this device has no saved catalogue, connect once before using offline mode.
          </p>
          <Button onClick={() => window.location.reload()} className="mt-4 h-11 rounded-xl gap-1.5">
            <RefreshCw className="w-4 h-4" /> Try again
          </Button>
          <a href="/pos/login" className="mt-4 block text-sm font-semibold text-primary">Sign in to Saji Till</a>
          <a href="/pos" className="mt-3 block text-xs text-muted-foreground">Return to Saji Till</a>
        </Card>
      </div>
    )
  }

  if (!state) {
    return (
      <div className="p-4 max-w-2xl mx-auto">
        <Card className="p-6 text-center rounded-2xl">
          <Calculator className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600" />
          <h1 className="mt-3 text-lg font-bold text-gray-900 dark:text-white">No till on this account</h1>
          <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            Set up your POS business to start serving customers, managing stock and adding your team.
          </p>
          <Link href="/pos/setup">
            <Button className="mt-4 h-11 rounded-xl gap-1.5">
              Set up your POS <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </Card>
      </div>
    )
  }

  if (view === "receipt" && receipt) {
    return (
      <div className="p-4 space-y-3">
        {error && <ErrorNote>{error}</ErrorNote>}
        {voidAsk && (
          <div className="mx-auto w-full max-w-sm rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/15 p-3 space-y-2.5">
            <p className="text-xs font-bold text-red-900 dark:text-red-300">Void this sale</p>
            <p className="text-[11px] text-red-800/80 dark:text-red-400/80 leading-snug">
              The stock goes back on the shelf and the money comes off the day&apos;s takings. The
              sale is kept, marked voided &mdash; it is not erased.
            </p>
            <Input
              value={voidAsk.reason}
              onChange={(e) => setVoidAsk({ ...voidAsk, reason: e.target.value })}
              placeholder="Why? e.g. rung up twice"
              className="h-11 rounded-xl text-sm bg-white dark:bg-gray-900"
            />
            {mode?.voidNeedsManager && (
              <div>
                <label className="text-[11px] font-semibold text-red-900 dark:text-red-300">
                  A manager has to approve this
                </label>
                <Input
                  value={voidAsk.pin}
                  onChange={(e) => setVoidAsk({ ...voidAsk, pin: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="Manager PIN"
                  className="mt-1 h-11 rounded-xl text-sm tracking-[0.4em] font-mono bg-white dark:bg-gray-900"
                />
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => { setVoidAsk(null); setError("") }}
                className="h-11 px-4 rounded-xl border border-red-200 dark:border-red-900 text-xs font-semibold text-red-700 dark:text-red-300 active:scale-95"
              >
                Keep it
              </button>
              <button
                onClick={doVoid}
                disabled={busy || voidAsk.reason.trim().length < 3 || (!!mode?.voidNeedsManager && voidAsk.pin.length < 4)}
                className="flex-1 h-11 rounded-xl bg-red-600 text-white text-xs font-semibold active:scale-95 disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Void the sale"}
              </button>
            </div>
          </div>
        )}
        <TillReceipt
          receipt={receipt}
          autoPrintOnce={autoPrintReceipt}
          onNewSale={clearSale}
          onVoid={busy || voidAsk ? undefined : doVoid}
          /* Printed on the slip so a customer can pay later or query the
             payment, which is the commonest reason they bring it back. */
          payTo={mpesa?.shortcode
            ? (mpesa.shortcodeType === "TILL" ? "Buy Goods " : "Paybill ") + mpesa.shortcode +
              (mpesa.shortcodeType !== "TILL" && mpesa.accountRef ? ", acct " + mpesa.accountRef : "")
            : null}
        />
      </div>
    )
  }

  // Queued, not sent. Deliberately a different screen from a real receipt:
  // there is no receipt number yet, nothing has been voided or can be, and
  // saying "Sale recorded" would be a claim about a server that has not
  // heard of it.
  if (view === "receipt" && queuedReceipt) {
    return (
      <div className="p-4 mx-auto w-full max-w-sm">
        <div className="rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/15 p-4 text-center">
          <div className="mx-auto w-10 h-10 rounded-full bg-amber-500 text-white flex items-center justify-center">
            <CloudOff className="w-5 h-5" />
          </div>
          <p className="mt-2 text-xs font-semibold text-amber-900 dark:text-amber-300">Saved on this device</p>
          {queuedReceipt.change > 0 ? (
            <>
              <p className="mt-2 text-[11px] uppercase tracking-wide text-amber-800/70 dark:text-amber-400/70">Change</p>
              <p className="text-3xl font-bold text-amber-900 dark:text-amber-200 tabular-nums">
                KSh {sh(queuedReceipt.change)}
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 text-[11px] uppercase tracking-wide text-amber-800/70 dark:text-amber-400/70">Total</p>
              <p className="text-3xl font-bold text-amber-900 dark:text-amber-200 tabular-nums">
                KSh {sh(queuedReceipt.total)}
              </p>
            </>
          )}
          <p className="mt-2 text-[11px] text-amber-800 dark:text-amber-300 leading-snug">
            There is no connection, so this sale is waiting on this device. It will go through
            on its own when the line comes back. Do not ring it up again.
          </p>
          <p className="mt-1.5 text-[10px] text-amber-700/80 dark:text-amber-400/70 leading-snug">
            A receipt number is given when it reaches the server, so there is none to print yet.
          </p>
        </div>
        <button
          onClick={clearSale}
          className="mt-3 w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm active:scale-[0.98] transition-transform"
        >
          Next sale
        </button>
      </div>
    )
  }

  // ---- a device the shop has stopped --------------------------------------
  //
  // Said here rather than at the moment of payment. Finding out that this
  // phone is barred when a customer is standing at the counter with their
  // money out is the wrong time to find out.
  if (deviceRevoked) {
    return (
      <div className="p-4 pb-28 lg:pb-4 mx-auto w-full max-w-sm">
        <div className="rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/15 p-4 text-center">
          <div className="mx-auto w-10 h-10 rounded-full bg-red-600 text-white flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <p className="mt-2 text-sm font-bold text-red-900 dark:text-red-300">
            {deviceRevoked.name} has been stopped
          </p>
          <p className="mt-1.5 text-xs text-red-800 dark:text-red-400 leading-relaxed">
            This device cannot ring up sales. If that was not meant to happen, turn it back on
            under Settings &rarr; Devices, from any till.
          </p>
        </div>
        <Link href="/pos/devices">
          <Button className="mt-3 w-full h-12 rounded-xl">Devices</Button>
        </Link>
      </div>
    )
  }

  // ---- who is serving ----------------------------------------------------
  //
  // Only asked where the shop has actually added people. The way past it
  // without a PIN is shown rather than hidden: the owner is already signed
  // in as the shop and may not have given themselves a PIN, and a till that
  // locks its owner out over a four-digit label is a broken till.
  if (mode?.anyCashiers && !cashier) {
    return (
      <div className="p-4 pb-28 lg:pb-4 mx-auto w-full max-w-sm">
        <div className="text-center">
          <span className="mx-auto w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
            <User className="w-6 h-6" />
          </span>
          <h1 className="mt-3 text-lg font-bold text-gray-900 dark:text-white">Who is serving?</h1>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            Enter your PIN so your name goes on the sales you ring up.
          </p>
        </div>

        <p className="mt-4 h-12 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center justify-center text-2xl tracking-[0.5em] font-mono text-gray-900 dark:text-white tabular-nums">
          {pin.replace(/./g, "\u2022") || <span className="text-sm tracking-normal font-sans text-gray-400">PIN</span>}
        </p>
        {pinError && <p className="mt-2 text-center text-xs text-red-600 dark:text-red-400">{pinError}</p>}

        {/* A keypad, not a text field: this is used standing up, one-handed,
            on a phone whose own keyboard would cover half the screen. */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button
              key={d}
              onClick={() => { setPinError(""); setPin((v) => (v.length < 6 ? v + d : v)) }}
              className="h-14 rounded-xl border border-gray-200 dark:border-gray-700 text-xl font-semibold text-gray-900 dark:text-white active:scale-95 active:bg-gray-100 dark:active:bg-gray-800"
            >
              {d}
            </button>
          ))}
          <button
            onClick={() => { setPinError(""); setPin("") }}
            aria-label="Clear"
            className="h-14 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-500 active:scale-95"
          >
            Clear
          </button>
          <button
            onClick={() => { setPinError(""); setPin((v) => (v.length < 6 ? v + "0" : v)) }}
            className="h-14 rounded-xl border border-gray-200 dark:border-gray-700 text-xl font-semibold text-gray-900 dark:text-white active:scale-95 active:bg-gray-100 dark:active:bg-gray-800"
          >
            0
          </button>
          <button
            onClick={() => { setPinError(""); setPin((v) => v.slice(0, -1)) }}
            aria-label="Delete last digit"
            className="h-14 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 active:scale-95"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>

        <button
          onClick={() => void doSignIn(pin)}
          disabled={pinBusy || pin.length < 4}
          className="mt-3 w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm active:scale-[0.98] disabled:opacity-50"
        >
          {pinBusy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Start serving"}
        </button>

        <button
          onClick={() => setCashier({ id: "", name: mode.ownerName, role: "owner" })}
          className="mt-2 w-full h-11 rounded-xl text-xs font-semibold text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 active:scale-[0.98]"
        >
          Continue as {mode.ownerName}
        </button>
        <p className="mt-1.5 text-center text-[11px] text-gray-400 dark:text-gray-500 leading-snug">
          Sales then go under your own name. You can give yourself a PIN under
          Settings &rarr; Who works the till.
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-dvh w-full bg-slate-50 pb-28 dark:bg-slate-950 lg:pl-20 lg:pb-4">
      <RegisterNavigation actor={actor} />
      {/* ---- the subscription, where it is in the way ---------------------
          Above everything, because a cashier who learns about this from a
          refused sale learns it in front of a customer. The server refuses
          regardless; this is the warning, not the rule. */}
      {billing && billing.message && (
        <div className={
          billing.canSell
            ? "border-b border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5"
            : "border-b border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2.5"
        }>
          <div className="flex items-start gap-2 w-full min-w-0">
            <AlertTriangle className={
              billing.canSell
                ? "w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5"
                : "w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5"
            } />
            <div className="min-w-0 flex-1">
              <p className={
                billing.canSell
                  ? "text-[11px] text-amber-800 dark:text-amber-300 leading-snug"
                  : "text-[11px] text-red-700 dark:text-red-300 leading-snug"
              }>
                {billing.message}
              </p>
              <Link
                href="/pos/subscription"
                className="mt-1 inline-block text-[11px] font-semibold underline text-gray-700 dark:text-gray-200"
              >
                See the subscription
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className={(view === "pay" ? "hidden" : "flex") + " flex-wrap items-center gap-2 border-b border-border bg-background px-4 py-3"}>
        <PosLogoutButton />
        <Button variant="outline" onClick={parkSale} disabled={!cart.length || busy || view === "receipt" || Object.values(prompts).some(prompt => prompt.state === "sending")} className="gap-2"><Clock className="h-4 w-4" />Park sale & start next</Button>
        <Button variant="outline" onClick={() => { setShowParked(!showParked); if (!showParked) void refreshParkedPayments() }}>Parked sales ({parkedSales.length})</Button>
        {payments.some(payment => payment.stkCheckoutId && !payment.mpesaTransactionId) && <Button variant="outline" onClick={() => void checkCurrentPayment()} disabled={checkingParked || busy}>{checkingParked ? "Checking…" : "Check this sale’s payment"}</Button>}
        <span className="text-xs text-muted-foreground">Saved in this browser tab. Stock is reserved only when the sale is recorded.</span>
      </div>
      {showParked && <section aria-label="Parked sales" className="border-b border-border bg-muted/20 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">Customers waiting for payment</h2><p className="mt-1 text-xs text-muted-foreground">Check payments, resume a basket, then record the sale. Your current basket will be parked when you switch.</p></div><Button variant="outline" onClick={() => void refreshParkedPayments()} disabled={checkingParked}>{checkingParked ? "Checking…" : "Check payment status"}</Button></div>
        {!parkedSales.length && <p className="py-4 text-sm text-muted-foreground">No parked sales. Add products and park the checkout to serve another customer.</p>}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{parkedSales.map((sale, index) => {
          const hasPrompt = sale.payments.some(payment => payment.stkCheckoutId)
          const paid = sale.payments.filter(payment => payment.mpesaTransactionId).reduce((sum, payment) => sum + Number(payment.amount), 0)
          return <div key={sale.key} className="rounded-xl border border-border bg-background p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-sm font-semibold">{sale.customerName || sale.member?.name || `Customer ${index + 1}`}</h3><p className="mt-1 text-xs text-muted-foreground">{sale.cart.length} lines · {new Date(sale.savedAt).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })}</p></div><strong className="whitespace-nowrap text-sm">KSh {shShort(sale.total)}</strong></div><p className="mt-3 text-xs font-medium">{paid >= sale.total && sale.total > 0 ? "Payment received · ready to record" : paid > 0 ? "Part payment received" : hasPrompt ? "M-Pesa prompt pending · check status" : "Waiting for payment"}</p><p className="mt-2 truncate text-xs text-muted-foreground">{sale.cart.map(line => line.product.name).join(", ")}</p><Button className="mt-3 w-full" onClick={() => resumeSale(sale)} disabled={busy}>Resume checkout</Button></div>
        })}</div>
      </section>}

      {/* ---- shift and takings bar ---------------------------------------- */}
      {!state.shift && <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 dark:bg-amber-950 dark:text-amber-100"><div><p className="text-sm font-semibold">Open your shift to start selling</p><p className="text-xs">Record the opening cash before adding products or taking payment.</p></div><Button onClick={() => setShowShift(true)}>Open shift</Button></div>}
      <div className="sticky top-0 z-20 border-b border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-900/95 backdrop-blur px-3 py-2">
        {/* Connection, stated before anything else. A cashier must never
            have to infer it from a sale failing. */}
        {(offline.connection === "offline" || offline.pendingCount > 0 || offline.failedCount > 0 || (state?.openDeposits ?? 0) > 0) && (
          <div className="w-full min-w-0 mb-2 flex flex-wrap items-center gap-1.5">
            {offline.connection === "offline" && (
              <span className="inline-flex items-center gap-1.5 h-7 px-2 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 text-[11px] font-semibold">
                <CloudOff className="w-3 h-3" /> No connection. Sales are saved here
              </span>
            )}
            {/* The settings came off this device, so the takings figure beside
                them is whatever it was when the line last worked. Saying so is
                the difference between a stale number and a wrong one. */}
            {stateIsRemembered && (
              <span className="inline-flex items-center gap-1.5 h-7 px-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-[11px] font-semibold">
                Today&apos;s figures are not up to date
              </span>
            )}
            {offline.pendingCount > 0 && (
              <button
                onClick={() => void offline.sync()}
                disabled={offline.syncing}
                className="inline-flex items-center gap-1.5 h-7 px-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-[11px] font-semibold active:scale-95"
              >
                <RefreshCw className={`w-3 h-3 ${offline.syncing ? "animate-spin" : ""}`} />
                {offline.pendingCount} waiting to send
              </button>
            )}
            {(state?.openDeposits ?? 0) > 0 && (
              <Link
                href="/pos/orders"
                className="inline-flex items-center gap-1.5 h-7 px-2 rounded-lg bg-sky-100 dark:bg-sky-900/30 text-sky-800 dark:text-sky-300 text-[11px] font-semibold active:scale-95"
              >
                <Hammer className="w-3 h-3" /> {state.openDeposits} to deliver
              </Link>
            )}
            {offline.failedCount > 0 && (
              <Link
                href="/pos/queue"
                className="inline-flex items-center gap-1.5 h-7 px-2 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-[11px] font-semibold active:scale-95"
              >
                <AlertTriangle className="w-3 h-3" /> {offline.failedCount} need attention
              </Link>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 w-full min-w-0">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{state.shopName}</p>
            <p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">
              KSh {shShort(state.takingsToday)}
              {/* Separated by a dot, not only by a margin: "KSh 0" followed by
                  "0 sales today" ran together as "KSh 0 0 sales today" and
                  read like one broken number. */}
              <span className="ml-1.5 text-[11px] font-normal text-gray-400">
                &middot; {state.salesToday} {state.salesToday === 1 ? "sale" : "sales"} today
              </span>
            </p>
          </div>
          <button
            onClick={() => { setShowShift((v) => !v); setCloseSummary(null) }}
            className={`h-9 px-2.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 active:scale-95 transition-transform ${
              state.shift
                ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400"
                : "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            {state.shift ? "Shift open" : "No shift"}
          </button>

          {/* Counter machine only. Hidden below xl for the same reason the
              wide layout starts there: that is where a till stops being a
              phone in someone's hand and becomes a monitor on a counter. */}
          <button
            onClick={() => void openCustomerDisplay()}
            title="Customer screen (F8)"
            className="hidden xl:flex h-9 px-2.5 rounded-lg text-[11px] font-semibold items-center gap-1.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 active:scale-95 transition-transform"
          >
            <MonitorPlay className="w-3.5 h-3.5" /> Customer screen
          </button>
          <button
            onClick={toggleFullscreen}
            title={fullscreen ? "Leave full screen (F4)" : "Full screen (F4)"}
            aria-label={fullscreen ? "Leave full screen" : "Full screen"}
            className="hidden xl:flex h-9 w-9 rounded-lg items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 active:scale-95 transition-transform"
          >
            {fullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
          {/* The branch, and only where there is more than one to confuse.
              A link rather than a label, because the reason to look at it is
              usually that you are in the wrong one. */}
          {branch && !branch.isOnlyOne && (
            <Link
              href="/pos/stores"
              className="h-9 px-2.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 active:scale-95 transition-transform bg-primary/10 text-primary max-w-[9rem]"
            >
              <Store className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{branch.name}</span>
            </Link>
          )}
          {/* Who the till thinks is serving. Shown rather than assumed: a
              cashier who walked away without signing out is the commonest way
              sales end up under the wrong name. */}
          {mode?.anyCashiers && cashier && (
            <button
              onClick={doSignOut}
              className="h-9 px-2.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 active:scale-95 transition-transform max-w-[130px]"
            >
              {cashier.role === "manager" ? <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" /> : <User className="w-3.5 h-3.5 flex-shrink-0" />}
              <span className="truncate">{cashier.name}</span>
              <LogOut className="w-3 h-3 flex-shrink-0 opacity-60" />
            </button>
          )}
          <Link href="/pos/settings" className="flex-shrink-0">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 active:scale-95 transition-transform">
              <SlidersHorizontal className="w-4 h-4" />
            </span>
          </Link>
        </div>

        {showShift && (
          <div className="w-full min-w-0 mt-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 p-3">
            {state.shift ? (
              <>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <ShiftStat label="Float" value={state.shift.openingFloat} />
                  <ShiftStat label="Cash taken" value={state.shift.cashTaken} />
                  <ShiftStat label="Expected" value={state.shift.openingFloat + state.shift.cashTaken} />
                </div>
                {state.shift.nonCashTaken > 0 && (
                  <p className="mt-1.5 text-center text-[11px] text-gray-500 dark:text-gray-400">
                    Plus KSh {shShort(state.shift.nonCashTaken)} not in the drawer (M-Pesa, card, bank)
                  </p>
                )}
                <label className="mt-2.5 block text-[11px] font-medium text-gray-700 dark:text-gray-300">
                  Count the drawer and enter what is in it
                </label>
                <div className="mt-1 flex gap-2">
                  <Input
                    value={shiftCounted}
                    onChange={(e) => setShiftCounted(e.target.value.replace(/[^\d.]/g, ""))}
                    inputMode="decimal"
                    placeholder="0"
                    className="h-10 rounded-xl tabular-nums"
                  />
                  <Button onClick={doCloseShift} disabled={busy || shiftCounted === ""} className="h-10 rounded-xl text-xs whitespace-nowrap">
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Close shift"}
                  </Button>
                </div>
                <Input
                  value={shiftNote}
                  onChange={(e) => setShiftNote(e.target.value)}
                  placeholder="Note (optional)"
                  className="mt-1.5 h-9 rounded-xl text-xs"
                />
              </>
            ) : (
              <>
                <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-snug">
                  Opening a shift records the cash you start with, so the drawer can be checked
                  against it later. Sales still work without one.
                </p>
                <div className="mt-2 flex gap-2">
                  <Input
                    value={shiftOpening}
                    onChange={(e) => setShiftOpening(e.target.value.replace(/[^\d.]/g, ""))}
                    inputMode="decimal"
                    placeholder="Cash in the drawer now"
                    className="h-10 rounded-xl tabular-nums"
                  />
                  <Button onClick={doOpenShift} disabled={busy} className="h-10 rounded-xl text-xs whitespace-nowrap">
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Open shift"}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {closeSummary && (
          <div className={`w-full min-w-0 mt-2 rounded-xl border p-3 ${
            closeSummary.variance === 0
              ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20"
              : "border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10"
          }`}>
            <p className="text-xs font-bold text-gray-900 dark:text-white">
              Shift closed &middot; {closeSummary.saleCount} {closeSummary.saleCount === 1 ? "sale" : "sales"}
            </p>
            <div className="mt-1.5 grid grid-cols-3 gap-2 text-center">
              <ShiftStat label="Expected" value={closeSummary.expectedCash} />
              <ShiftStat label="Counted" value={closeSummary.countedCash} />
              <ShiftStat label="Difference" value={closeSummary.variance} highlight={closeSummary.variance !== 0} />
            </div>
            <button onClick={() => setCloseSummary(null)} className="mt-2 text-[11px] text-gray-500 underline">Dismiss</button>
          </div>
        )}
      </div>

      <div className="w-full min-w-0 p-3 md:p-5 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px] lg:gap-5 xl:gap-6 lg:items-start">
        {/* ---- catalogue -------------------------------------------------- */}
        <div className="min-w-0">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4 rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-5 text-white md:p-6">
            <div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-300">Sales workspace</p><h1 className="mt-2 text-2xl font-semibold tracking-tight">{state.traits.includes("SERVICE") ? "Products & services" : "Product catalogue"}</h1><p className="mt-2 text-xs text-slate-300">Find an item, choose its options, and add it to the current sale.</p></div>
            <span className="hidden rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[10px] text-slate-300 sm:block">F2 Search · F4 Full screen · F8 Display</span>
          </div>
          <div className="mb-4"><BusinessWorkspace traits={state.traits} profileKey={state.profileKey} actor={actor} /></div>
          <div className="relative flex gap-2">
            <Search className="absolute left-3 top-6 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none z-10" />
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                // A barcode scanner ends its input with Enter.
                //
                // This used to add the item only when `results` already held
                // exactly one, which read well and almost never fired: the
                // search behind `results` is debounced, and a scanner sends
                // thirteen digits and Enter faster than that debounce. So the
                // Enter arrived while the list was still the whole shelf and
                // the scan merely filtered the grid. It now does its own
                // lookup, the same one a scan from anywhere else does.
                if (e.key === "Enter") {
                  e.preventDefault()
                  void onScannerCode(query)
                }
              }}
              placeholder="Search products, SKU or scan a barcode"
              className="h-12 pl-9 pr-9 rounded-xl text-base flex-1"
              autoComplete="off"
              autoFocus
            />
            {query !== "" && (
              <button
                onClick={() => { setQuery(""); searchRef.current?.focus() }}
                aria-label="Clear search"
                className="absolute right-[62px] top-6 -translate-y-1/2 w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 active:scale-90"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            {/* Beside the box rather than inside it: at a counter this is
                tapped with a thumb while the other hand holds the goods. */}
            <button
              onClick={() => setScanning(true)}
              aria-label="Scan with the camera"
              className="h-12 w-12 flex-shrink-0 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 active:scale-95"
            >
              <Camera className="w-5 h-5" />
            </button>
          </div>

          {scanning && (
            <BarcodeScanner
              label="barcode"
              onClose={() => setScanning(false)}
              onDetected={(code) => {
                setScanning(false)
                void onScannerCode(code)
                searchRef.current?.focus()
              }}
            />
          )}

          {error && view === "sell" && <div className="mt-2"><ErrorNote>{error}</ErrorNote></div>}

          <CatalogueBrowser products={results} catalogue={offline.catalogue} cart={cart} onAdd={addProduct} searching={searching} query={query} hasMore={hasMoreProducts} onLoadMore={() => void loadMoreProducts()} scope={actor ? `${actor.businessId}:${actor.storeId ?? "default"}` : null} />

          {results.length > 0 && (
            <div className="mt-3">
              <TillInstall />
            </div>
          )}
        </div>

        {/* ---- cart: a sheet on a phone, a column on a counter machine ---- */}
        <div
          className={`${
            cartOpen
              ? "fixed inset-x-0 bottom-0 top-14 z-40 overflow-y-auto bg-white dark:bg-gray-900 rounded-t-2xl shadow-2xl"
              : "hidden"
          } lg:sticky lg:top-24 lg:block lg:inset-x-auto lg:bottom-auto lg:z-auto lg:overflow-visible lg:rounded-none lg:shadow-none lg:bg-transparent lg:dark:bg-transparent`}
        >
          <div className="p-3 lg:p-0">
            <div className="flex items-center justify-between lg:hidden">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">This sale</h2>
              <button
                onClick={() => setCartOpen(false)}
                aria-label="Close basket"
                className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 active:scale-90"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <Card className="mt-2 lg:mt-0 gap-0 rounded-2xl border-border py-0 overflow-hidden shadow-sm">
              <div className="flex items-center justify-between border-b border-border bg-background p-4"><div><p className="text-sm font-semibold">Current sale</p><p className="mt-1 text-[11px] text-muted-foreground">{itemCount} {itemCount === 1 ? "item" : "items"} · {cashier?.name ?? actor?.name ?? "Counter"}</p></div><span className="rounded-xl bg-blue-50 p-2.5 text-blue-600 dark:bg-blue-950"><ShoppingCart className="h-5 w-5" /></span></div>
              {cart.length === 0 ? (
                <div className="p-5 text-center">
                  <ShoppingCart className="w-7 h-7 mx-auto text-gray-300 dark:text-gray-600" />
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Scan or tap a product to start.
                  </p>
                </div>
              ) : (
                <div className="max-h-[45dvh] overflow-y-auto overscroll-contain divide-y divide-gray-100 dark:divide-gray-700">
                  {cart.map((l) => {
                    const key = lineKey(l.product.id, l.variant?.id ?? null)
                    return (
                    <div key={key} className="p-3">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-gray-900 dark:text-white leading-tight">
                            {l.product.name}
                            {l.variant && <span className="text-gray-500 font-normal"> &middot; {l.variant.label}</span>}
                          </p>
                          <p className="text-[10px] text-gray-400 tabular-nums">
                            {shShort(l.unitPriceOverride ?? l.variant?.price ?? l.product.price)}
                            {l.product.unit !== "piece" && `/${l.product.unit}`}
                            {l.unitPriceOverride !== undefined && " (price set)"}
                          </p>
                        </div>
                        <p className="text-xs font-bold text-gray-900 dark:text-white tabular-nums">{sh(lineTotal(l))}</p>
                        <button
                          onClick={() => removeLine(key)}
                          aria-label={`Remove ${l.product.name}${l.variant ? " " + l.variant.label : ""}`}
                          className="-m-1 w-9 h-9 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 active:scale-90"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {l.product.tracksSerials ? (
                        <div className="mt-2">
                          {(l.serials ?? []).length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-1.5">
                              {(l.serials ?? []).map((sn) => (
                                <button
                                  key={sn}
                                  onClick={() => removeSerial(key, sn)}
                                  className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-[10px] font-mono bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 active:scale-95"
                                >
                                  {sn}
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              ))}
                            </div>
                          )}
                          <button
                            onClick={() => { setScanSerialsFor(key); setSerialDraft("") }}
                            className={`w-full h-9 rounded-lg border text-[11px] font-semibold active:scale-[0.98] transition-all ${
                              (l.serials?.length ?? 0) === 0
                                ? "border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/15 text-amber-800 dark:text-amber-300"
                                : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
                            }`}
                          >
                            {(l.serials?.length ?? 0) === 0
                              ? "Scan the serial or IMEI"
                              : "Scan another (" + (l.serials?.length ?? 0) + " so far)"}
                          </button>
                        </div>
                      ) : (
                      <div className="mt-2 flex items-center gap-1.5">
                        <button
                          onClick={() => bumpQuantity(key, -1)}
                          aria-label="One less"
                          className="w-9 h-9 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 active:scale-90"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        {/* A keypad where the shop sells by measure, a stepper
                            where it does not — the trait decides, and the
                            server enforces the same rule. */}
                        <Input
                          value={l.quantity}
                          onChange={(e) => setQuantity(key, e.target.value)}
                          inputMode={state.canSellFractional ? "decimal" : "numeric"}
                          aria-label={`Quantity of ${l.product.name}${l.variant ? " " + l.variant.label : ""}`}
                          className="h-9 w-16 rounded-lg text-center tabular-nums px-1"
                        />
                        <span className="text-[10px] text-gray-400 w-8">{l.product.unit === "piece" ? "" : l.product.unit}</span>
                        <button
                          onClick={() => bumpQuantity(key, 1)}
                          aria-label="One more"
                          className="w-9 h-9 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 active:scale-90"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>

                        {state.canOverridePrice && (
                          <Input
                            value={l.unitPriceOverride ?? ""}
                            onChange={(e) => setOverride(key, e.target.value)}
                            inputMode="decimal"
                            placeholder="price"
                            aria-label={`Price for ${l.product.name}${l.variant ? " " + l.variant.label : ""}`}
                            className="h-9 flex-1 min-w-0 rounded-lg text-center tabular-nums px-1 text-xs"
                          />
                        )}
                      </div>
                      )}
                    </div>
                    )
                  })}
                </div>
              )}

              {cart.length > 0 && (
                <div className="border-t border-gray-100 dark:border-gray-700 p-3 space-y-1.5 bg-gray-50/60 dark:bg-gray-800/40">
                  <Row label="Subtotal" value={sh(subtotal)} />
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="sale-discount" className="text-[11px] text-gray-500 dark:text-gray-400">Discount</label>
                    <Input
                      id="sale-discount"
                      value={saleDiscount}
                      onChange={(e) => setSaleDiscount(e.target.value.replace(/[^\d.]/g, ""))}
                      inputMode="decimal"
                      placeholder="0"
                      className="h-8 w-24 rounded-lg text-right tabular-nums text-xs"
                    />
                  </div>
                  {pointsDiscount > 0 && (
                    <Row
                      label={spendablePoints + " point" + (spendablePoints === 1 ? "" : "s")}
                      value={"-" + sh(pointsDiscount)}
                    />
                  )}
                  {taxRate > 0 && (
                    <Row
                      label={`VAT ${taxRate}%${taxInclusive ? " (included)" : ""}`}
                      value={sh(tax)}
                    />
                  )}
                  {roundingOff > 0 && (
                    <Row label="Rounded down" value={"-" + sh(roundingOff)} />
                  )}
                  <div className="flex items-center justify-between pt-1.5 border-t border-gray-200 dark:border-gray-700">
                    <span className="text-xs font-bold text-gray-900 dark:text-white">Total</span>
                    <span className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">KSh {sh(total)}</span>
                  </div>
                  <Button
                    onClick={() => {
                      if (unscanned.length > 0) {
                        setError(unscanned[0].product.name + " is tracked individually — scan each unit before taking payment.")
                        return
                      }
                      setView("pay"); setError("")
                    }}
                    disabled={total <= 0 || unscanned.length > 0}
                    className="w-full h-12 rounded-xl font-semibold mt-1"
                  >
                    {unscanned.length > 0
                      ? "Scan " + unscanned[0].product.name + " first"
                      : "Take payment"}
                    {unscanned.length === 0 && <ArrowRight className="w-4 h-4 ml-1" />}
                  </Button>
                  <Button variant="outline" onClick={parkSale} disabled={busy || Object.values(prompts).some(prompt => prompt.state === "sending")} className="lg:hidden w-full h-12 rounded-xl gap-2"><Clock className="h-4 w-4" />Park sale & start next</Button>
                  <button onClick={clearSale} className="w-full py-2.5 text-[11px] text-gray-400 underline">
                    Cancel this sale
                  </button>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>

      {/* ---- sticky basket bar (phones only) ------------------------------ */}
      {itemCount > 0 && !cartOpen && view === "sell" && (
        <div className="lg:hidden fixed bottom-16 inset-x-3 z-30 flex gap-2 rounded-2xl border border-border bg-background p-2 shadow-lg">
        <button
          type="button"
          aria-label={`Open basket, ${itemCount} items, KSh ${sh(total)}`}
          onClick={() => setCartOpen(true)}
          className="min-w-0 flex-1 rounded-xl bg-primary text-primary-foreground flex flex-col items-start justify-center px-3 py-2 active:scale-[0.98] transition-transform"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <ShoppingCart className="w-4 h-4" />
            {itemCount} {itemCount === 1 ? "item" : "items"}
          </span>
          <span className="text-base font-bold tabular-nums">KSh {sh(total)}</span>
        </button>
        <button type="button" onClick={parkSale} disabled={busy || Object.values(prompts).some(prompt => prompt.state === "sending")} className="flex w-32 shrink-0 items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-2 py-2 text-left text-xs font-semibold text-primary disabled:opacity-50"><Clock className="h-4 w-4 shrink-0" /><span>Park sale<br />&amp; start next</span></button>
        </div>
      )}

      {/* ---- which size? ---------------------------------------------------
          Only ever opened by tapping a product that has options. A scan that
          matched a size's own barcode skips this entirely, which is the whole
          reason each size can carry its own barcode. */}
      {pickVariantFor && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center lg:justify-center bg-black/40">
          <div className="w-full lg:max-w-md bg-white dark:bg-gray-900 rounded-t-2xl lg:rounded-2xl max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700 px-3 py-2.5 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{pickVariantFor.name}</p>
                <p className="text-[11px] text-gray-500">Which one?</p>
              </div>
              <button
                onClick={() => setPickVariantFor(null)}
                aria-label="Close"
                className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 active:scale-90 flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-3 grid grid-cols-2 min-[460px]:grid-cols-3 gap-2">
              {pickVariantFor.variants.map((v) => {
                const none = v.stock <= 0
                return (
                  <button
                    key={v.id}
                    onClick={() => addProduct(pickVariantFor, v)}
                    className={`min-h-[72px] p-2.5 rounded-xl border text-left active:scale-[0.98] transition-all ${
                      none
                        ? "border-dashed border-gray-300 dark:border-gray-600 bg-muted/30"
                        : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-primary/50"
                    }`}
                  >
                    <p className="text-sm font-bold text-gray-900 dark:text-white leading-tight">{v.label}</p>
                    <p className="mt-0.5 text-xs font-semibold text-gray-900 dark:text-white tabular-nums">
                      {shShort(v.price)}
                    </p>
                    {/* Out-of-stock sizes stay tappable. A shopkeeper holding
                        the thing in their hand must be able to sell it; the
                        negative-stock policy decides what happens, not this
                        button. */}
                    <p className={`text-[10px] tabular-nums ${none ? "text-red-500 font-semibold" : "text-gray-400"}`}>
                      {none ? "none left" : `${shShort(v.stock)} left`}
                    </p>
                  </button>
                )
              })}
            </div>
            {pickVariantFor.variants.length === 0 && (
              <p className="px-3 pb-4 text-xs text-gray-500">
                This product is marked as having options but none are set up yet. Add them under
                Stock before selling it.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ---- scanning serials --------------------------------------------- */}
      {scanSerialsFor && (() => {
        const line = cart.find((l) => lineKey(l.product.id, l.variant?.id ?? null) === scanSerialsFor)
        if (!line) return null
        const have = line.serials ?? []
        return (
          <div className="fixed inset-0 z-50 flex items-end lg:items-center lg:justify-center bg-black/40">
            <div className="w-full lg:max-w-md bg-white dark:bg-gray-900 rounded-t-2xl lg:rounded-2xl max-h-[88vh] overflow-y-auto">
              <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700 px-3 py-2.5 flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{line.product.name}</p>
                  <p className="text-[11px] text-gray-500">
                    {have.length === 0 ? "Scan the unit you are handing over" : have.length + " scanned"}
                  </p>
                </div>
                <button
                  onClick={() => setScanSerialsFor(null)}
                  aria-label="Done scanning"
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 active:scale-90 flex-shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-3 space-y-3">
                {error && <ErrorNote>{error}</ErrorNote>}

                <Input
                  value={serialDraft}
                  onChange={(e) => setSerialDraft(e.target.value)}
                  onKeyDown={(e) => {
                    // A barcode scanner ends with Enter, so a cashier can
                    // scan one box after another without touching anything.
                    if (e.key === "Enter") addSerial(scanSerialsFor, serialDraft)
                  }}
                  placeholder="Scan or type the serial / IMEI"
                  className="h-12 rounded-xl text-base font-mono"
                  autoComplete="off"
                  autoFocus
                />
                <Button
                  onClick={() => addSerial(scanSerialsFor, serialDraft)}
                  disabled={!serialDraft.trim()}
                  className="w-full h-11 rounded-xl text-sm"
                >
                  Add this one
                </Button>

                {have.length > 0 && (
                  <div className="space-y-1.5">
                    {have.map((sn, i) => (
                      <div key={sn} className="flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 p-2.5">
                        <span className="w-5 text-[10px] font-bold text-gray-300 dark:text-gray-600 tabular-nums">{i + 1}</span>
                        <span className="min-w-0 flex-1 text-xs font-mono text-gray-900 dark:text-white truncate">{sn}</span>
                        <button
                          onClick={() => removeSerial(scanSerialsFor, sn)}
                          aria-label={"Remove " + sn}
                          className="-m-1 w-9 h-9 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 active:scale-90 flex-shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-[10px] text-gray-400 leading-snug">
                  The quantity on this line follows what you scan — one unit per serial. Whichever
                  units you scan are the ones that leave the shelf, and the receipt records them.
                </p>

                <Button
                  onClick={() => setScanSerialsFor(null)}
                  variant="outline"
                  className="w-full h-11 rounded-xl text-sm"
                >
                  Done
                </Button>
              </div>
            </div>
          </div>
        )
      })()}

      <Dialog open={receiptCustomerOpen} onOpenChange={open => { if (!busy) { setReceiptCustomerOpen(open); if (!open) receiptCustomerRequest.current++ } }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader><DialogTitle>Add customer points before the receipt?</DialogTitle><DialogDescription>Ask for the customer's registered phone number. Points are added when this sale is recorded, and the receipt shows points earned and their updated balance.</DialogDescription></DialogHeader>
          {spendablePoints > 0 && member ? <p className="rounded-xl bg-muted p-3 text-sm">This sale redeems points from {member.name}. Keep this account attached to preserve the agreed payment total.</p> : <form onSubmit={event => { event.preventDefault(); void findReceiptCustomer() }} className="space-y-2">
            <label htmlFor="receipt-customer-phone" className="text-sm font-medium">Customer phone number</label>
            <div className="flex gap-2"><Input id="receipt-customer-phone" inputMode="tel" autoComplete="tel" placeholder="0712 345 678 or +254712345678" value={receiptCustomerPhone} onChange={event => { receiptCustomerRequest.current++; setReceiptCustomerBusy(false); setReceiptCustomerPhone(event.target.value); setReceiptCustomer(null); setReceiptCustomerError("") }} /><Button type="submit" disabled={receiptCustomerBusy || busy}>{receiptCustomerBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Find account"}</Button></div>
          </form>}
          {receiptCustomerError && <p role="alert" className="text-sm text-red-600">{receiptCustomerError}</p>}
          {receiptCustomer && <div className="rounded-xl border border-primary/20 bg-primary/5 p-4"><p className="text-sm font-semibold">{receiptCustomer.name}</p><p className="mt-1 text-xs text-muted-foreground">{receiptCustomer.phone}</p><p className="mt-3 text-sm">Current balance: <strong>{receiptCustomer.pointsBalance} points</strong></p><p className="mt-1 text-xs text-muted-foreground">Points for this purchase and the new total will appear on the final receipt.</p></div>}
          <Button disabled={!receiptCustomer || receiptCustomerBusy || busy} onClick={() => { if (receiptCustomer) { setMember(receiptCustomer); void takePayment(true, receiptCustomer) } }}>{busy ? "Recording…" : "Add points & finish sale"}</Button>
          <Button variant="outline" disabled={busy || spendablePoints > 0} onClick={() => { setMember(null); void takePayment(true, null) }}>Skip & finish without points</Button>
          <button type="button" onClick={() => setReceiptCustomerOpen(false)} disabled={busy} className="py-2 text-xs font-medium text-muted-foreground">Back to checkout</button>
        </DialogContent>
      </Dialog>

      {/* ---- payment sheet ------------------------------------------------ */}
      {view === "pay" && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center lg:justify-center bg-black/40">
          <div className="w-full lg:max-w-md bg-white dark:bg-gray-900 rounded-t-2xl lg:rounded-2xl max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700 px-3 py-2.5 flex items-center gap-2">
              <button
                onClick={() => { setView("sell"); setError("") }}
                aria-label="Back to the sale"
                className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-500 active:scale-90"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-gray-500 dark:text-gray-400">Amount due</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white tabular-nums leading-none">KSh {sh(total)}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 border-b border-border p-3">
              <Button variant="outline" className="w-full" onClick={parkSale} disabled={busy || Object.values(prompts).some(prompt => prompt.state === "sending")}><Clock className="mr-2 h-4 w-4" />Park sale & start next</Button>
              {payments.some(payment => payment.stkCheckoutId && !payment.mpesaTransactionId) && <Button variant="outline" className="w-full" onClick={() => void checkCurrentPayment()} disabled={checkingParked || busy}>{checkingParked ? "Checking…" : "Check this sale’s payment"}</Button>}
              {manualCompletion && <p className="text-xs text-muted-foreground">Resumed sale: review the payment and click Record the sale when ready.</p>}
            </div>
            <div className="p-3 space-y-3">
              {error && <ErrorNote>{error}</ErrorNote>}

              {payments.map((p, idx) => {
                const Icon = METHOD_META[p.method].icon
                return (
                  <div key={idx} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                        {payments.length > 1 ? `Payment ${idx + 1}` : "How are they paying?"}
                      </p>
                      {payments.length > 1 && (
                        <button
                          onClick={() => setPayments((prev) => prev.filter((_, i) => i !== idx))}
                          aria-label="Remove this payment"
                          className="text-gray-300 hover:text-red-500 active:scale-90"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="mt-2 grid grid-cols-5 gap-1.5">
                      {(Object.keys(METHOD_META) as PaymentDraft["method"][]).map((m) => {
                        const MIcon = METHOD_META[m].icon
                        const on = p.method === m
                        return (
                          <button
                            key={m}
                            onClick={() => setPayments((prev) => prev.map((q, i) => (i === idx ? { ...q, method: m, mpesaTransactionId: undefined, stkCheckoutId: undefined, stkPhone: undefined } : q)))}
                            aria-pressed={on}
                            className={`h-14 rounded-lg border flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-all ${
                              on ? "border-primary bg-primary/5 text-primary" : "border-gray-200 dark:border-gray-700 text-gray-500"
                            }`}
                          >
                            <MIcon className="w-4 h-4" />
                            <span className="text-[9px] font-semibold">{METHOD_META[m].label}</span>
                          </button>
                        )
                      })}
                    </div>

                    <div className="mt-2 flex items-center gap-2">
                      <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <Input
                        value={p.amount}
                        onChange={(e) => setPayments((prev) => prev.map((q, i) =>
                          i === idx ? { ...q, amount: e.target.value.replace(/[^\d.]/g, ""), mpesaTransactionId: undefined, stkCheckoutId: undefined, stkPhone: undefined } : q))}
                        inputMode="decimal"
                        placeholder="Amount"
                        className="h-11 rounded-xl tabular-nums text-base"
                      />
                    </div>

                    {p.method === "CASH" && (
                      <>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {/* Exact first, because "they gave me the exact
                              money" is the commonest case and deserves one
                              tap rather than typing. */}
                          <button
                            onClick={() => setPayments((prev) => prev.map((q, i) => (i === idx ? { ...q, amount: String(total) } : q)))}
                            className="h-9 px-3 rounded-lg bg-gray-100 dark:bg-gray-800 text-[11px] font-semibold text-gray-700 dark:text-gray-200 active:scale-95"
                          >
                            Exact
                          </button>
                          {quickCash(total).map((d) => (
                            <button
                              key={d}
                              onClick={() => setPayments((prev) => prev.map((q, i) => (i === idx ? { ...q, amount: String(d) } : q)))}
                              className="h-9 px-3 rounded-lg bg-gray-100 dark:bg-gray-800 text-[11px] font-semibold text-gray-700 dark:text-gray-200 tabular-nums active:scale-95"
                            >
                              {shShort(d)}
                            </button>
                          ))}
                        </div>
                      </>
                    )}

                    {(p.method === "MPESA" || p.method === "CARD" || p.method === "BANK") && (
                      <Input
                        value={p.reference}
                        onChange={(e) => setPayments((prev) => prev.map((q, i) => (i === idx ? { ...q, reference: e.target.value } : q)))}
                        placeholder={p.method === "MPESA" ? "M-Pesa code (e.g. QGR7XK2LMN)" : "Reference"}
                        className="mt-2 h-10 rounded-xl text-xs"
                      />
                    )}

                    {p.method === "MPESA" && (() => {
                      const prompt = prompts[idx]
                      const canPrompt = mpesa && mpesa.promptEnabled && !mpesa.promptBlockedReason
                      return (
                        <div className="mt-2 space-y-2">
                          {mpesa?.env === "sandbox" && <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">TEST MODE: sandbox confirmations do not represent real money. Switch the merchant connection to production before live trading.</p>}
                          <MpesaPaymentPicker amount={Number(p.amount || 0) || shortBy || total} onSelect={row => { setPayments(current => current.map((entry, index) => index === idx ? { ...entry, amount: String(row.amount), reference: row.receipt || "", mpesaTransactionId: row.id, stkCheckoutId: undefined, stkPhone: undefined } : entry)); setError("") }} />
                          {p.mpesaTransactionId && <p className="rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/30">Received payment selected: {p.reference}. It will be matched when this sale is recorded.</p>}
                          {/* The number on the wall, with the amount already
                              worked out. This is the part that helps every
                              shop, prompts or not. */}
                          {mpesa?.shortcode && (
                            <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-900/15 p-2.5">
                              <p className="text-[10px] uppercase tracking-wide text-emerald-800/70 dark:text-emerald-400/70">
                                Tell the customer
                              </p>
                              <p className="mt-0.5 text-xs font-semibold text-emerald-900 dark:text-emerald-300 leading-snug">
                                {mpesa.shortcodeType === "TILL" ? "Buy Goods till " : "Paybill "}
                                <span className="font-mono text-sm">{mpesa.shortcode}</span>
                                {mpesa.shortcodeType !== "TILL" && mpesa.accountRef && (
                                  <>
                                    , account <span className="font-mono text-sm">{mpesa.accountRef}</span>
                                  </>
                                )}
                                , KSh <span className="font-mono text-sm">{sh(Number(p.amount || 0) || shortBy || total)}</span>
                              </p>
                            </div>
                          )}

                          {canPrompt && !p.mpesaTransactionId && prompt?.state !== "paid" && (
                            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-2.5">
                              <label className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                                Or send the prompt to their phone
                              </label>
                              <div className="mt-1 flex gap-2">
                                <Input
                                  value={promptPhone}
                                  onChange={(e) => setPromptPhone(e.target.value.replace(/[^\d+]/g, "").slice(0, 13))}
                                  inputMode="tel"
                                  autoComplete="off"
                                  placeholder="07xx xxx xxx"
                                  className="h-11 rounded-xl text-sm tabular-nums"
                                />
                                <Button
                                  onClick={() => void sendPrompt(idx)}
                                  disabled={promptPhone.replace(/\D/g, "").length < 9 || prompt?.state === "sending" || prompt?.state === "waiting" || Boolean(p.stkCheckoutId && prompt?.state !== "failed")}
                                  className="h-11 rounded-xl text-xs whitespace-nowrap"
                                >
                                  {prompt?.state === "sending" || prompt?.state === "waiting"
                                    ? <Loader2 className="w-4 h-4 animate-spin" />
                                    : prompt?.state === "failed" ? "Try again" : "Send"}
                                </Button>
                              </div>

                              {prompt?.state === "waiting" && (
                                <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-gray-600 dark:text-gray-300 leading-snug">
                                  <Loader2 className="w-3 h-3 mt-0.5 flex-shrink-0 animate-spin" />
                                  Sent. Ask them to check their phone and enter their M-Pesa PIN.
                                </p>
                              )}
                              {prompt?.state === "failed" && (
                                <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-red-700 dark:text-red-400 leading-snug">
                                  <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                  {prompt.message}
                                </p>
                              )}
                            </div>
                          )}

                          {(prompt?.state === "paid" || p.mpesaTransactionId) ? (
                            /* The one case where the till genuinely knows.
                               Safaricom answered against the request we sent,
                               so this may say confirmed where nothing else in
                               the till is allowed to. */
                            <p className="flex items-start gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 leading-snug">
                              <Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" strokeWidth={3} />
                              Payment received and matched to this checkout{p.reference ? " (" + p.reference + ")" : ""}.
                            </p>
                          ) : (
                            /* Said plainly. Nothing here talks to Safaricom: the
                               cashier is reading a code off the customer's phone and
                               recording it. Implying the till confirmed the payment
                               would be a lie with money attached. */
                            <p className="flex items-start gap-1.5 text-[10px] text-gray-500 dark:text-gray-400 leading-snug">
                              <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                              A code you type in is recorded, not checked. Confirm it on your own
                              phone before handing the goods over.
                            </p>
                          )}
                        </div>
                      )
                    })()}

                    {p.method === "CREDIT" && (
                      <p className="mt-1.5 text-[10px] text-gray-500 dark:text-gray-400 leading-snug">
                        Recorded as taken on your own book. Saji does not chase it or guarantee it.
                      </p>
                    )}
                  </div>
                )
              })}

              {payments.length < 3 && (
                <button
                  onClick={() => setPayments((prev) => [...prev, { draftKey: newKey(), method: "MPESA", amount: "", reference: "" }])}
                  className="w-full h-10 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 text-[11px] font-semibold text-gray-500 active:scale-[0.99]"
                >
                  + Split across another payment
                </button>
              )}

              {needsRegister && (
                <div className="rounded-xl border border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/15 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <FileLock className="w-4 h-4 text-sky-700 dark:text-sky-400 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-900 dark:text-white">
                        This goes in your controlled register
                      </p>
                      <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-snug mt-0.5">
                        Recorded against this sale with your name and the time. It cannot be
                        edited afterwards.
                      </p>
                    </div>
                  </div>
                  <Input
                    value={buyer.name}
                    onChange={(e) => { setBuyer((b) => ({ ...b, name: e.target.value })); setError("") }}
                    placeholder="Who is taking it (full name)"
                    className="h-11 rounded-xl text-sm"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={buyer.idNumber}
                      onChange={(e) => setBuyer((b) => ({ ...b, idNumber: e.target.value }))}
                      placeholder="ID number"
                      className="h-10 rounded-xl text-xs"
                    />
                    <Input
                      value={buyer.phone}
                      onChange={(e) => setBuyer((b) => ({ ...b, phone: e.target.value }))}
                      placeholder="Phone"
                      className="h-10 rounded-xl text-xs"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={buyer.prescriberName}
                      onChange={(e) => setBuyer((b) => ({ ...b, prescriberName: e.target.value }))}
                      placeholder="Prescriber (if any)"
                      className="h-10 rounded-xl text-xs"
                    />
                    <Input
                      value={buyer.prescriptionRef}
                      onChange={(e) => setBuyer((b) => ({ ...b, prescriptionRef: e.target.value }))}
                      placeholder="Prescription no."
                      className="h-10 rounded-xl text-xs"
                    />
                  </div>
                  {/* Said plainly, because the opposite claim is the one a
                      shopkeeper would otherwise assume. */}
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-snug">
                    Saji keeps this record for you. It does not certify that your register meets
                    the Pharmacy and Poisons Board or Veterinary Medicines Directorate rules —
                    check what yours requires.
                  </p>
                </div>
              )}

              {needsAgeCheck && (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={ageConfirmed}
                  onClick={() => { setAgeConfirmed((v) => !v); setError("") }}
                  className={`w-full flex items-start gap-2.5 p-3 rounded-xl border text-left active:scale-[0.99] transition-all ${
                    ageConfirmed
                      ? "border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20"
                      : "border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/15"
                  }`}
                >
                  <span className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 ${
                    ageConfirmed ? "bg-emerald-500 text-white" : "border border-amber-400 bg-white dark:bg-gray-800"
                  }`}>
                    {ageConfirmed && <Check className="w-3 h-3" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-gray-900 dark:text-white">
                      I have checked this buyer is old enough
                    </span>
                    <span className="block text-[11px] text-gray-600 dark:text-gray-400 leading-snug mt-0.5">
                      This basket has age-restricted goods. The confirmation is recorded against
                      the sale with your name and the time.
                    </span>
                  </span>
                </button>
              )}

              {/* --- points -----------------------------------------------
                  Only where the shop runs a scheme. Searched by phone,
                  because that is the one thing a customer reliably knows
                  about their own membership. */}
              {loyalty?.enabled && (
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-2.5">
                  {member ? (
                    <>
                      <div className="flex items-center gap-2">
                        <Star className="w-4 h-4 text-amber-500 flex-shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-semibold text-gray-900 dark:text-white truncate">
                            {member.name}
                          </span>
                          <span className="block text-[11px] text-gray-500 tabular-nums">
                            {member.pointsBalance.toLocaleString("en-KE")} points
                            {" · worth KSh "}{sh(member.pointsValue)}
                          </span>
                        </span>
                        <button
                          onClick={() => { setMember(null); setRedeem(""); setMemberQuery("") }}
                          aria-label="Remove the customer from this sale"
                          className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 active:scale-95 flex-shrink-0"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {member.pointsBalance >= (loyalty.minRedeem || 0) && (
                        <div className="mt-2">
                          <label className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                            Spend points on this sale
                          </label>
                          <div className="mt-1 flex gap-2">
                            <Input
                              value={redeem}
                              onChange={(e) => setRedeem(e.target.value.replace(/\D/g, ""))}
                              inputMode="numeric"
                              placeholder={"0 of " + member.pointsBalance}
                              className="h-11 rounded-xl text-sm tabular-nums"
                            />
                            <button
                              onClick={() => {
                                // The most they can usefully spend: never
                                // more than they hold, and never more than
                                // the bill, because points that paid for
                                // nothing are points thrown away. Measured
                                // against the bill BEFORE points come off,
                                // which is what they are being spent on.
                                const worthPerPoint = loyalty.shillingsPerPoint || 1
                                const capByBill = Math.floor(headroom / worthPerPoint)
                                setRedeem(String(Math.max(0, Math.min(member.pointsBalance, capByBill))))
                              }}
                              className="h-11 px-3 rounded-xl border border-gray-200 dark:border-gray-700 text-[11px] font-semibold text-gray-600 dark:text-gray-300 active:scale-95 whitespace-nowrap"
                            >
                              Use max
                            </button>
                          </div>
                          {Number(redeem || 0) > 0 && (
                            <p className="mt-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                              Takes KSh {sh(Number(redeem) * (loyalty.shillingsPerPoint || 1))} off this sale.
                            </p>
                          )}
                          <p className="mt-1 text-[11px] text-gray-400 leading-snug">
                            {loyalty.minRedeem > 0
                              ? "Spent " + loyalty.minRedeem + " at a time or more."
                              : "Any amount."}
                          </p>
                        </div>
                      )}
                    </>
                  ) : joinOpen ? (
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                        Sign them up for points
                      </p>
                      <Input
                        value={joinName}
                        onChange={(e) => setJoinName(e.target.value)}
                        placeholder="Their name"
                        className="h-11 rounded-xl text-sm"
                      />
                      <p className="text-[11px] text-gray-500 tabular-nums">On {memberQuery}</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setJoinOpen(false); setJoinName("") }}
                          className="h-11 px-3 rounded-xl border border-gray-200 dark:border-gray-700 text-[11px] font-semibold text-gray-500 active:scale-95"
                        >
                          Cancel
                        </button>
                        <Button
                          onClick={() => void joinMember()}
                          disabled={busy || joinName.trim().length < 2}
                          className="flex-1 h-11 rounded-xl text-xs"
                        >
                          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sign up and add"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <label className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                        Points card
                      </label>
                      <div className="mt-1 flex gap-2">
                        <Input
                          value={memberQuery}
                          onChange={(e) => { setMemberQuery(e.target.value); void lookupMember(e.target.value) }}
                          inputMode="tel"
                          placeholder="07xx xxx xxx or +2547xx xxx xxx"
                          className="h-11 rounded-xl text-sm tabular-nums"
                        />
                        {memberSearching && <Loader2 className="w-4 h-4 animate-spin text-gray-400 self-center" />}
                      </div>
                      {memberHits.length > 0 && (
                        <div className="mt-1.5 space-y-1">
                          {memberHits.map((h) => (
                            <button
                              key={h.id}
                              onClick={() => { setMember(h); setMemberHits([]) }}
                              className="w-full flex items-center gap-2 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-left active:scale-[0.99]"
                            >
                              <Star className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                              <span className="min-w-0 flex-1 text-xs text-gray-900 dark:text-white truncate">{h.name}</span>
                              <span className="text-[11px] text-gray-400 tabular-nums flex-shrink-0">{h.pointsBalance} pts</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {memberQuery.replace(/\D/g, "").length >= 9 && memberHits.length === 0 && !memberSearching && (
                        <button
                          onClick={() => setJoinOpen(true)}
                          className="mt-1.5 w-full h-11 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 text-[11px] font-semibold text-gray-500 active:scale-[0.99]"
                        >
                          Not a member yet. Sign them up?
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}

              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Customer name (optional)"
                className="h-10 rounded-xl text-xs"
              />

              {canDeposit && (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={asDeposit}
                  onClick={() => { setAsDeposit((v) => !v); setError("") }}
                  className={`w-full flex items-start gap-2.5 p-3 rounded-xl border text-left active:scale-[0.99] transition-all ${
                    asDeposit
                      ? "border-primary bg-primary/5"
                      : "border-gray-200 dark:border-gray-700"
                  }`}
                >
                  <span className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 ${
                    asDeposit ? "bg-primary text-primary-foreground" : "border border-gray-300 dark:border-gray-600"
                  }`}>
                    {asDeposit && <Check className="w-3 h-3" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-gray-900 dark:text-white">
                      Take a deposit, deliver later
                    </span>
                    <span className="block text-[11px] text-gray-600 dark:text-gray-400 leading-snug mt-0.5">
                      The order stays open with the balance owed against it. Nothing comes off
                      your stock until you hand it over.
                    </span>
                  </span>
                </button>
              )}

              {asDeposit && canDeposit && (
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  aria-label="When the customer should expect it"
                  className="h-10 rounded-xl text-xs"
                />
              )}

              <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-3 space-y-1">
                {pointsDiscount > 0 && (
                  <>
                    <Row label="Before points" value={sh(headroom)} />
                    <Row
                      label={spendablePoints + " point" + (spendablePoints === 1 ? "" : "s") + " spent"}
                      value={"-" + sh(pointsDiscount)}
                    />
                  </>
                )}
                {roundingOff > 0 && <Row label="Rounded down" value={"-" + sh(roundingOff)} />}
                <Row label="Total" value={sh(total)} />
                <Row label="Paid" value={sh(paid)} />
                {asDeposit && canDeposit && paid > 0 ? (
                  <div className="flex items-center justify-between pt-1 border-t border-gray-200 dark:border-gray-700">
                    <span className="text-xs font-bold text-primary">Balance owed</span>
                    <span className="text-lg font-bold text-primary tabular-nums">{sh(depositBalance)}</span>
                  </div>
                ) : shortBy > 0 ? (
                  <div className="flex items-center justify-between pt-1 border-t border-gray-200 dark:border-gray-700">
                    <span className="text-xs font-bold text-amber-700 dark:text-amber-400">Short by</span>
                    <span className="text-base font-bold text-amber-700 dark:text-amber-400 tabular-nums">{sh(shortBy)}</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between pt-1 border-t border-gray-200 dark:border-gray-700">
                    <span className="text-xs font-bold text-gray-900 dark:text-white">Change</span>
                    <span className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">{sh(change)}</span>
                  </div>
                )}
                {!hasCash && paid > total && (
                  <p className="text-[10px] text-gray-500 leading-snug pt-0.5">
                    No cash in this payment, so there is no change to give.
                  </p>
                )}
              </div>

              <Button
                onClick={() => void takePayment()}
                disabled={!state.shift || busy || (shortBy > 0 && !(asDeposit && canDeposit && paid > 0)) || cart.length === 0 || (needsAgeCheck && !ageConfirmed)
                  || (needsRegister && buyer.name.trim().length < 2)}
                className="w-full h-14 rounded-xl text-base font-bold"
              >
                {busy
                  ? <Loader2 className="w-5 h-5 animate-spin" />
                  : asDeposit && canDeposit && paid > 0
                    ? `Take ${shShort(paid)} as a deposit`
                  : shortBy > 0 ? `Short by ${shShort(shortBy)}`
                  : needsRegister && buyer.name.trim().length < 2 ? "Record who it is going to"
                  : needsAgeCheck && !ageConfirmed ? "Confirm the age check first"
                  : "Record the sale"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function newKey(): string {
  // randomUUID is unavailable on http:// origins in some browsers, and this
  // key is the only thing standing between a retry and a double charge, so it
  // falls back rather than throwing.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID()
  return `k-${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-xs text-gray-900 dark:text-white tabular-nums">{value}</span>
    </div>
  )
}

function ShiftStat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`text-xs font-bold tabular-nums ${
        highlight
          ? value < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"
          : "text-gray-900 dark:text-white"
      }`}>
        {shShort(value)}
      </p>
    </div>
  )
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2.5 flex items-start gap-2">
      <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
      <p className="text-xs text-red-700 dark:text-red-300 leading-snug">{children}</p>
    </div>
  )
}

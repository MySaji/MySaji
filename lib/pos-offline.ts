/**
 * The till's local store: a catalogue snapshot and a durable outbox.
 *
 * Raw IndexedDB, no library. The surface used here is small, a dependency
 * on a counter machine is a thing that can fail to load, and the one
 * property that matters — a sale survives the browser being closed — is
 * exactly what IndexedDB gives for free.
 *
 * ---------------------------------------------------------------------------
 * WHAT "OFFLINE" MEANS HERE, PRECISELY
 * ---------------------------------------------------------------------------
 * Two different failures get called "offline" and only one of them is solved
 * here. Being clear about which matters more than the feature itself,
 * because a shopkeeper who believes the wrong one will lose a morning.
 *
 *   1. THE LINE DROPS WHILE THE TILL IS OPEN.  Handled. The catalogue is
 *      already local, sales queue, and the cashier keeps serving. This is
 *      the dominant failure in practice.
 *
 *   2. THE TILL IS STARTED COLD WITH NO CONNECTION.  Not handled. Loading
 *      the page still needs the network, because serving the application
 *      shell from a cache means eventually serving STALE CODE to a till —
 *      and stale code at a till prices things wrong. That needs versioned
 *      shell caching with a careful update path, and it is its own piece of
 *      work.
 *
 * What is guaranteed in both cases is the thing that actually matters: a
 * sale that was rung up is never lost. It sits in this outbox until the
 * server has confirmed it, surviving a reload, a crash and a flat battery.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS SAFE TO REPLAY
 * ---------------------------------------------------------------------------
 * Every queued sale carries the idempotency key it was created with, and
 * recordPosSale treats a repeat of that key as the original sale rather than
 * a new one. So replaying is safe no matter how badly the retry goes — a
 * response lost on the way back, a tab closed mid-send, the same queue
 * replayed from two tabs at once.
 */

const DB_NAME = "saji-till"
const DB_VERSION = 1
const STORE_CATALOGUE = "catalogue"
const STORE_OUTBOX = "outbox"
const STORE_META = "meta"

export type QueuedSaleStatus = "pending" | "sending" | "failed"

export type QueuedSale = {
  /** The idempotency key. Also the primary key here, so a double-enqueue
   *  of the same sale collapses rather than duplicating. */
  key: string
  /** Exactly the payload recordPosSale expects, stored whole. */
  payload: unknown
  /** For showing the cashier what is waiting without unpacking the payload. */
  summary: { total: number; itemCount: number; occurredAt: string }
  status: QueuedSaleStatus
  attempts: number
  /** Set when the server REFUSED it — a business error, not a network one. */
  lastError: string | null
  createdAt: string
}

export type CachedVariant = {
  id: string
  label: string
  sku: string | null
  barcode: string | null
  price: number
  stock: number
}

/**
 * Deliberately the same shape as TillProduct in lib/actions/pos-sales.ts.
 *
 * The till renders cached products through exactly the same component as
 * live ones, so the two types have to stay assignable. A cached product
 * missing its variants would mean a clothes shop losing its sizes the moment
 * the line drops — which is the moment it can least afford to.
 */
export type CachedProduct = {
  id: string
  name: string
  sku: string
  barcode: string | null
  unit: string
  price: number
  listPrice: number
  stock: number
  categoryName: string | null
  variants: CachedVariant[]
  matchedVariantId: string | null
}

/** IndexedDB is absent in SSR, in some private modes, and can be blocked. */
export function isOfflineStoreAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined"
}

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (!isOfflineStoreAvailable()) return Promise.reject(new Error("IndexedDB unavailable"))
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_CATALOGUE)) db.createObjectStore(STORE_CATALOGUE, { keyPath: "id" })
      if (!db.objectStoreNames.contains(STORE_OUTBOX)) db.createObjectStore(STORE_OUTBOX, { keyPath: "key" })
      if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error("could not open the till's local store"))
    // A second tab holding an old version open. Rejecting is right: the
    // caller falls back to online-only rather than hanging forever.
    req.onblocked = () => reject(new Error("the till's local store is in use by another tab"))
  })
  return dbPromise
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode)
        const req = fn(t.objectStore(store))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

// ---------------------------------------------------------------------------
// The catalogue snapshot
// ---------------------------------------------------------------------------

/**
 * Replace the local catalogue wholesale.
 *
 * Replace, not merge: a product deleted on the server has to disappear here
 * too, and merging would leave it sellable forever on a till that had once
 * seen it.
 */
export async function cacheCatalogue(products: CachedProduct[]): Promise<void> {
  const db = await open()
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction([STORE_CATALOGUE, STORE_META], "readwrite")
    const store = t.objectStore(STORE_CATALOGUE)
    store.clear()
    for (const p of products) store.put(p)
    t.objectStore(STORE_META).put(new Date().toISOString(), "catalogueUpdatedAt")
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
  })
}

export async function readCatalogue(): Promise<{ products: CachedProduct[]; updatedAt: string | null }> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const t = db.transaction([STORE_CATALOGUE, STORE_META], "readonly")
    const all = t.objectStore(STORE_CATALOGUE).getAll()
    const when = t.objectStore(STORE_META).get("catalogueUpdatedAt")
    t.oncomplete = () => resolve({ products: all.result ?? [], updatedAt: when.result ?? null })
    t.onerror = () => reject(t.error)
  })
}

/**
 * Search the local catalogue the same way the server does.
 *
 * Barcode exact first, then name and SKU. Kept deliberately identical to
 * findTillProducts in lib/actions/pos-sales.ts: a scan that finds one thing
 * online and something else offline is the kind of difference that is
 * discovered at a counter with a queue waiting.
 */
export function searchCached(products: CachedProduct[], query: string, limit = 20): CachedProduct[] {
  const q = query.trim().toLowerCase()
  if (!q) return products.slice(0, limit).map((p) => ({ ...p, matchedVariantId: null }))

  const exact = products.filter((p) => p.barcode && p.barcode.toLowerCase() === q)
  if (exact.length > 0) return exact.slice(0, limit).map((p) => ({ ...p, matchedVariantId: null }))

  // A variant's own barcode, before any fuzzy match — same order as the
  // server, so a scan that rings up a size online rings up the same size
  // offline rather than opening a picker.
  for (const p of products) {
    const hit = p.variants.find((v) => v.barcode && v.barcode.toLowerCase() === q)
    if (hit) return [{ ...p, matchedVariantId: hit.id }]
  }

  return products
    .filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
    .slice(0, limit)
    .map((p) => ({ ...p, matchedVariantId: null }))
}

// ---------------------------------------------------------------------------
// The outbox
// ---------------------------------------------------------------------------

export async function enqueueSale(entry: Omit<QueuedSale, "status" | "attempts" | "lastError" | "createdAt">): Promise<void> {
  await tx(STORE_OUTBOX, "readwrite", (s) =>
    s.put({ ...entry, status: "pending" as const, attempts: 0, lastError: null, createdAt: new Date().toISOString() }),
  )
}

export async function readOutbox(): Promise<QueuedSale[]> {
  const all = await tx<QueuedSale[]>(STORE_OUTBOX, "readonly", (s) => s.getAll())
  // Oldest first: a day's sales should reach the server in the order they
  // happened, so receipt numbers come out in a sensible sequence.
  return (all ?? []).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/**
 * Read-modify-write on one outbox entry, inside a SINGLE transaction.
 *
 * The obvious version — read in one transaction, write in another — has a
 * race that produces the worst possible symptom. If the entry is dequeued
 * between the two (its send succeeded), the later write RESURRECTS it: a
 * row that has already been accepted by the server reappears stuck in
 * "sending", so the cashier sees a sale permanently waiting that the server
 * already has. Found by an offline test whose final check kept reporting an
 * entry the drain had just watched disappear.
 *
 * Returning undefined from `fn` leaves the row alone; a missing row is never
 * re-created.
 */
function mutateEntry(key: string, fn: (row: QueuedSale) => QueuedSale | undefined): Promise<void> {
  return open().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction(STORE_OUTBOX, "readwrite")
        const store = t.objectStore(STORE_OUTBOX)
        const get = store.get(key)
        get.onsuccess = () => {
          const row = get.result as QueuedSale | undefined
          if (!row) return // gone, and it stays gone
          const next = fn(row)
          if (next) store.put(next)
        }
        t.oncomplete = () => resolve()
        t.onerror = () => reject(t.error)
      }),
  )
}

export async function markSending(key: string): Promise<void> {
  await mutateEntry(key, (row) => ({ ...row, status: "sending", attempts: row.attempts + 1 }))
}

/**
 * The server accepted it. Only now is it safe to forget.
 *
 * Called for a REPLAY as well as a first acceptance — a replayed key comes
 * back successful, which is the whole point of the idempotency contract.
 */
export async function dequeueSale(key: string): Promise<void> {
  await tx(STORE_OUTBOX, "readwrite", (s) => s.delete(key))
}

/**
 * The server REFUSED it. Kept, not dropped.
 *
 * A refusal is a business answer — the product was deleted, a price rule
 * changed — and it means a sale the shop believes happened has not been
 * recorded. Throwing it away would hide money. It stays visible until a
 * person deals with it.
 */
export async function markFailed(key: string, error: string): Promise<void> {
  await mutateEntry(key, (row) => ({ ...row, status: "failed", lastError: error }))
}

/** Put a failed entry back in the queue, after the cause has been fixed. */
export async function retrySale(key: string): Promise<void> {
  await mutateEntry(key, (row) => ({ ...row, status: "pending", lastError: null }))
}

/**
 * Discard a failed entry for good.
 *
 * Deliberately separate from dequeueSale and never called automatically.
 * Abandoning a sale is a decision with money attached and belongs to a
 * person, not to a retry loop.
 */
export async function discardSale(key: string): Promise<void> {
  await tx(STORE_OUTBOX, "readwrite", (s) => s.delete(key))
}

export async function clearOfflineStore(): Promise<void> {
  const db = await open()
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction([STORE_CATALOGUE, STORE_OUTBOX, STORE_META], "readwrite")
    t.objectStore(STORE_CATALOGUE).clear()
    t.objectStore(STORE_OUTBOX).clear()
    t.objectStore(STORE_META).clear()
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
  })
}

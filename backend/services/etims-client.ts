import type { EtimsDocument } from "@/backend/domain/etims"

/**
 * Talking to KRA.
 *
 * WHY EVERY ADDRESS HERE IS CONFIGURATION
 *
 * KRA issue the OSCU specification per integrator, and the base address
 * differs between their sandbox and the live service. Hard coding a URL
 * would mean a code change on the day they move it, which is the day you
 * least want one. So the base and each path come from the environment, with
 * the documented defaults below, and anything unset is a refusal rather than
 * a guess.
 *
 * WHAT THIS MODULE PROMISES THE CALLER
 *
 * It never throws, and it never blocks a sale. Every call returns a result
 * saying what happened, and the two failure kinds are kept apart on purpose:
 *
 *   `rejected`  KRA read it and said no. Retrying sends the same refusal.
 *   `failed`    nobody read it: a timeout, a 500, no network. Worth retrying.
 *
 * Treating those the same is how an integration either gives up on invoices
 * that would have gone through, or retries forever against a refusal.
 */

export type EtimsConfig = {
  baseUrl: string
  initPath: string
  salesPath: string
  verifyBase: string
  timeoutMs: number
}

/** The paths as documented, overridable for when KRA move them. */
const DEFAULTS = {
  initPath: "/initializer/selectInitInfo",
  salesPath: "/trnsSales/saveSales",
  timeoutMs: 20000,
}

/**
 * Which KRA to talk to.
 *
 * `env` is the shop's own: shops go live at different times, so one shop may
 * still be in the sandbox while another is filing for real on the same
 * deployment. The URLs for both come from the environment.
 */
export function etimsConfig(env: string): EtimsConfig | null {
  const live = env === "production"
  const baseUrl = (live ? process.env.ETIMS_BASE_URL : process.env.ETIMS_SANDBOX_BASE_URL) ?? ""
  if (!baseUrl.trim()) return null

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    initPath: process.env.ETIMS_INIT_PATH ?? DEFAULTS.initPath,
    salesPath: process.env.ETIMS_SALES_PATH ?? DEFAULTS.salesPath,
    verifyBase:
      (live ? process.env.ETIMS_VERIFY_URL : process.env.ETIMS_SANDBOX_VERIFY_URL) ??
      "https://etims.kra.go.ke/common/link/etimsQR/indexEtimsData",
    timeoutMs: Number(process.env.ETIMS_TIMEOUT_MS ?? DEFAULTS.timeoutMs),
  }
}

/** Whether this deployment can reach KRA at all for that environment. */
export function etimsConfigured(env: string): boolean {
  return etimsConfig(env) !== null
}

export type EtimsCredentials = {
  tin: string
  branchId: string
  deviceSerial: string
  /** Absent during initialisation, which is the call that issues it. */
  cmcKey?: string | null
}

export type EtimsSendResult =
  | {
      ok: true
      receiptNumber: string
      receiptSignature: string
      internalData: string
      sdcDateTime: Date
      raw: unknown
    }
  | { ok: false; kind: "rejected"; message: string; raw?: unknown }
  | { ok: false; kind: "failed"; message: string }
  | { ok: false; kind: "unconfigured"; message: string }

export type EtimsInitResult =
  | { ok: true; cmcKey: string; raw: unknown }
  | { ok: false; kind: "rejected" | "failed" | "unconfigured"; message: string }

/** One POST, with a timeout and no exceptions escaping. */
async function post(
  cfg: EtimsConfig,
  path: string,
  creds: EtimsCredentials,
  body: unknown,
): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; kind: "failed"; message: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs)
  try {
    const res = await fetch(cfg.baseUrl + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // KRA identify the device on every call, not just at sign in.
        tin: creds.tin,
        bhfId: creds.branchId,
        ...(creds.cmcKey ? { cmcKey: creds.cmcKey } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    const text = await res.text()
    let json: Record<string, unknown>
    try {
      json = JSON.parse(text) as Record<string, unknown>
    } catch {
      // HTML from a proxy, or an empty body. Not a refusal: nobody read it.
      return {
        ok: false,
        kind: "failed",
        message: "KRA replied with something that was not an invoice response (" + res.status + ").",
      }
    }

    if (!res.ok) {
      return { ok: false, kind: "failed", message: "KRA returned " + res.status + "." }
    }
    return { ok: true, json }
  } catch (e) {
    const message = e instanceof Error && e.name === "AbortError"
      ? "KRA did not answer within " + Math.round(cfg.timeoutMs / 1000) + " seconds."
      : "Could not reach KRA."
    return { ok: false, kind: "failed", message }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * KRA answer every call with a result code, and 000 is the only success.
 *
 * Anything else is a refusal with a reason, which is worth keeping verbatim:
 * "the item classification code is not valid" is something a shopkeeper can
 * act on, and anything this module paraphrased would be worse.
 */
function resultOf(json: Record<string, unknown>): { code: string; message: string; data: Record<string, unknown> } {
  const code = String(json.resultCd ?? json.resultCode ?? "")
  const message = String(json.resultMsg ?? json.resultMessage ?? "")
  const data = (json.data ?? {}) as Record<string, unknown>
  return { code, message, data }
}

/**
 * Register this till as a control unit.
 *
 * Done once per device. KRA answer with the communication key that every
 * later call carries, which is why nothing can be filed before this runs.
 */
export async function initialiseDevice(env: string, creds: EtimsCredentials): Promise<EtimsInitResult> {
  const cfg = etimsConfig(env)
  if (!cfg) {
    return {
      ok: false,
      kind: "unconfigured",
      message: "This site has no KRA address configured for " + env + " yet.",
    }
  }

  const res = await post(cfg, cfg.initPath, creds, {
    tin: creds.tin,
    bhfId: creds.branchId,
    dvcSrlNo: creds.deviceSerial,
  })
  if (!res.ok) return { ok: false, kind: "failed", message: res.message }

  const { code, message, data } = resultOf(res.json)
  if (code !== "000") {
    return { ok: false, kind: "rejected", message: message || "KRA refused the device (" + code + ")." }
  }

  const info = (data.info ?? data) as Record<string, unknown>
  const cmcKey = String(info.cmcKey ?? "")
  if (!cmcKey) {
    return { ok: false, kind: "rejected", message: "KRA accepted the device but sent no communication key." }
  }
  return { ok: true, cmcKey, raw: res.json }
}

/**
 * Send one invoice or credit note.
 *
 * The signature, the internal data and the control unit's timestamp come
 * back here, and all three belong on the printed receipt. A reply missing
 * any of them is treated as a refusal rather than quietly printing a receipt
 * that claims to be a tax invoice and is not.
 */
export async function sendDocument(
  env: string,
  creds: EtimsCredentials,
  doc: EtimsDocument,
): Promise<EtimsSendResult> {
  const cfg = etimsConfig(env)
  if (!cfg) {
    return {
      ok: false,
      kind: "unconfigured",
      message: "This site has no KRA address configured for " + env + " yet.",
    }
  }
  if (!creds.cmcKey) {
    return {
      ok: false,
      kind: "unconfigured",
      message: "This till has not been registered with KRA yet.",
    }
  }

  const res = await post(cfg, cfg.salesPath, creds, doc)
  if (!res.ok) return { ok: false, kind: "failed", message: res.message }

  const { code, message, data } = resultOf(res.json)
  if (code !== "000") {
    return {
      ok: false,
      kind: "rejected",
      message: message || "KRA refused the invoice (" + code + ").",
      raw: res.json,
    }
  }

  const receiptNumber = String(data.curRcptNo ?? data.rcptNo ?? "")
  const receiptSignature = String(data.rcptSign ?? "")
  const internalData = String(data.intrlData ?? "")
  const stamped = String(data.sdcDateTime ?? "")

  if (!receiptSignature || !receiptNumber) {
    return {
      ok: false,
      kind: "rejected",
      message: "KRA accepted the invoice but sent no signature, so it cannot be printed as a tax invoice.",
      raw: res.json,
    }
  }

  return {
    ok: true,
    receiptNumber,
    receiptSignature,
    internalData,
    sdcDateTime: parseSdcDate(stamped) ?? new Date(),
    raw: res.json,
  }
}

/**
 * Their timestamp, which arrives as yyyyMMddHHmmss and occasionally with
 * separators. Unparseable means the caller falls back to now rather than
 * storing a wrong legal time.
 */
export function parseSdcDate(v: string): Date | null {
  const digits = v.replace(/\D/g, "")
  if (digits.length < 8) return null
  const y = Number(digits.slice(0, 4))
  const mo = Number(digits.slice(4, 6))
  const d = Number(digits.slice(6, 8))
  const h = Number(digits.slice(8, 10) || "0")
  const mi = Number(digits.slice(10, 12) || "0")
  const s = Number(digits.slice(12, 14) || "0")
  const date = new Date(y, mo - 1, d, h, mi, s)
  return Number.isNaN(date.getTime()) ? null : date
}

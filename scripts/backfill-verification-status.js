#!/usr/bin/env node
/**
 * Sets `User.verificationStatus` for every account that predates progressive
 * KYC, and `Product.publishedAt` for every listing that predates the merchant
 * draft state.
 *
 * Both columns are new, so every existing row starts at the schema default
 * (BASIC / null) — which, left alone, would lock the entire existing user
 * base out of their own wallets and hide every live product. This is the run
 * that prevents that.
 *
 * Users, in precedence order:
 *
 *   VERIFIED  kycStatus APPROVED — an admin genuinely approved them.
 *   VERIFIED  internal staff (admin, sub-admin, secretary, agent). These
 *             accounts are provisioned by an admin, never self-signed-up, so
 *             public KYC does not apply to them — and leaving them BASIC
 *             would gate staff out of the very actions they exist to perform.
 *   VERIFIED  every existing customer (grandfathered, by product decision):
 *             customers were auto-approved at signup under the old model and
 *             have been transacting on that basis, so demanding documents
 *             retroactively would break live accounts. Customers created from
 *             this deploy onward start BASIC like everybody else.
 *   PENDING   a KycDocument exists and is still awaiting a verdict.
 *   BASIC     everyone else, REJECTED included — a rejected account is gated
 *             exactly like an unverified one, and `kycStatus` REJECTED is
 *             what lets the UI explain why and invite a resubmission.
 *
 * Products: publishedAt = createdAt for anything currently isActive, so
 * existing live listings read as published rather than as never-published
 * drafts. Inactive products keep null (indistinguishable from a draft, which
 * is correct — neither has ever been live).
 *
 * Idempotent, and safe to re-run: only ever moves an account *up* from BASIC,
 * so it can't undo a real verification that happened after an earlier run.
 *
 *   node scripts/backfill-verification-status.js --dry-run
 *   node scripts/backfill-verification-status.js
 */

require("dotenv").config()

const { PrismaClient } = require("@prisma/client")

const db = new PrismaClient()
const DRY_RUN = process.argv.includes("--dry-run")

/** Roles that exist only because an admin created them (see
 *  registerTeamMember in lib/actions/auth.ts). Progressive KYC governs the
 *  public marketplace; internal staff sit outside it entirely. */
const INTERNAL_ROLES = new Set(["ADMIN", "SUB_ADMIN", "SECRETARY", "AGENT"])

function decide(user, hasPendingDocument) {
  if (INTERNAL_ROLES.has(user.role)) return "VERIFIED"
  if (user.kycStatus === "APPROVED") return "VERIFIED"
  if (user.role === "CUSTOMER") return "VERIFIED"
  if (hasPendingDocument) return "PENDING"
  return "BASIC"
}

async function main() {
  console.log(DRY_RUN ? "DRY RUN — nothing will be written\n" : "Backfilling verification status\n")

  const users = await db.user.findMany({
    select: {
      id: true,
      email: true,
      role: true,
      kycStatus: true,
      verificationStatus: true,
      // A document still sitting at PENDING is one waiting on a reviewer;
      // that is what puts the account in the PENDING tier rather than BASIC.
      kycDocuments: { select: { status: true } },
    },
  })

  const counts = { VERIFIED: 0, PENDING: 0, BASIC: 0, skipped: 0 }

  for (const user of users) {
    // Only BASIC rows are candidates — anything else was set deliberately
    // (by a later run, or by a real verification since).
    if (user.verificationStatus !== "BASIC") {
      counts.skipped += 1
      continue
    }

    const hasPendingDocument = user.kycDocuments.some((doc) => doc.status === "PENDING")
    const status = decide(user, hasPendingDocument)

    if (status === "BASIC") {
      counts.BASIC += 1
      continue
    }

    if (!DRY_RUN) {
      await db.user.update({ where: { id: user.id }, data: { verificationStatus: status } })
    }
    counts[status] += 1
    console.log(`  ${DRY_RUN ? "would set" : "set      "} ${status.padEnd(8)} ${user.role.padEnd(11)} ${user.email}`)
  }

  const liveProducts = await db.product.count({ where: { isActive: true, publishedAt: null } })
  if (!DRY_RUN && liveProducts > 0) {
    // publishedAt mirrors createdAt rather than "now" — these listings have
    // been live since they were created; stamping today's date would misdate
    // every one of them.
    await db.$executeRaw`UPDATE products SET "publishedAt" = "createdAt" WHERE "isActive" = true AND "publishedAt" IS NULL`
  }

  console.log(
    `\nSummary\n` +
      `  users            ${users.length}\n` +
      `  -> verified      ${counts.VERIFIED}\n` +
      `  -> pending       ${counts.PENDING}\n` +
      `  left basic       ${counts.BASIC}\n` +
      `  already set      ${counts.skipped}\n` +
      `  products stamped ${liveProducts}`,
  )
  if (DRY_RUN) console.log("\nDry run — re-run without --dry-run to write.")
}

main()
  .catch((error) => {
    console.error("\nbackfill-verification-status failed:", error.message)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect().catch(() => {}))

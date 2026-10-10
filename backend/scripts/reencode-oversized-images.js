#!/usr/bin/env node
/**
 * Shrinks oversized base64 images already stored in the database.
 *
 * This app keeps uploads as base64 data URLs in Postgres rather than in object
 * storage, so an uncompressed phone photo is carried inline by every query
 * that selects it. Uploads are compressed client-side (lib/compress-image.ts),
 * but the offer wizard skipped that step for a while and stored raw camera
 * files — one product image in the live database is 4.4MB, and getLiveOffers
 * ships every LIVE offer's images inline on each customer home load, which is
 * enough to push that request past its 25s timeout so the "Recommended for
 * you" section silently renders nothing.
 *
 * The upload path is fixed; this is for the rows written before that.
 *
 * It re-encodes through a headless Chromium page running the *same* canvas
 * pipeline as compressImageToDataUrl — same 1280px longest edge, same JPEG
 * quality — so a repaired image is indistinguishable from one uploaded today.
 * Node has no built-in image decoder, and Chromium is already present via
 * Playwright, so this avoids adding an image library for a one-off repair.
 *
 * Safe to re-run:
 *   - only base64 image data URLs are touched (http(s) URLs and PDFs skipped),
 *   - only those above --min-kb, so a second run finds nothing,
 *   - a row is written only when the re-encode is actually smaller, so an
 *     already-optimal image is never replaced by a larger one.
 *
 * Re-encoding is lossy and overwrites the original, so --backup writes every
 * original out to disk first. Prefer using it: these source photos exist
 * nowhere else, since this app has no object storage to fall back on.
 *
 *   node scripts/reencode-oversized-images.js --dry-run
 *   node scripts/reencode-oversized-images.js --backup=./image-backup
 *   node scripts/reencode-oversized-images.js --min-kb=150
 *
 * Requires Playwright's Chromium. It is present in this project as a
 * transitive dependency; if that ever changes, `npx playwright install
 * chromium` (or `pnpm add -D playwright`) restores it.
 */

require("dotenv").config()

const fs = require("fs")
const path = require("path")
const { PrismaClient } = require("@prisma/client")

const db = new PrismaClient()
const DRY_RUN = process.argv.includes("--dry-run")
const minKbArg = process.argv.find((a) => a.startsWith("--min-kb="))
const backupArg = process.argv.find((a) => a.startsWith("--backup="))
const BACKUP_DIR = backupArg ? backupArg.split("=").slice(1).join("=") : null
/** Below this, the row is not worth a rewrite — a compressed 1280px JPEG
 *  lands well under it, so this also makes the script idempotent. */
const MIN_BYTES = (minKbArg ? Number(minKbArg.split("=")[1]) : 300) * 1024

/** Mirrors lib/compress-image.ts. Keep the two in step: the whole point is
 *  that a repaired image matches what the app writes today. */
const MAX_DIMENSION = 1280
const QUALITY = 0.8

/**
 * Every column that stores an image. `array` distinguishes String[] columns
 * from single String ones; the Prisma model name is the client property.
 */
const TARGETS = [
  { model: "offer", field: "images", array: true },
  { model: "product", field: "images", array: true },
  { model: "distributorProduct", field: "images", array: true },
  { model: "service", field: "images", array: true },
  { model: "post", field: "images", array: true },
  { model: "groupPost", field: "images", array: true },
  { model: "portfolioItem", field: "imageUrl", array: false },
  { model: "shopPortfolioItem", field: "imageUrl", array: false },
  { model: "banner", field: "imageUrl", array: false },
  { model: "shopkeeperProfile", field: "shopLogoUrl", array: false },
  { model: "group", field: "image", array: false },
  { model: "user", field: "image", array: false },
]

function isReencodable(value) {
  // Only raster images stored inline. An http(s) URL is already cheap, and a
  // PDF cannot go through a canvas.
  return typeof value === "string" && value.startsWith("data:image/") && value.length > MIN_BYTES
}

const kb = (bytes) => `${(bytes / 1024).toFixed(0)}KB`

async function main() {
  let chromium
  try {
    ({ chromium } = require("playwright"))
  } catch {
    console.error(
      "Playwright is not available, and Node cannot decode images on its own.\n" +
        "Install it and re-run:  npx playwright install chromium",
    )
    process.exitCode = 1
    return
  }

  console.log(
    (DRY_RUN ? "DRY RUN — nothing will be written\n" : "Re-encoding oversized images\n") +
      `threshold ${kb(MIN_BYTES)}   target ${MAX_DIMENSION}px @ quality ${QUALITY}\n` +
      (BACKUP_DIR
        ? `originals -> ${path.resolve(BACKUP_DIR)}\n`
        : "no --backup given: originals will be overwritten and cannot be recovered\n"),
  )

  if (BACKUP_DIR && !DRY_RUN) fs.mkdirSync(BACKUP_DIR, { recursive: true })

  const browser = await chromium.launch()
  const page = await browser.newPage()

  /** Runs the identical canvas pipeline to compressImageToDataUrl. Returns
   *  null if the image cannot be decoded, so one bad row cannot abort a run. */
  async function reencode(dataUrl) {
    return page.evaluate(
      ([src, maxDimension, quality]) =>
        new Promise((resolve) => {
          const img = new Image()
          img.onload = () => {
            const scale = Math.min(1, maxDimension / Math.max(img.width, img.height))
            const canvas = document.createElement("canvas")
            canvas.width = Math.round(img.width * scale)
            canvas.height = Math.round(img.height * scale)
            const ctx = canvas.getContext("2d")
            if (!ctx) return resolve(null)
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
            resolve(canvas.toDataURL("image/jpeg", quality))
          }
          img.onerror = () => resolve(null)
          img.src = src
        }),
      [dataUrl, MAX_DIMENSION, QUALITY],
    )
  }

  let examined = 0
  let rewritten = 0
  let skipped = 0
  let failed = 0
  let saved = 0

  for (const { model, field, array } of TARGETS) {
    let rows
    try {
      rows = await db[model].findMany({ select: { id: true, [field]: true } })
    } catch (error) {
      console.log(`  ! ${model}.${field} — could not read (${error.message.split("\n")[0]})`)
      continue
    }

    for (const row of rows) {
      const original = row[field]
      const values = array ? original : [original]
      if (!values || values.every((v) => !isReencodable(v))) continue

      const next = []
      let rowBefore = 0
      let rowAfter = 0
      let changed = false

      for (const value of values) {
        if (!isReencodable(value)) {
          next.push(value)
          continue
        }
        examined += 1
        const encoded = await reencode(value)
        if (!encoded) {
          console.log(`  ! ${model}/${row.id} — could not decode an image, left as is`)
          failed += 1
          next.push(value)
          continue
        }
        // Never make a row bigger. A tiny PNG logo can re-encode larger as
        // JPEG, and replacing it would be a pure loss.
        if (encoded.length >= value.length) {
          skipped += 1
          next.push(value)
          continue
        }
        rowBefore += value.length
        rowAfter += encoded.length
        changed = true
        next.push(encoded)
      }

      if (!changed) continue

      // Written before the update, so a failure part-way through can never
      // leave an original destroyed with no copy of it anywhere.
      if (BACKUP_DIR && !DRY_RUN) {
        values.forEach((value, i) => {
          if (!isReencodable(value) || next[i] === value) return
          const ext = (value.slice(5, value.indexOf(";")) || "image/jpeg").split("/")[1]
          const file = path.join(BACKUP_DIR, `${model}--${row.id}--${i}.${ext}`)
          fs.writeFileSync(file, Buffer.from(value.slice(value.indexOf(",") + 1), "base64"))
        })
      }

      if (!DRY_RUN) {
        await db[model].update({
          where: { id: row.id },
          data: { [field]: array ? next : next[0] },
        })
      }

      rewritten += 1
      saved += rowBefore - rowAfter
      console.log(
        `  ${DRY_RUN ? "would fix" : "fixed   "} ${model}/${row.id}  ${kb(rowBefore)} -> ${kb(rowAfter)}`,
      )
    }
  }

  await browser.close()

  console.log(
    `\nSummary\n` +
      `  images examined  ${examined}\n` +
      `  rows rewritten   ${rewritten}\n` +
      `  already optimal  ${skipped}\n` +
      `  undecodable      ${failed}\n` +
      `  space reclaimed  ${(saved / 1024 / 1024).toFixed(2)}MB`,
  )
  if (DRY_RUN) console.log("\nDry run — re-run without --dry-run to write.")
}

main()
  .catch((error) => {
    console.error("\nreencode-oversized-images failed:", error.message)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect().catch(() => {}))

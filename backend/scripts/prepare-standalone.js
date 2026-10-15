const fs = require("node:fs")
const path = require("node:path")
const root = process.cwd()
const target = path.join(root, ".next", "standalone")
if (!fs.existsSync(target)) {
  if (process.env.NEXT_STANDALONE === "1" || process.platform !== "win32") throw new Error("Standalone build missing")
  console.log("Standalone packaging skipped on Windows; build on the deployment OS.")
} else {
  for (const [source, dest] of [["public", "public"], [".next/static", ".next/static"]]) {
    const from = path.join(root, source)
    if (fs.existsSync(from)) fs.cpSync(from, path.join(target, dest), { recursive: true })
  }
  if (!fs.existsSync(path.join(target, "server.js"))) throw new Error("Standalone server.js missing")
  console.log("Standalone server and static assets ready in .next/standalone")
}

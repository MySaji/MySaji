// Standalone output does not copy browser assets automatically.
const fs = require("node:fs")
const path = require("node:path")
const root = path.resolve(__dirname, "../..")
const target = path.join(root, ".next/standalone")
if (fs.existsSync(path.join(target, "server.js"))) {
  for (const relative of ["public", ".next/static"]) {
    const source = path.join(root, relative)
    if (fs.existsSync(source)) fs.cpSync(source, path.join(target, relative), { recursive: true })
  }
  console.log("Standalone public and static assets prepared")
} else if (process.platform !== "win32" || process.env.NEXT_STANDALONE === "1") {
  throw new Error("Standalone server missing after build")
}

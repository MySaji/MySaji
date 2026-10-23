import "server-only"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

// Read the running build, rather than an independently maintained version number.
export async function getAppRelease(): Promise<string | null> {
  if (process.env.NODE_ENV !== "production") return null
  try {
    const release = (await readFile(join(process.cwd(), ".next", "BUILD_ID"), "utf8")).trim()
    return /^[a-zA-Z0-9_-]{1,200}$/.test(release) ? release : null
  } catch { return null }
}

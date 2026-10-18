import { test, expect } from "@playwright/test"

test("Till exposes its own install identity and registers its worker before login", async ({ page }) => {
  await page.goto("/pos/login")
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/till-manifest.json")
  await expect(page.locator('meta[name="application-name"]')).toHaveAttribute("content", "Saji Till")
  const manifest = await (await page.request.get("/till-manifest.json")).json()
  const marketplace = await (await page.request.get("/manifest.json")).json()
  expect(manifest.id).toBe("/pos/sell")
  expect(manifest.start_url).toBe("/pos/sell")
  expect(manifest.scope).toBe("/pos/")
  expect(manifest.display).toBe("standalone")
  expect(manifest.id).not.toBe(marketplace.id ?? marketplace.start_url)
  for (const icon of manifest.icons) {
    expect(icon.src).toMatch(/^\/pos\//)
    const response = await page.request.get(icon.src)
    expect(response.ok()).toBe(true)
    expect(response.headers()["content-type"]).toContain("image/png")
  }
  await expect.poll(() => page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration("/pos/")
    return registration?.active?.scriptURL ?? ""
  })).toContain("/pos/sw.js")
})

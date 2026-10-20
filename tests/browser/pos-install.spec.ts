import { test, expect } from "@playwright/test"

test("Till exposes its own install identity and registers its worker before login", async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto("/pos/login")
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/till-manifest.json")
  await expect(page.locator('meta[name="application-name"]')).toHaveAttribute("content", "Saji Till")
  const manifest = await (await page.request.get("/till-manifest.json")).json()
  const marketplace = await (await page.request.get("/manifest.json")).json()
  expect(manifest.id).toBe("/pos/sell")
  expect(manifest.start_url).toBe("/pos/open")
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

test("installed Till launch routes signed-out users to Till sign-in", async ({ request }) => {
  const response = await request.get("/pos/open", { maxRedirects: 0 })
  expect(response.status()).toBe(307)
  expect(new URL(response.headers().location).pathname).toBe("/pos/login")
  expect(response.headers()["cache-control"]).toContain("no-store")
  const malicious = await request.get("/pos/open?shop=https://elsewhere.example&next=https://elsewhere.example", { maxRedirects: 0 })
  expect(new URL(malicious.headers().location).pathname).toBe("/pos/login")
})

test("old installed register URLs recover to sign-in without waiting for offline storage", async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto("/pos/sell", { timeout: 90_000 })
  await expect(page).toHaveURL(/\/pos\/login$/, { timeout: 25_000 })
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
})

test("printed shop addresses stay inside the Till application", async ({ request }) => {
  const response = await request.get("/till/example-shop", { maxRedirects: 0 })
  expect([307, 308]).toContain(response.status())
  expect(new URL(response.headers().location, "http://localhost").pathname).toBe("/pos/welcome/example-shop")
})

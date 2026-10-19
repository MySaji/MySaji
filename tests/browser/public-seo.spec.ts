import { test, expect } from "@playwright/test"
import { PUBLIC_OFFERINGS } from "../../backend/domain/public-offerings"
import { OFFERING_LINKS } from "../../backend/domain/public-site"

test("every sitemap URL is a successful public canonical with a unique title and crawlable HTML", async ({ request }) => {
  test.setTimeout(180_000)
  const response = await request.get("/sitemap.xml")
  expect(response.status()).toBe(200)
  const urls = [...(await response.text()).matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1])
  expect(new Set(urls).size).toBe(urls.length)
  const titles = new Set<string>()
  for (const url of urls) {
    const canonical = new URL(url)
    expect(canonical.origin).toBe("https://mysaji.com")
    const page = await request.get(canonical.pathname)
    expect(page.status(), canonical.pathname).toBe(200)
    expect(page.headers()["x-robots-tag"] ?? "").not.toContain("noindex")
    const html = await page.text()
    const renderedCanonical = html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]*)"/)?.[1]
    expect(renderedCanonical, canonical.pathname).toBeTruthy()
    expect(new URL(renderedCanonical!).href, canonical.pathname).toBe(canonical.href)
    expect(html).toContain('name="robots" content="index, follow"')
    expect(html).toMatch(/<h1(?:\s[^>]*)?>[^]*?<\/h1>/)
    const title = html.match(/<title>(.*?)<\/title>/)?.[1] ?? ""
    expect(title).toContain("MySaji")
    expect(titles.has(title), title).toBe(false)
    titles.add(title)
  }
})

test("offering content, links and matching breadcrumbs are available without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  try {
    for (const offering of PUBLIC_OFFERINGS) {
      const response = await page.goto(`${test.info().project.use.baseURL}/${offering.slug}`)
      expect(response?.status()).toBe(200)
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(offering.heading)
      await expect(page.getByRole("navigation", { name: "Breadcrumb", exact: true })).toContainText(offering.label)
      await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute("content", "MySaji")
      const schema = JSON.parse(await page.locator('script[type="application/ld+json"]').first().textContent() ?? "{}")
      expect(schema["@type"]).toBe("BreadcrumbList")
      expect(schema.itemListElement.at(-1).item).toBe(`https://mysaji.com/${offering.slug}`)
      for (const link of OFFERING_LINKS) expect(await page.locator(`a[href="${link.href}"]`).count()).toBeGreaterThan(0)
    }
  } finally { await context.close() }
})

test("private portal and authentication responses retain noindex headers", async ({ request }) => {
  test.setTimeout(120_000)
  for (const path of ["/auth/login", "/auth/signup", "/auth/forgot-password", "/team-login", "/admin", "/customer/home", "/provider", "/secretary", "/agent", "/distributor", "/pos/login", "/pos/home", "/till-display"]) {
    const response = await request.get(path, { maxRedirects: 0 })
    expect(response.headers()["x-robots-tag"], path).toBe("noindex, nofollow")
    if (response.status() === 200) expect(await response.text(), path).toContain('name="robots" content="noindex, nofollow"')
  }
})

test("public navigation and landing pages work at narrow mobile widths", async ({ page }) => {
  test.setTimeout(120_000)
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    for (const path of ["/", ...PUBLIC_OFFERINGS.map(offering => `/${offering.slug}`), "/knowledge", "/pos"]) {
      const response = await page.goto(path)
      expect(response?.status()).toBe(200)
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${path} at ${width}`).toBe(true)
    }
    await page.goto("/pro")
    await page.getByRole("button", { name: "Open navigation menu", exact: true }).click()
    const navigation = page.getByRole("navigation", { name: "Mobile navigation", exact: true })
    for (const link of OFFERING_LINKS) await expect(navigation.getByRole("link", { name: link.label, exact: true })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(navigation).toBeHidden()
    await page.screenshot({ path: `.artifacts/seo-pro-${width}.png`, fullPage: true })
  }
})

test("homepage has one WebSite node and unknown public offerings stay 404/noindex", async ({ page, request }) => {
  await page.goto("/")
  const schemas = await page.locator('script[type="application/ld+json"]').allTextContents()
  const websites = schemas.map(schema => JSON.parse(schema)).filter(schema => schema["@type"] === "WebSite")
  expect(websites).toHaveLength(1)
  expect(websites[0].name).toBe("MySaji")
  expect(websites[0].url).toBe("https://mysaji.com/")
  for (const path of ["/not-an-offering", "/knowledge/not-a-real-guide"]) {
    const response = await request.get(path)
    expect(response.status()).toBe(404)
    expect(await response.text()).toMatch(/name="robots" content="noindex/)
  }
  await page.screenshot({ path: ".artifacts/seo-home-desktop.png", fullPage: true })
})

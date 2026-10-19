import { test, expect } from "@playwright/test"
import { GUIDES } from "../../backend/domain/knowledge"

test("homepage introduces MySaji and links to the public offering hierarchy", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("heading", { level: 1 })).toContainText("MySaji")
  await page.getByRole("navigation", { name: "Explore MySaji offerings", exact: true }).getByRole("link", { name: /Shop products/ }).click()
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Shop products. Keep the order details together.")
  await expect(page.getByRole("navigation", { name: "Breadcrumb", exact: true })).toContainText("Shop")
})

test("knowledge search, topic filters, and related articles work", async ({ page }) => {
  await page.goto("/knowledge")
  await page.getByRole("searchbox").fill("offline")
  await expect(page.getByRole("link", { name: /Keep selling when connectivity drops/ })).toBeVisible()
  await page.getByRole("searchbox").fill("zzzz-no-match")
  await expect(page.getByRole("status")).toHaveText("0 guides found")
  await expect(page.getByText("No matching guides.", { exact: false })).toBeVisible()
  await page.getByRole("searchbox").fill("")
  await page.getByRole("button", { name: "Payments", exact: true }).click()
  await expect(page.getByRole("link", { name: /Payments, wallet, and receipts/ })).toBeVisible()
  await page.getByRole("link", { name: /Payments, wallet, and receipts/ }).click()
  await expect(page.getByRole("navigation", { name: "Article contents" })).toBeVisible()
  await page.getByRole("link", { name: "Changes, cancellations, and disputes →", exact: true }).click()
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Changes, cancellations, and disputes")
})

test("public pages fit a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  for (const route of ["/", "/knowledge", "/knowledge/pos-offline"]) {
    await page.goto(route)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
  await page.screenshot({ path: ".artifacts/knowledge-mobile.png", fullPage: true })
})

test("unknown guides return 404", async ({ page }) => {
  const response = await page.goto("/knowledge/does-not-exist")
  expect(response?.status()).toBe(404)
})

test("every handbook guide is reachable and renders its contents", async ({ page }) => {
  test.setTimeout(90_000)
  for (const guide of GUIDES) {
    const response = await page.goto(`/knowledge/${guide.slug}`)
    expect(response?.status(), guide.slug).toBe(200)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(guide.title)
    await expect(page.getByRole("navigation", { name: "Article contents" })).toBeVisible()
  }
})

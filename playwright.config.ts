import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "tests/browser", timeout: 45_000, workers: 1,
  reporter: "list", outputDir: ".artifacts/browser-results",
  use: { baseURL: process.env.SAJI_BROWSER_BASE_URL || "http://localhost:3100", browserName: "chromium",
    launchOptions: process.platform === "win32" ? { executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" } : {},
  },
})

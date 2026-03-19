/**
 * tests/e2e/simple.spec.ts
 * Simple test to verify Playwright setup works
 */

import { test, expect } from "@playwright/test";
import { getTestPort } from "./test-port.ts";

test.describe("Simple Tests", () => {
  const testPort = getTestPort();

  test.afterEach(async () => {
    // Pause for 1 second in visual mode so test developer can observe
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  test("should load blob-office.html", async ({ page }) => {
    // Load the blob-office viewer from the mock server (serves HTML with injected WS port)
    await page.goto(`http://localhost:${testPort}/`);

    // Wait for page to load
    await page.waitForLoadState("domcontentloaded");

    // The no-agents element should be present
    await expect(page.locator("#no-agents")).toBeAttached();

    // Check for WebSocket status elements
    await expect(page.locator("#ws-dot")).toBeVisible();
    await expect(page.locator("#ws-label")).toBeVisible();

    // Wait for WebSocket to connect (might take a moment)
    await page.waitForTimeout(3000);

    // Take a screenshot to verify the page loaded
    await page.screenshot({ path: "test-results/simple-test.png" });
  });
});
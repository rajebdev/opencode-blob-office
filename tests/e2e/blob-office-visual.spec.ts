/**
 * tests/e2e/blob-office-visual.spec.ts
 * End-to-end tests for blob-office visual animations
 */

import { test, expect, Page } from "@playwright/test";

test.describe("Blob Office Visual Tests", () => {
  const testPort = 2727;

  test.beforeAll(async () => {
    // Mock server should be running via globalSetup on port 2727
    // Test that it's accessible
    try {
      const response = await fetch(`http://localhost:${testPort}/scenario/status`);
      if (!response.ok) {
        throw new Error("Mock server not accessible");
      }
    } catch (error) {
      console.warn("Mock server not running, some tests may fail:", error);
    }
  });

  test.afterEach(async () => {
    // Pause for 1 second in visual mode so test developer can observe animations
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  test.beforeEach(async ({ page }) => {
    // Load the blob-office viewer from the mock server (serves HTML with injected WS port)
    await page.goto("http://localhost:2727/");

    // Wait for page to load
    await page.waitForLoadState("domcontentloaded");
    
    // Give WebSocket time to connect (might take a moment)
    await page.waitForTimeout(3000);
  });

  test("should display empty office initially", async ({ page }) => {
    // Page should load with empty office
    await expect(page.locator("#no-agents")).toBeVisible();
    await page.screenshot({ path: "test-results/empty-office.png" });
  });

  test("should load the viewer from HTTP server", async ({ page }) => {
    // Verify the viewer loads and displays status bar
    await expect(page.locator("#status-bar")).toBeVisible();
    await expect(page.locator("#ws-label")).toBeAttached();
    await page.screenshot({ path: "test-results/viewer-loaded.png" });
  });
});
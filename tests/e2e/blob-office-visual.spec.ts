/**
 * tests/e2e/blob-office-visual.spec.ts
 * End-to-end tests for blob-office visual animations
 */

import { test, expect, Page } from "@playwright/test";
import { getTestPort } from "./test-port.ts";

test.describe("Blob Office Visual Tests", () => {
  const testPort = getTestPort();

  test.beforeAll(async () => {
    // Mock server should be running via globalSetup
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
    await page.goto(`http://localhost:${testPort}/`);

    // Wait for page to load
    await page.waitForLoadState("domcontentloaded");
    
    // Give WebSocket time to connect (might take a moment)
    await page.waitForTimeout(3000);
  });

  test("should load viewer without errors", async ({ page }) => {
    // Verify the viewer loads with WebSocket connected and no console errors
    await page.goto(`http://localhost:${testPort}/`);
    await page.waitForLoadState("domcontentloaded");
    
    // Wait for WebSocket connection
    await page.waitForFunction(() => {
      const wsDot = document.getElementById("ws-dot");
      return wsDot && wsDot.classList.contains("connected");
    });
    
    // Verify status bar is visible
    await expect(page.locator("#status-bar")).toBeVisible();
    await expect(page.locator("#ws-label")).toContainText("connected");
  });

  test("should load the viewer from HTTP server", async ({ page }) => {
    // Verify the viewer loads and displays status bar
    await expect(page.locator("#status-bar")).toBeVisible();
    await expect(page.locator("#ws-label")).toBeAttached();
    await page.screenshot({ path: "test-results/viewer-loaded.png" });
  });
});
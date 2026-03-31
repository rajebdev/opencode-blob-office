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
    // Stop any running scenario to ensure clean state for next test
    await fetch(`http://localhost:${testPort}/scenario/stop`, { method: "POST" });
  });

  test.beforeEach(async ({ page }) => {
    // Stop any running scenario first to ensure clean state
    await fetch(`http://localhost:${testPort}/scenario/stop`, { method: "POST" });
    // Wait for empty state to broadcast to any connected clients
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Load the blob-office viewer from the mock server (serves HTML with injected WS port)
    await page.goto(`http://localhost:${testPort}/`);

    // Wait for page to load
    await page.waitForLoadState("domcontentloaded");
    
    // Give WebSocket time to connect and receive initial snapshot
    await page.waitForTimeout(1000);
  });

  test("should load viewer with WebSocket connected", async ({ page }) => {
    // Verify the viewer loads with WebSocket connected
    // Note: Testing empty office state requires a fresh mock server instance
    await expect(page.locator("#status-bar")).toBeVisible();
    await expect(page.locator("#ws-label")).toContainText("connected");
    await page.screenshot({ path: "test-results/viewer-connected.png" });
  });

  test("should load the viewer from HTTP server", async ({ page }) => {
    // Verify the viewer loads and displays status bar
    await expect(page.locator("#status-bar")).toBeVisible();
    await expect(page.locator("#ws-label")).toBeAttached();
    await page.screenshot({ path: "test-results/viewer-loaded.png" });
  });
});
/**
 * tests/e2e/state-capture.spec.ts
 * Captures screenshots/GIFs of all agent states for documentation/mockups
 * Replaces media-previews/capture-states.sh and generate-mockups.sh
 */

import { test, expect } from "@playwright/test";

test.describe("Agent State Capture", () => {
  const testPort = 2727;

  test.beforeEach(async ({ page }) => {
    // Load the blob-office viewer from the mock server
    await page.goto(`http://localhost:${testPort}/`);
    await page.waitForLoadState("domcontentloaded");
    // Wait for WebSocket connection
    await page.waitForTimeout(3000);
  });

  test("capture all agent states for documentation", async ({ page }) => {
    // Start the basic-lifecycle scenario which cycles through states
    const response = await fetch(`http://localhost:${testPort}/scenario/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenario: {
          name: "state-capture",
          description: "Cycle through all agent states",
          duration: 30000,
          events: [
            // Idle
            {
              timestamp: 0,
              agents: [{
                id: "capture-agent",
                parentID: null,
                folder: "demo",
                folderFull: "/demo",
                title: null,
                status: "idle",
                tool: null,
                message: "💤 waiting",
                since: Date.now(),
                color: 200,
                idleSince: Date.now(),
                activityScale: 1.0,
              }],
            },
            // Thinking
            {
              timestamp: 2000,
              agents: [{
                id: "capture-agent",
                parentID: null,
                folder: "demo",
                folderFull: "/demo",
                title: null,
                status: "thinking",
                tool: null,
                message: "🧠 thinking…",
                since: Date.now(),
                color: 200,
                idleSince: null,
                activityScale: 1.0,
              }],
            },
            // Editing
            {
              timestamp: 4000,
              agents: [{
                id: "capture-agent",
                parentID: null,
                folder: "demo",
                folderFull: "/demo",
                title: null,
                status: "editing",
                tool: "edit",
                message: "✏️ editing",
                since: Date.now(),
                color: 200,
                idleSince: null,
                activityScale: 1.0,
              }],
            },
            // Reading
            {
              timestamp: 6000,
              agents: [{
                id: "capture-agent",
                parentID: null,
                folder: "demo",
                folderFull: "/demo",
                title: null,
                status: "reading",
                tool: "read",
                message: "📖 reading",
                since: Date.now(),
                color: 200,
                idleSince: null,
                activityScale: 1.0,
              }],
            },
            // Running
            {
              timestamp: 8000,
              agents: [{
                id: "capture-agent",
                parentID: null,
                folder: "demo",
                folderFull: "/demo",
                title: null,
                status: "running",
                tool: "bash",
                message: "💻 running",
                since: Date.now(),
                color: 200,
                idleSince: null,
                activityScale: 1.0,
              }],
            },
            // Waiting
            {
              timestamp: 10000,
              agents: [{
                id: "capture-agent",
                parentID: null,
                folder: "demo",
                folderFull: "/demo",
                title: null,
                status: "waiting",
                tool: null,
                message: "⚠️ needs permission",
                since: Date.now(),
                color: 200,
                idleSince: null,
                activityScale: 1.0,
              }],
            },
            // Error
            {
              timestamp: 12000,
              agents: [{
                id: "capture-agent",
                parentID: null,
                folder: "demo",
                folderFull: "/demo",
                title: null,
                status: "error",
                tool: null,
                message: "❌ error",
                since: Date.now(),
                color: 200,
                idleSince: null,
                activityScale: 1.0,
              }],
            },
            // Back to idle
            {
              timestamp: 14000,
              agents: [{
                id: "capture-agent",
                parentID: null,
                folder: "demo",
                folderFull: "/demo",
                title: null,
                status: "idle",
                tool: null,
                message: "💤 waiting",
                since: Date.now(),
                color: 200,
                idleSince: Date.now(),
                activityScale: 1.0,
              }],
            },
          ],
        },
      }),
    });
    expect(response.ok).toBe(true);

    // Wait for agent to appear
    await page.waitForTimeout(500);

    // Capture each state
    const states = [
      { name: "idle", wait: 500 },
      { name: "thinking", wait: 2500 },
      { name: "editing", wait: 2500 },
      { name: "reading", wait: 2500 },
      { name: "running", wait: 2500 },
      { name: "waiting", wait: 2500 },
      { name: "error", wait: 2500 },
    ];

    for (const state of states) {
      await page.waitForTimeout(state.wait);
      await page.screenshot({
        path: `test-results/state-${state.name}.png`,
        fullPage: false,
      });
    }
  });

  test("capture subagent states", async ({ page }) => {
    // Start multi-agent scenario
    const response = await fetch(`http://localhost:${testPort}/scenario/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenario: {
          name: "subagent-capture",
          description: "Capture subagent states",
          duration: 20000,
          events: [
            // Main agent with subagents
            {
              timestamp: 0,
              agents: [
                {
                  id: "main-agent",
                  parentID: null,
                  folder: "demo",
                  folderFull: "/demo",
                  title: null,
                  status: "waiting",
                  tool: null,
                  message: "👀 supervising",
                  since: Date.now(),
                  color: 240,
                  idleSince: null,
                  activityScale: 1.0,
                },
                {
                  id: "sub-1",
                  parentID: "main-agent",
                  folder: "demo",
                  folderFull: "/demo",
                  title: null,
                  status: "reading",
                  tool: "read",
                  message: "📖 reading",
                  since: Date.now(),
                  color: 270,
                  idleSince: null,
                  activityScale: 1.0,
                },
                {
                  id: "sub-2",
                  parentID: "main-agent",
                  folder: "demo",
                  folderFull: "/demo",
                  title: null,
                  status: "editing",
                  tool: "edit",
                  message: "✏️ editing",
                  since: Date.now(),
                  color: 300,
                  idleSince: null,
                  activityScale: 1.0,
                },
              ],
            },
          ],
        },
      }),
    });
    expect(response.ok).toBe(true);

    await page.waitForTimeout(2000);
    await page.screenshot({
      path: "test-results/state-subagents.png",
      fullPage: false,
    });
  });

  test("capture activity scaling", async ({ page }) => {
    // Start activity scaling scenario
    const response = await fetch(`http://localhost:${testPort}/scenario/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenario: {
          name: "activity-capture",
          description: "Capture activity scaling",
          duration: 15000,
          events: [
            {
              timestamp: 0,
              agents: [{
                id: "active-agent",
                parentID: null,
                folder: "demo",
                folderFull: "/demo",
                title: null,
                status: "editing",
                tool: "edit",
                message: "✏️ editing",
                since: Date.now(),
                color: 60,
                idleSince: null,
                activityScale: 1.0,
              }],
            },
            {
              timestamp: 3000,
              agents: [{
                id: "active-agent",
                parentID: null,
                folder: "demo",
                folderFull: "/demo",
                title: null,
                status: "editing",
                tool: "edit",
                message: "✏️ editing many files",
                since: Date.now(),
                color: 60,
                idleSince: null,
                activityScale: 1.8,
              }],
            },
            {
              timestamp: 6000,
              agents: [{
                id: "active-agent",
                parentID: null,
                folder: "demo",
                folderFull: "/demo",
                title: null,
                status: "running",
                tool: "bash",
                message: "💻 processing",
                since: Date.now(),
                color: 60,
                idleSince: null,
                activityScale: 2.5,
              }],
            },
          ],
        },
      }),
    });
    expect(response.ok).toBe(true);

    // Capture at different activity scales
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: "test-results/state-activity-low.png",
      fullPage: false,
    });

    await page.waitForTimeout(2500);
    await page.screenshot({
      path: "test-results/state-activity-medium.png",
      fullPage: false,
    });

    await page.waitForTimeout(2500);
    await page.screenshot({
      path: "test-results/state-activity-high.png",
      fullPage: false,
    });
  });

  test("capture empty office state", async ({ page }) => {
    await page.screenshot({
      path: "test-results/state-empty-office.png",
      fullPage: false,
    });
  });
});
/**
 * tests/e2e/capture-previews.spec.ts
 * Records webm videos of agent state scenarios for the media-previews gallery.
 *
 * Run with:  bun run preview:capture
 * Then convert:  bun run preview:convert
 */

import { test, expect } from "@playwright/test";
import { mkdirSync } from "fs";
import { join } from "path";
import { getTestPort } from "./test-port.ts";

const TEST_PORT = getTestPort();
const PREVIEWS_DIR = join(process.cwd(), "media-previews", "webm");

/** Close the page to flush the video, then save it to the previews directory */
async function saveVideo(page: import("@playwright/test").Page, name: string): Promise<void> {
	const video = page.video();
	await page.close();
	if (video) {
		await video.saveAs(join(PREVIEWS_DIR, `${name}.webm`));
	}
}

test.describe("Preview Capture", () => {
	test.beforeAll(() => {
		mkdirSync(PREVIEWS_DIR, { recursive: true });
	});

	test.beforeEach(async ({ page }) => {
		await page.goto(`http://localhost:${TEST_PORT}/`);
		await page.waitForLoadState("domcontentloaded");
		// Wait for WebSocket connection and initial render
		await page.waitForTimeout(2000);
	});

	test("lifecycle — idle to thinking to editing to running to idle", async ({ page }) => {
		const response = await fetch(`http://localhost:${TEST_PORT}/scenario/start`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				scenario: {
					name: "preview-lifecycle",
					description: "Single agent lifecycle",
					duration: 14000,
					events: [
						{
							timestamp: 0,
							agents: [{
								id: "demo-agent",
								parentID: null,
								folder: "my-project",
								folderFull: "/home/dev/my-project",
								title: null,
								status: "idle",
								tool: null,
								message: "💤 waiting",
								since: Date.now(),
								color: 160,
								idleSince: Date.now(),
								activityScale: 1.0,
							}],
						},
						{
							timestamp: 2000,
							agents: [{
								id: "demo-agent",
								parentID: null,
								folder: "my-project",
								folderFull: "/home/dev/my-project",
								title: null,
								status: "thinking",
								tool: null,
								message: "🧠 thinking...",
								since: Date.now(),
								color: 160,
								idleSince: null,
								activityScale: 1.0,
							}],
						},
						{
							timestamp: 5000,
							agents: [{
								id: "demo-agent",
								parentID: null,
								folder: "my-project",
								folderFull: "/home/dev/my-project",
								title: null,
								status: "editing",
								tool: "edit",
								message: "✏️ editing",
								since: Date.now(),
								color: 160,
								idleSince: null,
								activityScale: 1.0,
							}],
						},
						{
							timestamp: 8000,
							agents: [{
								id: "demo-agent",
								parentID: null,
								folder: "my-project",
								folderFull: "/home/dev/my-project",
								title: null,
								status: "running",
								tool: "bash",
								message: "💻 running tests",
								since: Date.now(),
								color: 160,
								idleSince: null,
								activityScale: 1.0,
							}],
						},
						{
							timestamp: 11000,
							agents: [{
								id: "demo-agent",
								parentID: null,
								folder: "my-project",
								folderFull: "/home/dev/my-project",
								title: null,
								status: "idle",
								tool: null,
								message: "💤 done",
								since: Date.now(),
								color: 160,
								idleSince: Date.now(),
								activityScale: 1.0,
							}],
						},
					],
				},
			}),
		});
		expect(response.ok).toBe(true);

		// Let the full scenario play out
		await page.waitForTimeout(13000);

		await saveVideo(page, "lifecycle");
	});

	test("subagents — parent supervising children", async ({ page }) => {
		const response = await fetch(`http://localhost:${TEST_PORT}/scenario/start`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				scenario: {
					name: "preview-subagents",
					description: "Parent with subagents",
					duration: 14000,
					events: [
						{
							timestamp: 0,
							agents: [{
								id: "parent",
								parentID: null,
								folder: "my-project",
								folderFull: "/home/dev/my-project",
								title: null,
								status: "thinking",
								tool: null,
								message: "🧠 planning...",
								since: Date.now(),
								color: 220,
								idleSince: null,
								activityScale: 1.0,
							}],
						},
						{
							timestamp: 2000,
							agents: [
								{
									id: "parent",
									parentID: null,
									folder: "my-project",
									folderFull: "/home/dev/my-project",
									title: null,
									status: "waiting",
									tool: null,
									message: "👀 supervising",
									since: Date.now(),
									color: 220,
									idleSince: null,
									activityScale: 1.0,
								},
								{
									id: "sub-reader",
									parentID: "parent",
									folder: "my-project",
									folderFull: "/home/dev/my-project",
									title: null,
									status: "reading",
									tool: "read",
									message: "📖 reading files",
									since: Date.now(),
									color: 250,
									idleSince: null,
									activityScale: 1.0,
								},
							],
						},
						{
							timestamp: 5000,
							agents: [
								{
									id: "parent",
									parentID: null,
									folder: "my-project",
									folderFull: "/home/dev/my-project",
									title: null,
									status: "waiting",
									tool: null,
									message: "👀 supervising",
									since: Date.now(),
									color: 220,
									idleSince: null,
									activityScale: 1.0,
								},
								{
									id: "sub-reader",
									parentID: "parent",
									folder: "my-project",
									folderFull: "/home/dev/my-project",
									title: null,
									status: "reading",
									tool: "read",
									message: "📖 reading files",
									since: Date.now(),
									color: 250,
									idleSince: null,
									activityScale: 1.0,
								},
								{
									id: "sub-editor",
									parentID: "parent",
									folder: "my-project",
									folderFull: "/home/dev/my-project",
									title: null,
									status: "editing",
									tool: "edit",
									message: "✏️ editing code",
									since: Date.now(),
									color: 280,
									idleSince: null,
									activityScale: 1.0,
								},
							],
						},
						{
							timestamp: 9000,
							agents: [
								{
									id: "parent",
									parentID: null,
									folder: "my-project",
									folderFull: "/home/dev/my-project",
									title: null,
									status: "thinking",
									tool: null,
									message: "🧠 reviewing...",
									since: Date.now(),
									color: 220,
									idleSince: null,
									activityScale: 1.0,
								},
							],
						},
						{
							timestamp: 11000,
							agents: [{
								id: "parent",
								parentID: null,
								folder: "my-project",
								folderFull: "/home/dev/my-project",
								title: null,
								status: "idle",
								tool: null,
								message: "💤 done",
								since: Date.now(),
								color: 220,
								idleSince: Date.now(),
								activityScale: 1.0,
							}],
						},
					],
				},
			}),
		});
		expect(response.ok).toBe(true);

		await page.waitForTimeout(13000);

		await saveVideo(page, "subagents");
	});

	test("error-recovery — agent hits error and recovers", async ({ page }) => {
		const response = await fetch(`http://localhost:${TEST_PORT}/scenario/start`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				scenario: {
					name: "preview-error",
					description: "Error and recovery",
					duration: 12000,
					events: [
						{
							timestamp: 0,
							agents: [{
								id: "error-agent",
								parentID: null,
								folder: "my-project",
								folderFull: "/home/dev/my-project",
								title: null,
								status: "running",
								tool: "bash",
								message: "💻 running build",
								since: Date.now(),
								color: 30,
								idleSince: null,
								activityScale: 1.0,
							}],
						},
						{
							timestamp: 3000,
							agents: [{
								id: "error-agent",
								parentID: null,
								folder: "my-project",
								folderFull: "/home/dev/my-project",
								title: null,
								status: "error",
								tool: null,
								message: "❌ build failed",
								since: Date.now(),
								color: 30,
								idleSince: null,
								activityScale: 1.0,
							}],
						},
						{
							timestamp: 6000,
							agents: [{
								id: "error-agent",
								parentID: null,
								folder: "my-project",
								folderFull: "/home/dev/my-project",
								title: null,
								status: "editing",
								tool: "edit",
								message: "✏️ fixing...",
								since: Date.now(),
								color: 30,
								idleSince: null,
								activityScale: 1.0,
							}],
						},
						{
							timestamp: 9000,
							agents: [{
								id: "error-agent",
								parentID: null,
								folder: "my-project",
								folderFull: "/home/dev/my-project",
								title: null,
								status: "idle",
								tool: null,
								message: "✅ fixed",
								since: Date.now(),
								color: 30,
								idleSince: Date.now(),
								activityScale: 1.0,
							}],
						},
					],
				},
			}),
		});
		expect(response.ok).toBe(true);

		await page.waitForTimeout(11000);

		await saveVideo(page, "error-recovery");
	});

	test("multi-session — multiple independent agents", async ({ page }) => {
		const response = await fetch(`http://localhost:${TEST_PORT}/scenario/start`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				scenario: {
					name: "preview-multi",
					description: "Multiple sessions in the office",
					duration: 12000,
					events: [
						{
							timestamp: 0,
							agents: [
								{
									id: "agent-a",
									parentID: null,
									folder: "frontend",
									folderFull: "/home/dev/frontend",
									title: null,
									status: "editing",
									tool: "edit",
									message: "✏️ editing components",
									since: Date.now(),
									color: 120,
									idleSince: null,
									activityScale: 1.0,
								},
								{
									id: "agent-b",
									parentID: null,
									folder: "backend",
									folderFull: "/home/dev/backend",
									title: null,
									status: "reading",
									tool: "read",
									message: "📖 reading docs",
									since: Date.now(),
									color: 280,
									idleSince: null,
									activityScale: 1.0,
								},
							],
						},
						{
							timestamp: 4000,
							agents: [
								{
									id: "agent-a",
									parentID: null,
									folder: "frontend",
									folderFull: "/home/dev/frontend",
									title: null,
									status: "running",
									tool: "bash",
									message: "💻 running tests",
									since: Date.now(),
									color: 120,
									idleSince: null,
									activityScale: 1.5,
								},
								{
									id: "agent-b",
									parentID: null,
									folder: "backend",
									folderFull: "/home/dev/backend",
									title: null,
									status: "thinking",
									tool: null,
									message: "🧠 planning API",
									since: Date.now(),
									color: 280,
									idleSince: null,
									activityScale: 1.0,
								},
							],
						},
						{
							timestamp: 8000,
							agents: [
								{
									id: "agent-a",
									parentID: null,
									folder: "frontend",
									folderFull: "/home/dev/frontend",
									title: null,
									status: "idle",
									tool: null,
									message: "💤 tests passed",
									since: Date.now(),
									color: 120,
									idleSince: Date.now(),
									activityScale: 1.0,
								},
								{
									id: "agent-b",
									parentID: null,
									folder: "backend",
									folderFull: "/home/dev/backend",
									title: null,
									status: "editing",
									tool: "edit",
									message: "✏️ writing endpoints",
									since: Date.now(),
									color: 280,
									idleSince: null,
									activityScale: 1.3,
								},
							],
						},
					],
				},
			}),
		});
		expect(response.ok).toBe(true);

		await page.waitForTimeout(11000);

		await saveVideo(page, "multi-session");
	});
});

/**
 * blob-office-mock-server.ts
 * Standalone mock WebSocket server for testing blob-office animations
 *
 * Simulates the real blob-office plugin server with controllable scenarios.
 * Uses test ports (2728+) to avoid conflicts with production server.
 */

import type { AgentState } from "./blob-office-lib.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

type ScenarioEvent = {
	timestamp: number; // Relative to scenario start (ms)
	agents: AgentState[];
};

type Scenario = {
	name: string;
	description: string;
	events: ScenarioEvent[];
	duration: number; // Total duration in ms
};

// ─── Mock Server ──────────────────────────────────────────────────────────────

export class BlobOfficeMockServer {
	private wss: Awaited<ReturnType<typeof Bun.serve>> | null = null;
	private clients = new Set<globalThis.WebSocket>();
	private agents = new Map<string, AgentState>();
	private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
	private scenarioTimeout: ReturnType<typeof setTimeout> | null = null;
	private currentScenario: Scenario | null = null;
	private scenarioStartTime: number = 0;
	private port: number;

	constructor(port = 2727) {
		this.port = port;
	}

	// Get HTML with injected WS port
	private async getHtmlWithWsPort(): Promise<string> {
		const htmlPaths = [
			"./blob-office.html",
			"./blob-office.html",
			`${process.cwd()}/blob-office.html`,
		];

		for (const htmlPath of htmlPaths) {
			try {
				const file = Bun.file(htmlPath);
				if (await file.exists()) {
					let html = await file.text();
					// Inject WS port before the first script tag
					const injection = `<script>window.BLOB_OFFICE_WS_PORT = ${this.port};</script>`;
					html = html.replace("<script>", injection + "\n<script>");
					return html;
				}
			} catch {
				// Try next path
			}
		}

		throw new Error("Could not find blob-office.html");
	}

	// Start the mock server
	async start(): Promise<void> {
		console.log(`[mock-server] Starting on port ${this.port}...`);

		this.wss = Bun.serve({
			port: this.port,
			fetch: async (req, server) => {
				const url = new URL(req.url);

				// Serve HTML with injected WS port (at root path)
				if (url.pathname === "" || url.pathname === "/" || url.pathname === "/index.html") {
					try {
						const html = await this.getHtmlWithWsPort();
						return new Response(html, {
							headers: { "Content-Type": "text/html" },
						});
					} catch (e) {
						return new Response("HTML not found: " + (e as Error).message, { status: 500 });
					}
				}

				// WebSocket endpoint
				if (url.pathname === "/ws") {
					const success = server.upgrade(req, { data: {} });
					if (success) return undefined;
					return new Response("WebSocket upgrade failed", { status: 400 });
				}

				// HTTP control endpoints
				if (url.pathname === "/scenario/start" && req.method === "POST") {
					return this.handleStartScenario(req);
				}
				if (url.pathname === "/scenario/stop" && req.method === "POST") {
					return this.handleStopScenario();
				}
				if (url.pathname === "/scenario/status") {
					return this.handleGetStatus();
				}

				return new Response("Not Found", { status: 404 });
			},
			websocket: {
				open: (ws) => {
					console.log(`[mock-server] Client connected (${this.clients.size + 1} total)`);
					this.clients.add(ws as unknown as globalThis.WebSocket);

					// Send initial snapshot immediately (viewer expects this)
					this.broadcastSnapshot();
				},
				close: (ws) => {
					console.log(`[mock-server] Client disconnected (${this.clients.size - 1} remaining)`);
					this.clients.delete(ws as unknown as globalThis.WebSocket);
				},
				message: (ws, message) => {
					// Mock server doesn't need to handle client messages for basic testing
					// Could add echo/response logic later if needed
				},
			},
		});

		// Start heartbeat (every 25 seconds like real server)
		this.startHeartbeat();

		console.log(`[mock-server] Ready at ws://localhost:${this.port}/ws`);
		console.log(`[mock-server] Control endpoints:`);
		console.log(`  POST /scenario/start - Start a scenario`);
		console.log(`  POST /scenario/stop - Stop current scenario`);
		console.log(`  GET /scenario/status - Get current status`);
	}

	// Stop the mock server
	async stop(): Promise<void> {
		console.log("[mock-server] Stopping...");

		if (this.scenarioTimeout) {
			clearTimeout(this.scenarioTimeout);
			this.scenarioTimeout = null;
		}

		if (this.heartbeatInterval) {
			clearInterval(this.heartbeatInterval);
			this.heartbeatInterval = null;
		}

		// Send server closing message to clients
		const closingMsg = JSON.stringify({ type: "serverclosing", reason: "mock_server_stopped" });
		for (const ws of this.clients) {
			if (ws.readyState === WebSocket.OPEN) {
				ws.send(closingMsg);
			}
		}

		if (this.wss) {
			this.wss.stop();
			this.wss = null;
		}

		this.clients.clear();
		this.agents.clear();
		this.currentScenario = null;

		console.log("[mock-server] Stopped");
	}

	// Start heartbeat broadcasting
	private startHeartbeat(): void {
		this.heartbeatInterval = setInterval(() => {
			const heartbeatMsg = JSON.stringify({
				type: "heartbeat",
				timestamp: Date.now(),
			});

			// Also send current state periodically (like real server)
			const snapshotMsg = JSON.stringify({
				type: "snapshot",
				agents: [...this.agents.values()],
			});

			for (const ws of this.clients) {
				if (ws.readyState === WebSocket.OPEN) {
					ws.send(heartbeatMsg);
					ws.send(snapshotMsg);
				}
			}
		}, 25000); // Every 25 seconds
	}

	// Broadcast current agent state to all clients
	private broadcastSnapshot(): void {
		if (this.clients.size === 0) return;

		const msg = JSON.stringify({
			type: "snapshot",
			agents: [...this.agents.values()],
		});

		for (const ws of this.clients) {
			if (ws.readyState === WebSocket.OPEN) {
				ws.send(msg);
			}
		}
	}

	// HTTP handlers for scenario control
	private async handleStartScenario(req: Request): Promise<Response> {
		try {
			const body = await req.json() as { scenario: Scenario };
			const { scenario } = body;

			if (!scenario || !scenario.events) {
				return new Response(JSON.stringify({ error: "Invalid scenario format" }), {
					status: 400,
					headers: { "Content-Type": "application/json" },
				});
			}

			this.startScenario(scenario);

			return new Response(JSON.stringify({
				success: true,
				message: `Started scenario: ${scenario.name}`,
				duration: scenario.duration,
			}), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		} catch (err) {
			return new Response(JSON.stringify({ error: "Failed to parse request" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}
	}

	private handleStopScenario(): Response {
		this.stopScenario();
		return new Response(JSON.stringify({
			success: true,
			message: "Scenario stopped",
		}), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}

	private handleGetStatus(): Response {
		return new Response(JSON.stringify({
			running: this.currentScenario !== null,
			scenario: this.currentScenario?.name || null,
			clients: this.clients.size,
			agents: this.agents.size,
			elapsed: this.currentScenario ? Date.now() - this.scenarioStartTime : null,
		}), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}

	// Scenario playback
	private startScenario(scenario: Scenario): void {
		console.log(`[mock-server] Starting scenario: ${scenario.name}`);

		this.stopScenario(); // Stop any current scenario
		this.currentScenario = scenario;
		this.scenarioStartTime = Date.now();

		// Clear current agents
		this.agents.clear();

		// Schedule all events
		for (const event of scenario.events) {
			this.scenarioTimeout = setTimeout(() => {
				// Update agents from this event
				for (const agent of event.agents) {
					this.agents.set(agent.id, agent);
				}
				this.broadcastSnapshot();
			}, event.timestamp);
		}

		// Schedule scenario completion
		this.scenarioTimeout = setTimeout(() => {
			console.log(`[mock-server] Scenario completed: ${scenario.name}`);
			this.currentScenario = null;
		}, scenario.duration);
	}

	private stopScenario(): void {
		if (this.scenarioTimeout) {
			clearTimeout(this.scenarioTimeout);
			this.scenarioTimeout = null;
		}

		if (this.currentScenario) {
			console.log(`[mock-server] Stopped scenario: ${this.currentScenario.name}`);
			this.currentScenario = null;
		}

		// Clear agents and broadcast empty state
		this.agents.clear();
		this.broadcastSnapshot();
	}
}

// ─── CLI Interface ────────────────────────────────────────────────────────────

if (import.meta.main) {
	const port = parseInt(process.argv[2] || "2728");
	const server = new BlobOfficeMockServer(port);

	// Handle graceful shutdown
	process.on("SIGINT", async () => {
		console.log("\n[mock-server] Received SIGINT, shutting down...");
		await server.stop();
		process.exit(0);
	});

	process.on("SIGTERM", async () => {
		console.log("\n[mock-server] Received SIGTERM, shutting down...");
		await server.stop();
		process.exit(0);
	});

	server.start().catch((err) => {
		console.error("[mock-server] Failed to start:", err);
		process.exit(1);
	});
}

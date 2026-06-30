/**
 * blob-office.ts
 * Global OpenCode plugin — installed via OpenCode's plugin system
 *
 * Starts a WebSocket server on ws://localhost:2727 and broadcasts
 * live session state to the blob-office viewer (blob-office.html).
 *
 * Install:
 *   bunx opencode-blob-office install
 *   # OpenCode runs `bun install` automatically at next startup
 */

import type { Plugin } from "@opencode-ai/plugin";
import { existsSync, writeFileSync, unlinkSync, readFileSync } from "fs";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AgentStatus =
  | "idle"
  | "thinking"
  | "editing"
  | "reading"
  | "running"
  | "waiting"
  | "error";

export interface AgentState {
  id: string;
  parentID: string | null;
  folder: string;
  folderFull: string;
  title: string | null;
  status: AgentStatus;
  tool: string | null;
  message: string | null;
  since: number;
  color: number;
  idleSince: number | null;
  activityScale: number;
  recentFiles: string[];
  lastAssistantMessage: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function hueFromId(id: string): number {
	let h = 0;
	for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
	return h % 360;
}

export function folderName(path: string): string {
	return path.split("/").filter(Boolean).pop() ?? path;
}

export const TOOL_STATUS: Record<string, AgentStatus> = {
	write: "editing",
	edit: "editing",
	multiedit: "editing",
	read: "reading",
	glob: "reading",
	grep: "reading",
	ls: "reading",
	bash: "running",
	webfetch: "reading",
	websearch: "reading",
	task: "waiting",
	todoread: "reading",
	todowrite: "editing",
};

export function toolStatus(tool: string): AgentStatus {
	return TOOL_STATUS[tool.toLowerCase()] ?? "thinking";
}

export function toolLabel(tool: string): string {
	const labels: Record<string, string> = {
		write: "✏️ writing",
		edit: "✏️ editing",
		multiedit: "✏️ editing",
		read: "📖 reading",
		glob: "🔍 searching",
		grep: "🔍 searching",
		ls: "📂 listing",
		bash: "💻 running",
		webfetch: "🌐 fetching",
		websearch: "🌐 searching",
		task: "🤖 spawning…",
		todoread: "📋 todos",
		todowrite: "📋 updating",
	};
	return labels[tool.toLowerCase()] ?? `🔧 ${tool}`;
}

const IGNORE_PATTERNS = [
	"node_modules",
	".git",
	"dist",
	"build",
	"__pycache__",
	".venv",
	"vendor",
	".next",
	".cache",
	".DS_Store",
];

// Active states that should NOT be overwritten with "resumed"
const ACTIVE_STATES: AgentStatus[] = [
	"thinking",
	"editing",
	"reading",
	"running",
	"waiting",
];

export const agentFileActivity = new Map<string, Set<string>>();

export function isIgnored(filePath: string): boolean {
	const parts = filePath.split(/[/\\]/);
	return parts.some((part) => IGNORE_PATTERNS.includes(part));
}

export function recordFileActivity(agentId: string, filePath: string): void {
	if (!agentFileActivity.has(agentId)) {
		agentFileActivity.set(agentId, new Set());
	}
	agentFileActivity.get(agentId)!.add(filePath);
}

export function getActivityScale(agentId: string): number {
	const files = agentFileActivity.get(agentId)?.size ?? 0;
	// Logarithmic scale: 1 file → 1.0, 10 files → 1.15, 100 files → 1.3, 1000 files → 1.45
	const scale = 1.0 + Math.log10(Math.max(files, 1)) * 0.15;
	return Math.min(Math.max(scale, 1.0), 2.5);
}

/** Generate capitalization variants of a filename to pad short lists for animation variety. */
export function capVariants(name: string, maxVariants: number = 6): string[] {
	const variants: string[] = [name];
	const seen = new Set<string>([name]);

	// Find indices of letters that can be toggled
	const letterIndices: number[] = [];
	for (let i = 0; i < name.length; i++) {
		if (/[a-zA-Z]/.test(name[i])) letterIndices.push(i);
	}
	if (letterIndices.length === 0) return variants;

	// Toggle single characters
	for (const i of letterIndices) {
		if (variants.length >= maxVariants) break;
		const chars = [...name];
		chars[i] = chars[i] === chars[i].toUpperCase()
			? chars[i].toLowerCase()
			: chars[i].toUpperCase();
		const v = chars.join("");
		if (!seen.has(v)) { seen.add(v); variants.push(v); }
	}

	// Toggle pairs for more variety
	for (let a = 0; a < letterIndices.length && variants.length < maxVariants; a++) {
		for (let b = a + 1; b < letterIndices.length && variants.length < maxVariants; b++) {
			const chars = [...name];
			for (const i of [letterIndices[a], letterIndices[b]]) {
				chars[i] = chars[i] === chars[i].toUpperCase()
					? chars[i].toLowerCase()
					: chars[i].toUpperCase();
			}
			const v = chars.join("");
			if (!seen.has(v)) { seen.add(v); variants.push(v); }
		}
	}

	return variants;
}

/** Build the recentFiles list for an agent: basenames + cap-variant padding to ≥ minItems. */
export function buildRecentFiles(agentId: string, minItems: number = 8): string[] {
	const paths = agentFileActivity.get(agentId);
	if (!paths || paths.size === 0) return [];

	// Extract basenames, most-recent first (Set preserves insertion order)
	const basenames = [...paths]
		.map((p) => p.split(/[/\\]/).filter(Boolean).pop() ?? p)
		.filter(Boolean);
	// Deduplicate basenames (different paths can have the same filename)
	const unique = [...new Set(basenames)];

	if (unique.length >= minItems) return unique.slice(0, minItems);

	// Pad with capitalization variants until we reach minItems
	const result = [...unique];
	const seen = new Set(result);
	for (const name of unique) {
		if (result.length >= minItems) break;
		for (const v of capVariants(name)) {
			if (result.length >= minItems) break;
			if (!seen.has(v)) { seen.add(v); result.push(v); }
		}
	}
	return result;
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export const BlobOfficePlugin: Plugin = async ({ directory, client, $ }) => {
	// File-based diagnostic - guaranteed visible
	const diagFile = `${process.env.HOME}/.config/opencode/plugins/blob-office-diag.txt`;
	const diag = (msg: string) => {
		const ts = new Date().toISOString();
		const line = `[${ts}] ${msg}\n`;
		try {
			Bun.write(diagFile, line, { append: true });
		} catch {}
		console.log(`[blob-office] ${msg}`);
	};
	
	diag("Plugin initialization START");
	
	// Clear any stale activity data from previous sessions
	agentFileActivity.clear();

	const WS_BASE_PORT = 2727;
	const WS_MAX_PORT_ATTEMPTS = 10;
	let wsPort = WS_BASE_PORT;
	const agents = new Map<string, AgentState>();
	const clients = new Set<globalThis.WebSocket>();

	// Helper for structured logging (goes to OpenCode log, not terminal)
	const log = async (
		level: "debug" | "info" | "warn" | "error",
		msg: string,
	) => {
		try {
			await client?.app?.log?.({
				body: {
					service: "blob-office",
					level,
					message: msg,
				},
			});
		} catch {
			// Fallback to console if logging fails
		}
	};

	// Helper to show system notification on macOS (fire-and-forget)
	const notify = (title: string, message: string): void => {
		// Escape double quotes to prevent shell injection
		const safeTitle = title.replace(/"/g, '\\"');
		const safeMessage = message.replace(/"/g, '\\"');
		// Don't await - notifications should never block the plugin
		$`osascript -e 'display notification "${safeMessage}" with title "${safeTitle}"'`.catch(() => {
			// Silently fail if notifications aren't available
		});
	};

	// ── Broadcast to all connected clients ──────────────────────────────────

	// WebSocket connection to central server (for non-server instances)
	let syncWs: WebSocket | null = null;

	// Debounce mechanism to prevent rapid updates
	let broadcastTimeout: ReturnType<typeof setTimeout> | null = null;
	const BROADCAST_DEBOUNCE_MS = 50;

	function broadcast() {
		// Clear existing timeout to debounce rapid calls
		if (broadcastTimeout) {
			clearTimeout(broadcastTimeout);
		}

		broadcastTimeout = setTimeout(() => {
			broadcastTimeout = null;
			const msg = JSON.stringify({
				type: "snapshot",
				agents: [...agents.values()],
			});

			// Send to all connected viewer clients
			for (const ws of clients) {
				if (ws.readyState === WebSocket.OPEN) {
					ws.send(msg);
				}
			}

			// If we're a client instance, send incremental updates instead of full snapshot
			// to avoid overwriting other instances' agents
			if (syncWs && syncWs.readyState === WebSocket.OPEN) {
				const updateMsg = JSON.stringify({
					type: "agent_update",
					agents: [...agents.values()],
				});
				syncWs.send(updateMsg);
			}
		}, BROADCAST_DEBOUNCE_MS);
	}

	function updateAgent(id: string, patch: Partial<AgentState>) {
		const a = agents.get(id);
		if (!a) return;
		// Skip if nothing actually changed
		const changed = Object.keys(patch).some(
			(k) => a[k as keyof AgentState] !== patch[k as keyof AgentState],
		);
		if (!changed) return;
		Object.assign(a, patch, { since: Date.now() });
		broadcast();
	}

	// ── Auto-open browser ─────────────────────────────────────────────────────

	let browserOpened = false;
	let serverWasAlreadyRunning = false;
	let cachedRawHtml: string | null = null;

	async function getHtmlWithWsPort(injectedWsPort: number): Promise<string> {
		if (!cachedRawHtml) {
			// Find and read the HTML file — check multiple locations
			const htmlPaths: string[] = [];

			// 1. Same directory as this .ts file (works for installed plugins)
			const selfDir = new URL(".", import.meta.url).pathname;
			htmlPaths.push(`${selfDir}blob-office.html`);

			// 2. Try resolving from node_modules (installed via npm/bun)
			try {
				const pkgJson = import.meta.resolve("opencode-blob-office/package.json");
				const pkgDir = new URL(".", pkgJson).pathname;
				htmlPaths.push(`${pkgDir}blob-office.html`);
			} catch {
				// Not installed as npm package — OK, try fallbacks
			}

			// 3. Current working directory (local dev)
			htmlPaths.push(`${process.cwd()}/blob-office.html`);

			for (const htmlPath of htmlPaths) {
				try {
					const file = Bun.file(htmlPath);
					if (await file.exists()) {
						cachedRawHtml = await file.text();
						break;
					}
				} catch {
					// Try next path
				}
			}

			if (!cachedRawHtml) throw new Error("Could not find blob-office.html");
		}

		// Always inject the WS port fresh into the raw (unmodified) HTML
		const injection = `<script>window.BLOB_OFFICE_WS_PORT = ${injectedWsPort};</script>`;
		return cachedRawHtml.replace("<script>", injection + "\n<script>");
	}

	async function openViewer(wsPortToUse: number) {
		return;
	}

	// ── Bun WebSocket Server ─────────────────────────────────────────────────

	// Track WebSocket connections using Bun's native WebSocket
	let wss: Awaited<ReturnType<typeof Bun.serve>> | null = null;
	let isServerInstance = false; // true if this instance started the server
	let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
	let idleCleanupInterval: ReturnType<typeof setInterval> | null = null;

	// Start heartbeat to send periodic pings and prevent connection timeouts
	function startHeartbeat() {
		if (heartbeatInterval) return;
		heartbeatInterval = setInterval(() => {
			const heartbeatMsg = JSON.stringify({
				type: "heartbeat",
				timestamp: Date.now(),
			});
			for (const ws of clients) {
				if (ws.readyState === WebSocket.OPEN) {
					ws.send(heartbeatMsg);
				}
			}
		}, 25000); // Heartbeat every 25 seconds
	}

	// Start cleanup interval to remove idle subagents after 10 seconds
	function startIdleCleanup() {
		if (idleCleanupInterval) return;
		idleCleanupInterval = setInterval(() => {
			const now = Date.now();
			const toDelete: string[] = [];

			for (const [id, agent] of agents) {
				if (agent.parentID) {
					if (agent.idleSince) {
						const idleTime = now - agent.idleSince;
						if (idleTime > 10000) {
							diag(`Cleanup: ${id.substring(0, 8)} idle for ${Math.floor(idleTime/1000)}s`);
							toDelete.push(id);
						}
					} else if (agent.status === "waiting") {
						const waitingTime = now - agent.since;
						if (waitingTime > 30000) {
							diag(`Cleanup: ${id.substring(0, 8)} waiting for ${Math.floor(waitingTime/1000)}s`);
							toDelete.push(id);
						}
					}
				} else {
					const hasActiveSubagents = [...agents.values()].some(
						a => a.parentID === id && !a.idleSince
					);
					
					if (!hasActiveSubagents && (agent.status === "idle" || agent.status === "waiting")) {
						const idleTime = agent.idleSince ? now - agent.idleSince : now - agent.since;
						if (idleTime > 60000) {
							diag(`Cleanup: main agent ${id.substring(0, 8)} idle for ${Math.floor(idleTime/1000)}s (no active subagents)`);
							toDelete.push(id);
						}
					}
				}
			}

			if (toDelete.length > 0) {
				for (const id of toDelete) {
					agents.delete(id);
				}
				broadcast();
			}
		}, 1000);
	}

	diag("Starting WebSocket server setup...");
	
	// Global lock to prevent multiple server instances
	const lockFile = `${process.env.HOME}/.config/opencode/blob-office.lock`;
	
	// Check if server already running via lock file
	if (existsSync(lockFile)) {
		try {
			const lockContent = readFileSync(lockFile, 'utf-8');
			const lockData = JSON.parse(lockContent);
			const lockPort = lockData.port || WS_BASE_PORT;
			
			diag(`Lock file exists, connecting to existing server on port ${lockPort}`);
			serverWasAlreadyRunning = true;
			wsPort = lockPort;
			
			// Connect as client to existing server
			const wsUrl = `ws://localhost:${wsPort}/ws`;
			syncWs = new WebSocket(wsUrl);

			syncWs.onopen = () => {
				log("info", "Connected to existing Blob Office server as client");
				if (agents.size > 0) {
					const syncMsg = JSON.stringify({
						type: "full_sync",
						agents: [...agents.values()],
					});
					syncWs?.send(syncMsg);
					log("info", `Sent ${agents.size} agents to server during sync`);
				}
			};

			syncWs.onmessage = (ev) => {
				try {
					const msg = JSON.parse(ev.data);
					if (msg.type === "snapshot") {
						for (const agent of msg.agents) {
							if (!agents.has(agent.id)) {
								agents.set(agent.id, agent);
							} else {
								const existing = agents.get(agent.id)!;
								Object.assign(existing, agent);
							}
						}
					}
				} catch (err) {
					log("warn", `Failed to process sync message: ${(err as Error).message}`);
				}
			};

			syncWs.onerror = () => {
				log("warn", "Error connecting to existing server");
			};
			
			diag("Plugin initialization COMPLETE (client mode), returning hooks");
		} catch (err) {
			diag(`Lock file invalid, will try to start server: ${err}`);
			// Lock file corrupted, delete and continue to start server
			try { unlinkSync(lockFile); } catch {}
		}
	}
	
	// Only start server if no lock file or lock file was invalid
	if (!serverWasAlreadyRunning) {
	// Find available port (serves both HTTP and WebSocket on the same port)
	for (let portAttempt = 0; portAttempt < WS_MAX_PORT_ATTEMPTS; portAttempt++) {
		const tryPort = WS_BASE_PORT + portAttempt;
		diag(`Attempting WS port ${tryPort}...`);
		try {
			wss = Bun.serve({
				port: tryPort,
				hostname: "0.0.0.0",
				fetch: async (req, server) => {
					const url = new URL(req.url);
					
					// Serve HTML with injected WS port (at root path)
					if (url.pathname === "" || url.pathname === "/" || url.pathname === "/index.html") {
						try {
							const html = await getHtmlWithWsPort(tryPort);
							return new Response(html, {
								headers: { "Content-Type": "text/html" },
							});
						} catch (e) {
							return new Response("HTML not found: " + (e as Error).message, { status: 500 });
						}
					}
					
					// WebSocket upgrade
					if (url.pathname === "/ws") {
						const success = server.upgrade(req, { data: {} });
						if (success) return undefined;
						return new Response("WebSocket upgrade failed", { status: 400 });
					}
					
					return new Response("Not Found", { status: 404 });
				},
				websocket: {
					open(ws) {
						log("info", "Client connected");
						notify("Blob Office", "Viewer connected");
						clients.add(ws as unknown as globalThis.WebSocket);
						ws.send(
							JSON.stringify({ type: "snapshot", agents: [...agents.values()] }),
						);
					},
					close(ws) {
						log("info", "Client disconnected");
						clients.delete(ws as unknown as globalThis.WebSocket);
					},
					message(ws, message) {
						try {
							const msg = JSON.parse(message.toString());
							if (
								msg.type === "agent_update" ||
								msg.type === "full_sync" ||
								msg.type === "snapshot"
							) {
								for (const agent of msg.agents) {
									if (!agents.has(agent.id)) {
										agents.set(agent.id, agent);
									} else {
										const existing = agents.get(agent.id)!;
										if (agent.since >= existing.since) {
											Object.assign(existing, agent);
										}
									}
								}
								log(
									"info",
									`Merged ${msg.agents.length} agents from client, total: ${agents.size}`,
								);
								broadcast();
						}
					} catch (err) {
						log("warn", `Failed to process WebSocket message: ${(err as Error).message}`);
					}
				},
				},
		});
		wsPort = tryPort;
		isServerInstance = true;
		
		writeFileSync(lockFile, JSON.stringify({ port: tryPort, pid: process.pid }));
		
		diag(`Server started successfully on port ${tryPort}`);
		break;
	} catch (err) {
		diag(`Port ${tryPort} failed: ${(err as Error).message}`);
		if ((err as NodeJS.ErrnoException).code === "EADDRINUSE") {
			log("warn", `Port ${tryPort} in use, trying next...`);
			continue;
		}
		throw err;
	}
}
}

if (isServerInstance) {
	diag("Server instance - setting up heartbeat and cleanup...");
	startHeartbeat();
		startIdleCleanup();

		// Forceful shutdown — kill everything immediately
		const shutdown = () => {
			// Notify clients (best-effort, don't wait)
			const closingMsg = JSON.stringify({ type: "serverclosing", reason: "opencode_exit" });
			for (const ws of clients) {
				try {
					if (ws.readyState === WebSocket.OPEN) {
						ws.send(closingMsg);
						ws.close();
					}
				} catch {}
			}
			clients.clear();

			// Stop the HTTP/WS server
			if (wss) {
				try { wss.stop(true); } catch {} // true = force close
				wss = null;
			}

		// Clear intervals so nothing keeps the process alive
		if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
		if (idleCleanupInterval) { clearInterval(idleCleanupInterval); idleCleanupInterval = null; }
		if (broadcastTimeout) { clearTimeout(broadcastTimeout); broadcastTimeout = null; }
		
		try { unlinkSync(lockFile); } catch {}
	};

		process.on("beforeExit", shutdown);
		process.on("SIGINT", shutdown);
		process.on("SIGTERM", shutdown);
		process.on("exit", shutdown);

		const wsUrl = `ws://localhost:${wsPort}/ws`;
		const viewerUrl = `http://localhost:${wsPort}/`;
		log("info", `Server running on port ${wsPort} (viewer: ${viewerUrl}, ws: ${wsUrl})`);
		
		// Make showToast truly non-blocking with a timeout
		const toastPromise = client?.tui?.showToast?.({
			body: {
				title: "Blob Office",
				message: `Viewer: localhost:${wsPort}`,
				variant: "info",
				duration: 8000,
			},
		});
		
		// Don't await - let it complete in background with timeout
		if (toastPromise) {
			Promise.race([
				toastPromise,
				new Promise((_, reject) => setTimeout(() => reject(new Error("Toast timeout")), 2000))
			]).then(() => {
				diag("showToast completed");
			}).catch((e) => {
				diag(`showToast failed or timed out: ${e}`);
			});
		} else {
			diag("showToast not available");
		}
		
		diag(`WebSocket: ${wsUrl}`);
		diag(`Open viewer: ${viewerUrl}`);
	}

	diag("Plugin initialization COMPLETE, returning hooks");

	// ── Hooks ─────────────────────────────────────────────────────────────────

	return {
		// Tool about to execute — most interesting hook
		// Note: receives (input, output) as two parameters
		"tool.execute.before": async (input, output) => {
			const { sessionID, tool } = input as {
				sessionID: string;
				tool: string;
				callID: string;
			};

			// Track file activity from any tool that touches files
			const FILE_TOOLS = ["write", "edit", "multiedit", "read", "glob", "grep", "ls"];
			if (FILE_TOOLS.includes(tool.toLowerCase())) {
				try {
					const toolInput = input as any;
					const filePath = toolInput.filePath || toolInput.path || toolInput.pattern;

					if (filePath && typeof filePath === "string" && !isIgnored(filePath)) {
						recordFileActivity(sessionID, filePath);

						if (agents.has(sessionID)) {
							const agent = agents.get(sessionID)!;
							agent.activityScale = getActivityScale(sessionID);
							agent.recentFiles = buildRecentFiles(sessionID);
							broadcast();
						}
					}
				} catch {
					// Silently fail if we can't extract file path
				}
			}

			if (!sessionID || !agents.has(sessionID)) return;
			updateAgent(sessionID, {
				status: toolStatus(tool),
				tool: tool,
				message: toolLabel(tool),
			});
		},

		// Tool finished
		"tool.execute.after": async (input) => {
			const { sessionID } = input as { sessionID: string; tool: string };
			if (!sessionID || !agents.has(sessionID)) return;
			updateAgent(sessionID, {
				status: "thinking",
				tool: null,
				message: "🧠 thinking…",
			});
		},

		// Unified event hook - handles all session events
		event: async ({ event }) => {
			const eventProps = event.properties as Record<string, unknown>;

			switch (event.type) {
				// New session created
				case "session.created": {
					const sessionInfo = eventProps.info as {
						id: string;
						parentID?: string;
						title: string;
					};
					const id = sessionInfo.id;
					const parentID = sessionInfo.parentID;
					const title = sessionInfo.title;
					const isSubAgent = !!parentID;

					// Check if agent already exists before adding
					const agentAlreadyExists = agents.has(id);

					// Log for debugging - shows session info and agent count
					log(
						"info",
						`Session created: ${id.substring(0, 8)}..., parentID: ${parentID ? parentID.substring(0, 8) + "..." : "none"}, already exists: ${agentAlreadyExists}, agents count: ${agents.size}`,
					);

				agents.set(id, {
					id,
					parentID: parentID ?? null,
					folder: folderName(directory),
					folderFull: directory,
					title: title ?? null,
					status: "idle",
					tool: null,
					message: "✨ created",
					since: Date.now(),
					color: hueFromId(id),
					idleSince: null,
					activityScale: 1.0,
					recentFiles: [],
					lastAssistantMessage: null,
				});

					log("info", `Agent added, total agents: ${agents.size}`);

					// Subagent born → parent transitions from "spawning" to "supervising"
					if (isSubAgent && parentID && agents.has(parentID)) {
						updateAgent(parentID, {
							status: "waiting",
							message: "👀 supervising",
						});
					}

					broadcast();
					openViewer(wsPort);
					break;
				}

				// Session updated (includes when session is resumed/focused)
				case "session.updated": {
					const sessionInfo = eventProps.info as {
						id: string;
						title?: string;
					};
					const id = sessionInfo.id;
					const title = sessionInfo.title;

					const agentExists = agents.has(id);
					log(
						"info",
						`Session updated: ${id.substring(0, 8)}..., agent exists: ${agentExists}, agents count: ${agents.size}`,
					);

					// If agent doesn't exist yet, create it (edge case - session resumed but not created in this instance)
					if (!agents.has(id)) {
					const parentID = (eventProps.parentID as string) ?? null;
					agents.set(id, {
						id,
						parentID: parentID,
						folder: folderName(directory),
						folderFull: directory,
						title: title ?? null,
						status: "idle",
						tool: null,
						message: "↩️ resumed",
						since: Date.now(),
						color: hueFromId(id),
						idleSince: null,
						activityScale: 1.0,
						recentFiles: [],
						lastAssistantMessage: null,
					});
						log(
							"info",
							`Agent added via session.updated (${id.substring(0, 8)}...), parentID: ${parentID ? parentID.substring(0, 8) + "..." : "none"}, total agents: ${agents.size}`,
						);
					} else {
						// Agent already exists - check if it was just created (session.created already ran)
						// If message is "✨ created", don't override with "resumed"
						const existing = agents.get(id)!;
						const isNewSession = existing.message === "✨ created";

						const isActive = ACTIVE_STATES.includes(existing.status);

						// Sub-agents should never show "resumed" - they just show status indicators
						const isSubAgent = existing.parentID !== null;

						// Build update patch based on current state
						const updatePatch: Partial<AgentState> = {};

						if (isActive) {
							// Preserve active state and current message - don't show "resumed"
							// The agent is doing something (thinking, editing, etc.), keep showing that
						} else if (isNewSession || isSubAgent) {
							// New sessions and sub-agents don't show "resumed", just stay in their current idle/waiting state
							updatePatch.status = "idle";
							updatePatch.tool = null;
							updatePatch.message = null;
						} else {
							// Already idle main agent — only update title if changed, don't spam "resumed"
						}

						if (title) {
							updatePatch.title = title;
						}

						// Only update if we have changes to make
						if (Object.keys(updatePatch).length > 0) {
							updateAgent(id, updatePatch);
						}
					}
					broadcast();
					openViewer(wsPort);
					break;
				}

				// Session deleted / closed
				case "session.deleted": {
					const deletedSessionInfo = eventProps.info as { id: string };
					const id = deletedSessionInfo.id;
					agents.delete(id);
					agentFileActivity.delete(id);
					broadcast();
					break;
				}

				// Session went idle (agent finished its turn)
				case "session.idle": {
					const sessionID = eventProps.sessionID as string;
					if (!sessionID || !agents.has(sessionID)) return;
					const agent = agents.get(sessionID)!;
					const isSubagent = agent.parentID !== null;
					updateAgent(sessionID, {
						status: "idle",
						tool: null,
						message: isSubagent ? "💤 done" : "💤 waiting",
						idleSince: isSubagent ? Date.now() : null,
					});
					break;
				}

				// Status updates (thinking, etc)
				case "session.status": {
					const sessionID = eventProps.sessionID as string;
					const status = (eventProps.status as string).toLowerCase();
					if (!sessionID || !agents.has(sessionID)) return;
					if (status === "thinking" || status === "generating") {
						updateAgent(sessionID, {
							status: "thinking",
							message: "🧠 thinking…",
						});
					}
					break;
				}

				// Session error
				case "session.error": {
					const sessionID = eventProps.sessionID as string;
					if (!sessionID || !agents.has(sessionID)) return;
					updateAgent(sessionID, { status: "error", message: "❌ error" });
					break;
				}

				// Message updated — grab last user-visible content for speech bubble
			case "message.updated": {
				const messageInfo = eventProps.info as {
					id: string;
					sessionID: string;
					role: string;
					content?: any;
					text?: string;
				};
				const sessionID = messageInfo?.sessionID;
				if (!sessionID || !agents.has(sessionID)) return;
				if (messageInfo?.role !== "assistant") return;
				
				const content = messageInfo?.content || messageInfo?.text || "";
				const textContent = typeof content === 'string' ? content : JSON.stringify(content);
				
				diag(`Message updated for ${sessionID.substring(0, 8)}: ${textContent.substring(0, 100)}`);
				
				updateAgent(sessionID, {
					status: "thinking",
					message: "🧠 thinking…",
					lastAssistantMessage: textContent,
				});
				break;
			}

				// Permission needed — agent is blocked waiting for human
				case "permission.updated": {
					const sessionID = (eventProps as { sessionID: string }).sessionID;
					if (!sessionID || !agents.has(sessionID)) return;
					updateAgent(sessionID, {
						status: "waiting",
						message: "⚠️ needs permission",
					});
					break;
				}

				case "permission.replied": {
					const sessionID = (eventProps as { sessionID: string }).sessionID;
					if (!sessionID || !agents.has(sessionID)) return;
					updateAgent(sessionID, {
						status: "thinking",
						message: "🧠 thinking…",
					});
					break;
				}
			}
		},
	};
};

export default BlobOfficePlugin;

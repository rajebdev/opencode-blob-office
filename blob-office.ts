/**
 * blob-office.ts
 * Global OpenCode plugin — drop into ~/.config/opencode/plugins/
 *
 * Starts a WebSocket server on ws://localhost:2727 and broadcasts
 * live session state to the blob-office viewer (blob-office.html).
 *
 * Install:
 *   cp blob-office.ts ~/.config/opencode/plugins/
 *   cp package.json   ~/.config/opencode/plugins/
 *   # OpenCode runs `bun install` automatically at next startup
 */

import type { Plugin } from "@opencode-ai/plugin";

// ─── Types ────────────────────────────────────────────────────────────────────

type AgentStatus =
	| "idle"
	| "thinking"
	| "editing"
	| "reading"
	| "running"
	| "waiting"
	| "error";

interface AgentState {
	id: string;
	parentID: string | null; // ID of parent agent if this is a subagent
	folder: string; // basename of project directory
	folderFull: string; // full path
	title: string | null; // session title
	status: AgentStatus;
	tool: string | null; // current tool being executed
	message: string | null; // last speech bubble text
	since: number; // timestamp of last status change (ms)
	color: number; // hue 0–360, derived from session id
	idleSince: number | null; // timestamp when subagent went idle (for cleanup)
	activityScale: number; // 1.0 = normal, up to 2.5 (based on files modified)
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
	task: "thinking",
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
		task: "🤖 spawning",
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

	const BASE_PORT = 2727;
	const MAX_PORT_ATTEMPTS = 10;
	let actualPort = BASE_PORT;
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
		// Don't await - notifications should never block the plugin
		$`osascript -e 'display notification "${message}" with title "${title}"'`.catch(() => {
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
		Object.assign(a, patch, { since: Date.now() });
		broadcast();
	}

	// ── Auto-open browser ─────────────────────────────────────────────────────

	let browserOpened = false;
	let serverWasAlreadyRunning = false;

	async function openViewer() {
		// Don't open browser if server was already running (from previous OpenCode session)
		if (browserOpened || serverWasAlreadyRunning) return;
		browserOpened = true;
		// Find the viewer — look next to the plugin file, then home
		const candidates = [
			`${process.env.HOME}/.config/opencode/plugins/blob-office.html`,
			`${process.env.HOME}/blob-office/index.html`,
		];
		const viewer = candidates[0]; // default install location

		const platform = process.platform;
		const cmd =
			platform === "darwin"
				? ["open", viewer]
				: platform === "win32"
					? ["cmd", "/c", "start", "", viewer]
					: ["xdg-open", viewer];

		try {
			// Don't await - opening browser should never block the plugin
			Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore" });
		} catch {
			log("info", `Open viewer manually: ${viewer}`);
		}
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
			// Also broadcast current state periodically to keep clients in sync
			const snapshotMsg = JSON.stringify({
				type: "snapshot",
				agents: [...agents.values()],
			});
			for (const ws of clients) {
				if (ws.readyState === WebSocket.OPEN) {
					// Send heartbeat
					ws.send(heartbeatMsg);
					// Also send current state to ensure clients stay synced
					ws.send(snapshotMsg);
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
				// Only cleanup subagents (have parentID) that have been idle for 10+ seconds
				if (agent.parentID && agent.status === "idle" && agent.idleSince) {
					const idleTime = now - agent.idleSince;
					if (idleTime > 10000) {
						// 10 seconds
						toDelete.push(id);
					}
				}
			}

			if (toDelete.length > 0) {
				for (const id of toDelete) {
					agents.delete(id);
				}
				broadcast();
			}
		}, 1000); // Check every second
	}

	console.log("[blob-office] Starting WebSocket server setup...");
	diag("Starting WebSocket server setup...");
	
	for (let portAttempt = 0; portAttempt < MAX_PORT_ATTEMPTS; portAttempt++) {
		const tryPort = BASE_PORT + portAttempt;
		console.log(`[blob-office] Attempting port ${tryPort}...`);
			diag(`Attempting port ${tryPort}...`);
		try {
			wss = Bun.serve({
				port: tryPort,
				fetch(req, server) {
					const url = new URL(req.url);
					if (url.pathname === "/ws" || url.pathname === "/") {
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
						} catch {
						}
					},
				},
			});
			actualPort = tryPort;
			isServerInstance = true;
			console.log(`[blob-office] Server started successfully on port ${tryPort}`);
			break;
		} catch (err) {
			console.log(`[blob-office] Port ${tryPort} failed:`, (err as Error).message);
			if ((err as NodeJS.ErrnoException).code === "EADDRINUSE") {
				log("warn", `Port ${tryPort} in use, trying next...`);
				continue;
			}
			throw err;
		}
	}

	if (isServerInstance) {
		console.log("[blob-office] Server instance - setting up heartbeat and cleanup...");
		startHeartbeat();
		startIdleCleanup();

		// Graceful shutdown - notify clients before server closes
		const broadcastShutdown = () => {
			const closingMsg = JSON.stringify({ type: "serverclosing", reason: "opencode_exit" });
			for (const ws of clients) {
				try {
					if (ws.readyState === WebSocket.OPEN) {
						ws.send(closingMsg);
					}
				} catch {}
			}
		};

		process.on("beforeExit", broadcastShutdown);

		const wsUrl = `ws://localhost:${actualPort}/ws`;
		const viewerUrl = `file://${process.env.HOME}/.config/opencode/plugins/blob-office.html`;
		log("info", `WebSocket server running on ${wsUrl}`);
		console.log("[blob-office] About to call showToast...");
		
		// Make showToast truly non-blocking with a timeout
		const toastPromise = client?.tui?.showToast?.({
			body: {
				title: "Blob Office",
				message: `WebSocket: ${wsUrl}`,
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
				console.log("[blob-office] showToast completed");
			}).catch((e) => {
				console.log("[blob-office] showToast failed or timed out:", e);
			});
		} else {
			console.log("[blob-office] showToast not available");
		}
		
		console.log(`[blob-office] WebSocket: ${wsUrl}`);
		console.log(`[blob-office] Open viewer: ${viewerUrl}`);
	} else {
		console.log("[blob-office] No server - connecting as client...");
		log("warn", "No available port found, connecting to existing server as client");
		serverWasAlreadyRunning = true;
		const wsUrl = `ws://localhost:${BASE_PORT}`;
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
			} else {
				log("info", "No local agents to sync to server");
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
			} catch {
			}
		};

		syncWs.onerror = () => {
			log("warn", "Error connecting to existing server");
		};
	}

	console.log("[blob-office] Plugin initialization COMPLETE, returning hooks");

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

			// Track file modifications for activity scaling
			if (["write", "edit", "multiedit"].includes(tool.toLowerCase())) {
				try {
					const toolInput = input as any;
					const filePath = toolInput.filePath || toolInput.path;

					if (filePath && !isIgnored(filePath)) {
						recordFileActivity(sessionID, filePath);

						if (agents.has(sessionID)) {
							const agent = agents.get(sessionID)!;
							agent.activityScale = getActivityScale(sessionID);
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
					});

					log("info", `Agent added, total agents: ${agents.size}`);
					broadcast();
					openViewer();
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

						// Active states that should NOT be overwritten with "resumed"
						const activeStates: AgentStatus[] = [
							"thinking",
							"editing",
							"reading",
							"running",
							"waiting",
						];
						const isActive = activeStates.includes(existing.status);

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
							// Only show "resumed" for truly resumed idle/waiting main agents
							updatePatch.status = "idle";
							updatePatch.tool = null;
							updatePatch.message = "↩️ resumed";
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
					openViewer();
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
					};
					const sessionID = messageInfo?.sessionID;
					if (!sessionID || !agents.has(sessionID)) return;
					// Only care about assistant messages
					if (messageInfo?.role !== "assistant") return;
					updateAgent(sessionID, {
						status: "thinking",
						message: "🧠 thinking…",
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

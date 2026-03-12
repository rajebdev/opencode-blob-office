/**
 * Progressive test - add Bun.serve()
 */

import type { Plugin } from "@opencode-ai/plugin";

const diagFile = `${process.env.HOME}/.config/opencode/plugins/blob-office-diag.txt`;
const diag = (msg: string) => {
	const line = `[${new Date().toISOString()}] ${msg}\n`;
	Bun.write(diagFile, line, { append: true });
};

diag("MODULE LOAD START");

// Test Bun.serve at module level
let wss: Awaited<ReturnType<typeof Bun.serve>> | null = null;
const clients = new Set<globalThis.WebSocket>();

diag("About to call Bun.serve...");

try {
	wss = Bun.serve({
		port: 2727,
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
				clients.add(ws as unknown as globalThis.WebSocket);
			},
			close(ws) {
				clients.delete(ws as unknown as globalThis.WebSocket);
			},
			message(ws, message) {},
		},
	});
	diag("Bun.serve SUCCESS - server started on 2727");
} catch (err) {
	diag(`Bun.serve FAILED: ${(err as Error).message}`);
}

diag("MODULE LOAD END");

export const BlobOfficePlugin: Plugin = async ({ directory, client, $ }) => {
	diag("PLUGIN FUNCTION CALLED");
	return {
		"tool.execute.before": async () => {},
	};
};

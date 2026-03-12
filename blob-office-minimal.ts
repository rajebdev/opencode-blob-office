/**
 * Minimal test plugin to diagnose hanging
 */

import type { Plugin } from "@opencode-ai/plugin";

// Write to file immediately at module load time
const diagFile = `${process.env.HOME}/.config/opencode/plugins/blob-office-diag.txt`;
Bun.write(diagFile, `[${new Date().toISOString()}] MODULE LOAD START\n`, { append: true });

export const BlobOfficePlugin: Plugin = async ({ directory, client, $ }) => {
	Bun.write(diagFile, `[${new Date().toISOString()}] PLUGIN FUNCTION CALLED\n`, { append: true });
	
	return {
		"tool.execute.before": async () => {},
	};
};

Bun.write(diagFile, `[${new Date().toISOString()}] MODULE LOAD END\n`, { append: true });

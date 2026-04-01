#!/usr/bin/env node
import { parseArgs } from "node:util";
import { readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PLUGIN_DIR = join(homedir(), ".config/opencode/plugins");
const OPENCODE_CONFIG = join(homedir(), ".config/opencode/opencode.json");
const LEGACY_PLUGIN_FILES = [
	join(PLUGIN_DIR, "blob-office.ts"),
	join(PLUGIN_DIR, "blob-office.html"),
];

async function removeIfExists(path) {
	if (!existsSync(path)) return false;
	await rm(path, { force: true });
	return true;
}

const HELP = `
Blob Office — OpenCode Visualization Plugin

Usage:
  opencode-blob-office install      Install the plugin to OpenCode
  opencode-blob-office uninstall    Remove the plugin from OpenCode

Options:
  -h, --help                        Show this help message

After installation:
  1. Restart OpenCode
  2. The viewer opens automatically in your browser
  3. Start coding and watch your sessions come to life!
`;

async function install() {
	console.log("📦 Installing Blob Office plugin...\n");

	let removedLegacyFiles = 0;
	for (const path of LEGACY_PLUGIN_FILES) {
		if (await removeIfExists(path)) {
			removedLegacyFiles += 1;
		}
	}

	let config = { plugin: [] };
	if (existsSync(OPENCODE_CONFIG)) {
		try {
			const raw = await readFile(OPENCODE_CONFIG, "utf-8");
			config = JSON.parse(raw);
			if (!Array.isArray(config.plugin)) {
				config.plugin = [];
			}
		} catch {
			console.log("⚠️  Could not parse existing opencode.json, creating new one");
			config = { plugin: [] };
		}
	}

	if (!config.plugin.includes("opencode-blob-office")) {
		config.plugin.push("opencode-blob-office");
		console.log(`✓ Registered plugin in opencode.json`);
	} else {
		console.log(`✓ Plugin already registered in opencode.json`);
	}

	const legacyIdx = config.plugin.indexOf("blob-office");
	if (legacyIdx !== -1) {
		config.plugin.splice(legacyIdx, 1);
		console.log(`✓ Removed legacy blob-office entry from opencode.json`);
	}

	await writeFile(OPENCODE_CONFIG, JSON.stringify(config, null, 2) + "\n");

	if (removedLegacyFiles > 0) {
		console.log(`✓ Removed ${removedLegacyFiles} legacy local plugin file${removedLegacyFiles === 1 ? "" : "s"}`);
	}

	console.log(`\n✅ Blob Office installed successfully!\n`);
	console.log(`   OpenCode will automatically install the npm package on startup.`);
	console.log(`   The viewer opens automatically when OpenCode starts.`);
	console.log(`   WebSocket will run on ws://localhost:2727 (or next available port)\n`);
	console.log(`   Restart OpenCode to activate the plugin.\n`);
}

async function uninstall() {
	console.log("🗑️  Uninstalling Blob Office plugin...\n");

	let removedLegacyFiles = 0;
	for (const path of LEGACY_PLUGIN_FILES) {
		if (await removeIfExists(path)) {
			removedLegacyFiles += 1;
		}
	}
	if (removedLegacyFiles > 0) {
		console.log(`✓ Removed ${removedLegacyFiles} legacy local plugin file${removedLegacyFiles === 1 ? "" : "s"}`);
	}

	// Remove plugin registration from opencode.json
	if (existsSync(OPENCODE_CONFIG)) {
		try {
			const raw = await readFile(OPENCODE_CONFIG, "utf-8");
			const config = JSON.parse(raw);
			if (Array.isArray(config.plugin)) {
				// Remove opencode-blob-office (npm package)
				const idx = config.plugin.indexOf("opencode-blob-office");
				if (idx !== -1) {
					config.plugin.splice(idx, 1);
					console.log(`✓ Deregistered opencode-blob-office from opencode.json`);
				}
				// Also remove old blob-office entry if it exists
				const oldIdx = config.plugin.indexOf("blob-office");
				if (oldIdx !== -1) {
					config.plugin.splice(oldIdx, 1);
					console.log(`✓ Deregistered legacy blob-office from opencode.json`);
				}
				await writeFile(OPENCODE_CONFIG, JSON.stringify(config, null, 2) + "\n");
			}
		} catch {
			// Ignore parse errors
		}
	}

	console.log(`\n✅ Blob Office uninstalled successfully!\n`);
	console.log(`   Restart OpenCode to complete removal.\n`);
}

async function main() {
	const { values, positionals } = parseArgs({
		options: {
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: true,
	});

	if (values.help) {
		console.log(HELP);
		process.exit(0);
	}

	const command = positionals[0];

	if (command === "install") {
		await install();
	} else if (command === "uninstall") {
		await uninstall();
	} else if (!command) {
		console.log(HELP);
		process.exit(0);
	} else {
		console.error(`Unknown command: ${command}`);
		console.log(HELP);
		process.exit(1);
	}
}

main().catch((err) => {
	console.error("❌ Error:", err.message);
	process.exit(1);
});

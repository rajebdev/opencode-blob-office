#!/usr/bin/env node
import { parseArgs } from "node:util";
import { cp, mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = join(homedir(), ".config/opencode/plugins");
const OPENCODE_CONFIG = join(homedir(), ".config/opencode/opencode.json");

const HELP = `
Blob Office — OpenCode Visualization Plugin

Usage:
  blob-office install    Install the plugin to OpenCode

Options:
  -h, --help             Show this help message

After installation:
  1. Restart OpenCode
  2. Open the viewer at ~/.config/opencode/plugins/blob-office.html
  3. Start coding and watch your sessions come to life!
`;

async function install() {
	console.log("📦 Installing Blob Office plugin...\n");

	await mkdir(PLUGIN_DIR, { recursive: true });

	const srcDir = join(__dirname, "..");
	const files = [
		{ src: join(srcDir, "blob-office.ts"), dest: join(PLUGIN_DIR, "blob-office.ts") },
		{ src: join(srcDir, "blob-office.html"), dest: join(PLUGIN_DIR, "blob-office.html") },
	];

	for (const file of files) {
		if (!existsSync(file.src)) {
			console.error(`❌ Source file not found: ${file.src}`);
			process.exit(1);
		}
		await cp(file.src, file.dest);
		console.log(`✓ Copied ${file.dest}`);
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

	if (!config.plugin.includes("blob-office")) {
		config.plugin.push("blob-office");
		await writeFile(OPENCODE_CONFIG, JSON.stringify(config, null, 2) + "\n");
		console.log(`✓ Registered plugin in opencode.json`);
	} else {
		console.log(`✓ Plugin already registered in opencode.json`);
	}

	console.log(`\n✅ Blob Office installed successfully!\n`);
	console.log(`   Viewer: file://${PLUGIN_DIR}/blob-office.html`);
	console.log(`   WebSocket will run on ws://localhost:2727 (or next available port)\n`);
	console.log(`   Restart OpenCode to activate the plugin.\n`);
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

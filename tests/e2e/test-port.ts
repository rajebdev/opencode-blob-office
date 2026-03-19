/**
 * tests/e2e/test-port.ts
 * Reads the mock server port written by global-setup.ts
 */

import { readFileSync } from "fs";
import { join } from "path";

const PORT_FILE = join(process.cwd(), "test-results", ".mock-server-port");

export function getTestPort(): number {
	try {
		return parseInt(readFileSync(PORT_FILE, "utf-8").trim(), 10);
	} catch {
		// Fallback to default if port file not found
		return 2727;
	}
}

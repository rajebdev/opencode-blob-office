/**
 * scenarios/index.ts
 * Scenario definitions and helpers for blob-office testing
 */

import type { AgentState, AgentStatus } from "../blob-office.ts";

export type ScenarioEvent = {
	timestamp: number; // Relative to scenario start (ms)
	agents: AgentState[];
};

export type Scenario = {
	name: string;
	description: string;
	events: ScenarioEvent[];
	duration: number; // Total duration in ms
};

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Create a basic agent with sensible defaults
 */
export function createAgent(overrides: Partial<AgentState>): AgentState {
	return {
		id: `agent-${Date.now()}-${Math.random()}`,
		parentID: null,
		folder: "test-project",
		folderFull: "/test/project",
		title: null,
		status: "idle",
		tool: null,
		message: null,
		since: Date.now(),
		color: Math.floor(Math.random() * 360),
		idleSince: null,
		activityScale: 1.0,
		...overrides,
	};
}

/**
 * Create a subagent (child of a parent agent)
 */
export function createSubagent(parentId: string, overrides: Partial<AgentState>): AgentState {
	return createAgent({
		parentID: parentId,
		...overrides,
	});
}

/**
 * Create a scenario event at a specific timestamp
 */
export function eventAt(timestamp: number, agents: AgentState[]): ScenarioEvent {
	return { timestamp, agents };
}

/**
 * Create a transition: agent changes state at timestamp
 */
export function transitionAt(timestamp: number, agent: AgentState, newState: Partial<AgentState>): ScenarioEvent {
	const updatedAgent = { ...agent, ...newState, since: Date.now() };
	return eventAt(timestamp, [updatedAgent]);
}

/**
 * Create a status change event
 */
export function statusChangeAt(timestamp: number, agentId: string, status: AgentStatus, message?: string): ScenarioEvent {
	return eventAt(timestamp, [{
		...createAgent({ id: agentId }),
		status,
		message: message || null,
		since: Date.now(),
	}]);
}

// ─── Pre-built Scenarios ──────────────────────────────────────────────────────

/**
 * Basic agent lifecycle: create → think → edit → run → idle
 */
export const basicLifecycleScenario: Scenario = {
	name: "basic-lifecycle",
	description: "Single agent going through basic status transitions",
	events: [
		// Agent appears
		eventAt(0, [
			createAgent({
				id: "agent-1",
				status: "idle",
				message: "✨ created",
				color: 120, // Green
			}),
		]),

		// Start thinking
		eventAt(1000, [
			{
				id: "agent-1",
				parentID: null,
				folder: "test-project",
				folderFull: "/test/project",
				title: null,
				status: "thinking",
				tool: null,
				message: "🧠 thinking…",
				since: Date.now(),
				color: 120,
				idleSince: null,
				activityScale: 1.0,
			},
		]),

		// Start editing
		eventAt(3000, [
			{
				id: "agent-1",
				parentID: null,
				folder: "test-project",
				folderFull: "/test/project",
				title: null,
				status: "editing",
				tool: "edit",
				message: "✏️ editing",
				since: Date.now(),
				color: 120,
				idleSince: null,
				activityScale: 1.0,
			},
		]),

		// Start running
		eventAt(6000, [
			{
				id: "agent-1",
				parentID: null,
				folder: "test-project",
				folderFull: "/test/project",
				title: null,
				status: "running",
				tool: "bash",
				message: "💻 running",
				since: Date.now(),
				color: 120,
				idleSince: null,
				activityScale: 1.0,
			},
		]),

		// Go idle
		eventAt(9000, [
			{
				id: "agent-1",
				parentID: null,
				folder: "test-project",
				folderFull: "/test/project",
				title: null,
				status: "idle",
				tool: null,
				message: "💤 waiting",
				since: Date.now(),
				color: 120,
				idleSince: Date.now(),
				activityScale: 1.0,
			},
		]),
	],
	duration: 10000,
};

/**
 * Multiple agents scenario: main agent spawns subagents
 */
export const multiAgentScenario: Scenario = {
	name: "multi-agent",
	description: "Main agent spawns subagents that perform different tasks",
	events: [
		// Main agent appears — about to spawn
		eventAt(0, [
			createAgent({
				id: "main-agent",
				status: "waiting",
				message: "🤖 spawning…",
				color: 240, // Blue
			}),
		]),

		// Subagent 1 appears (reading) — parent now supervising
		eventAt(2000, [
			createAgent({
				id: "main-agent",
				status: "waiting",
				message: "👀 supervising",
				color: 240,
			}),
			createSubagent("main-agent", {
				id: "sub-1",
				status: "reading",
				tool: "read",
				message: "📖 reading files",
				color: 240,
			}),
		]),

		// Subagent 2 appears (editing) — parent still supervising
		eventAt(4000, [
			createAgent({
				id: "main-agent",
				status: "waiting",
				message: "👀 supervising",
				color: 240,
			}),
			createSubagent("main-agent", {
				id: "sub-1",
				status: "reading",
				tool: "read",
				message: "📖 reading files",
				color: 240,
			}),
			createSubagent("main-agent", {
				id: "sub-2",
				status: "editing",
				tool: "edit",
				message: "✏️ editing code",
				color: 240,
			}),
		]),

		// Subagents working, parent supervising
		eventAt(6000, [
			createAgent({
				id: "main-agent",
				status: "waiting",
				message: "👀 supervising",
				color: 240,
			}),
			createSubagent("main-agent", {
				id: "sub-1",
				status: "reading",
				tool: "read",
				message: "📖 reading files",
				color: 240,
			}),
			createSubagent("main-agent", {
				id: "sub-2",
				status: "editing",
				tool: "edit",
				message: "✏️ editing code",
				color: 240,
			}),
		]),

		// Subagent 1 finishes
		eventAt(8000, [
			createAgent({
				id: "main-agent",
				status: "idle",
				message: "💤 done",
				color: 240,
				idleSince: Date.now(),
			}),
			createSubagent("main-agent", {
				id: "sub-1",
				status: "idle",
				tool: null,
				message: "💤 done",
				color: 240,
				idleSince: Date.now(),
			}),
			createSubagent("main-agent", {
				id: "sub-2",
				status: "editing",
				tool: "edit",
				message: "✏️ editing code",
				color: 240,
			}),
		]),

		// Subagent 2 finishes
		eventAt(10000, [
			createAgent({
				id: "main-agent",
				status: "idle",
				message: "💤 done",
				color: 240,
				idleSince: Date.now(),
			}),
			createSubagent("main-agent", {
				id: "sub-1",
				status: "idle",
				tool: null,
				message: "💤 done",
				color: 240,
				idleSince: Date.now(),
			}),
			createSubagent("main-agent", {
				id: "sub-2",
				status: "idle",
				tool: null,
				message: "💤 done",
				color: 240,
				idleSince: Date.now(),
			}),
		]),
	],
	duration: 12000,
};

/**
 * Error scenario: agent encounters error state
 */
export const errorScenario: Scenario = {
	name: "error-handling",
	description: "Agent encounters and recovers from error state",
	events: [
		// Agent starts normally
		eventAt(0, [
			createAgent({
				id: "error-agent",
				status: "thinking",
				message: "🧠 thinking…",
				color: 0, // Red
			}),
		]),

		// Running some command
		eventAt(2000, [
			{
				id: "error-agent",
				parentID: null,
				folder: "test-project",
				folderFull: "/test/project",
				title: null,
				status: "running",
				tool: "bash",
				message: "💻 running command",
				since: Date.now(),
				color: 0,
				idleSince: null,
				activityScale: 1.0,
			},
		]),

		// Error occurs
		eventAt(4000, [
			{
				id: "error-agent",
				parentID: null,
				folder: "test-project",
				folderFull: "/test/project",
				title: null,
				status: "error",
				tool: null,
				message: "❌ command failed",
				since: Date.now(),
				color: 0,
				idleSince: null,
				activityScale: 1.0,
			},
		]),

		// Recover and try again
		eventAt(6000, [
			{
				id: "error-agent",
				parentID: null,
				folder: "test-project",
				folderFull: "/test/project",
				title: null,
				status: "thinking",
				tool: null,
				message: "🧠 retrying…",
				since: Date.now(),
				color: 0,
				idleSince: null,
				activityScale: 1.0,
			},
		]),

		// Success
		eventAt(8000, [
			{
				id: "error-agent",
				parentID: null,
				folder: "test-project",
				folderFull: "/test/project",
				title: null,
				status: "idle",
				tool: null,
				message: "✅ recovered",
				since: Date.now(),
				color: 0,
				idleSince: Date.now(),
				activityScale: 1.0,
			},
		]),
	],
	duration: 10000,
};

/**
 * Activity scaling scenario: agent modifies many files
 */
export const activityScalingScenario: Scenario = {
	name: "activity-scaling",
	description: "Agent shows increasing activity scale as it modifies more files",
	events: [
		// Start with low activity
		eventAt(0, [
			createAgent({
				id: "active-agent",
				status: "editing",
				message: "✏️ editing",
				color: 60, // Yellow
				activityScale: 1.0,
			}),
		]),

		// Medium activity
		eventAt(3000, [
			{
				id: "active-agent",
				parentID: null,
				folder: "test-project",
				folderFull: "/test/project",
				title: null,
				status: "editing",
				tool: "edit",
				message: "✏️ editing multiple files",
				since: Date.now(),
				color: 60,
				idleSince: null,
				activityScale: 1.3,
			},
		]),

		// High activity
		eventAt(6000, [
			{
				id: "active-agent",
				parentID: null,
				folder: "test-project",
				folderFull: "/test/project",
				title: null,
				status: "editing",
				tool: "multiedit",
				message: "✏️ editing many files",
				since: Date.now(),
				color: 60,
				idleSince: null,
				activityScale: 2.0,
			},
		]),

		// Very high activity
		eventAt(9000, [
			{
				id: "active-agent",
				parentID: null,
				folder: "test-project",
				folderFull: "/test/project",
				title: null,
				status: "running",
				tool: "bash",
				message: "💻 processing results",
				since: Date.now(),
				color: 60,
				idleSince: null,
				activityScale: 2.5,
			},
		]),

		// Back to idle
		eventAt(12000, [
			{
				id: "active-agent",
				parentID: null,
				folder: "test-project",
				folderFull: "/test/project",
				title: null,
				status: "idle",
				tool: null,
				message: "💤 done",
				since: Date.now(),
				color: 60,
				idleSince: Date.now(),
				activityScale: 2.5, // Keeps the final scale
			},
		]),
	],
	duration: 15000,
};

// ─── Scenario Registry ────────────────────────────────────────────────────────

export const scenarios = {
	"basic-lifecycle": basicLifecycleScenario,
	"multi-agent": multiAgentScenario,
	"error-handling": errorScenario,
	"activity-scaling": activityScalingScenario,
};

/**
 * Get all available scenario names
 */
export function getScenarioNames(): string[] {
	return Object.keys(scenarios);
}

/**
 * Get a scenario by name
 */
export function getScenario(name: string): Scenario | null {
	return scenarios[name] || null;
}
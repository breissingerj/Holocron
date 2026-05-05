/**
 * Chain Progress — Shows live chain step progress in the status bar
 * and fires a notification on each step transition.
 *
 * Listens to pi-subagents slash bridge events so it works automatically
 * for any /run-chain, /chain, or /run invocation with multiple steps.
 *
 * Nothing is shown for single-agent /run calls (progress.length < 2).
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

const SLASH_SUBAGENT_UPDATE_EVENT = "subagent:slash:update";
const SLASH_SUBAGENT_RESPONSE_EVENT = "subagent:slash:response";
const STATUS_KEY = "chain-progress";

interface AgentProgress {
	index: number;
	agent: string;
	status: "pending" | "running" | "completed" | "failed" | "detached";
	toolCount: number;
	currentTool?: string;
	durationMs: number;
}

interface SlashSubagentUpdate {
	requestId: string;
	progress?: AgentProgress[];
}

export default function (pi: ExtensionAPI) {
	// Skip in subagent child processes — only the parent session needs this UI.
	if (process.env["PI_SUBAGENT_CHILD"] === "1") return;

	let ctx: ExtensionContext | null = null;
	let lastStepIndex = -1;
	let lastRequestId = "";

	pi.on("session_start", async (_event, sessionCtx) => {
		ctx = sessionCtx;
		lastStepIndex = -1;
		lastRequestId = "";
	});

	pi.on("session_before_fork", async () => {
		ctx = null;
	});

	pi.on("session_shutdown", async () => {
		ctx = null;
	});

	pi.events.on(SLASH_SUBAGENT_UPDATE_EVENT, (data: unknown) => {
		if (!ctx?.hasUI) return;
		const update = data as SlashSubagentUpdate;
		const progress = update.progress;

		// Only show for chains (2+ steps); single /run is handled by pi-subagents itself.
		if (!progress || progress.length < 2) return;

		// Reset tracking when a new chain starts.
		if (update.requestId !== lastRequestId) {
			lastRequestId = update.requestId;
			lastStepIndex = -1;
		}

		const runningStep = progress.find((s) => s.status === "running");
		if (!runningStep) return;

		const total = progress.length;
		const stepNum = runningStep.index + 1;

		// Notify on each step transition so completions are visible in the scrollback.
		if (runningStep.index !== lastStepIndex) {
			ctx.ui.notify(`▶ Step ${stepNum}/${total}: ${runningStep.agent}`, "info");
			lastStepIndex = runningStep.index;
		}

		// Update status bar: [3/8] algorithm-plan · 12 tools · bash
		const tool = runningStep.currentTool ? ` · ${runningStep.currentTool}` : "";
		ctx.ui.setStatus(
			STATUS_KEY,
			`[${stepNum}/${total}] ${runningStep.agent} · ${runningStep.toolCount} tools${tool}`,
		);
	});

	// Clear the status bar when the chain finishes (success or error).
	pi.events.on(SLASH_SUBAGENT_RESPONSE_EVENT, (_data: unknown) => {
		if (!ctx?.hasUI) return;
		ctx.ui.setStatus(STATUS_KEY, undefined);
		lastStepIndex = -1;
		lastRequestId = "";
	});
}

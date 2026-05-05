/**
 * slash-synthesis.ts — Auto-synthesize after slash subagent runs
 *
 * pi-subagents' slash commands (/run-chain, /run, /chain, /parallel) inject
 * their results into the session with display:true but WITHOUT triggerTurn:true.
 * The result is in context, but the main LLM never gets a turn to respond.
 *
 * This extension listens for subagent:slash:response and — for non-management,
 * non-background completions — sends a lightweight synthesis prompt that
 * triggers the main LLM to process the chain results and respond.
 *
 * Synthesis is opt-in per session via /synthesis-on / /synthesis-off.
 * Default: ON.
 *
 * Placement: ~/.pi/agent/extensions/slash-synthesis.ts (auto-linked by install.sh)
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

// ─── Types (minimal subset of pi-subagents result shape) ─────────────────────

interface SlashResponse {
	requestId?: string;
	isError?:   boolean;
	result?: {
		details?: {
			mode?:        string;
			chainAgents?: string[];
			totalSteps?:  number;
			results?:     Array<{ agent?: string; exitCode?: number }>;
		};
	};
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI): void {
	if (process.env["PI_SUBAGENT_CHILD"] === "1") return;

	let synthesisEnabled = true;
	let widgetCtx: ExtensionContext | null = null;
	const eventUnsubs: Array<() => void> = [];

	// ── Refresh status line ─────────────────────────────────────────────────
	function updateStatus(): void {
		if (!widgetCtx?.hasUI) return;
		widgetCtx.ui.setStatus(
			"slash-synthesis",
			synthesisEnabled ? "⟳ synthesis on" : undefined,
		);
	}

	// ── Session lifecycle ───────────────────────────────────────────────────
	pi.on("session_start",  async (_e, ctx) => { widgetCtx = ctx; updateStatus(); });
	pi.on("session_switch", async (_e, ctx) => { widgetCtx = ctx; updateStatus(); });
	pi.on("session_fork",   async (_e, ctx) => { widgetCtx = ctx; updateStatus(); });
	pi.on("session_tree",   async (_e, ctx) => { widgetCtx = ctx; updateStatus(); });

	pi.on("session_shutdown", async () => {
		for (const unsub of eventUnsubs) { try { unsub(); } catch {} }
	});

	// ── Core: listen for slash completion ───────────────────────────────────
	const onSlashResponse = (data: unknown): void => {
		if (!synthesisEnabled) return;

		const resp = data as SlashResponse;
		if (!resp?.result?.details) return;

		const details = resp.result.details;
		const mode = details.mode;

		// Skip management actions (list, status, doctor, etc.) and single
		// no-op runs where we don't need synthesis
		if (!mode || mode === "management") return;

		// Build a context string so the synthesis prompt is grounded
		const agentList = details.chainAgents?.join(" → ")
			?? details.results?.map(r => r.agent).filter(Boolean).join(", ")
			?? mode;

		const stepCount = details.totalSteps ?? details.results?.length ?? 0;
		const failed    = details.results?.filter(r => r.exitCode !== 0).length ?? 0;
		const status    = resp.isError
			? "completed with errors"
			: failed > 0
			? `completed (${failed} step(s) failed)`
			: "completed successfully";

		const modeLabel = mode === "chain"    ? "chain"
			: mode === "parallel" ? "parallel run"
			: "subagent run";

		// Defer slightly so the SLASH_RESULT_TYPE message is fully settled
		// in the session before we trigger the LLM turn.
		setTimeout(() => {
			pi.sendMessage(
				{
					customType: "slash-synthesis-trigger",
					content: [
						`The ${modeLabel} (${agentList}${stepCount ? `, ${stepCount} step(s)` : ""}) ${status}.`,
						`Review the subagent results now in your context and provide a concise synthesis:`,
						`what was accomplished, any key decisions or findings, and recommended next actions.`,
					].join(" "),
					display: false,   // ← don't show the trigger prompt in the chat UI
				},
				{ triggerTurn: true, deliverAs: "followUp" },
			);
		}, 100);
	};

	const u = pi.events.on("subagent:slash:response", onSlashResponse);
	if (typeof u === "function") eventUnsubs.push(u);

	// ── /synthesis-on / /synthesis-off commands ─────────────────────────────
	pi.registerCommand("synthesis-on", {
		description: "Enable auto-synthesis after slash subagent runs (default)",
		handler: async (_args, ctx) => {
			widgetCtx = ctx;
			synthesisEnabled = true;
			updateStatus();
			ctx.ui.notify("Synthesis enabled — main agent will respond after each slash run.", "success");
		},
	});

	pi.registerCommand("synthesis-off", {
		description: "Disable auto-synthesis after slash subagent runs",
		handler: async (_args, ctx) => {
			widgetCtx = ctx;
			synthesisEnabled = false;
			updateStatus();
			ctx.ui.notify("Synthesis disabled — slash runs will complete silently.", "info");
		},
	});
}

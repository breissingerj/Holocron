/**
 * subagent-progress.ts — Live card-grid progress tracker for pi-subagents
 *
 * Hooks into tool_execution_start / tool_execution_update / tool_execution_end
 * for every `subagent` tool call and renders a real-time card grid showing:
 *   • per-agent status  (pending ○ / running ● / done ✓ / error ✗)
 *   • elapsed time
 *   • last work line extracted from streaming partial output
 *
 * Layout mirrors disler's agent-chain card-grid and subagent-widget UX:
 *   chain    → cards left-to-right with ──▶ arrows
 *   parallel → cards side-by-side
 *   single   → one full-width card
 *
 * Multiple concurrent `subagent` calls (e.g. LLM parallelizing two chains in
 * one turn) each get their own labelled section stacked vertically.
 * Completed runs linger for 8 s then auto-clear.
 *
 * Placement: ~/.pi/agent/extensions/subagent-progress.ts (auto-linked by install.sh)
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Text, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { applyExtensionDefaults } from "./themeMap.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

type CardStatus = "pending" | "running" | "done" | "error";
type RunMode    = "single" | "parallel" | "chain" | "management";

interface AgentCard {
	name:      string;       // agent name, e.g. "scout" or "worker[2]"
	task:      string;       // task preview (may be empty for inherited chain steps)
	status:    CardStatus;
	startTime: number;       // epoch ms; 0 while still pending
	elapsed:   number;       // ms since startTime
	lastWork:  string;       // last meaningful line from streaming output
}

interface RunState {
	callId:        string;
	runIndex:      number;   // 1-based display label
	mode:          RunMode;
	cards:         AgentCard[];
	overallStatus: "running" | "done" | "error";
	startTime:     number;
	elapsed:       number;
}

// ─── Input shapes for the `subagent` tool ────────────────────────────────────
// (Mirrors the pi-subagents tool parameter schema)

interface ChainStep {
	agent?:    string;
	task?:     string;
	parallel?: Array<{ agent: string; task?: string; count?: number }>;
}

interface ParallelTask {
	agent:  string;
	task?:  string;
	count?: number;
}

interface SubagentInput {
	agent?:  string;
	task?:   string;
	action?: string;          // management action — no card display needed
	tasks?:  ParallelTask[];
	chain?:  ChainStep[];
}

// ─── Display helpers ──────────────────────────────────────────────────────────

function displayName(name: string): string {
	return name.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function fmtElapsed(ms: number): string {
	if (ms < 1000)  return `${ms}ms`;
	if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
	return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function clamp(s: string, max: number): string {
	return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// ─── Card rendering (5 lines, disler style) ───────────────────────────────────

function renderCard(card: AgentCard, colWidth: number, theme: any): string[] {
	const inner = Math.max(6, colWidth - 2); // visible chars between │ │

	// ── Status colours / icons ─────────────────────────────────────────────
	const statusColor = card.status === "pending" ? "dim"
		: card.status === "running" ? "accent"
		: card.status === "done"    ? "success"
		: "error";

	const statusIcon  = card.status === "pending" ? "○"
		: card.status === "running" ? "●"
		: card.status === "done"    ? "✓"
		: "✗";

	// ── Line 1: agent name ─────────────────────────────────────────────────
	const rawName   = displayName(card.name);
	const nameTrunc = clamp(rawName, inner - 1);
	const nameLine  = theme.bold(theme.fg("accent", nameTrunc));
	const nameVis   = nameTrunc.length;

	// ── Line 2: status + elapsed ───────────────────────────────────────────
	const timeStr   = card.status !== "pending" ? ` ${fmtElapsed(card.elapsed)}` : "";
	const statusRaw = `${statusIcon} ${card.status}${timeStr}`;
	const statusLine = theme.fg(statusColor, statusRaw);
	const statusVis  = statusRaw.length;

	// ── Line 3: last work / task fallback ──────────────────────────────────
	const workRaw  = card.lastWork
		? clamp(card.lastWork, inner - 1)
		: card.task
		? clamp(card.task, inner - 1)
		: "—";
	const workLine = card.lastWork
		? theme.fg("muted",  workRaw)
		: theme.fg("dim",    workRaw);
	const workVis  = workRaw.length;

	// ── Border helpers ─────────────────────────────────────────────────────
	const b = (s: string) => theme.fg("dim", s);
	const top = b("┌") + b("─".repeat(inner)) + b("┐");
	const bot = b("└") + b("─".repeat(inner)) + b("┘");

	const row = (content: string, visLen: number): string =>
		b("│") + content + " ".repeat(Math.max(0, inner - visLen)) + b("│");

	return [
		top,
		row(" " + nameLine,   1 + nameVis),
		row(" " + statusLine, 1 + statusVis),
		row(" " + workLine,   1 + workVis),
		bot,
	];
}

// ─── Grid assembly (chain ──▶ or parallel side-by-side) ───────────────────────

const ARROW_W  = 5; // visible width of " ──▶ "
const ARROW_ROW = 2; // row index (0-based) in the 5-line card to put the arrow

function renderGrid(cards: AgentCard[], mode: RunMode, width: number, theme: any): string[] {
	if (cards.length === 0) return [];

	const isChain  = mode === "chain";
	const gapW     = isChain ? ARROW_W : 2;
	const cols     = cards.length;
	const colWidth = Math.max(10, Math.floor((width - gapW * (cols - 1)) / cols));

	const cardLines  = cards.map(c => renderCard(c, colWidth, theme));
	const cardHeight = cardLines[0]!.length;
	const output: string[] = [];

	for (let row = 0; row < cardHeight; row++) {
		let line = cardLines[0]![row]!;
		for (let c = 1; c < cols; c++) {
			line += (row === ARROW_ROW && isChain)
				? theme.fg("dim", " ──▶ ")
				: " ".repeat(gapW);
			line += cardLines[c]![row]!;
		}
		output.push(line);
	}

	return output;
}

// ─── Partial-result parsing ───────────────────────────────────────────────────

/** Extract the last non-decorative, non-trivial line from streaming text. */
function extractLastWork(text: string): string {
	const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
	for (let i = lines.length - 1; i >= 0; i--) {
		const l = lines[i]!;
		if (/^[─━═\-┤├┘└┐┌│╭╰╮╯]+$/.test(l)) continue;    // pure box-drawing
		if (/^[\s\d.%]+$/.test(l))             continue;    // pure numbers/whitespace
		if (l.length < 3)                      continue;    // too short to be useful
		return l;
	}
	return lines[lines.length - 1] ?? "";
}

/**
 * Try to advance chain card states by scanning pi-subagents' compact progress
 * text for patterns like "done scout → running planner" or "✓ scout".
 */
function advanceChainCards(text: string, cards: AgentCard[], now: number): void {
	// "done <agent>" → mark done
	for (const m of text.matchAll(/\bdone\s+([\w-]+)/gi)) {
		const name = m[1]!.toLowerCase();
		const card = cards.find(c => c.name.toLowerCase() === name);
		if (card && card.status === "running") {
			card.status  = "done";
			card.elapsed = card.startTime ? now - card.startTime : card.elapsed;
		}
	}

	// "● <agent>" or "running <agent>" → ensure marked running, start next pending
	for (const m of text.matchAll(/(?:●|running)\s+([\w-]+)/gi)) {
		const name = m[1]!.toLowerCase();
		const card = cards.find(c => c.name.toLowerCase() === name);
		if (card && card.status === "pending") {
			card.status    = "running";
			card.startTime = now;
		}
	}

	// "✓ <agent>" → shorthand done
	for (const m of text.matchAll(/✓\s+([\w-]+)/g)) {
		const name = m[1]!.toLowerCase();
		const card = cards.find(c => c.name.toLowerCase() === name);
		if (card && card.status === "running") {
			card.status  = "done";
			card.elapsed = card.startTime ? now - card.startTime : card.elapsed;
		}
	}

	// If a done card's successor is still pending, advance it to running
	for (let i = 0; i < cards.length - 1; i++) {
		if (cards[i]!.status === "done" && cards[i + 1]!.status === "pending") {
			cards[i + 1]!.status    = "running";
			cards[i + 1]!.startTime = now;
		}
	}
}

/**
 * Apply structured step details if pi-subagents exposes them in partialResult.details.
 * Shape: { steps: Array<{ agent, status, elapsed?, output? }> }
 */
function applyStructuredDetails(details: any, cards: AgentCard[], now: number): void {
	if (!Array.isArray(details?.steps)) return;
	for (const step of details.steps) {
		const name = (step.agent ?? "").toLowerCase();
		const card = cards.find(c => c.name.toLowerCase() === name);
		if (!card) continue;
		if (step.status && ["pending", "running", "done", "error"].includes(step.status)) {
			card.status = step.status;
		}
		if (typeof step.elapsed === "number") card.elapsed = step.elapsed;
		if (typeof step.output  === "string" && step.output) {
			const work = extractLastWork(step.output);
			if (work) card.lastWork = work;
		}
	}
}

// ─── RunState factory ─────────────────────────────────────────────────────────

function buildRunState(callId: string, runIndex: number, input: SubagentInput): RunState {
	const now = Date.now();
	let mode: RunMode = "single";
	let cards: AgentCard[] = [];

	if (input.action) {
		mode = "management";
	} else if (input.chain?.length) {
		mode  = "chain";
		cards = input.chain.flatMap((step, i) => {
			if (step.parallel?.length) {
				// Inline parallel step inside a chain — show as separate pending cards
				return step.parallel.flatMap(p =>
					Array.from({ length: p.count ?? 1 }, (_, j) => ({
						name:      (p.count ?? 1) > 1 ? `${p.agent}[${j + 1}]` : p.agent,
						task:      p.task ?? "",
						status:    "pending" as CardStatus,
						startTime: 0,
						elapsed:   0,
						lastWork:  "",
					}))
				);
			}
			return [{
				name:      step.agent ?? "?",
				task:      step.task  ?? "",
				status:    (i === 0 ? "running" : "pending") as CardStatus,
				startTime: i === 0 ? now : 0,
				elapsed:   0,
				lastWork:  "",
			}];
		});
	} else if (input.tasks?.length) {
		mode  = "parallel";
		cards = input.tasks.flatMap(t =>
			Array.from({ length: t.count ?? 1 }, (_, i) => ({
				name:      (t.count ?? 1) > 1 ? `${t.agent}[${i + 1}]` : t.agent,
				task:      t.task ?? "",
				status:    "running" as CardStatus,
				startTime: now,
				elapsed:   0,
				lastWork:  "",
			}))
		);
	} else {
		mode  = "single";
		cards = [{
			name:      input.agent ?? "?",
			task:      input.task  ?? "",
			status:    "running" as CardStatus,
			startTime: now,
			elapsed:   0,
			lastWork:  "",
		}];
	}

	return { callId, runIndex, mode, cards, overallStatus: "running", startTime: now, elapsed: 0 };
}

// ─── Extension entry point ────────────────────────────────────────────────────

export default function (pi: ExtensionAPI): void {
	// This extension is for the orchestrating parent session only.
	// pi-subagents sets PI_SUBAGENT_CHILD=1 in child processes.
	if (process.env["PI_SUBAGENT_CHILD"] === "1") return;

	// ── Module state ────────────────────────────────────────────────────────
	const runs         = new Map<string, RunState>();
	const clearTimers  = new Map<string, ReturnType<typeof setTimeout>>();
	let   runCounter   = 0;
	let   widgetCtx:   ExtensionContext | null = null;
	let   tuiRef:      any                    = null;   // captured from widget factory
	let   widgetOpen   = false;
	let   elapsedTimer: ReturnType<typeof setInterval> | null = null;

	// ── Elapsed ticker ──────────────────────────────────────────────────────
	function startElapsedTimer(): void {
		if (elapsedTimer) return;
		elapsedTimer = setInterval(() => {
			const now = Date.now();
			let hasRunning = false;
			for (const run of runs.values()) {
				if (run.overallStatus !== "running") continue;
				hasRunning   = true;
				run.elapsed  = now - run.startTime;
				for (const card of run.cards) {
					if (card.status === "running" && card.startTime) {
						card.elapsed = now - card.startTime;
					}
				}
			}
			if (hasRunning) tuiRef?.requestRender();
		}, 500);
	}

	function stopElapsedTimer(): void {
		const anyRunning = [...runs.values()].some(r => r.overallStatus === "running");
		if (!anyRunning && elapsedTimer) {
			clearInterval(elapsedTimer);
			elapsedTimer = null;
		}
	}

	// ── Widget lifecycle ────────────────────────────────────────────────────

	function renderWidget(width: number, theme: any): string[] {
		const active = [...runs.values()].filter(r => r.mode !== "management");
		if (active.length === 0) return [];

		const lines: string[] = [];

		for (const run of active) {
			// ── Header ─────────────────────────────────────────────────────
			const modeLabel =
				run.mode === "chain"    ? "chain"    :
				run.mode === "parallel" ? "parallel" : "agent";

			const agentSummary = run.cards.length <= 4
				? run.cards.map(c => c.name).join(", ")
				: `${run.cards.slice(0, 3).map(c => c.name).join(", ")} +${run.cards.length - 3}`;

			const statusColor = run.overallStatus === "running" ? "accent"
				: run.overallStatus === "done" ? "success" : "error";
			const statusIcon  = run.overallStatus === "running" ? "●"
				: run.overallStatus === "done" ? "✓" : "✗";

			const header = [
				" ",
				theme.fg(statusColor, statusIcon),
				theme.fg("dim",    ` #${run.runIndex} ${modeLabel} `),
				theme.fg("muted",  clamp(agentSummary, 48)),
				theme.fg("dim",    " · "),
				theme.fg(statusColor, fmtElapsed(run.elapsed)),
			].join("");

			lines.push(truncateToWidth(header, width, ""));

			// ── Card grid ──────────────────────────────────────────────────
			const gridLines = renderGrid(run.cards, run.mode, width - 2, theme);
			for (const l of gridLines) lines.push(" " + l);

			lines.push(""); // spacer between runs
		}

		return lines;
	}

	/** Open the widget (registers factory, closes over `runs` map). */
	function openWidget(): void {
		if (widgetOpen || !widgetCtx?.hasUI) return;
		widgetOpen = true;

		widgetCtx.ui.setWidget("subagent-progress", (tui, theme) => {
			tuiRef = tui;
			const content = new Text("", 0, 0);

			return {
				render(width: number): string[] {
					const lines = renderWidget(width, theme);
					content.setText(lines.join("\n"));
					return content.render(width);
				},
				invalidate(): void { content.invalidate(); },
			};
		}, { placement: "belowEditor" });
	}

	/** Close / hide the widget. */
	function closeWidget(): void {
		if (!widgetOpen || !widgetCtx?.hasUI) return;
		widgetOpen = false;
		tuiRef     = null;
		widgetCtx.ui.setWidget("subagent-progress", undefined);
	}

	/** Sync widget visibility with current run count. */
	function syncWidget(): void {
		const active = [...runs.values()].filter(r => r.mode !== "management");
		if (active.length > 0) {
			openWidget();
			tuiRef?.requestRender();
		} else {
			closeWidget();
		}
	}

	// ── Session lifecycle ───────────────────────────────────────────────────

	function resetState(ctx: ExtensionContext): void {
		for (const t of clearTimers.values()) clearTimeout(t);
		clearTimers.clear();
		if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
		runs.clear();
		runCounter = 0;
		widgetOpen = false;
		tuiRef     = null;
		widgetCtx  = ctx;
		// No widget to show yet — will open when first run starts
	}

	pi.on("session_start",  async (_e, ctx) => { applyExtensionDefaults(import.meta.url, ctx); resetState(ctx); });
	pi.on("session_switch", async (_e, ctx) => resetState(ctx));
	pi.on("session_fork",   async (_e, ctx) => resetState(ctx));
	pi.on("session_tree",   async (_e, ctx) => resetState(ctx));

	pi.on("session_shutdown", async () => {
		if (elapsedTimer) clearInterval(elapsedTimer);
		for (const t of clearTimers.values()) clearTimeout(t);
	});

	// ── Tool execution hooks ────────────────────────────────────────────────

	pi.on("tool_execution_start", async (event, ctx) => {
		if (event.toolName !== "subagent") return;

		// Ensure widgetCtx is populated even if this fires before session_start resolves
		if (!widgetCtx) widgetCtx = ctx;

		const input = event.args as SubagentInput;
		runCounter++;

		const run = buildRunState(event.toolCallId, runCounter, input);
		runs.set(event.toolCallId, run);

		if (run.mode !== "management") {
			startElapsedTimer();
			syncWidget();
		}
	});

	pi.on("tool_execution_update", async (event) => {
		if (event.toolName !== "subagent") return;
		const run = runs.get(event.toolCallId);
		if (!run || run.mode === "management") return;

		const now     = Date.now();
		const partial = event.partialResult as any;

		// ── Structured details (if pi-subagents provides them) ────────────
		if (partial?.details) {
			applyStructuredDetails(partial.details, run.cards, now);
		}

		// ── Text-based parsing (always attempt as fallback) ───────────────
		const text = (partial?.content as any[])?.find?.((c: any) => c.type === "text")?.text ?? "";

		if (text) {
			const lastLine = extractLastWork(text);

			// Update last work on the currently running card
			if (lastLine) {
				const active = run.cards.find(c => c.status === "running");
				if (active) active.lastWork = lastLine;
			}

			// For chain mode, try to detect step transitions from progress text
			if (run.mode === "chain") {
				advanceChainCards(text, run.cards, now);
			}
		}

		tuiRef?.requestRender();
	});

	pi.on("tool_execution_end", async (event) => {
		if (event.toolName !== "subagent") return;
		const run = runs.get(event.toolCallId);
		if (!run) return;

		const finalStatus: CardStatus = event.isError ? "error" : "done";
		run.overallStatus = event.isError ? "error" : "done";
		run.elapsed       = Date.now() - run.startTime;

		// Settle any unsettled cards
		for (const card of run.cards) {
			if (card.status === "running" || card.status === "pending") {
				card.status  = finalStatus;
				card.elapsed = card.startTime ? Date.now() - card.startTime : run.elapsed;
			}
		}

		stopElapsedTimer();
		tuiRef?.requestRender();

		// Auto-clear this run from the grid after 8 s
		const t = setTimeout(() => {
			runs.delete(event.toolCallId);
			clearTimers.delete(event.toolCallId);
			syncWidget();
		}, 8000);
		clearTimers.set(event.toolCallId, t);
	});

	// ── /subagent-progress command ──────────────────────────────────────────

	pi.registerCommand("subagent-progress", {
		description: "Show / refresh the subagent progress grid",
		handler: async (_args, ctx) => {
			widgetCtx = ctx;
			const active = [...runs.values()].filter(r => r.mode !== "management");
			if (active.length === 0) {
				ctx.ui.notify("No subagent runs tracked in this session.", "info");
				return;
			}
			// Re-open in case it was closed
			widgetOpen = false;
			openWidget();
			tuiRef?.requestRender();
		},
	});

	// ── Ctrl+Shift+G shortcut (toggle grid) ─────────────────────────────────

	pi.registerShortcut("ctrl+shift+g", {
		description: "Toggle subagent progress grid",
		handler: async (ctx) => {
			widgetCtx = ctx;
			if (widgetOpen) {
				closeWidget();
			} else {
				openWidget();
				tuiRef?.requestRender();
			}
		},
	});
}

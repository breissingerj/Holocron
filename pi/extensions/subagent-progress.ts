/**
 * subagent-progress.ts — Live card-grid progress tracker for pi-subagents
 *
 * Hooks into two separate execution paths:
 *
 *   1. LLM tool calls  — tool_execution_start / update / end for the `subagent` tool
 *   2. Slash commands  — subagent:slash:request / update / response on pi.events
 *      (covers /run-chain, /run, /parallel, /chain which never go through the LLM)
 *
 * Both paths feed the same RunState → card-grid renderer.
 *
 * Layout mirrors disler's agent-chain and subagent-widget UX:
 *   chain    → cards left-to-right with ──▶ arrows
 *   parallel → cards side-by-side
 *   single   → one full-width card
 *
 * Slash commands have rich structured AgentProgress[] data (status, durationMs,
 * toolCount, recentOutput, currentTool) — no text parsing needed for that path.
 * LLM tool calls use partialResult text as fallback.
 *
 * Multiple concurrent runs (e.g. two parallel chains in one LLM turn) each get
 * their own labelled section stacked vertically.
 * Completed runs linger 8 s then auto-clear.
 *
 * Placement: ~/.pi/agent/extensions/subagent-progress.ts (auto-linked by install.sh)
 * Toggle:    Ctrl+Shift+G  or  /subagent-progress
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Text, truncateToWidth } from "@mariozechner/pi-tui";
import { applyExtensionDefaults } from "./themeMap.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

type CardStatus = "pending" | "running" | "done" | "error";
type RunMode    = "single" | "parallel" | "chain" | "management";

interface AgentCard {
	name:      string;
	task:      string;
	status:    CardStatus;
	startTime: number;   // epoch ms; 0 while pending
	elapsed:   number;   // ms
	lastWork:  string;   // last meaningful line / current tool
	toolCount: number;
}

interface RunState {
	callId:        string;
	runIndex:      number;
	mode:          RunMode;
	cards:         AgentCard[];
	overallStatus: "running" | "done" | "error";
	startTime:     number;
	elapsed:       number;
}

// ─── Input shapes (pi-subagents tool / slash params) ─────────────────────────

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
	action?: string;
	tasks?:  ParallelTask[];
	chain?:  ChainStep[];
}

// AgentProgress from pi-subagents types.ts (rich structured data)
interface AgentProgress {
	index:             number;
	agent:             string;
	status:            "pending" | "running" | "completed" | "failed" | "detached";
	task:              string;
	currentTool?:      string;
	recentOutput:      string[];
	toolCount:         number;
	durationMs:        number;
}

// ─── Display helpers ──────────────────────────────────────────────────────────

function displayName(name: string): string {
	return name.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function fmtElapsed(ms: number): string {
	if (ms <  1000)  return `${ms}ms`;
	if (ms < 60000)  return `${(ms / 1000).toFixed(1)}s`;
	return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function clamp(s: string, max: number): string {
	return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// ─── Card rendering (5-line disler style) ────────────────────────────────────

function renderCard(card: AgentCard, colWidth: number, theme: any): string[] {
	const inner = Math.max(6, colWidth - 2);

	const statusColor = card.status === "pending" ? "dim"
		: card.status === "running" ? "accent"
		: card.status === "done"    ? "success"
		: "error";

	const statusIcon = card.status === "pending" ? "○"
		: card.status === "running" ? "●"
		: card.status === "done"    ? "✓"
		: "✗";

	// Line 1: agent name
	const nameTrunc = clamp(displayName(card.name), inner - 1);
	const nameLine  = theme.bold(theme.fg("accent", nameTrunc));
	const nameVis   = nameTrunc.length;

	// Line 2: status + elapsed + tool count
	const toolSuffix = card.status === "running" && card.toolCount > 0
		? ` [${card.toolCount}t]` : "";
	const timeStr    = card.status !== "pending" ? ` ${fmtElapsed(card.elapsed)}` : "";
	const statusRaw  = `${statusIcon} ${card.status}${timeStr}${toolSuffix}`;
	const statusLine = theme.fg(statusColor, statusRaw);
	const statusVis  = statusRaw.length;

	// Line 3: last work / current tool / task fallback
	const workRaw  = card.lastWork
		? clamp(card.lastWork, inner - 1)
		: card.task
		? clamp(card.task, inner - 1)
		: "—";
	const workLine = card.lastWork
		? theme.fg("muted", workRaw)
		: theme.fg("dim",   workRaw);
	const workVis  = workRaw.length;

	const b   = (s: string) => theme.fg("dim", s);
	const top = b("┌") + b("─".repeat(inner)) + b("┐");
	const bot = b("└") + b("─".repeat(inner)) + b("┘");
	const row = (content: string, vis: number): string =>
		b("│") + content + " ".repeat(Math.max(0, inner - vis)) + b("│");

	return [
		top,
		row(" " + nameLine,   1 + nameVis),
		row(" " + statusLine, 1 + statusVis),
		row(" " + workLine,   1 + workVis),
		bot,
	];
}

// ─── Grid assembly ────────────────────────────────────────────────────────────

const ARROW_W   = 5;  // " ──▶ "
const ARROW_ROW = 2;  // row index (0-based) where arrow is placed

function renderGrid(cards: AgentCard[], mode: RunMode, width: number, theme: any): string[] {
	if (cards.length === 0) return [];

	const isChain = mode === "chain";
	const gapW    = isChain ? ARROW_W : 2;
	const cols    = cards.length;
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

// ─── AgentProgress → AgentCard update (slash path) ───────────────────────────

function applyAgentProgress(cards: AgentCard[], progress: AgentProgress[]): void {
	const now = Date.now();

	for (const p of progress) {
		// Match by index first (authoritative), then by agent name
		const card = (p.index >= 0 && p.index < cards.length)
			? cards[p.index]
			: cards.find(c => c.name === p.agent);
		if (!card) continue;

		// Status
		const next: CardStatus =
			p.status === "pending"   ? "pending" :
			p.status === "running"   ? "running" :
			p.status === "completed" ? "done"    :
			p.status === "failed"    ? "error"   : "done";

		if (next !== card.status) {
			card.status = next;
			if (next === "running" && !card.startTime) card.startTime = now;
		}

		// pi-subagents tracks elapsed authoritatively
		if (p.durationMs > 0) card.elapsed = p.durationMs;

		// Tool count
		if (p.toolCount > card.toolCount) card.toolCount = p.toolCount;

		// Last work: prefer recentOutput, then currentTool
		if (p.recentOutput.length > 0) {
			const last = p.recentOutput[p.recentOutput.length - 1];
			if (last?.trim()) card.lastWork = last.trim();
		} else if (p.currentTool) {
			card.lastWork = p.currentTool;
		}
	}
}

// ─── Text fallback for LLM-path partialResult ────────────────────────────────

function extractLastWork(text: string): string {
	const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 2);
	for (let i = lines.length - 1; i >= 0; i--) {
		const l = lines[i]!;
		if (/^[─━═\-┤├┘└┐┌│╭╰╮╯]+$/.test(l)) continue;
		if (/^[\s\d.%]+$/.test(l))            continue;
		return l;
	}
	return lines[lines.length - 1] ?? "";
}

// For LLM-path chain: detect step transitions from partial text patterns
function advanceChainCards(text: string, cards: AgentCard[]): void {
	const now = Date.now();

	for (const m of text.matchAll(/\bdone\s+([\w-]+)/gi)) {
		const card = cards.find(c => c.name.toLowerCase() === m[1]!.toLowerCase());
		if (card?.status === "running") {
			card.status  = "done";
			card.elapsed = card.startTime ? now - card.startTime : card.elapsed;
		}
	}
	for (const m of text.matchAll(/(?:●|running)\s+([\w-]+)/gi)) {
		const card = cards.find(c => c.name.toLowerCase() === m[1]!.toLowerCase());
		if (card?.status === "pending") { card.status = "running"; card.startTime = now; }
	}
	for (const m of text.matchAll(/✓\s+([\w-]+)/g)) {
		const card = cards.find(c => c.name.toLowerCase() === m[1]!.toLowerCase());
		if (card?.status === "running") {
			card.status  = "done";
			card.elapsed = card.startTime ? now - card.startTime : card.elapsed;
		}
	}
	// Auto-advance: if a done card's next sibling is still pending, start it
	for (let i = 0; i < cards.length - 1; i++) {
		if (cards[i]!.status === "done" && cards[i + 1]!.status === "pending") {
			cards[i + 1]!.status    = "running";
			cards[i + 1]!.startTime = now;
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
				return step.parallel.flatMap(p =>
					Array.from({ length: p.count ?? 1 }, (_, j) => ({
						name:      (p.count ?? 1) > 1 ? `${p.agent}[${j + 1}]` : p.agent,
						task:      p.task ?? "",
						status:    "pending" as CardStatus,
						startTime: 0, elapsed: 0, lastWork: "", toolCount: 0,
					}))
				);
			}
			return [{
				name:      step.agent ?? "?",
				task:      step.task  ?? "",
				status:    (i === 0 ? "running" : "pending") as CardStatus,
				startTime: i === 0 ? now : 0,
				elapsed:   0, lastWork: "", toolCount: 0,
			}];
		});
	} else if (input.tasks?.length) {
		mode  = "parallel";
		cards = input.tasks.flatMap(t =>
			Array.from({ length: t.count ?? 1 }, (_, i) => ({
				name:      (t.count ?? 1) > 1 ? `${t.agent}[${i + 1}]` : t.agent,
				task:      t.task ?? "",
				status:    "running" as CardStatus,
				startTime: now, elapsed: 0, lastWork: "", toolCount: 0,
			}))
		);
	} else {
		mode  = "single";
		cards = [{
			name:      input.agent ?? "?",
			task:      input.task  ?? "",
			status:    "running" as CardStatus,
			startTime: now, elapsed: 0, lastWork: "", toolCount: 0,
		}];
	}

	return { callId, runIndex, mode, cards, overallStatus: "running", startTime: now, elapsed: 0 };
}

// ─── Extension entry point ────────────────────────────────────────────────────

export default function (pi: ExtensionAPI): void {
	if (process.env["PI_SUBAGENT_CHILD"] === "1") return;

	// ── Module state ────────────────────────────────────────────────────────
	const runs        = new Map<string, RunState>();
	const clearTimers = new Map<string, ReturnType<typeof setTimeout>>();
	const eventUnsubs: Array<() => void> = [];
	let   runCounter  = 0;
	let   widgetCtx:  ExtensionContext | null = null;
	let   tuiRef:     any                    = null;
	let   widgetOpen  = false;
	let   elapsedTimer: ReturnType<typeof setInterval> | null = null;

	// ── Elapsed ticker (for LLM-path cards whose durationMs isn't updated) ─
	function startElapsedTimer(): void {
		if (elapsedTimer) return;
		elapsedTimer = setInterval(() => {
			const now = Date.now();
			let hasRunning = false;
			for (const run of runs.values()) {
				if (run.overallStatus !== "running") continue;
				hasRunning  = true;
				run.elapsed = now - run.startTime;
				for (const card of run.cards) {
					// Only tick cards whose elapsed isn't being fed by AgentProgress
					if (card.status === "running" && card.startTime && card.elapsed < now - card.startTime) {
						card.elapsed = now - card.startTime;
					}
				}
			}
			if (hasRunning) tuiRef?.requestRender();
		}, 500);
	}

	function stopElapsedTimer(): void {
		if (!elapsedTimer) return;
		if ([...runs.values()].some(r => r.overallStatus === "running")) return;
		clearInterval(elapsedTimer);
		elapsedTimer = null;
	}

	// ── Widget ─────────────────────────────────────────────────────────────

	function renderAll(width: number, theme: any): string[] {
		const active = [...runs.values()].filter(r => r.mode !== "management");
		if (active.length === 0) return [];

		const lines: string[] = [];

		for (const run of active) {
			const modeLabel = run.mode === "chain" ? "chain"
				: run.mode === "parallel" ? "parallel" : "agent";

			const names = run.cards.length <= 4
				? run.cards.map(c => c.name).join(", ")
				: `${run.cards.slice(0, 3).map(c => c.name).join(", ")} +${run.cards.length - 3}`;

			const scol  = run.overallStatus === "running" ? "accent"
				: run.overallStatus === "done" ? "success" : "error";
			const sicon = run.overallStatus === "running" ? "●"
				: run.overallStatus === "done" ? "✓" : "✗";

			const header = [
				" ",
				theme.fg(scol,   sicon),
				theme.fg("dim",  ` #${run.runIndex} ${modeLabel} `),
				theme.fg("muted", clamp(names, 48)),
				theme.fg("dim",  " · "),
				theme.fg(scol,   fmtElapsed(run.elapsed)),
			].join("");

			lines.push(truncateToWidth(header, width, ""));

			const grid = renderGrid(run.cards, run.mode, width - 2, theme);
			for (const l of grid) lines.push(" " + l);

			lines.push("");
		}

		return lines;
	}

	function openWidget(): void {
		if (widgetOpen || !widgetCtx?.hasUI) return;
		widgetOpen = true;

		widgetCtx.ui.setWidget("subagent-progress", (tui, theme) => {
			tuiRef = tui;
			const content = new Text("", 0, 0);
			return {
				render(width: number): string[] {
					content.setText(renderAll(width, theme).join("\n"));
					return content.render(width);
				},
				invalidate(): void { content.invalidate(); },
			};
		}, { placement: "belowEditor" });
	}

	function closeWidget(): void {
		if (!widgetOpen || !widgetCtx?.hasUI) return;
		widgetOpen = false;
		tuiRef     = null;
		widgetCtx.ui.setWidget("subagent-progress", undefined);
	}

	function syncWidget(): void {
		const active = [...runs.values()].filter(r => r.mode !== "management");
		if (active.length > 0) { openWidget(); tuiRef?.requestRender(); }
		else closeWidget();
	}

	// ── Common: finalize a run ──────────────────────────────────────────────
	function finalizeRun(run: RunState, isError: boolean): void {
		const finalStatus: CardStatus = isError ? "error" : "done";
		run.overallStatus = isError ? "error" : "done";
		run.elapsed       = Date.now() - run.startTime;

		for (const card of run.cards) {
			if (card.status === "running" || card.status === "pending") {
				card.status  = finalStatus;
				card.elapsed = card.startTime ? Date.now() - card.startTime : run.elapsed;
			}
		}

		stopElapsedTimer();
		tuiRef?.requestRender();
	}

	function scheduleAutoClear(callId: string): void {
		const t = setTimeout(() => {
			runs.delete(callId);
			clearTimers.delete(callId);
			syncWidget();
		}, 8000);
		clearTimers.set(callId, t);
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
	}

	pi.on("session_start",  async (_e, ctx) => { applyExtensionDefaults(import.meta.url, ctx); resetState(ctx); });
	pi.on("session_switch", async (_e, ctx) => resetState(ctx));
	pi.on("session_fork",   async (_e, ctx) => resetState(ctx));
	pi.on("session_tree",   async (_e, ctx) => resetState(ctx));

	pi.on("session_shutdown", async () => {
		if (elapsedTimer) clearInterval(elapsedTimer);
		for (const t of clearTimers.values()) clearTimeout(t);
		for (const unsub of eventUnsubs) { try { unsub(); } catch {} }
	});

	// ── Path A: LLM calls `subagent` tool ──────────────────────────────────
	//    Fires for: natural language delegation ("use scout to…"),
	//               the `subagent` tool parameter, programmatic /run calls
	//               where the LLM picks up and re-delegates.
	//    Does NOT fire for: /run-chain, /run, /parallel, /chain slash commands.

	pi.on("tool_execution_start", async (event, ctx) => {
		if (event.toolName !== "subagent") return;
		if (!widgetCtx) widgetCtx = ctx;

		const input = event.args as SubagentInput;
		if (input.action) return;

		runCounter++;
		runs.set(event.toolCallId, buildRunState(event.toolCallId, runCounter, input));
		startElapsedTimer();
		syncWidget();
	});

	pi.on("tool_execution_update", async (event) => {
		if (event.toolName !== "subagent") return;
		const run = runs.get(event.toolCallId);
		if (!run || run.mode === "management") return;

		const partial = event.partialResult as any;

		// Prefer structured AgentProgress[] details from pi-subagents
		const progressArr: AgentProgress[] | undefined = partial?.details?.progress;
		if (progressArr?.length) {
			applyAgentProgress(run.cards, progressArr);
		} else {
			// Text fallback
			const text = (partial?.content as any[])?.find?.((c: any) => c.type === "text")?.text ?? "";
			if (text) {
				const last = extractLastWork(text);
				if (last) {
					const active = run.cards.find(c => c.status === "running");
					if (active) active.lastWork = last;
				}
				if (run.mode === "chain") advanceChainCards(text, run.cards);
			}
		}

		tuiRef?.requestRender();
	});

	pi.on("tool_execution_end", async (event) => {
		if (event.toolName !== "subagent") return;
		const run = runs.get(event.toolCallId);
		if (!run) return;

		finalizeRun(run, event.isError);
		scheduleAutoClear(event.toolCallId);
	});

	// ── Path B: Slash commands (/run-chain, /run, /parallel, /chain) ───────
	//    pi-subagents emits these events on pi.events for every slash-driven run.

	const onSlashRequest = (data: unknown): void => {
		const req = data as { requestId?: string; params?: SubagentInput };
		if (!req?.requestId || !req?.params) return;
		if (req.params.action) return;

		// Cancel any pending clear for this requestId (re-run case)
		const existing = clearTimers.get(req.requestId);
		if (existing) { clearTimeout(existing); clearTimers.delete(req.requestId); }

		runCounter++;
		runs.set(req.requestId, buildRunState(req.requestId, runCounter, req.params));
		startElapsedTimer();
		syncWidget();
	};

	const onSlashUpdate = (data: unknown): void => {
		const upd = data as { requestId?: string; progress?: AgentProgress[] };
		if (!upd?.requestId) return;
		const run = runs.get(upd.requestId);
		if (!run || run.mode === "management") return;

		if (upd.progress?.length) {
			applyAgentProgress(run.cards, upd.progress);
			// Also update overall elapsed from max card elapsed
			const maxElapsed = Math.max(...run.cards.map(c => c.elapsed), 0);
			if (maxElapsed > run.elapsed) run.elapsed = maxElapsed;
		}

		tuiRef?.requestRender();
	};

	const onSlashResponse = (data: unknown): void => {
		const resp = data as { requestId?: string; isError?: boolean };
		if (!resp?.requestId) return;
		const run = runs.get(resp.requestId);
		if (!run) return;

		finalizeRun(run, resp.isError ?? false);
		scheduleAutoClear(resp.requestId);
	};

	// Register and capture unsubscribe handles
	const u1 = pi.events.on("subagent:slash:request",  onSlashRequest);
	const u2 = pi.events.on("subagent:slash:update",   onSlashUpdate);
	const u3 = pi.events.on("subagent:slash:response", onSlashResponse);
	if (typeof u1 === "function") eventUnsubs.push(u1);
	if (typeof u2 === "function") eventUnsubs.push(u2);
	if (typeof u3 === "function") eventUnsubs.push(u3);

	// ── Commands & shortcuts ────────────────────────────────────────────────

	pi.registerCommand("subagent-progress", {
		description: "Show / refresh the subagent progress grid",
		handler: async (_args, ctx) => {
			widgetCtx = ctx;
			const active = [...runs.values()].filter(r => r.mode !== "management");
			if (active.length === 0) {
				ctx.ui.notify("No subagent runs tracked this session.", "info");
				return;
			}
			widgetOpen = false;
			openWidget();
			tuiRef?.requestRender();
		},
	});

	pi.registerShortcut("ctrl+shift+g", {
		description: "Toggle subagent progress grid",
		handler: async (ctx) => {
			widgetCtx = ctx;
			if (widgetOpen) closeWidget();
			else { openWidget(); tuiRef?.requestRender(); }
		},
	});
}

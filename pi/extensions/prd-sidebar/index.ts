/**
 * PRD Sidebar Extension
 *
 * Displays the active session PRD from $HOLOCRON_MEMORY_DIR/WORK/ as a
 * persistent passive right-side overlay in the pi TUI. The sidebar does NOT
 * capture keyboard focus — chat interaction remains fully active while it is open.
 *
 * Toggle: /prd command  or  Ctrl+Shift+P
 * Close:  /prd again (cycles visible → hidden → visible) or session end
 *
 * Session tracking: the extension listens to tool_result events and pins the
 * PRD.md path whenever the AI writes/edits a file under WORK/. This ensures
 * each session tracks its own PRD even when multiple pi sessions run in parallel.
 *
 * Fallback: on session start with no prior history, the most recently modified
 * PRD.md in WORK/ is used as the initial value.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import { matchesKey, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import type { OverlayHandle, Theme, TUI } from "@mariozechner/pi-tui";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PrdFrontmatter {
	task?: string;
	slug?: string;
	effort?: string;
	phase?: string;
	progress?: string;
	mode?: string;
	started?: string;
	updated?: string;
}

interface Criterion {
	done: boolean;
	id: string;
	text: string;
}

interface ParsedPrd {
	frontmatter: PrdFrontmatter;
	criteria: Criterion[];
	filePath: string;
}

// ─── PRD Parsing ─────────────────────────────────────────────────────────────

function parseFrontmatter(content: string): { fm: PrdFrontmatter; body: string } {
	const fm: PrdFrontmatter = {};
	const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (!match) return { fm, body: content };

	for (const line of (match[1] ?? "").split("\n")) {
		const kv = line.match(/^(\w+):\s*(.+)$/);
		if (kv) fm[kv[1] as keyof PrdFrontmatter] = kv[2]!.trim();
	}

	return { fm, body: match[2] ?? "" };
}

function parseCriteria(body: string): Criterion[] {
	const results: Criterion[] = [];
	for (const line of body.split("\n")) {
		const m = line.match(/^-\s+\[(x| )\]\s+(ISC-\d+[A-Z]*):\s+(.+)$/);
		if (m) results.push({ done: m[1] === "x", id: m[2]!, text: m[3]! });
	}
	return results;
}

function parsePrd(filePath: string): ParsedPrd | null {
	try {
		const content = fs.readFileSync(filePath, "utf-8");
		const { fm, body } = parseFrontmatter(content);
		return { frontmatter: fm, criteria: parseCriteria(body), filePath };
	} catch {
		return null;
	}
}

// ─── PRD Discovery (fallback only) ───────────────────────────────────────────

function findLatestPrd(workDir: string): string | null {
	try {
		if (!fs.existsSync(workDir)) return null;
		let latest: { filePath: string; mtime: number } | null = null;
		for (const entry of fs.readdirSync(workDir, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue;
			const prdPath = path.join(workDir, entry.name, "PRD.md");
			try {
				const stat = fs.statSync(prdPath);
				if (!latest || stat.mtimeMs > latest.mtime) latest = { filePath: prdPath, mtime: stat.mtimeMs };
			} catch { /* no PRD.md here */ }
		}
		return latest?.filePath ?? null;
	} catch {
		return null;
	}
}

// ─── Phase Helpers ────────────────────────────────────────────────────────────

type ThemeColor = "accent" | "warning" | "success" | "error" | "muted" | "dim" | "text" | "border";

function phaseColor(phase: string | undefined): ThemeColor {
	switch (phase) {
		case "observe":  return "accent";
		case "think":    return "warning";
		case "plan":     return "warning";
		case "build":    return "accent";
		case "execute":  return "success";
		case "verify":   return "warning";
		case "learn":    return "accent";
		case "complete": return "muted";
		default:         return "dim";
	}
}

function phaseIcon(phase: string | undefined): string {
	switch (phase) {
		case "observe":  return "👁";
		case "think":    return "🧠";
		case "plan":     return "📋";
		case "build":    return "🔨";
		case "execute":  return "⚡";
		case "verify":   return "✅";
		case "learn":    return "📚";
		case "complete": return "🏁";
		default:         return "·";
	}
}

// ─── Sidebar Component ────────────────────────────────────────────────────────

class PrdSidebarComponent {
	private tui: TUI;
	private theme: Theme;
	private prd: ParsedPrd | null = null;
	private errorMsg: string | null = null;

	constructor(tui: TUI, theme: Theme, prdPath: string | null) {
		this.tui = tui;
		this.theme = theme;
		this.loadPrd(prdPath);
	}

	loadPrd(prdPath: string | null): void {
		if (!prdPath) {
			this.prd = null;
			this.errorMsg = "No PRD found in WORK/";
		} else {
			this.prd = parsePrd(prdPath);
			this.errorMsg = this.prd ? null : `Cannot read: ${path.basename(path.dirname(prdPath))}`;
		}
		this.invalidate();
		this.tui.requestRender();
	}

	/**
	 * handleInput is kept for optional future use via overlayHandle.focus().
	 * It is NOT registered in the component object passed to ctx.ui.custom()
	 * — the sidebar is nonCapturing by default so this never fires passively.
	 */
	handleInput(_data: string): void {
		// Reserved — sidebar is passive (nonCapturing: true).
		// Call overlayHandle.focus() then overlayHandle.unfocus() to temporarily
		// give focus for keyboard interaction if ever needed.
	}

	render(width: number): string[] {
		const th = this.theme;
		const innerW = Math.max(4, width - 2);
		const border = (s: string) => th.fg("border", s);
		const hr = () => border(`├${"─".repeat(innerW)}┤`);
		const padLine = (s: string): string => truncateToWidth(s, innerW, "…", true);
		const rowWith = (content: string) => border("│") + padLine(content) + border("│");

		const contentLines: string[] = [];

		if (this.errorMsg || !this.prd) {
			contentLines.push(rowWith(` ${th.fg("error", this.errorMsg ?? "Loading…")}`));
			contentLines.push(rowWith(` ${th.fg("dim", "Set $HOLOCRON_MEMORY_DIR")}`));
		} else {
			const fm = this.prd.frontmatter;

			// ── Task ─────────────────────────────────────────────────────────
			const taskWrapped = wrapText(fm.task ?? "(untitled)", innerW - 2);
			contentLines.push(rowWith(` ${th.bold(th.fg("text", taskWrapped[0] ?? ""))}`));
			for (let i = 1; i < taskWrapped.length; i++) {
				contentLines.push(rowWith(`  ${th.fg("muted", taskWrapped[i] ?? "")}`));
			}

			// ── Phase + effort ────────────────────────────────────────────────
			contentLines.push(rowWith(""));
			const phase = fm.phase ?? "—";
			contentLines.push(rowWith(
				` ${th.fg(phaseColor(phase), `${phaseIcon(phase)} ${phase}`)}  ${th.fg("dim", fm.effort ?? "—")}`,
			));

			// ── Progress bar ──────────────────────────────────────────────────
			const [doneStr, totalStr] = (fm.progress ?? "0/0").split("/");
			const doneN = parseInt(doneStr ?? "0", 10);
			const totalN = parseInt(totalStr ?? "0", 10);
			if (totalN > 0) {
				const barWidth = Math.max(4, innerW - 8);
				const filled = Math.round((doneN / totalN) * barWidth);
				const bar = th.fg("success", "█".repeat(filled)) + th.fg("dim", "░".repeat(barWidth - filled));
				contentLines.push(rowWith(` ${bar}  ${th.fg("muted", `${doneN}/${totalN}`)}`));
			}

			// ── Criteria list ─────────────────────────────────────────────────
			if (this.prd.criteria.length > 0) {
				contentLines.push(rowWith(""));
				for (const c of this.prd.criteria) {
					const check = c.done ? th.fg("success", "✓") : th.fg("dim", "·");
					contentLines.push(rowWith(
						` ${check} ${th.fg(c.done ? "dim" : "muted", c.id)}: ${th.fg(c.done ? "dim" : "text", c.text)}`,
					));
				}
			}

			// ── Updated timestamp ─────────────────────────────────────────────
			if (fm.updated) {
				contentLines.push(rowWith(""));
				contentLines.push(rowWith(
					` ${th.fg("dim", `↻ ${fm.updated.replace("T", " ").replace("Z", "").slice(0, 16)}`)}`,
				));
			}
		}

		// ── Header (centered slug as title) ───────────────────────────────────
		const slug = this.prd?.frontmatter.slug?.slice(16) ?? "PRD";
		const title = truncateToWidth(` ${slug}`, innerW);
		const titleVw = visibleWidth(title);
		const leftDashes = Math.floor((innerW - titleVw) / 2);
		const rightDashes = innerW - titleVw - leftDashes;

		return [
			border("╭") + border("─".repeat(leftDashes)) + th.fg("accent", title) + border("─".repeat(rightDashes)) + border("╮"),
			...contentLines,
			hr(),
			rowWith(th.fg("dim", " /prd toggle · Ctrl+Shift+P")),
			border(`╰${"─".repeat(innerW)}╯`),
		];
	}

	invalidate(): void { /* stateless render — no cache to clear */ }
}

// ─── Word Wrap ────────────────────────────────────────────────────────────────

function wrapText(text: string, maxWidth: number): string[] {
	if (maxWidth < 1) return [text];
	const lines: string[] = [];
	let current = "";
	for (const word of text.split(" ")) {
		if (!current) current = word;
		else if (current.length + 1 + word.length <= maxWidth) current += ` ${word}`;
		else { lines.push(current); current = word; }
	}
	if (current) lines.push(current);
	return lines.length > 0 ? lines : [""];
}

// ─── Extension Entry Point ────────────────────────────────────────────────────

export default function prdSidebar(pi: ExtensionAPI): void {
	const workDir = process.env.HOLOCRON_MEMORY_DIR
		? path.join(process.env.HOLOCRON_MEMORY_DIR, "WORK")
		: null;

	// ── State ──────────────────────────────────────────────────────────────
	/** Path of the PRD.md belonging to THIS session. Pinned by tool_result events. */
	let currentPrdPath: string | null = null;
	let overlayHandle: OverlayHandle | null = null;
	let closeFn: (() => void) | null = null;
	let isHidden = false;
	let activeComponent: PrdSidebarComponent | null = null;
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let watcher: fs.FSWatcher | null = null;

	// ── Helper: does a file path belong to a WORK PRD? ─────────────────────
	function asPrdPath(filePath: unknown): string | null {
		if (typeof filePath !== "string" || !workDir) return null;
		// Must be exactly WORK/{slug}/PRD.md — one directory level deep
		const rel = path.relative(workDir, filePath);
		const parts = rel.split(path.sep);
		if (parts.length === 2 && parts[1] === "PRD.md" && !parts[0]!.startsWith("..")) {
			return filePath;
		}
		return null;
	}

	// ── File watcher ───────────────────────────────────────────────────────
	function startWatcher(): void {
		if (!workDir || watcher) return;
		try {
			watcher = fs.watch(workDir, { recursive: true }, (_eventType, filename) => {
				if (!filename?.endsWith("PRD.md")) return;
				// Only react to changes in the pinned session PRD
				const changedAbs = path.join(workDir, filename);
				if (currentPrdPath && changedAbs !== currentPrdPath) return;
				if (debounceTimer) clearTimeout(debounceTimer);
				debounceTimer = setTimeout(() => {
					activeComponent?.loadPrd(currentPrdPath);
				}, 250);
			});
		} catch { /* WORK dir may not exist yet */ }
	}

	function stopWatcher(): void {
		watcher?.close();
		watcher = null;
	}

	// ── Session-specific PRD tracking via tool_result ──────────────────────
	// event.input carries the *tool call* parameters, not the tool's output.
	// For write/edit tools, input.path is the file path that was written —
	// exactly what we need to detect when the OBSERVE agent creates the PRD.
	// This fires after every tool result, so asPrdPath() validates the path
	// is strictly WORK/{slug}/PRD.md before pinning it to this session.
	pi.on("tool_result", async (event) => {
		const pinned = asPrdPath((event.input as Record<string, unknown>)?.path);
		if (!pinned) return;
		currentPrdPath = pinned;
		// Persist so session resume restores the correct PRD
		pi.appendEntry("prd-sidebar-state", { currentPrdPath });
		// Live update the component if panel is open
		activeComponent?.loadPrd(currentPrdPath);
	});

	// ── Seed currentPrdPath on session start / resume ──────────────────────
	pi.on("session_start", async (_event, ctx) => {
		// Restore from last persisted state entry (works for resume/fork)
		const entries = ctx.sessionManager.getEntries();
		for (let i = entries.length - 1; i >= 0; i--) {
			const e = entries[i] as { type: string; customType?: string; data?: { currentPrdPath?: string } };
			if (e.type === "custom" && e.customType === "prd-sidebar-state" && e.data?.currentPrdPath) {
				currentPrdPath = e.data.currentPrdPath;
				return;
			}
		}
		// Fallback: pick latest PRD (acceptable on first startup only)
		if (workDir) currentPrdPath = findLatestPrd(workDir);
	});

	// ── Open / toggle panel ────────────────────────────────────────────────
	function openPanel(ctx: ExtensionContext): void {
		if (!ctx.hasUI) return;

		// Panel already exists — cycle: visible → hidden → visible
		if (overlayHandle) {
			isHidden = !isHidden;
			overlayHandle.setHidden(isHidden);
			return;
		}

		// Fire-and-forget so the command handler returns immediately
		void ctx.ui.custom(
			(tui, theme, _kb, done) => {
				closeFn = done;
				const comp = new PrdSidebarComponent(tui, theme, currentPrdPath);
				activeComponent = comp;
				// Return component WITHOUT handleInput — sidebar is nonCapturing
				return {
					render: (w: number) => comp.render(w),
					invalidate: () => comp.invalidate(),
				};
			},
			{
				overlay: true,
				overlayOptions: {
					anchor: "right-center",
					width: "35%",
					minWidth: 45,
					maxHeight: "90%",
					margin: { right: 1 },
					visible: (termWidth: number) => termWidth >= 100,
					nonCapturing: true,   // ← chat stays fully interactive
				},
				onHandle: (handle: OverlayHandle) => {
					overlayHandle = handle;
					isHidden = false;
					startWatcher();
				},
			},
		);
	}

	// ── /prd command ───────────────────────────────────────────────────────
	pi.registerCommand("prd", {
		description: "Toggle PRD sidebar (passive — chat stays active while open)",
		handler: async (_args, ctx) => openPanel(ctx),
	});

	// ── Ctrl+Shift+P shortcut ──────────────────────────────────────────────
	pi.registerShortcut("ctrl+shift+p", {
		description: "Toggle PRD sidebar",
		handler: async (ctx) => openPanel(ctx),
	});

	// ── Cleanup on session shutdown ────────────────────────────────────────
	pi.on("session_shutdown", async () => {
		stopWatcher();
		if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
		closeFn?.();
		closeFn = null;
		overlayHandle = null;
		activeComponent = null;
	});
}

/**
 * Purpose Gate — Prompts the engineer to declare intent before working
 *
 * On session start, shows a "What is the purpose of this agent?" text input.
 * If answered, a persistent widget displays the purpose and it is injected
 * into the system prompt for the full session, keeping focus.
 *
 * Purpose is OPTIONAL — dismissing the dialog (empty input) lets the user
 * continue without declaring one. Input is never blocked by this extension.
 *
 * Usage: pi -e extensions/purpose-gate.ts
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text, truncateToWidth } from "@mariozechner/pi-tui";
import { applyExtensionDefaults } from "./themeMap.ts";

/** Read purpose_gate.enabled from ~/.pi/agent/settings.json. Defaults to true if missing or unreadable. */
function isPurposeGateEnabled(): boolean {
	try {
		const settingsPath = join(homedir(), ".pi", "agent", "settings.json");
		if (!existsSync(settingsPath)) return true;
		const raw = readFileSync(settingsPath, "utf-8");
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		const gate = parsed["purpose_gate"];
		if (gate && typeof gate === "object" && "enabled" in gate) {
			return (gate as Record<string, unknown>)["enabled"] !== false;
		}
		return true;
	} catch {
		return true;
	}
}

// synthwave: bgWarm #4a1e6a → rgb(74,30,106)
function bg(s: string): string {
	return `\x1b[48;2;74;30;106m${s}\x1b[49m`;
}

// synthwave: pink #ff7edb
function pink(s: string): string {
	return `\x1b[38;2;255;126;219m${s}\x1b[39m`;
}

// synthwave: cyan #36f9f6
function cyan(s: string): string {
	return `\x1b[38;2;54;249;246m${s}\x1b[39m`;
}

function bold(s: string): string {
	return `\x1b[1m${s}\x1b[22m`;
}

export default function (pi: ExtensionAPI) {
	// Skip entirely when disabled via settings.json purpose_gate.enabled = false.
	if (!isPurposeGateEnabled()) return;

	// Skip entirely when running as a pi-subagent child process.
	// The parent session already has a declared purpose; asking again in a
	// forked subagent session would also crash with a stale-ctx error.
	if (process.env["PI_SUBAGENT_CHILD"] === "1") return;

	let purpose: string | undefined;

	// Guard flag: set to false the moment ANY session replacement becomes imminent.
	// session_before_fork fires synchronously before ctx.fork() invalidates the ctx,
	// giving us a clean window to abort before the next ctx.ui access would throw.
	// session_shutdown covers reload / new / resume replacement paths.
	let ctxActive = true;

	pi.on("session_before_fork", async () => {
		ctxActive = false;
	});

	pi.on("session_shutdown", async () => {
		ctxActive = false;
	});

	async function askForPurpose(ctx: any) {
		// withSession guard: bail immediately if ctx is already stale on entry.
		if (!ctxActive) return;
		try {
			while (!purpose) {
				// Pre-await guard: don't start an input dialog on a stale ctx.
				if (!ctxActive) return;
				const answer = await ctx.ui.input(
					"What is the purpose of this agent?",
					"e.g. Refactor the auth module to use JWT"
				);
				// Post-await guard: session may have been replaced while we were awaiting.
				if (!ctxActive) return;

				if (answer && answer.trim()) {
					purpose = answer.trim();
				} else {
					// Empty answer — user dismissed the prompt. Leave purpose unset and
					// break out so they can work freely without declaring a purpose.
					break;
				}
			}

			// Guard before setWidget — purpose may have been set but ctx already stale.
			if (!ctxActive || !purpose) return;

			ctx.ui.setWidget("purpose", () => {
				return {
					render(width: number): string[] {
						const pad = bg(" ".repeat(width));
						const label = pink(bold("  PURPOSE: "));
						const msg = cyan(bold(purpose!));
						const content = bg(truncateToWidth(label + msg + " ".repeat(width), width, ""));
						return [pad, content, pad];
					},
					invalidate() {},
				};
			});
		} catch {
			// Belt-and-suspenders: catch any stale ctx error that slips through the
			// ctxActive flag (e.g. if fork fires between a flag check and a ctx.ui call).
		}
	}

	pi.on("session_start", async (_event, ctx) => {
		applyExtensionDefaults(import.meta.url, ctx);
		askForPurpose(ctx).catch(() => {}); // replace void — explicit discard of stale-ctx errors
	});

	pi.on("before_agent_start", async (event) => {
		if (!purpose) return;
		return {
			systemPrompt: event.systemPrompt + `\n\n<purpose>\nYour singular purpose this session: ${purpose}\nStay focused on this goal. If a request drifts from this purpose, gently remind the user.\n</purpose>`,
		};
	});

	// Do NOT block input when no purpose is set — purpose is optional.
	// 1-off queries should always go through. The widget only shows when
	// a purpose has been actively declared.
	pi.on("input", async (_event, _ctx) => {
		return { action: "continue" as const };
	});
}

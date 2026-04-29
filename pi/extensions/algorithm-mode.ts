/**
 * Algorithm Mode Extension
 *
 * Controls which Holocron response mode (ALGORITHM / NATIVE / MINIMAL) is
 * used for each prompt.  Three mechanisms layered in priority order:
 *
 *   1. Session lock  — Ctrl+Alt+A cycles the lock for the whole session
 *   2. Slash command — /algorithm | /native | /minimal override next turn only
 *   3. LLM pre-classifier — cheap sub-call that classifies before the main agent
 *
 * Priority: session lock > slash command override > pre-classifier > auto (LLM self-classify)
 *
 * Footer status:
 *   ⚡ ALGORITHM ⬤  — session locked
 *   → NATIVE        — next-turn override set
 *   ~ ALGORITHM     — pre-classifier suggestion
 *   (nothing)       — auto / self-classify
 */

import { complete } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

type Mode = "ALGORITHM" | "NATIVE" | "MINIMAL" | "PIPELINE" | "auto";

const LOCK_CYCLE: Mode[] = ["auto", "ALGORITHM", "NATIVE", "MINIMAL", "PIPELINE"];

const CLASSIFIER_PROMPT = (text: string) =>
  [
    "Classify this request. Reply with ONE word only — no punctuation, no explanation.",
    "",
    "ALGORITHM — multi-step work: planning, building, debugging, researching, refactoring, multiple files",
    "NATIVE    — single-step: quick task, simple edit, one file change, one question, under 2 minutes",
    "MINIMAL   — pure acknowledgment: greeting, rating, yes/no, one-word reply",
    "",
    `Request: "${text.slice(0, 400)}"`,
  ].join("\n");

export default function algorithmMode(pi: ExtensionAPI): void {
  // ── State ─────────────────────────────────────────────────────────────
  let sessionLock: Mode = "auto"; // survives compaction via appendEntry
  let nextTurnOverride: Mode = "auto"; // consumed after one agent_end
  let lastClassified: Mode = "auto"; // set by pre-classifier, reset after agent_end

  // ── Helpers ───────────────────────────────────────────────────────────
  function effectiveMode(): Mode {
    if (sessionLock !== "auto") return sessionLock;
    if (nextTurnOverride !== "auto") return nextTurnOverride;
    return lastClassified;
  }

  function refreshStatus(ctx: ExtensionContext): void {
    if (sessionLock !== "auto") {
      ctx.ui.setStatus("algo-mode", ctx.ui.theme.fg("warning", `⚡ ${sessionLock} ⬤`));
    } else if (nextTurnOverride !== "auto") {
      ctx.ui.setStatus("algo-mode", ctx.ui.theme.fg("accent", `→ ${nextTurnOverride}`));
    } else if (lastClassified !== "auto") {
      ctx.ui.setStatus("algo-mode", ctx.ui.theme.fg("muted", `~ ${lastClassified}`));
    } else {
      ctx.ui.setStatus("algo-mode", undefined);
    }
  }

  // ── 1. LLM Pre-classifier ─────────────────────────────────────────────
  // Fires on every interactive prompt when no override is already set.
  // Uses the current active model with maxTokens=5 to keep it fast and cheap.
  pi.on("input", async (event, ctx) => {
    // Only classify user-typed prompts; skip when an override is already in place
    if (event.source !== "interactive") return { action: "continue" };
    if (effectiveMode() !== "auto") return { action: "continue" };

    const model = ctx.model;
    if (!model) return { action: "continue" };

    try {
      const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
      if (!auth.ok || !auth.apiKey) return { action: "continue" };

      const response = await complete(
        model,
        {
          messages: [
            {
              role: "user",
              content: [{ type: "text", text: CLASSIFIER_PROMPT(event.text) }],
              timestamp: Date.now(),
            },
          ],
          maxTokens: 5,
        },
        { apiKey: auth.apiKey, headers: auth.headers },
      );

      const raw = response.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text.trim().toUpperCase())
        .join("")
        .replace(/[^A-Z]/g, ""); // strip any punctuation the model snuck in

      if (raw === "ALGORITHM" || raw === "NATIVE" || raw === "MINIMAL" || raw === "PIPELINE") {
        lastClassified = raw;
        refreshStatus(ctx);
      }
    } catch {
      // Pre-classifier failure is non-fatal — falls back to LLM self-classification
    }

    return { action: "continue" };
  });

  // ── 2. Inject mode directive before every agent turn ──────────────────
  // Invisible message (display: false) tells the model which mode to use.
  pi.on("before_agent_start", async (_event, _ctx) => {
    const mode = effectiveMode();
    if (mode === "auto") return;

    if (mode === "PIPELINE") {
      return {
        message: {
          customType: "algorithm-mode-directive",
          content:
            "[MODE DIRECTIVE] Use PIPELINE mode — call the algorithm_pipeline tool with the full user task as the `task` parameter. Do not run the Algorithm inline. Pass the complete original user prompt as `task`.",
          display: false,
        },
      };
    }

    return {
      message: {
        customType: "algorithm-mode-directive",
        content: `[MODE DIRECTIVE] Use ${mode} mode for this response. Follow its exact output format from your instructions.`,
        display: false,
      },
    };
  });

  // ── 3. Reset per-turn state after each response ───────────────────────
  pi.on("agent_end", async (_event, ctx) => {
    const hadOverride = nextTurnOverride !== "auto";
    nextTurnOverride = "auto";
    lastClassified = "auto";
    if (hadOverride) refreshStatus(ctx);
  });

  // ── 2b. PIPELINE mode directive ──────────────────────────────────────
  // Overrides the standard mode directive to instruct the model to call the
  // algorithm_pipeline tool instead of running the Algorithm inline.

  // ── 4. Slash commands ─────────────────────────────────────────────────
  pi.registerCommand("algorithm", {
    description: "Force next prompt into Algorithm mode",
    handler: async (_args, ctx) => {
      nextTurnOverride = "ALGORITHM";
      refreshStatus(ctx);
      ctx.ui.notify("Next prompt → ALGORITHM mode", "info");
    },
  });

  pi.registerCommand("native", {
    description: "Force next prompt into Native mode",
    handler: async (_args, ctx) => {
      nextTurnOverride = "NATIVE";
      refreshStatus(ctx);
      ctx.ui.notify("Next prompt → NATIVE mode", "info");
    },
  });

  pi.registerCommand("minimal", {
    description: "Force next prompt into Minimal mode",
    handler: async (_args, ctx) => {
      nextTurnOverride = "MINIMAL";
      refreshStatus(ctx);
      ctx.ui.notify("Next prompt → MINIMAL mode", "info");
    },
  });

  pi.registerCommand("pipeline", {
    description: "Force next prompt into Pipeline mode (runs Algorithm as isolated sub-agents)",
    handler: async (_args, ctx) => {
      nextTurnOverride = "PIPELINE";
      refreshStatus(ctx);
      ctx.ui.notify("Next prompt → PIPELINE mode (algorithm_pipeline tool)", "info");
    },
  });

  // ── 5. Keyboard shortcut — cycle session lock ─────────────────────────
  // Ctrl+Alt+A steps through: auto → ALGORITHM → NATIVE → MINIMAL → auto
  pi.registerShortcut("ctrl+alt+a", {
    description: "Cycle session mode lock (auto → ALGORITHM → NATIVE → MINIMAL → PIPELINE → auto)",
    handler: async (ctx) => {
      const idx = LOCK_CYCLE.indexOf(sessionLock);
      sessionLock = LOCK_CYCLE[(idx + 1) % LOCK_CYCLE.length];

      // Persist so session resume restores it
      pi.appendEntry("mode-session-lock", { lock: sessionLock });
      refreshStatus(ctx);

      ctx.ui.notify(
        sessionLock === "auto"
          ? "Mode lock off — pre-classifier active"
          : `Session locked to ${sessionLock} mode`,
        "info",
      );
    },
  });

  // ── 6. Restore session lock on startup / resume ───────────────────────
  pi.on("session_start", async (_event, ctx) => {
    const entries = ctx.sessionManager.getEntries();
    const lastLock = [...entries]
      .reverse()
      .find(
        (e: { type: string; customType?: string }) =>
          e.type === "custom" && e.customType === "mode-session-lock",
      ) as { data?: { lock: Mode } } | undefined;

    if (lastLock?.data?.lock) {
      sessionLock = lastLock.data.lock;
    }

    refreshStatus(ctx);
  });
}

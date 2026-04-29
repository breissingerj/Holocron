/**
 * Algorithm Pipeline — Phase Definitions
 *
 * Defines the tool sets available per phase and the static phase ordering.
 * Keep skip logic in orchestrator.ts — this file is pure data.
 */

import type { PhaseName } from "./context.js";

/** Phases that must never be skipped, regardless of recommendations */
export const NEVER_SKIP: PhaseName[] = ["observe", "execute", "verify"];

/** Canonical phase execution order */
export const ALL_PHASES: PhaseName[] = [
  "observe",
  "think",
  "plan",
  "build",
  "execute",
  "verify",
  "learn",
];

/**
 * Tools available to each phase agent.
 *
 * OBSERVE/THINK/PLAN: read-only — agents must not modify the codebase during
 * analysis phases. This prevents premature edits before the approach is validated.
 *
 * BUILD/EXECUTE: full access — capabilities must be actually invoked, not described.
 *
 * VERIFY: read + bash only — agents run tests and inspect outputs, but must not
 * make changes that could mask failures.
 *
 * LEARN: read + bash + write — reflection writes to LEARNING/REFLECTIONS/ and
 * updates PRD.md to phase=complete.
 */
export const PHASE_TOOLS: Record<PhaseName, string[]> = {
  observe:  ["read", "bash", "grep", "find", "ls"],
  think:    ["read", "bash", "grep", "find", "ls"],
  plan:     ["read", "bash", "grep", "find", "ls"],
  build:    ["read", "bash", "edit", "write"],
  execute:  ["read", "bash", "edit", "write"],
  verify:   ["read", "bash"],
  learn:    ["read", "bash", "write"],
};

/** Human-readable label for each phase used in UI status lines */
export const PHASE_LABELS: Record<PhaseName, string> = {
  observe: "👁️  OBSERVE",
  think:   "🧠 THINK",
  plan:    "📋 PLAN",
  build:   "🔨 BUILD",
  execute: "⚡ EXECUTE",
  verify:  "✅ VERIFY",
  learn:   "📚 LEARN",
};

/** Emoji status icons for rendering */
export const PHASE_STATUS = {
  running: "⏳",
  done:    "✓",
  skipped: "⤼",
  pending: "○",
  error:   "✗",
} as const;

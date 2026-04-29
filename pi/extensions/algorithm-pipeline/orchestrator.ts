/**
 * Algorithm Pipeline — Orchestrator
 *
 * Drives the sequential phase pipeline:
 *   1. Iterate ALL_PHASES in order
 *   2. Evaluate skip conditions (two-layer: agent recommendation + hard rules)
 *   3. Spawn an isolated pi subprocess for each non-skipped phase
 *   4. Parse the agent's JSON envelope response
 *   5. Merge into the accumulated PipelineContext
 *   6. Return the final context when all phases complete
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Message } from "@mariozechner/pi-ai";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { withFileMutationQueue } from "@mariozechner/pi-coding-agent";
import type {
  AgentEnvelopeResponse,
  CapabilitySelection,
  Effort,
  PhaseName,
  PipelineContext,
} from "./context.js";
import { ALL_PHASES, NEVER_SKIP, PHASE_TOOLS } from "./phases.js";

// ── Token budget ────────────────────────────────────────────────────────────
/** Approximate token cap for the serialised envelope (chars / 4 ≈ tokens) */
const MAX_ENVELOPE_CHARS = 48_000;

// ── Slug generation ─────────────────────────────────────────────────────────

export function generateSlug(task: string): string {
  const now = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  const date = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
  ].join("");
  const time = [
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
  const slug = task
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40)
    .replace(/-+$/, "");
  return `${date}-${time}_${slug}`;
}

// ── Skip evaluation ─────────────────────────────────────────────────────────

/**
 * Collect recommend_skip arrays from all phases that have run so far.
 * Returns the union of all recommendations relevant to the next phase.
 */
export function getPriorRecommendations(
  _phase: PhaseName,
  ctx: PipelineContext,
): PhaseName[] {
  const recs = new Set<PhaseName>();
  if (ctx.observe?.recommend_skip) for (const p of ctx.observe.recommend_skip) recs.add(p);
  if (ctx.think?.recommend_skip)   for (const p of ctx.think.recommend_skip)   recs.add(p);
  if (ctx.plan?.recommend_skip)    for (const p of ctx.plan.recommend_skip)     recs.add(p);
  if (ctx.build?.recommend_skip)   for (const p of ctx.build.recommend_skip)    recs.add(p);
  return Array.from(recs);
}

/**
 * Two-layer skip evaluation:
 *   Layer 1 — Agent recommendations (primary signal)
 *   Layer 2 — Orchestrator hard rules (secondary, catches what agents miss)
 *
 * NEVER_SKIP phases always return false regardless of any recommendation.
 */
export function evaluateSkips(
  phase: PhaseName,
  ctx: PipelineContext,
  agentRecommendations: PhaseName[],
): boolean {
  // Hard rule: these three phases are never skippable
  if (NEVER_SKIP.includes(phase)) return false;

  // Layer 1: honour agent recommendation
  if (agentRecommendations.includes(phase)) return true;

  // Layer 2: orchestrator hard rules
  switch (phase) {
    case "think": {
      // Skip for Standard effort with small ISC count and no analytical capabilities
      const analyticalCaps = ["Research", "Thinking", "Council", "RedTeam", "FirstPrinciples"];
      const hasAnalytical = ctx.observe?.capabilities_selected.some((c: CapabilitySelection) =>
        analyticalCaps.some(a => c.name.toLowerCase().includes(a.toLowerCase()))
      ) ?? false;
      return (
        ctx.effort === "standard" &&
        (ctx.observe?.isc_criteria.length ?? 0) <= 8 &&
        !hasAnalytical
      );
    }

    case "plan":
      // Skip for Standard effort with no blocked prerequisites and few capabilities
      return (
        ctx.effort === "standard" &&
        (ctx.think?.prerequisites_blocked.length ?? 0) === 0 &&
        (ctx.observe?.capabilities_selected.length ?? 0) <= 2
      );

    case "build":
      // Skip when no capabilities were selected — nothing to pre-invoke
      return (ctx.observe?.capabilities_selected.length ?? 0) === 0;

    case "learn":
      // Skip for pure lookup/question tasks that produced no file changes
      return (
        ctx.effort === "standard" &&
        (ctx.verify?.criteria_passed.length ?? 0) <= 2 &&
        (ctx.execute?.files_changed.length ?? 0) === 0
      );

    default:
      return false;
  }
}

// ── Subprocess helpers ───────────────────────────────────────────────────────

function getPiInvocation(args: string[]): { command: string; args: string[] } {
  const currentScript = process.argv[1];
  const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
  if (currentScript && !isBunVirtualScript && fs.existsSync(currentScript)) {
    return { command: process.execPath, args: [currentScript, ...args] };
  }
  const execName = path.basename(process.execPath).toLowerCase();
  const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
  if (!isGenericRuntime) return { command: process.execPath, args };
  return { command: "pi", args };
}

function getFinalOutput(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "assistant") {
      for (const part of msg.content) {
        if (part.type === "text") return part.text;
      }
    }
  }
  return "";
}

interface PhaseAgentResult {
  output: string;
  exitCode: number;
  stderr: string;
}

async function runPhaseAgent(
  phase: PhaseName,
  envelope: PipelineContext,
  systemPromptContent: string,
  cwd: string,
  signal: AbortSignal | undefined,
): Promise<PhaseAgentResult> {
  const tools = PHASE_TOOLS[phase];
  const args: string[] = ["--mode", "json", "-p", "--no-session"];
  args.push("--tools", tools.join(","));

  // Write system prompt to temp file
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), `pi-algo-${phase}-`));
  const tmpFile = path.join(tmpDir, `${phase}-prompt.md`);
  await withFileMutationQueue(tmpFile, async () => {
    await fs.promises.writeFile(tmpFile, systemPromptContent, { encoding: "utf-8", mode: 0o600 });
  });

  args.push("--append-system-prompt", tmpFile);

  // Prune envelope if too large before serialising
  const prunedEnvelope = pruneEnvelope(envelope);
  const taskPrompt = `CONTEXT_ENVELOPE:\n${JSON.stringify(prunedEnvelope, null, 2)}`;
  args.push(taskPrompt);

  const messages: Message[] = [];
  let stderr = "";
  let exitCode = 0;
  let wasAborted = false;

  try {
    exitCode = await new Promise<number>((resolve) => {
      const invocation = getPiInvocation(args);
      const proc = spawn(invocation.command, invocation.args, {
        cwd,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
      });

      let buffer = "";
      const processLine = (line: string) => {
        if (!line.trim()) return;
        let event: { type?: string; message?: Message };
        try { event = JSON.parse(line); } catch { return; }
        if (event.type === "message_end" && event.message) {
          messages.push(event.message);
        }
        if (event.type === "tool_result_end" && event.message) {
          messages.push(event.message);
        }
      };

      proc.stdout.on("data", (data: Buffer) => {
        buffer += data.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) processLine(line);
      });

      proc.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });
      proc.on("close", (code) => {
        if (buffer.trim()) processLine(buffer);
        resolve(code ?? 0);
      });
      proc.on("error", () => resolve(1));

      if (signal) {
        const kill = () => {
          wasAborted = true;
          proc.kill("SIGTERM");
          setTimeout(() => { if (!proc.killed) proc.kill("SIGKILL"); }, 5000);
        };
        if (signal.aborted) kill();
        else signal.addEventListener("abort", kill, { once: true });
      }
    });

    if (wasAborted) throw new Error(`Phase ${phase} aborted`);

    return { output: getFinalOutput(messages), exitCode, stderr };
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    try { fs.rmdirSync(tmpDir); } catch { /* ignore */ }
  }
}

// ── Envelope helpers ─────────────────────────────────────────────────────────

/**
 * Prune evidence strings from phases more than 2 steps back when envelope
 * grows too large. Preserves structure; only strips verbose evidence values.
 */
export function pruneEnvelope(envelope: PipelineContext): PipelineContext {
  const serialised = JSON.stringify(envelope);
  if (serialised.length <= MAX_ENVELOPE_CHARS) return envelope;

  const pruned = JSON.parse(serialised) as PipelineContext;

  // Prune phases_run except the last 2
  const keepFrom = Math.max(0, pruned.phases_run.length - 2);
  const phasesToPrune = pruned.phases_run.slice(0, keepFrom) as PhaseName[];

  for (const phase of phasesToPrune) {
    const output = pruned[phase] as Record<string, unknown> | undefined;
    if (!output) continue;

    // Strip evidence maps
    if ("evidence" in output && typeof output.evidence === "object") {
      output.evidence = { _pruned: "Evidence pruned to reduce context size" };
    }
    // Truncate large text fields
    for (const key of ["context_summary", "work_summary", "preparation_summary", "technical_approach"]) {
      if (typeof output[key] === "string" && (output[key] as string).length > 200) {
        output[key] = (output[key] as string).slice(0, 200) + "…[pruned]";
      }
    }
  }

  return pruned;
}

/**
 * Extract the JSON phase_output from an agent's text response.
 * Searches for the last occurrence of {"phase_output": in the output.
 */
export function parseEnvelopeUpdate(
  output: string,
  _phase: PhaseName,
): AgentEnvelopeResponse | null {
  // Find last JSON object containing phase_output
  const marker = '"phase_output"';
  const idx = output.lastIndexOf(marker);
  if (idx === -1) return null;

  // Walk back to find the opening brace of the enclosing object
  let depth = 0;
  let start = -1;
  for (let i = idx; i >= 0; i--) {
    if (output[i] === "{") {
      start = i;
      break;
    }
  }
  if (start === -1) return null;

  // Walk forward to find the matching closing brace
  depth = 0;
  let end = -1;
  for (let i = start; i < output.length; i++) {
    if (output[i] === "{") depth++;
    else if (output[i] === "}") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) return null;

  try {
    const parsed = JSON.parse(output.slice(start, end + 1)) as AgentEnvelopeResponse;
    if (!parsed.phase_output) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Merge a parsed phase response into the accumulated envelope */
export function mergeEnvelope(
  envelope: PipelineContext,
  phase: PhaseName,
  response: AgentEnvelopeResponse,
): PipelineContext {
  const updated = { ...envelope } as PipelineContext & Record<string, unknown>;
  updated[phase] = response.phase_output;

  // If OBSERVE returned a refined effort level, propagate it to the header
  if (phase === "observe" && envelope.observe === undefined) {
    const obs = response.phase_output as { effort_level?: Effort };
    if (obs.effort_level) updated.effort = obs.effort_level;
  }

  return updated as PipelineContext;
}

/** Store raw output when JSON parsing fails — non-fatal fallback */
export function storeFallback(
  envelope: PipelineContext,
  phase: PhaseName,
  rawOutput: string,
): PipelineContext {
  return {
    ...envelope,
    _fallbacks: {
      ...envelope._fallbacks,
      [phase]: rawOutput.slice(0, 2000),
    },
  };
}

/** Build a human-readable summary of the completed pipeline */
export function buildFinalSummary(envelope: PipelineContext): string {
  const lines: string[] = [
    `Pipeline complete for: ${envelope.task.slice(0, 80)}`,
    `Effort: ${envelope.effort} | Slug: ${envelope.slug}`,
    `Phases run: ${envelope.phases_run.join(" → ")}`,
  ];

  if (envelope.phases_skipped.length > 0) {
    lines.push(`Phases skipped: ${envelope.phases_skipped.join(", ")}`);
  }

  if (envelope.verify) {
    const passed = envelope.verify.criteria_passed.length;
    const failed = envelope.verify.criteria_failed.length;
    lines.push(`Verification: ${passed} passed, ${failed} failed`);
  }

  if (envelope.execute?.work_summary) {
    lines.push(`\nWork summary:\n${envelope.execute.work_summary}`);
  }

  return lines.join("\n");
}

// ── Pipeline runner ──────────────────────────────────────────────────────────

export interface PipelineParams {
  task: string;
  effort?: Effort;
  force_skip?: string[];
  force_run?: string[];
}

export interface PipelineResult {
  content: Array<{ type: "text"; text: string }>;
  details: PipelineContext;
  isError?: boolean;
}

export type OnUpdateCallback = (partial: {
  content: Array<{ type: "text"; text: string }>;
  details: PipelineContext;
}) => void;

/**
 * Main pipeline runner. Iterates all phases, evaluates skip conditions,
 * spawns isolated pi subprocesses, and accumulates the context envelope.
 */
export async function runPipeline(
  params: PipelineParams,
  agentPromptsDir: string,
  ctx: ExtensionContext,
  signal: AbortSignal | undefined,
  onUpdate: OnUpdateCallback | undefined,
): Promise<PipelineResult> {
  const slug = generateSlug(params.task);
  const memDir = process.env.HOLOCRON_MEMORY_DIR ?? os.homedir();
  const prdPath = path.join(memDir, "WORK", slug, "PRD.md");

  let envelope: PipelineContext = {
    task: params.task,
    slug,
    effort: params.effort ?? "standard",
    started: new Date().toISOString(),
    prd_path: prdPath,
    phases_run: [],
    phases_skipped: [],
  };

  const emit = (text: string) =>
    onUpdate?.({ content: [{ type: "text", text }], details: envelope });

  for (const phase of ALL_PHASES) {
    // ── Force-skip (never applies to NEVER_SKIP phases) ──────────────────
    if (params.force_skip?.includes(phase) && !NEVER_SKIP.includes(phase)) {
      envelope = { ...envelope, phases_skipped: [...envelope.phases_skipped, phase] };
      emit(`⤼ Skipping ${phase} (forced)`);
      continue;
    }

    // ── Skip evaluation ──────────────────────────────────────────────────
    const recommendations = getPriorRecommendations(phase, envelope);
    const shouldSkip = evaluateSkips(phase, envelope, recommendations);

    if (shouldSkip && !params.force_run?.includes(phase)) {
      envelope = { ...envelope, phases_skipped: [...envelope.phases_skipped, phase] };
      emit(`⤼ Skipping ${phase} (auto)`);
      continue;
    }

    // ── Load agent system prompt ─────────────────────────────────────────
    const promptPath = path.join(agentPromptsDir, `${phase}.md`);
    let systemPrompt: string;
    try {
      systemPrompt = await fs.promises.readFile(promptPath, "utf-8");
    } catch {
      emit(`✗ ${phase}: agent prompt not found at ${promptPath}`);
      envelope = { ...envelope, phases_skipped: [...envelope.phases_skipped, phase] };
      continue;
    }

    // ── Run phase agent ──────────────────────────────────────────────────
    emit(`⏳ Running ${phase}…`);
    let result: PhaseAgentResult;
    try {
      result = await runPhaseAgent(phase, envelope, systemPrompt, ctx.cwd, signal);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      emit(`✗ ${phase} aborted: ${msg}`);
      return {
        content: [{ type: "text", text: buildFinalSummary(envelope) }],
        details: envelope,
        isError: true,
      };
    }

    // ── Parse agent output ───────────────────────────────────────────────
    const parsed = parseEnvelopeUpdate(result.output, phase);
    if (parsed) {
      envelope = mergeEnvelope(envelope, phase, parsed);
    } else {
      // Malformed JSON — store fallback, log warning, continue
      envelope = storeFallback(envelope, phase, result.output);
      emit(`⚠ ${phase}: could not parse JSON envelope — stored raw output as fallback`);
    }

    envelope = { ...envelope, phases_run: [...envelope.phases_run, phase] };
    emit(`✓ ${phase} complete\n${parsed?.narrative ?? result.output.slice(0, 300)}`);
  }

  return {
    content: [{ type: "text", text: buildFinalSummary(envelope) }],
    details: envelope,
  };
}

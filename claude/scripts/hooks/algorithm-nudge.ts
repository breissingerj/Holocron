#!/usr/bin/env bun
/**
 * algorithm-nudge.ts — deterministic event nudges for the Algorithm (v1.0.0)
 *
 * Fires questions at the moment they are answerable, replacing standing prose.
 * Bounds (from instructions/algorithm.md, "Events Layer"): a row may only ask
 * about an outcome the Algorithm already states, and only about state the model
 * CANNOT observe from its own context. Keyword/regex matching only — zero
 * inference. This file is the single home for the row table.
 *
 * Wired in claude/settings.json:
 *   - UserPromptSubmit (sync): rows 1-3 inject additionalContext
 *   - PostToolUse Bash (async): row 4 warns after destructive-shaped commands
 *
 * Hook I/O: reads the Claude Code hook JSON on stdin; prints JSON on stdout.
 * Fails silent (exit 0, no output) on any parse problem — a nudge never blocks.
 */

interface HookInput {
  hook_event_name?: string;
  prompt?: string;
  tool_name?: string;
  tool_input?: { command?: string };
}

interface Nudge { row: string; ask: string }

// Row 1: prompt matches a skill's USE WHEN index (prebuilt, no live scan).
// Keep this index in sync with skills/*/SKILL.md frontmatter descriptions.
const SKILL_INDEX: Array<[RegExp, string]> = [
  [/\b(research|investigate|deep dive|find out about)\b/i, "research"],
  [/\b(threat ?model|security (audit|review)|vulnerabilit|pentest|osint)\b/i, "security"],
  [/\b(root cause|why does this keep|postmortem|5 whys|fishbone|recurring (bug|failure))\b/i, "thinking/RootCauseAnalysis"],
  [/\b(council|debate|multiple perspectives|red ?team)\b/i, "thinking"],
  [/\b(linear ticket|linear issue|jira ticket|jira issue)\b/i, "linear-cli or acli"],
  [/\b(mermaid|diagram)\b/i, "mermaid"],
  [/\b(scrape|crawl)\b/i, "scraping"],
  [/\b(remember|note that|keep in mind|ingest)\b/i, "memory-ingest"],
  [/\b(playwright|browser|screenshot)\b/i, "playwright-cli"],
];

// Row 2: explicit depth call in plain language, no run registered yet.
const DEPTH_RE = /\b(go (deep|heavy)|think deeply|quick pass|take your time|be thorough)\b/i;

// Row 3: substantial-looking request, possibly no PRD written.
const SUBSTANTIAL_RE = /\b(build|implement|refactor|migrate|redesign|debug|fix the)\b/i;

// Row 4: destructive-shaped shell command (PostToolUse Bash).
const DESTRUCTIVE_RE = /\b(rm\s+-[a-z]*r|git\s+push\s+.*--force|drop\s+table|delete\s+(worker|domain|zone|record|bucket|route)|kubectl\s+delete|terragrunt\s+destroy|terraform\s+destroy)\b/i;

function nudgesForPrompt(prompt: string): Nudge[] {
  const out: Nudge[] = [];
  for (const [re, skill] of SKILL_INDEX) {
    if (re.test(prompt)) {
      out.push({ row: "skill-use-when", ask: `This prompt matches the "${skill}" skill's USE WHEN — invoke the skill, don't handroll. (algorithm-nudge)` });
      break; // one skill nudge per prompt is enough
    }
  }
  if (DEPTH_RE.test(prompt)) {
    out.push({ row: "depth-call", ask: "Explicit depth call: Jack's call outranks effort defaults — write done down (PRD) and name what the depth earns, or state why inline is enough. (algorithm-nudge)" });
  }
  if (SUBSTANTIAL_RE.test(prompt) && prompt.length > 120) {
    out.push({ row: "prd-check", ask: "Substantial request: if this session has no PRD yet, does done need writing down? (algorithm-nudge)" });
  }
  return out;
}

async function main() {
  let raw = "";
  try { raw = await new Response(Bun.stdin.stream()).text(); } catch { process.exit(0); }
  let input: HookInput = {};
  try { input = JSON.parse(raw); } catch { process.exit(0); }

  if (input.hook_event_name === "UserPromptSubmit" && input.prompt) {
    const nudges = nudgesForPrompt(input.prompt);
    if (nudges.length === 0) process.exit(0);
    const context = nudges.map(n => `- ${n.ask}`).join("\n");
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: `Algorithm nudges:\n${context}`,
      },
    }));
    process.exit(0);
  }

  if (input.hook_event_name === "PostToolUse" && input.tool_name === "Bash") {
    const cmd = input.tool_input?.command ?? "";
    if (DESTRUCTIVE_RE.test(cmd)) {
      console.log(JSON.stringify({
        systemMessage: "algorithm-nudge: destructive-shaped command ran — what did it own? Re-list from the source of truth post-op and prove prior functionality still works (steering-rules: verify before asserting).",
      }));
    }
    process.exit(0);
  }

  process.exit(0);
}

main();

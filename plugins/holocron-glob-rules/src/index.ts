import type { Plugin } from "@opencode-ai/plugin";
import { readFile, readdir } from "fs/promises";
import { join, matchesGlob } from "path";

/**
 * holocron-glob-rules — Milestone 14: Context Injection Upgrades
 *
 * Conditional Glob Rules: reads rule files from `{projectRoot}/.opencode/rules/*.md`.
 * Each rule file has YAML frontmatter with a `globs:` array. When the agent reads a
 * file whose path matches any listed glob, the rule file is appended to the tool output,
 * injecting file-type-specific behavioral standards exactly when they're relevant.
 *
 * Example rule file (.opencode/rules/react-standards.md):
 *   ---
 *   globs:
 *     - "**\/*.tsx"
 *     - "**\/*.jsx"
 *   description: React component standards
 *   ---
 *   # React Component Standards
 *   Always use functional components...
 *
 * Hook strategy:
 *   tool.execute.after → intercept read tool results, match filePath against rule globs,
 *                        append matching rule content to output.output
 *
 * Glob matching:
 *   Uses path.matchesGlob() — built-in Node 22+, zero external dependencies.
 *
 * Deduplication:
 *   Module-level Set<string> tracks injected rule file paths per session.
 *   Each rule file is injected at most once per session regardless of how many
 *   matching files the agent reads.
 *
 * Load timing:
 *   Rule files are discovered and parsed at plugin init. Changes to rule files
 *   mid-session require a harness restart to take effect.
 */

const PLUGIN_TAG = "[holocron-glob-rules]";

/** Relative path within the project directory where rule files live. */
export const RULES_DIR = ".opencode/rules";

// ── Types ─────────────────────────────────────────────────────────────────────

export type RuleEntry = {
  /** Absolute path to the rule file — used as dedup key. */
  filePath: string;
  /** Glob patterns from frontmatter. */
  globs: string[];
  /** Rule content with frontmatter stripped — what gets injected. */
  body: string;
};

// ── Deduplication ─────────────────────────────────────────────────────────────

/**
 * Module-level set tracking which rule file paths have already been injected
 * this session. Session-scoped: cleared only on process restart.
 */
export const injectedRules = new Set<string>();

/** Reset for testing — clears the dedup set between test cases. */
export function resetInjectedRules(): void {
  injectedRules.clear();
}

// ── Frontmatter parsing ───────────────────────────────────────────────────────

export type ParsedFrontmatter = {
  globs: string[];
  body: string;
};

/**
 * Parse YAML frontmatter from a markdown string.
 *
 * Extracts the `globs:` list from a leading `--- ... ---` block.
 * Supports both inline array (`globs: ["*.tsx"]`) and block list formats:
 *   globs:
 *     - "**\/*.tsx"
 *     - "**\/*.jsx"
 *
 * Returns `{ globs: [], body: content }` if frontmatter is absent or unparseable.
 * The returned `body` always has the frontmatter block stripped.
 */
export function parseFrontmatter(content: string): ParsedFrontmatter {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!fmMatch) {
    return { globs: [], body: content };
  }

  const yaml = fmMatch[1];
  const body = fmMatch[2] ?? "";

  const globs: string[] = [];

  // Try block list format first:
  //   globs:
  //     - "**/*.tsx"
  //     - "**/*.jsx"
  const blockMatch = yaml.match(/^globs:\s*\r?\n((?:[ \t]+-[^\r\n]*\r?\n?)+)/m);
  if (blockMatch) {
    const lines = blockMatch[1].split(/\r?\n/);
    for (const line of lines) {
      const item = line.match(/^\s*-\s*["']?(.+?)["']?\s*$/);
      if (item) globs.push(item[1]);
    }
    return { globs, body };
  }

  // Try inline array format: globs: ["**/*.tsx", "**/*.jsx"]
  const inlineMatch = yaml.match(/^globs:\s*\[([^\]]*)\]/m);
  if (inlineMatch) {
    const items = inlineMatch[1].split(",");
    for (const item of items) {
      const trimmed = item.trim().replace(/^["']|["']$/g, "");
      if (trimmed) globs.push(trimmed);
    }
    return { globs, body };
  }

  // globs key present but no parseable value
  return { globs: [], body };
}

// ── Rule loading ──────────────────────────────────────────────────────────────

/**
 * Load all rule files from `rulesDir`.
 * Files that can't be read or have no globs are silently skipped.
 * Logs a warning per skipped file.
 */
export async function loadRules(
  rulesDir: string,
  log: (msg: string) => void
): Promise<RuleEntry[]> {
  let files: string[];
  try {
    const entries = await readdir(rulesDir);
    files = entries.filter((f) => f.endsWith(".md")).map((f) => join(rulesDir, f));
  } catch {
    // Rules directory does not exist — return empty, plugin still loads
    return [];
  }

  const rules: RuleEntry[] = [];

  for (const filePath of files) {
    try {
      const content = await readFile(filePath, "utf-8");
      const { globs, body } = parseFrontmatter(content);

      if (globs.length === 0) {
        log(`No globs in ${filePath} — skipping`);
        continue;
      }

      rules.push({ filePath, globs, body });
    } catch {
      log(`Could not read ${filePath} — skipping`);
    }
  }

  return rules;
}

// ── Glob matching ─────────────────────────────────────────────────────────────

/**
 * Returns true if `filePath` matches any of the provided glob patterns.
 * Uses Node's built-in path.matchesGlob (Node 22+).
 */
export function matchesAnyGlob(filePath: string, globs: string[]): boolean {
  for (const pattern of globs) {
    if (matchesGlob(filePath, pattern)) return true;
  }
  return false;
}

// ── Injection formatting ──────────────────────────────────────────────────────

/**
 * Format a matched rule file for appending to the tool output.
 */
export function formatRuleInjection(ruleFilePath: string, body: string): string {
  return [
    "",
    `<!-- holocron-glob-rules: rule from ${ruleFilePath} -->`,
    `# Rule: ${ruleFilePath}`,
    "",
    body.trim(),
    "",
    `<!-- end rule -->`,
  ].join("\n");
}

// ── Plugin ────────────────────────────────────────────────────────────────────

export const HolocronGlobRules: Plugin = async ({ client, directory }) => {
  const rulesDir = join(directory, RULES_DIR);

  const log = (message: string) =>
    client.app.log({ body: { service: PLUGIN_TAG, level: "warn", message } });

  const rules = await loadRules(rulesDir, log);

  await client.app.log({
    body: {
      service: PLUGIN_TAG,
      level: "info",
      message: `Loaded ${rules.length} glob rule(s) from ${rulesDir}`,
    },
  });

  if (rules.length === 0) return {};

  return {
    /**
     * tool.execute.after fires after any tool completes.
     * We intercept "read" tool calls, check the file path against all loaded
     * glob rules, and append matching rules (not yet injected) to the tool output.
     */
    "tool.execute.after": async (input, output) => {
      if (input.tool !== "read") return;

      const filePath = (input as any).args?.filePath;
      if (typeof filePath !== "string" || !filePath) return;

      const injections: string[] = [];

      for (const rule of rules) {
        if (injectedRules.has(rule.filePath)) continue;
        if (!matchesAnyGlob(filePath, rule.globs)) continue;

        injectedRules.add(rule.filePath);
        injections.push(formatRuleInjection(rule.filePath, rule.body));

        await client.app.log({
          body: {
            service: PLUGIN_TAG,
            level: "info",
            message: `Injected rule ${rule.filePath} (matched ${filePath})`,
          },
        });
      }

      if (injections.length > 0) {
        (output as any).output = ((output as any).output ?? "") + injections.join("\n");
      }
    },
  };
};

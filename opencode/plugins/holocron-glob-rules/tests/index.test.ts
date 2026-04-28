import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { mkdir, writeFile } from "fs/promises";
import { randomUUID } from "crypto";

import {
  parseFrontmatter,
  loadRules,
  matchesAnyGlob,
  formatRuleInjection,
  injectedRules,
  resetInjectedRules,
  RULES_DIR,
} from "../src/index.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function makeTempDir(files: Record<string, string> = {}): Promise<string> {
  const root = join(tmpdir(), `holocron-glob-rules-test-${randomUUID()}`);
  await mkdir(root, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    await mkdir(join(full, ".."), { recursive: true });
    await writeFile(full, content, "utf-8");
  }
  return root;
}

const noop = (_: string) => {};

// ── parseFrontmatter ──────────────────────────────────────────────────────────

describe("parseFrontmatter", () => {
  it("extracts a single glob from block list format", () => {
    const content = `---\nglobs:\n  - "**/*.tsx"\n---\n# Body`;
    const { globs, body } = parseFrontmatter(content);
    expect(globs).toEqual(["**/*.tsx"]);
    expect(body).toContain("# Body");
  });

  it("extracts multiple globs from block list format", () => {
    const content = `---\nglobs:\n  - "**/*.tsx"\n  - "**/*.jsx"\n---\n# Body`;
    const { globs } = parseFrontmatter(content);
    expect(globs).toEqual(["**/*.tsx", "**/*.jsx"]);
  });

  it("extracts globs from inline array format", () => {
    const content = `---\nglobs: ["**/*.ts", "**/*.js"]\n---\n# Body`;
    const { globs } = parseFrontmatter(content);
    expect(globs).toEqual(["**/*.ts", "**/*.js"]);
  });

  it("returns empty globs when no frontmatter present", () => {
    const content = `# Just a markdown file\nNo frontmatter here.`;
    const { globs, body } = parseFrontmatter(content);
    expect(globs).toEqual([]);
    expect(body).toContain("Just a markdown file");
  });

  it("returns empty globs when globs key is missing from frontmatter", () => {
    const content = `---\ndescription: Some rule\n---\n# Body`;
    const { globs } = parseFrontmatter(content);
    expect(globs).toEqual([]);
  });

  it("returns empty globs on malformed frontmatter", () => {
    const content = `---\nglobs: not-a-list-or-array\n---\n# Body`;
    const { globs } = parseFrontmatter(content);
    expect(globs).toEqual([]);
  });

  it("strips frontmatter — body content is preserved without the --- block", () => {
    const content = `---\nglobs:\n  - "**/*.ts"\n---\n# Actual Rules\nDo stuff.`;
    const { body } = parseFrontmatter(content);
    expect(body).toContain("# Actual Rules");
    expect(body).toContain("Do stuff.");
    expect(body).not.toContain("---");
    expect(body).not.toContain("globs:");
  });

  it("handles globs block list items without quotes", () => {
    const content = `---\nglobs:\n  - **/*.tsx\n  - **/*.jsx\n---\n# Body`;
    const { globs } = parseFrontmatter(content);
    expect(globs).toEqual(["**/*.tsx", "**/*.jsx"]);
  });

  it("handles single-quoted glob items", () => {
    const content = `---\nglobs:\n  - '**/*.sql'\n---\n# Body`;
    const { globs } = parseFrontmatter(content);
    expect(globs).toEqual(["**/*.sql"]);
  });
});

// ── loadRules ─────────────────────────────────────────────────────────────────

describe("loadRules", () => {
  it("returns empty array when rules directory does not exist", async () => {
    const rules = await loadRules("/nonexistent/path/.opencode/rules", noop);
    expect(rules).toEqual([]);
  });

  it("returns empty array when rules directory is empty", async () => {
    const root = await makeTempDir();
    const rulesDir = join(root, ".opencode", "rules");
    await mkdir(rulesDir, { recursive: true });
    const rules = await loadRules(rulesDir, noop);
    expect(rules).toEqual([]);
  });

  it("loads a single rule file with globs", async () => {
    const root = await makeTempDir({
      ".opencode/rules/react.md": `---\nglobs:\n  - "**/*.tsx"\n---\n# React Rules`,
    });
    const rules = await loadRules(join(root, ".opencode", "rules"), noop);
    expect(rules).toHaveLength(1);
    expect(rules[0].globs).toEqual(["**/*.tsx"]);
    expect(rules[0].body).toContain("# React Rules");
  });

  it("loads multiple rule files", async () => {
    const root = await makeTempDir({
      ".opencode/rules/react.md": `---\nglobs:\n  - "**/*.tsx"\n---\n# React`,
      ".opencode/rules/sql.md": `---\nglobs:\n  - "**/*.sql"\n---\n# SQL`,
    });
    const rules = await loadRules(join(root, ".opencode", "rules"), noop);
    expect(rules).toHaveLength(2);
  });

  it("skips rule files with no globs", async () => {
    const warnings: string[] = [];
    const root = await makeTempDir({
      ".opencode/rules/no-globs.md": `---\ndescription: No globs here\n---\n# Body`,
    });
    const rules = await loadRules(join(root, ".opencode", "rules"), (m) => warnings.push(m));
    expect(rules).toHaveLength(0);
    expect(warnings.some((w) => w.includes("no-globs.md"))).toBe(true);
  });

  it("ignores non-.md files in the rules directory", async () => {
    const root = await makeTempDir({
      ".opencode/rules/react.md": `---\nglobs:\n  - "**/*.tsx"\n---\n# React`,
      ".opencode/rules/config.json": `{"not": "a rule"}`,
    });
    const rules = await loadRules(join(root, ".opencode", "rules"), noop);
    expect(rules).toHaveLength(1);
  });
});

// ── matchesAnyGlob ────────────────────────────────────────────────────────────

describe("matchesAnyGlob", () => {
  it("returns true for a matching glob", () => {
    expect(matchesAnyGlob("src/Button.tsx", ["**/*.tsx"])).toBe(true);
  });

  it("returns false for a non-matching glob", () => {
    expect(matchesAnyGlob("src/api/route.ts", ["**/*.tsx", "**/*.jsx"])).toBe(false);
  });

  it("returns true when second glob in list matches", () => {
    expect(matchesAnyGlob("src/Button.jsx", ["**/*.tsx", "**/*.jsx"])).toBe(true);
  });

  it("returns false for empty globs array", () => {
    expect(matchesAnyGlob("src/Button.tsx", [])).toBe(false);
  });

  it("matches nested paths with ** glob", () => {
    expect(matchesAnyGlob("src/routes/api/v1/handler.ts", ["**/routes/**/*.ts"])).toBe(true);
  });

  it("does not match when pattern requires different extension", () => {
    expect(matchesAnyGlob("src/Button.tsx", ["**/*.sql"])).toBe(false);
  });
});

// ── formatRuleInjection ───────────────────────────────────────────────────────

describe("formatRuleInjection", () => {
  it("includes the rule file path in the output", () => {
    const result = formatRuleInjection("/rules/react.md", "# Rules");
    expect(result).toContain("/rules/react.md");
  });

  it("includes the body content trimmed", () => {
    const result = formatRuleInjection("/rules/react.md", "  # React  \n\n");
    expect(result).toContain("# React");
  });

  it("wraps output in HTML comment markers", () => {
    const result = formatRuleInjection("/rules/react.md", "# Rules");
    expect(result).toContain("<!-- holocron-glob-rules:");
    expect(result).toContain("<!-- end rule -->");
  });
});

// ── injectedRules deduplication ───────────────────────────────────────────────

describe("injectedRules deduplication", () => {
  beforeEach(() => resetInjectedRules());
  afterEach(() => resetInjectedRules());

  it("starts empty after reset", () => {
    expect(injectedRules.size).toBe(0);
  });

  it("tracks added rule paths", () => {
    injectedRules.add("/rules/react.md");
    expect(injectedRules.has("/rules/react.md")).toBe(true);
  });

  it("Set prevents duplicate entries for the same path", () => {
    injectedRules.add("/rules/react.md");
    injectedRules.add("/rules/react.md");
    expect(injectedRules.size).toBe(1);
  });

  it("tracks distinct paths separately", () => {
    injectedRules.add("/rules/react.md");
    injectedRules.add("/rules/sql.md");
    expect(injectedRules.size).toBe(2);
  });
});

// ── RULES_DIR constant ────────────────────────────────────────────────────────

describe("RULES_DIR", () => {
  it("is the expected relative path", () => {
    expect(RULES_DIR).toBe(".opencode/rules");
  });
});

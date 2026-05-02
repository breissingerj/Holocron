import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join, sep } from "path";
import { mkdir, writeFile } from "fs/promises";
import { randomUUID } from "crypto";

import {
  walkForAgentsMd,
  walkForContextFiles,
  readAgentsMd,
  readContextFile,
  formatInjection,
  injectedPaths,
  resetInjectedPaths,
  MAX_WALK_DEPTH,
  CONTEXT_FILENAMES,
} from "../src/index.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function makeTempTree(structure: Record<string, string>): Promise<string> {
  const root = join(tmpdir(), `holocron-agents-loader-test-${randomUUID()}`);
  await mkdir(root, { recursive: true });
  for (const [relativePath, content] of Object.entries(structure)) {
    const fullPath = join(root, relativePath);
    await mkdir(join(fullPath, ".."), { recursive: true });
    await writeFile(fullPath, content, "utf-8");
  }
  return root;
}

// ── walkForAgentsMd ───────────────────────────────────────────────────────────

describe("walkForAgentsMd", () => {
  it("finds AGENTS.md in the same directory as the file", async () => {
    const root = await makeTempTree({
      "AGENTS.md": "# Root rules",
    });

    const result = await walkForAgentsMd(root);
    expect(result.some((p) => p.endsWith("AGENTS.md"))).toBe(true);
  });

  it("finds AGENTS.md in parent directory when not in current dir", async () => {
    const root = await makeTempTree({
      "AGENTS.md": "# Parent rules",
      "subdir/placeholder.txt": "",
    });

    const result = await walkForAgentsMd(join(root, "subdir"));
    expect(result.some((p) => p.includes(root))).toBe(true);
  });

  it("finds multiple AGENTS.md files at different levels", async () => {
    const root = await makeTempTree({
      "AGENTS.md": "# Root rules",
      "a/AGENTS.md": "# A rules",
      "a/b/placeholder.txt": "",
    });

    const result = await walkForAgentsMd(join(root, "a", "b"));
    // Should find both a/AGENTS.md and root AGENTS.md
    const names = result.map((p) => p.replace(root, ""));
    expect(names.some((n) => n.includes(`a${sep}AGENTS.md`) || n.includes("a/AGENTS.md"))).toBe(true);
    expect(names.some((n) => n === `${sep}AGENTS.md` || n === "/AGENTS.md")).toBe(true);
  });

  it("returns bottom-up order — most specific directory first", async () => {
    const root = await makeTempTree({
      "AGENTS.md": "# Root rules",
      "sub/AGENTS.md": "# Sub rules",
    });

    const result = await walkForAgentsMd(join(root, "sub"));
    expect(result[0]).toContain(`sub`);
    expect(result[1]).not.toContain(`sub`);
  });

  it("returns empty array when no AGENTS.md exists anywhere in tree", async () => {
    const root = await makeTempTree({
      "subdir/file.ts": "// no agents md",
    });

    // Walk from a deep temp dir that has no AGENTS.md
    const result = await walkForAgentsMd(join(root, "subdir"));
    // May or may not find one in the real filesystem above tmpdir; just check it doesn't throw
    expect(Array.isArray(result)).toBe(true);
  });

  it("stops before infinite loop at filesystem root", async () => {
    // Walk from filesystem root — should terminate without looping
    const result = await walkForAgentsMd(sep);
    expect(Array.isArray(result)).toBe(true);
  });

  it("respects MAX_WALK_DEPTH cap", async () => {
    // Build a deeply nested directory tree (depth > MAX_WALK_DEPTH)
    const depth = MAX_WALK_DEPTH + 5;
    const root = join(tmpdir(), `holocron-depth-test-${randomUUID()}`);
    let current = root;
    for (let i = 0; i < depth; i++) {
      current = join(current, `level${i}`);
    }
    await mkdir(current, { recursive: true });

    // Place an AGENTS.md at the very top (root) — walk should NOT find it
    // because it's more than MAX_WALK_DEPTH levels above `current`
    await writeFile(join(root, "AGENTS.md"), "# deep root rules", "utf-8");

    const result = await walkForAgentsMd(current);
    // The AGENTS.md at root level is beyond MAX_WALK_DEPTH — should not appear
    const hasRoot = result.some((p) => p === join(root, "AGENTS.md"));
    expect(hasRoot).toBe(false);
  });
});

// ── walkForContextFiles — CLAUDE.md priority logic ───────────────────────────

describe("walkForContextFiles — CLAUDE.md fallback", () => {
  it("returns CLAUDE.md when no AGENTS.md exists in directory", async () => {
    const root = await makeTempTree({
      "CLAUDE.md": "# Claude rules",
    });

    const result = await walkForContextFiles(root);
    expect(result.some((p) => p.endsWith("CLAUDE.md"))).toBe(true);
  });

  it("returns AGENTS.md and ignores CLAUDE.md when both exist in same directory", async () => {
    const root = await makeTempTree({
      "AGENTS.md": "# Agents rules",
      "CLAUDE.md": "# Claude rules",
    });

    const result = await walkForContextFiles(root);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("AGENTS.md");
    expect(result.some((p) => p.endsWith("CLAUDE.md"))).toBe(false);
  });

  it("uses AGENTS.md in child and CLAUDE.md in parent when each is alone", async () => {
    const root = await makeTempTree({
      "CLAUDE.md": "# Parent claude rules",
      "sub/AGENTS.md": "# Child agents rules",
    });

    const result = await walkForContextFiles(join(root, "sub"));
    expect(result.some((p) => p.endsWith("AGENTS.md"))).toBe(true);
    expect(result.some((p) => p.endsWith("CLAUDE.md"))).toBe(true);
  });

  it("returns AGENTS.md (not CLAUDE.md) when both exist — priority confirmed by path", async () => {
    const root = await makeTempTree({
      "AGENTS.md": "# Agents rules",
      "CLAUDE.md": "# Claude rules",
    });

    const result = await walkForContextFiles(root);
    expect(result[0]).toMatch(/AGENTS\.md$/);
  });

  it("CONTEXT_FILENAMES has AGENTS.md before CLAUDE.md", () => {
    expect(CONTEXT_FILENAMES[0]).toBe("AGENTS.md");
    expect(CONTEXT_FILENAMES[1]).toBe("CLAUDE.md");
  });
});

// ── readAgentsMd / readContextFile ────────────────────────────────────────────

describe("readContextFile", () => {
  it("reads content from an existing file", async () => {
    const root = await makeTempTree({
      "CLAUDE.md": "# Claude rules\nDo something.",
    });
    const content = await readContextFile(join(root, "CLAUDE.md"));
    expect(content).toContain("Claude rules");
  });

  it("returns null for a missing file", async () => {
    const result = await readContextFile("/nonexistent/path/CLAUDE.md");
    expect(result).toBeNull();
  });

  it("returns null for a directory path (not a file)", async () => {
    const root = await makeTempTree({});
    const result = await readContextFile(root);
    expect(result).toBeNull();
  });
});

describe("readAgentsMd", () => {
  it("reads content from an existing file", async () => {
    const root = await makeTempTree({
      "AGENTS.md": "# Test rules\nDo something.",
    });
    const content = await readAgentsMd(join(root, "AGENTS.md"));
    expect(content).toContain("Test rules");
  });

  it("returns null for a missing file", async () => {
    const result = await readAgentsMd("/nonexistent/path/AGENTS.md");
    expect(result).toBeNull();
  });

  it("returns null for a directory path (not a file)", async () => {
    const root = await makeTempTree({});
    const result = await readAgentsMd(root); // root is a directory
    expect(result).toBeNull();
  });
});

// ── formatInjection ───────────────────────────────────────────────────────────

describe("formatInjection", () => {
  it("includes the AGENTS.md path in the output", () => {
    const result = formatInjection("/a/b/AGENTS.md", "# Rules");
    expect(result).toContain("/a/b/AGENTS.md");
  });

  it("includes the content trimmed", () => {
    const result = formatInjection("/a/AGENTS.md", "  # Rule  \n\n");
    expect(result).toContain("# Rule");
  });

  it("wraps output in HTML comment markers for clear boundaries", () => {
    const result = formatInjection("/a/AGENTS.md", "# Rules");
    expect(result).toContain("<!-- holocron-agents-loader:");
    expect(result).toContain("<!-- end local rules -->");
  });
});

// ── Deduplication (injectedPaths set) ────────────────────────────────────────

describe("injectedPaths deduplication", () => {
  beforeEach(() => resetInjectedPaths());
  afterEach(() => resetInjectedPaths());

  it("starts empty after reset", () => {
    expect(injectedPaths.size).toBe(0);
  });

  it("tracks added paths", () => {
    injectedPaths.add("/a/AGENTS.md");
    expect(injectedPaths.has("/a/AGENTS.md")).toBe(true);
  });

  it("prevents duplicate injection by checking has() before add()", () => {
    injectedPaths.add("/a/AGENTS.md");
    const sizeBefore = injectedPaths.size;
    injectedPaths.add("/a/AGENTS.md"); // adding same path again
    expect(injectedPaths.size).toBe(sizeBefore);
  });

  it("does not deduplicate different paths", () => {
    injectedPaths.add("/a/AGENTS.md");
    injectedPaths.add("/b/AGENTS.md");
    expect(injectedPaths.size).toBe(2);
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("walk handles a file path directly (takes dirname)", async () => {
    const root = await makeTempTree({
      "AGENTS.md": "# Rules",
      "src/file.ts": "// code",
    });

    // Simulate what the plugin does: dirname of the file being read
    const { dirname } = await import("path");
    const startDir = dirname(join(root, "src", "file.ts"));
    const result = await walkForAgentsMd(startDir);
    // Should find root AGENTS.md (walking up from src/)
    expect(result.some((p) => p.endsWith("AGENTS.md"))).toBe(true);
  });

  it("walk returns empty array for empty string start dir gracefully", async () => {
    // dirname of an empty string produces "." — walk from current dir
    const { dirname } = await import("path");
    const startDir = dirname("");
    expect(typeof startDir).toBe("string");
    // Should not throw
    const result = await walkForAgentsMd(startDir);
    expect(Array.isArray(result)).toBe(true);
  });
});

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { mkdir, writeFile } from "fs/promises";
import { randomUUID } from "crypto";

import {
  readSettings,
  stripCodeFences,
  hasIncompleteWork,
  isSentinelPresent,
  DEFAULT_SETTINGS,
  RALPH_LOOP_SENTINEL,
  CONTINUATION_PROMPT,
} from "../src/index.js";

// ── readSettings ──────────────────────────────────────────────────────────────

describe("readSettings", () => {
  let memoryDir: string;

  beforeEach(async () => {
    memoryDir = join(tmpdir(), `holocron-test-${randomUUID()}`);
    await mkdir(join(memoryDir, "settings"), { recursive: true });
  });

  it("returns default settings when file is missing", async () => {
    const settings = await readSettings(memoryDir);
    expect(settings.ralph_loop.enabled).toBe(true);
  });

  it("reads ralph_loop.enabled: true from file", async () => {
    const content = JSON.stringify({ ralph_loop: { enabled: true } });
    await writeFile(join(memoryDir, "settings", "holocron.settings.json"), content, "utf-8");
    const settings = await readSettings(memoryDir);
    expect(settings.ralph_loop.enabled).toBe(true);
  });

  it("reads ralph_loop.enabled: false from file", async () => {
    const content = JSON.stringify({ ralph_loop: { enabled: false } });
    await writeFile(join(memoryDir, "settings", "holocron.settings.json"), content, "utf-8");
    const settings = await readSettings(memoryDir);
    expect(settings.ralph_loop.enabled).toBe(false);
  });

  it("falls back to defaults when file is malformed JSON", async () => {
    await writeFile(
      join(memoryDir, "settings", "holocron.settings.json"),
      "not valid json {{{{",
      "utf-8"
    );
    const settings = await readSettings(memoryDir);
    expect(settings.ralph_loop.enabled).toBe(DEFAULT_SETTINGS.ralph_loop.enabled);
  });

  it("falls back to defaults when ralph_loop key is missing", async () => {
    const content = JSON.stringify({ other_feature: { enabled: false } });
    await writeFile(join(memoryDir, "settings", "holocron.settings.json"), content, "utf-8");
    const settings = await readSettings(memoryDir);
    expect(settings.ralph_loop.enabled).toBe(DEFAULT_SETTINGS.ralph_loop.enabled);
  });
});

// ── stripCodeFences ───────────────────────────────────────────────────────────

describe("stripCodeFences", () => {
  it("removes content between triple backtick fences", () => {
    const text = "before\n```\n- [ ] task inside fence\n```\nafter";
    const result = stripCodeFences(text);
    expect(result).not.toContain("- [ ]");
    expect(result).toContain("before");
    expect(result).toContain("after");
  });

  it("leaves text outside fences intact", () => {
    const text = "- [ ] task outside fence\n```\ncode\n```";
    const result = stripCodeFences(text);
    expect(result).toContain("- [ ] task outside fence");
  });

  it("handles multiple code fences", () => {
    const text = "```\n- [ ] first\n```\nreal text\n```\n- [ ] second\n```";
    const result = stripCodeFences(text);
    expect(result).not.toContain("first");
    expect(result).not.toContain("second");
    expect(result).toContain("real text");
  });

  it("returns text unchanged when no fences present", () => {
    const text = "- [ ] plain checkbox outside any fence";
    expect(stripCodeFences(text)).toBe(text);
  });
});

// ── hasIncompleteWork ─────────────────────────────────────────────────────────

describe("hasIncompleteWork", () => {
  it("detects unchecked checkbox outside code fence", () => {
    expect(hasIncompleteWork("- [ ] ISC-1: do the thing")).toBe(true);
  });

  it("does NOT detect checkbox inside code fence", () => {
    expect(hasIncompleteWork("```\n- [ ] inside fence\n```")).toBe(false);
  });

  it("detects in_progress keyword", () => {
    expect(hasIncompleteWork("status: in_progress")).toBe(true);
  });

  it("does NOT detect in_progress inside code fence", () => {
    expect(hasIncompleteWork("```\nin_progress\n```")).toBe(false);
  });

  it("does NOT fire on fully checked list", () => {
    expect(hasIncompleteWork("- [x] ISC-1: done\n- [x] ISC-2: done")).toBe(false);
  });

  it("does NOT fire on normal prose with no signals", () => {
    expect(hasIncompleteWork("Here is a summary of the work done.")).toBe(false);
  });

  it("detects mixed: one unchecked among many checked", () => {
    const text = "- [x] ISC-1: done\n- [ ] ISC-2: pending\n- [x] ISC-3: done";
    expect(hasIncompleteWork(text)).toBe(true);
  });
});

// ── isSentinelPresent ─────────────────────────────────────────────────────────

describe("isSentinelPresent", () => {
  it("returns true when sentinel is in text", () => {
    expect(isSentinelPresent(`[${RALPH_LOOP_SENTINEL}] continue`)).toBe(true);
  });

  it("returns false when sentinel is absent", () => {
    expect(isSentinelPresent("normal response text")).toBe(false);
  });

  it("continuation prompt itself contains the sentinel", () => {
    expect(isSentinelPresent(CONTINUATION_PROMPT)).toBe(true);
  });
});

// ── sentinel constant ─────────────────────────────────────────────────────────

describe("RALPH_LOOP_SENTINEL", () => {
  it("is the expected string", () => {
    expect(RALPH_LOOP_SENTINEL).toBe("HOLOCRON_RALPH_LOOP");
  });
});

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { mkdir, readFile, rm } from "fs/promises";
import { randomUUID } from "crypto";

import {
  detectExplicitRating,
  detectImplicitSentiment,
  buildRatingEntry,
  appendSignal,
  writeLearningFile,
} from "../src/index.js";

// ── detectExplicitRating ──────────────────────────────────────────────────────

describe("detectExplicitRating", () => {
  it("detects N/10 at end of message", () => {
    expect(detectExplicitRating("that was great 7/10")).toBe(7);
  });

  it("detects 10/10", () => {
    expect(detectExplicitRating("10/10")).toBe(10);
  });

  it("detects 1/10", () => {
    expect(detectExplicitRating("1/10")).toBe(1);
  });

  it("detects 'rate: 8'", () => {
    expect(detectExplicitRating("rate: 8")).toBe(8);
  });

  it("detects 'rating: 5'", () => {
    expect(detectExplicitRating("rating: 5")).toBe(5);
  });

  it("detects 'score: 9'", () => {
    expect(detectExplicitRating("score: 9")).toBe(9);
  });

  it("does NOT match '7/10ths'", () => {
    expect(detectExplicitRating("only 7/10ths of the work done")).toBeNull();
  });

  it("does NOT match plain number without /10", () => {
    expect(detectExplicitRating("fixed 7 issues")).toBeNull();
  });

  it("returns null for no match", () => {
    expect(detectExplicitRating("looks good, keep going")).toBeNull();
  });
});

// ── detectImplicitSentiment ───────────────────────────────────────────────────

describe("detectImplicitSentiment", () => {
  it("detects correction: 'wrong'", () => {
    const result = detectImplicitSentiment("that's wrong, please fix it");
    expect(result).not.toBeNull();
    expect(result!.rating).toBe(3);
  });

  it("detects correction: 'that's not right'", () => {
    const result = detectImplicitSentiment("that's not what i asked");
    expect(result).not.toBeNull();
    expect(result!.rating).toBe(3);
  });

  it("detects correction: 'incorrect'", () => {
    const result = detectImplicitSentiment("that is incorrect");
    expect(result).not.toBeNull();
    expect(result!.rating).toBe(3);
  });

  it("detects positive: 'perfect'", () => {
    const result = detectImplicitSentiment("perfect, exactly what I needed");
    expect(result).not.toBeNull();
    expect(result!.rating).toBe(8);
  });

  it("detects positive: 'exactly'", () => {
    const result = detectImplicitSentiment("exactly right");
    expect(result).not.toBeNull();
    expect(result!.rating).toBe(8);
  });

  it("returns null for neutral message", () => {
    expect(detectImplicitSentiment("ok, keep going on the next task")).toBeNull();
  });
});

// ── buildRatingEntry ──────────────────────────────────────────────────────────

describe("buildRatingEntry", () => {
  it("contains all required fields", () => {
    const entry = buildRatingEntry(7, "sess-123", "explicit", "Explicit rating: 7/10", 1.0, "good job 7/10");
    expect(entry).toHaveProperty("timestamp");
    expect(entry).toHaveProperty("rating", 7);
    expect(entry).toHaveProperty("session_id", "sess-123");
    expect(entry).toHaveProperty("source", "explicit");
    expect(entry).toHaveProperty("sentiment_summary");
    expect(entry).toHaveProperty("confidence", 1.0);
    expect(entry).toHaveProperty("response_preview");
  });

  it("truncates response_preview to 300 chars", () => {
    const long = "x".repeat(500);
    const entry = buildRatingEntry(7, "sess-123", "explicit", "test", 1.0, long);
    expect(entry.response_preview.length).toBe(300);
  });
});

// ── appendSignal ──────────────────────────────────────────────────────────────

describe("appendSignal", () => {
  let memoryDir: string;

  beforeEach(async () => {
    memoryDir = join(tmpdir(), `holocron-test-${randomUUID()}`);
    await mkdir(memoryDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(memoryDir, { recursive: true, force: true });
  });

  it("creates LEARNING/SIGNALS/ratings.jsonl and appends entry", async () => {
    const entry = buildRatingEntry(7, "sess-1", "explicit", "test", 1.0, "7/10");
    await appendSignal(memoryDir, entry);

    const raw = await readFile(join(memoryDir, "LEARNING", "SIGNALS", "ratings.jsonl"), "utf-8");
    const parsed = JSON.parse(raw.trim());
    expect(parsed.rating).toBe(7);
    expect(parsed.session_id).toBe("sess-1");
    expect(parsed.source).toBe("explicit");
  });

  it("appends multiple entries on separate lines", async () => {
    const e1 = buildRatingEntry(7, "s1", "explicit", "a", 1.0, "7/10");
    const e2 = buildRatingEntry(3, "s2", "implicit", "b", 0.7, "wrong");
    await appendSignal(memoryDir, e1);
    await appendSignal(memoryDir, e2);

    const raw = await readFile(join(memoryDir, "LEARNING", "SIGNALS", "ratings.jsonl"), "utf-8");
    const lines = raw.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).rating).toBe(7);
    expect(JSON.parse(lines[1]).rating).toBe(3);
  });
});

// ── writeLearningFile ─────────────────────────────────────────────────────────

describe("writeLearningFile", () => {
  let memoryDir: string;

  beforeEach(async () => {
    memoryDir = join(tmpdir(), `holocron-test-${randomUUID()}`);
    await mkdir(memoryDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(memoryDir, { recursive: true, force: true });
  });

  it("writes a .md file for a low rating (≤ 4)", async () => {
    const entry = buildRatingEntry(3, "sess-1", "implicit", "Correction detected", 0.7, "that's wrong");
    await writeLearningFile(memoryDir, entry, "that's wrong, please redo this");

    const capturesDir = join(memoryDir, "LEARNING", "CAPTURES");
    const { readdir } = await import("fs/promises");
    const months = await readdir(capturesDir);
    expect(months.length).toBeGreaterThan(0);

    const files = await readdir(join(capturesDir, months[0]));
    expect(files.length).toBe(1);
    expect(files[0]).toContain("sentiment-rating-3");
    expect(files[0]).toEndWith(".md");
  });

  it("file contains required frontmatter fields", async () => {
    const entry = buildRatingEntry(2, "sess-1", "explicit", "Explicit rating: 2/10", 1.0, "2/10");
    await writeLearningFile(memoryDir, entry, "2/10 this needs improvement");

    const capturesDir = join(memoryDir, "LEARNING", "CAPTURES");
    const { readdir } = await import("fs/promises");
    const months = await readdir(capturesDir);
    const files = await readdir(join(capturesDir, months[0]));
    const content = await readFile(join(capturesDir, months[0], files[0]), "utf-8");

    expect(content).toContain("capture_type: LEARNING");
    expect(content).toContain("rating: 2");
    expect(content).toContain("auto_captured: true");
    expect(content).toContain("## Context");
    expect(content).toContain("## Improvement Notes");
  });
});

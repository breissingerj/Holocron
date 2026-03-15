import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { mkdir, writeFile, readFile } from "fs/promises";
import { randomUUID } from "crypto";

// ── helpers under test ────────────────────────────────────────────────────────
import {
  parseFrontmatter,
  generateSlug,
  buildPrdStub,
  syncToWorkJson,
} from "../src/index.js";

// ── parseFrontmatter ──────────────────────────────────────────────────────────

describe("parseFrontmatter", () => {
  it("returns null when no frontmatter block exists", () => {
    expect(parseFrontmatter("# No frontmatter here")).toBeNull();
  });

  it("parses all required PRD fields", () => {
    const stub = buildPrdStub("20260315-171554_new-task", new Date("2026-03-15T17:15:54Z"));
    const fm = parseFrontmatter(stub);
    expect(fm).not.toBeNull();
    expect(fm!.task).toBe("New Task");
    expect(fm!.slug).toBe("20260315-171554_new-task");
    expect(fm!.effort).toBe("standard");
    expect(fm!.phase).toBe("observe");
    expect(fm!.progress).toBe("0/0");
    expect(fm!.mode).toBe("interactive");
    expect(fm!.started).toBeTruthy();
    expect(fm!.updated).toBeTruthy();
  });

  it("handles values that contain colons (e.g. ISO timestamps)", () => {
    const content = `---\nstarted: 2026-03-15T17:15:54.000Z\n---`;
    const fm = parseFrontmatter(content);
    expect(fm!.started).toBe("2026-03-15T17:15:54.000Z");
  });
});

// ── generateSlug ──────────────────────────────────────────────────────────────

describe("generateSlug", () => {
  it("returns a string in YYYYMMDD-HHMMSS_new-task format", () => {
    const slug = generateSlug(new Date("2026-03-15T17:15:54Z"));
    expect(slug).toMatch(/^\d{8}-\d{6}_new-task$/);
  });

  it("encodes the date correctly", () => {
    const slug = generateSlug(new Date("2026-03-15T17:15:54Z"));
    expect(slug.startsWith("20260315-")).toBe(true);
  });
});

// ── buildPrdStub ──────────────────────────────────────────────────────────────

describe("buildPrdStub", () => {
  const now = new Date("2026-03-15T17:15:54Z");
  const slug = "20260315-171554_new-task";

  it("includes all 8 required frontmatter fields", () => {
    const stub = buildPrdStub(slug, now);
    const fm = parseFrontmatter(stub);
    const requiredFields = ["task", "slug", "effort", "phase", "progress", "mode", "started", "updated"];
    for (const field of requiredFields) {
      expect(fm).toHaveProperty(field);
    }
  });

  it("embeds the provided slug", () => {
    const stub = buildPrdStub(slug, now);
    expect(stub).toContain(`slug: ${slug}`);
  });

  it("sets effort to standard", () => {
    const stub = buildPrdStub(slug, now);
    expect(stub).toContain("effort: standard");
  });

  it("sets phase to observe", () => {
    const stub = buildPrdStub(slug, now);
    expect(stub).toContain("phase: observe");
  });

  it("sets progress to 0/0", () => {
    const stub = buildPrdStub(slug, now);
    expect(stub).toContain("progress: 0/0");
  });

  it("includes Context, Criteria, Decisions, Verification sections", () => {
    const stub = buildPrdStub(slug, now);
    expect(stub).toContain("## Context");
    expect(stub).toContain("## Criteria");
    expect(stub).toContain("## Decisions");
    expect(stub).toContain("## Verification");
  });
});

// ── syncToWorkJson ────────────────────────────────────────────────────────────

describe("syncToWorkJson", () => {
  let memoryDir: string;

  beforeEach(async () => {
    memoryDir = join(tmpdir(), `holocron-test-${randomUUID()}`);
    await mkdir(memoryDir, { recursive: true });
  });

  it("creates STATE/work.json with the slug key", async () => {
    const state = { slug: "20260315-171554_new-task", task: "Test", phase: "observe" };
    await syncToWorkJson(memoryDir, state);

    const raw = await readFile(join(memoryDir, "STATE", "work.json"), "utf-8");
    const data = JSON.parse(raw);
    expect(data).toHaveProperty("20260315-171554_new-task");
    expect(data["20260315-171554_new-task"].task).toBe("Test");
  });

  it("preserves existing entries when adding a new slug", async () => {
    const stateDir = join(memoryDir, "STATE");
    await mkdir(stateDir, { recursive: true });
    const existing = { "old-slug": { slug: "old-slug", task: "Old" } };
    await writeFile(join(stateDir, "work.json"), JSON.stringify(existing), "utf-8");

    const state = { slug: "new-slug", task: "New", phase: "observe" };
    await syncToWorkJson(memoryDir, state);

    const raw = await readFile(join(stateDir, "work.json"), "utf-8");
    const data = JSON.parse(raw);
    expect(data).toHaveProperty("old-slug");
    expect(data).toHaveProperty("new-slug");
  });

  it("recovers gracefully from a corrupt work.json", async () => {
    const stateDir = join(memoryDir, "STATE");
    await mkdir(stateDir, { recursive: true });
    await writeFile(join(stateDir, "work.json"), "not json {{", "utf-8");

    const state = { slug: "fresh-slug", task: "Fresh", phase: "observe" };
    await expect(syncToWorkJson(memoryDir, state)).resolves.toBeUndefined();

    const raw = await readFile(join(stateDir, "work.json"), "utf-8");
    const data = JSON.parse(raw);
    expect(data).toHaveProperty("fresh-slug");
  });
});

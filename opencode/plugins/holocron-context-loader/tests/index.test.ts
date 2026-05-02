import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { mkdir, writeFile, rm } from "fs/promises";
import { randomUUID } from "crypto";

import { buildContextBlock, getMostRecentPRD } from "../src/index.js";

// ── getMostRecentPRD ──────────────────────────────────────────────────────────

describe("getMostRecentPRD", () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = join(tmpdir(), `holocron-test-${randomUUID()}`);
    await mkdir(workDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it("returns null when WORK directory is empty", async () => {
    const result = await getMostRecentPRD(workDir);
    expect(result).toBeNull();
  });

  it("returns null when no subdirectory has a valid PRD.md", async () => {
    await mkdir(join(workDir, "slug-no-prd"), { recursive: true });
    const result = await getMostRecentPRD(workDir);
    expect(result).toBeNull();
  });

  it("returns the active work string for a valid PRD", async () => {
    const slug = "20260315-171554_test-task";
    await mkdir(join(workDir, slug), { recursive: true });
    await writeFile(
      join(workDir, slug, "PRD.md"),
      `---\ntask: Test Task\nslug: ${slug}\nphase: execute\n---\n`,
      "utf-8"
    );

    const result = await getMostRecentPRD(workDir);
    expect(result).toContain("Test Task");
    expect(result).toContain("execute");
    expect(result).toContain(slug);
  });

  it("returns the most recently modified PRD when multiple exist", async () => {
    const slugOld = "20260314-100000_old-task";
    const slugNew = "20260315-171554_new-task";

    await mkdir(join(workDir, slugOld), { recursive: true });
    await writeFile(
      join(workDir, slugOld, "PRD.md"),
      `---\ntask: Old Task\nslug: ${slugOld}\nphase: complete\n---\n`,
      "utf-8"
    );

    // Small delay to ensure different mtimes
    await new Promise((r) => setTimeout(r, 20));

    await mkdir(join(workDir, slugNew), { recursive: true });
    await writeFile(
      join(workDir, slugNew, "PRD.md"),
      `---\ntask: New Task\nslug: ${slugNew}\nphase: execute\n---\n`,
      "utf-8"
    );

    const result = await getMostRecentPRD(workDir);
    expect(result).toContain("New Task");
    expect(result).not.toContain("Old Task");
  });
});

// ── buildContextBlock ─────────────────────────────────────────────────────────

describe("buildContextBlock", () => {
  let memoryDir: string;
  const savedEnv = process.env.HOLOCRON_MEMORY_DIR;

  beforeEach(async () => {
    memoryDir = join(tmpdir(), `holocron-test-${randomUUID()}`);
    await mkdir(join(memoryDir, "memory"), { recursive: true });
    await mkdir(join(memoryDir, "WORK"), { recursive: true });
  });

  afterEach(async () => {
    process.env.HOLOCRON_MEMORY_DIR = savedEnv;
    await rm(memoryDir, { recursive: true, force: true });
  });

  it("returns null when HOLOCRON_MEMORY_DIR is not set", async () => {
    delete process.env.HOLOCRON_MEMORY_DIR;
    const result = await buildContextBlock(null);
    expect(result).toBeNull();
  });

  it("returns null when memory dir is set but no files exist", async () => {
    process.env.HOLOCRON_MEMORY_DIR = memoryDir;
    const result = await buildContextBlock(null);
    expect(result).toBeNull();
  });

  it("includes Identity section when IDENTITY.md is present", async () => {
    process.env.HOLOCRON_MEMORY_DIR = memoryDir;
    await writeFile(join(memoryDir, "memory", "IDENTITY.md"), "Name: Jack\nRole: Engineer", "utf-8");

    const result = await buildContextBlock(null);
    expect(result).toContain("## Identity");
    expect(result).toContain("Name: Jack");
  });

  it("includes Memory section when MEMORY.md is present", async () => {
    process.env.HOLOCRON_MEMORY_DIR = memoryDir;
    await writeFile(join(memoryDir, "memory", "MEMORY.md"), "Prefers TypeScript.", "utf-8");

    const result = await buildContextBlock(null);
    expect(result).toContain("## Memory");
    expect(result).toContain("Prefers TypeScript.");
  });

  it("includes both Identity and Memory sections when both files exist", async () => {
    process.env.HOLOCRON_MEMORY_DIR = memoryDir;
    await writeFile(join(memoryDir, "memory", "IDENTITY.md"), "Name: Jack", "utf-8");
    await writeFile(join(memoryDir, "memory", "MEMORY.md"), "Prefers TypeScript.", "utf-8");

    const result = await buildContextBlock(null);
    expect(result).toContain("## Identity");
    expect(result).toContain("## Memory");
  });

  it("wraps output in holocron-context-loader comment markers", async () => {
    process.env.HOLOCRON_MEMORY_DIR = memoryDir;
    await writeFile(join(memoryDir, "memory", "IDENTITY.md"), "Name: Jack", "utf-8");

    const result = await buildContextBlock(null);
    expect(result).toContain("<!-- holocron-context-loader:");
    expect(result).toContain("<!-- end personal context -->");
  });
});

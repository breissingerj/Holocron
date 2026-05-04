/**
 * holocron-memory.ts — Holocron Memory Context Priming Extension
 *
 * Replicates the Claude LoadContext.hook.ts memory priming behavior for pi.
 * At session start, loads static and dynamic context from $HOLOCRON_MEMORY_DIR
 * and injects it into the system prompt via the before_agent_start event.
 *
 * Loaded context:
 *   - memory/MEMORY.md               — curated master memory index
 *   - Holocron/USER/AISTEERINGRULES.md — behavioral overrides
 *   - Holocron/USER/PROJECTS/PROJECTS.md — active project registry
 *   - Holocron/USER/OPINIONS.md       — high-confidence preferences (≥0.85)
 *   - RELATIONSHIP/YYYY-MM/YYYY-MM-DD.md — today + yesterday notes
 *   - LEARNING/REFLECTIONS/algorithm-reflections.jsonl — last 5 entries
 *   - WORK/{slug}/ PRDs from last 48h with non-complete phase
 *
 * Placement: ~/.pi/agent/extensions/holocron-memory.ts
 * Reload:    /reload  (after edits)
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MemorySection {
  title: string;
  content: string;
}

interface MemoryContext {
  sections: MemorySection[];
  totalChars: number;
  loadedAt: string;
}

// ─── Size budgets per section (chars) ─────────────────────────────────────────
const SECTION_LIMITS: Record<string, number> = {
  "Holocron Memory":      3000,
  "AI Steering Rules":    1500,
  "Active Projects":      1000,
  "Key Opinions":          500,
  "Relationship Context":  700,
  "Learning Reflections":  700,
  "Active Work":           700,
};
const TOTAL_CAP = 8000;

// ─── Sentinel injected into the system prompt to detect duplicate injection ───
const MEMORY_SENTINEL = "<!-- holocron-memory-priming -->";

// ─── Module-level cache (populated at session_start, read at before_agent_start) ──
let cachedContext: MemoryContext | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeRead(path: string): string | null {
  try {
    if (!existsSync(path)) return null;
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const truncated = text.slice(0, maxChars);
  // Try to cut at a paragraph boundary
  const lastPara = truncated.lastIndexOf("\n\n");
  const cut = lastPara > maxChars * 0.6 ? lastPara : truncated.lastIndexOf("\n");
  return (cut > maxChars * 0.5 ? truncated.slice(0, cut) : truncated) +
    `\n\n[...truncated — ${text.length - maxChars} chars omitted]`;
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0]!;
}

function formatMonth(d: Date): string {
  return d.toISOString().slice(0, 7);
}

// ─── Static file loaders ──────────────────────────────────────────────────────

function loadStaticFiles(dir: string): MemorySection[] {
  const sections: MemorySection[] = [];

  const staticFiles: Array<{ rel: string; title: string }> = [
    { rel: "memory/MEMORY.md",                            title: "Holocron Memory"   },
    { rel: "Holocron/USER/AISTEERINGRULES.md",            title: "AI Steering Rules" },
    { rel: "Holocron/USER/PROJECTS/PROJECTS.md",          title: "Active Projects"   },
  ];

  for (const { rel, title } of staticFiles) {
    const content = safeRead(join(dir, rel));
    if (content) {
      const limit = SECTION_LIMITS[title] ?? 1000;
      sections.push({ title, content: truncate(content.trim(), limit) });
    }
  }

  return sections;
}

// ─── OPINIONS.md — extract high-confidence opinions ──────────────────────────

function loadOpinions(dir: string): MemorySection | null {
  const content = safeRead(join(dir, "Holocron/USER/OPINIONS.md"));
  if (!content) return null;

  const bullets: string[] = [];

  // Split on ### headings to get opinion blocks
  const blocks = content.split(/^### /m).slice(1);
  for (const block of blocks) {
    const lines = block.split("\n");
    const title = lines[0]?.trim();
    if (!title) continue;

    const confidenceMatch = block.match(/\*\*Confidence:\*\*\s*([\d.]+)/);
    const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]!) : 0;

    if (confidence >= 0.85 && title) {
      bullets.push(`• ${title} (${Math.round(confidence * 100)}%)`);
    }
  }

  if (bullets.length === 0) return null;

  const limit = SECTION_LIMITS["Key Opinions"] ?? 500;
  const body = bullets.join("\n");
  return {
    title: "Key Opinions",
    content: truncate(body, limit),
  };
}

// ─── RELATIONSHIP notes — today + yesterday ───────────────────────────────────

function loadRelationship(dir: string): MemorySection | null {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const parts: string[] = [];

  for (const date of [today, yesterday]) {
    const noteFile = join(
      dir,
      "RELATIONSHIP",
      formatMonth(date),
      `${formatDate(date)}.md`
    );
    const content = safeRead(noteFile);
    if (content) {
      parts.push(`*${formatDate(date)}:*`);
      // Pull bullet list items, max 8
      const bullets = content
        .split("\n")
        .filter((l) => l.trim().startsWith("- "))
        .slice(0, 8);
      if (bullets.length > 0) {
        parts.push(...bullets);
      } else {
        // Fall back to first 300 chars of file
        parts.push(content.trim().slice(0, 300));
      }
    }
  }

  if (parts.length === 0) return null;

  const limit = SECTION_LIMITS["Relationship Context"] ?? 700;
  return {
    title: "Relationship Context",
    content: truncate(parts.join("\n"), limit),
  };
}

// ─── Algorithm reflections — last 5 JSONL entries ────────────────────────────

interface ReflectionEntry {
  timestamp?: string;
  task_description?: string;
  implied_sentiment?: number;
  effort_level?: string;
  criteria_passed?: number;
  criteria_count?: number;
  reflection_q1?: string;
  within_budget?: boolean;
}

function loadReflections(dir: string): MemorySection | null {
  const jsonlPath = join(dir, "LEARNING/REFLECTIONS/algorithm-reflections.jsonl");
  const raw = safeRead(jsonlPath);
  if (!raw) return null;

  const lines = raw.trim().split("\n").filter(Boolean);
  const recent = lines.slice(-5).reverse(); // last 5, newest first

  const formatted: string[] = [];
  for (const line of recent) {
    try {
      const entry = JSON.parse(line) as ReflectionEntry;
      const date = entry.timestamp ? entry.timestamp.slice(0, 10) : "?";
      const sentiment = entry.implied_sentiment ?? "?";
      const task = entry.task_description ?? "unknown task";
      const passed = entry.criteria_passed ?? "?";
      const total = entry.criteria_count ?? "?";
      const q1 = entry.reflection_q1 ? ` → ${entry.reflection_q1.slice(0, 80)}` : "";
      formatted.push(`[${date} | ${sentiment}/10 | ${passed}/${total}] ${task}${q1}`);
    } catch {
      // Skip malformed lines
    }
  }

  if (formatted.length === 0) return null;

  const limit = SECTION_LIMITS["Learning Reflections"] ?? 700;
  return {
    title: "Learning Reflections",
    content: truncate(formatted.join("\n"), limit),
  };
}

// ─── Active Work — WORK/ PRDs from last 48h ───────────────────────────────────

interface WorkEntry {
  slug: string;
  task: string;
  phase: string;
  progress: string;
  timestamp: string;
}

function loadActiveWork(dir: string): MemorySection | null {
  const workDir = join(dir, "WORK");
  if (!existsSync(workDir)) return null;

  const now = Date.now();
  const cutoff48h = 48 * 60 * 60 * 1000;
  const entries: WorkEntry[] = [];

  let allDirs: string[] = [];
  try {
    allDirs = readdirSync(workDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && /^\d{8}-\d{6}_/.test(d.name))
      .map((d) => d.name)
      .sort()
      .reverse()
      .slice(0, 50); // cap scan at 50 most recent
  } catch {
    return null;
  }

  for (const dirName of allDirs) {
    // Parse timestamp from dir name YYYYMMDD-HHMMSS_slug
    const m = dirName.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})_(.+)$/);
    if (!m) continue;

    const [, y, mo, d, h, mi, s] = m;
    const dirTime = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}`).getTime();
    if (now - dirTime > cutoff48h) break; // dirs are sorted newest-first; stop on first stale

    const prdPath = join(workDir, dirName, "PRD.md");
    const prdContent = safeRead(prdPath);
    if (!prdContent) continue;

    // Extract frontmatter fields
    const taskMatch = prdContent.match(/^task:\s*(.+)$/m);
    const phaseMatch = prdContent.match(/^phase:\s*(\S+)$/m);
    const progressMatch = prdContent.match(/^progress:\s*(\S+)$/m);

    const task = taskMatch?.[1]?.trim() ?? dirName;
    const phase = phaseMatch?.[1]?.trim() ?? "unknown";
    const progress = progressMatch?.[1]?.trim() ?? "?/?";

    // Skip completed sessions
    if (phase === "complete") continue;

    entries.push({
      slug: dirName,
      task,
      phase,
      progress,
      timestamp: `${y}-${mo}-${d} ${h}:${mi}`,
    });
  }

  if (entries.length === 0) return null;

  const lines = entries.map(
    (e) => `• [${e.phase} | ${e.progress}] ${e.task} (${e.timestamp})`
  );

  const limit = SECTION_LIMITS["Active Work"] ?? 700;
  return {
    title: "Active Work",
    content: truncate(lines.join("\n"), limit),
  };
}

// ─── Assemble full context block ──────────────────────────────────────────────

function buildMemoryContext(): MemoryContext {
  const dir = process.env.HOLOCRON_MEMORY_DIR;
  if (!dir || !existsSync(dir)) {
    return { sections: [], totalChars: 0, loadedAt: new Date().toISOString() };
  }

  const sections: MemorySection[] = [];

  // Static files
  sections.push(...loadStaticFiles(dir));

  // Dynamic sections
  const dynamic = [
    loadOpinions(dir),
    loadRelationship(dir),
    loadReflections(dir),
    loadActiveWork(dir),
  ];
  for (const s of dynamic) {
    if (s) sections.push(s);
  }

  // Enforce total cap — drop later sections if over budget
  let budget = TOTAL_CAP;
  const kept: MemorySection[] = [];
  for (const section of sections) {
    if (budget <= 0) break;
    const chars = section.content.length;
    if (chars <= budget) {
      kept.push(section);
      budget -= chars;
    } else {
      // Partial: truncate to remaining budget
      kept.push({
        title: section.title,
        content: truncate(section.content, budget),
      });
      budget = 0;
    }
  }

  const totalChars = kept.reduce((sum, s) => sum + s.content.length, 0);
  return { sections: kept, totalChars, loadedAt: new Date().toISOString() };
}

function formatMemoryBlock(ctx: MemoryContext): string {
  if (ctx.sections.length === 0) return "";

  const parts: string[] = [
    MEMORY_SENTINEL,
    "# Holocron Memory Context\n",
    `> Auto-loaded at session start from $HOLOCRON_MEMORY_DIR. ${ctx.sections.length} sections, ${ctx.totalChars} chars.\n`,
  ];

  for (const section of ctx.sections) {
    parts.push(`\n## ${section.title}\n\n${section.content}`);
  }

  parts.push("\n<!-- end holocron-memory-priming -->");
  return parts.join("\n");
}

// ─── Extension entry point ────────────────────────────────────────────────────

export default function holocronMemory(pi: ExtensionAPI) {
  // ── session_start: load memory context once ──────────────────────────────
  pi.on("session_start", async (_event, ctx) => {
    const dir = process.env.HOLOCRON_MEMORY_DIR;

    if (!dir || !existsSync(dir)) {
      if (ctx.hasUI) {
        ctx.ui.notify(
          "⚠️ Holocron memory: $HOLOCRON_MEMORY_DIR not set or not found — skipping context priming",
          "warning"
        );
      }
      cachedContext = null;
      return;
    }

    cachedContext = buildMemoryContext();

    if (ctx.hasUI) {
      if (cachedContext.sections.length > 0) {
        const sectionNames = cachedContext.sections.map((s) => s.title).join(", ");
        ctx.ui.notify(
          `🧠 Holocron memory primed: ${cachedContext.sections.length} sections (${cachedContext.totalChars} chars)\n  ${sectionNames}`,
          "info"
        );
      } else {
        ctx.ui.notify("⚠️ Holocron memory: no context sections loaded", "warning");
      }
    }
  });

  // ── before_agent_start: inject cached context into system prompt ──────────
  pi.on("before_agent_start", async (event) => {
    if (!cachedContext || cachedContext.sections.length === 0) return;

    // Guard against duplicate injection (e.g. tool-triggered re-runs)
    if (event.systemPrompt.includes(MEMORY_SENTINEL)) return;

    const block = formatMemoryBlock(cachedContext);
    return {
      systemPrompt: event.systemPrompt + "\n\n" + block,
    };
  });

  // ── /memory-status: show what was loaded ─────────────────────────────────
  pi.registerCommand("memory-status", {
    description: "Show Holocron memory context loaded into this session",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;

      if (!cachedContext) {
        ctx.ui.notify("Holocron memory: not loaded (no session_start fired yet)", "warning");
        return;
      }

      if (cachedContext.sections.length === 0) {
        ctx.ui.notify(
          "$HOLOCRON_MEMORY_DIR not set or no memory files found.",
          "warning"
        );
        return;
      }

      const dir = process.env.HOLOCRON_MEMORY_DIR ?? "(unset)";
      const lines: string[] = [
        `🧠 Holocron Memory Context`,
        `   Source: ${dir}`,
        `   Loaded: ${cachedContext.loadedAt}`,
        `   Total: ${cachedContext.sections.length} sections, ${cachedContext.totalChars} chars`,
        ``,
      ];

      for (const section of cachedContext.sections) {
        lines.push(`  📄 ${section.title}: ${section.content.length} chars`);
      }

      ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}

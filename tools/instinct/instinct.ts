#!/usr/bin/env bun
/**
 * instinct.ts — Instinct-style memory core (spec: specs/002-instinct-memory-backend)
 *
 * Harness-agnostic CLI + library. Thin adapters (pi extension, Claude hooks) shell out to it.
 * Active only when HOLOCRON_MEMORY_BACKEND=instinct (hook-* commands are silent no-ops otherwise).
 *
 * Layout under $HOLOCRON_MEMORY_DIR/instinct/:
 *   profile.md onepager.md recap.md board.md
 *   store/{entities,knowledge,timeline}/**.md   (only `consolidate`/`forget` write here)
 *   store/_archive/**                            (superseded / expired / forgotten bullets)
 *   inbox/*.jsonl  inbox/processed/              (candidate facts)
 *   .state/checkpoints.json                      (transcript offsets per session)
 *
 * Bullet format (metadata in a trailing HTML comment so it renders clean in Obsidian):
 *   - fact text <!-- b:ab12cd asserted:2026-10-08 conf:0.8 src:session expires:2027-01-01 superseded_by:ef34 -->
 */

import {
  existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, appendFileSync,
  renameSync, statSync,
} from "node:fs";
import { join, dirname, relative, basename } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

// ─── Config ───────────────────────────────────────────────────────────────────

export const SENTINEL = "<!-- instinct-memory -->";
export const BUDGET_TOKENS = { profile: 500, onepager: 4000, recap: 8000, board: 2000, retrieved: 2000 };
const STALE_DAYS = 180;
const LOW_CONF = 0.5;
const DECAY_DAYS = 180;
const tok = (s: string) => Math.ceil(s.length / 4);
const clip = (s: string, tokens: number) => {
  const max = tokens * 4;
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const nl = cut.lastIndexOf("\n");
  return (nl > max * 0.6 ? cut.slice(0, nl) : cut) + "\n[…truncated]";
};

export const isActive = () => process.env.HOLOCRON_MEMORY_BACKEND === "instinct";
const nowDate = () => (process.env.INSTINCT_NOW ? new Date(process.env.INSTINCT_NOW) : new Date());
const today = () => nowDate().toISOString().slice(0, 10);

export function memDir(): string {
  const d = process.env.HOLOCRON_MEMORY_DIR;
  if (!d) throw new Error("HOLOCRON_MEMORY_DIR is not set");
  return d;
}
export const root = () => join(memDir(), "instinct");
const P = {
  profile: () => join(root(), "profile.md"),
  onepager: () => join(root(), "onepager.md"),
  recap: () => join(root(), "recap.md"),
  board: () => join(root(), "board.md"),
  store: () => join(root(), "store"),
  archive: () => join(root(), "store", "_archive"),
  inbox: () => join(root(), "inbox"),
  processed: () => join(root(), "inbox", "processed"),
  state: () => join(root(), ".state"),
  signals: () => join(root(), "signals"),
  suggestions: () => join(root(), "suggestions"),
};

const read = (p: string) => { try { return readFileSync(p, "utf-8"); } catch { return ""; } };
const write = (p: string, s: string) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, s); };

// ─── Store model ──────────────────────────────────────────────────────────────

export interface Bullet {
  id: string; text: string; asserted: string; conf: number; src: string;
  expires?: string; supersededBy?: string; archived?: string; reason?: string;
}
export interface StoreFile {
  path: string; rel: string; id: string; type: string; aliases: string[];
  updated: string; pinned: boolean; title: string; bullets: Bullet[]; preamble: string; raw: string;
}

const META_RE = /\s*<!--\s*b:(\S+)([^>]*?)-->\s*$/;

export function parseBullet(line: string): Bullet | null {
  if (!line.startsWith("- ")) return null;
  const m = line.match(META_RE);
  const text = (m ? line.slice(2, m.index) : line.slice(2)).trim();
  const meta: Record<string, string> = {};
  if (m) for (const kv of m[2]!.trim().split(/\s+/)) { const i = kv.indexOf(":"); if (i > 0) meta[kv.slice(0, i)] = kv.slice(i + 1); }
  return {
    id: m ? m[1]! : hash(text),
    text,
    asserted: meta.asserted ?? "",
    conf: meta.conf ? parseFloat(meta.conf) : 0.7,
    src: meta.src ?? "",
    expires: meta.expires,
    supersededBy: meta.superseded_by,
    archived: meta.archived,
    reason: meta.reason,
  };
}
export function fmtBullet(b: Bullet): string {
  const parts = [`b:${b.id}`, `asserted:${b.asserted}`, `conf:${b.conf}`];
  if (b.src) parts.push(`src:${b.src.replace(/\s+/g, "_")}`);
  if (b.expires) parts.push(`expires:${b.expires}`);
  if (b.supersededBy) parts.push(`superseded_by:${b.supersededBy}`);
  if (b.archived) parts.push(`archived:${b.archived}`);
  if (b.reason) parts.push(`reason:${b.reason.replace(/\s+/g, "_")}`);
  return `- ${b.text} <!-- ${parts.join(" ")} -->`;
}
const hash = (s: string) => createHash("sha1").update(s.toLowerCase()).digest("hex").slice(0, 6);

export function parseStoreFile(path: string): StoreFile {
  const raw = read(path);
  const fm: Record<string, string> = {};
  let body = raw;
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (m) {
    body = raw.slice(m[0].length);
    for (const l of m[1]!.split("\n")) { const i = l.indexOf(":"); if (i > 0) fm[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }
  }
  const aliases = (fm.aliases ?? "").replace(/^\[|\]$/g, "").split(",").map((s) => s.trim()).filter(Boolean);
  const lines = body.split("\n");
  const bullets: Bullet[] = []; const pre: string[] = []; let seenBullet = false; let title = "";
  for (const l of lines) {
    const b = parseBullet(l);
    if (b) { bullets.push(b); seenBullet = true; }
    else if (!seenBullet) { pre.push(l); if (!title && l.startsWith("# ")) title = l.slice(2).trim(); }
  }
  const rel = relative(P.store(), path);
  return {
    path, rel, id: fm.id ?? basename(path, ".md"), type: fm.type ?? "topic", aliases,
    updated: fm.updated ?? "", pinned: fm.pinned === "true", title: title || basename(path, ".md"),
    bullets, preamble: pre.join("\n").trimEnd(), raw,
  };
}
export function renderStoreFile(f: Pick<StoreFile, "id" | "type" | "aliases" | "updated" | "pinned" | "preamble" | "bullets">): string {
  const fm = [`id: ${f.id}`, `type: ${f.type}`, `aliases: [${f.aliases.join(", ")}]`, `updated: ${f.updated}`];
  if (f.pinned) fm.push("pinned: true");
  return `---\n${fm.join("\n")}\n---\n${f.preamble}\n\n${f.bullets.map(fmtBullet).join("\n")}\n`;
}

function walk(dir: string, skipArchive = true): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (skipArchive && e.name === "_archive") continue; out.push(...walk(p, skipArchive)); }
    else if (e.name.endsWith(".md")) out.push(p);
  }
  return out;
}
export const loadStore = () => walk(P.store()).map(parseStoreFile);

// ─── Text utils ───────────────────────────────────────────────────────────────

const STOP = new Set("the and for with that this from have has had are was were you your what when where how why who about into out not but can could should would will just any all get got let its our their them they then than too very".split(" "));
export const tokens = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !STOP.has(t));
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "untitled";

/** Optimal-string-alignment (Damerau-Levenshtein) distance. */
export function dl(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    const c = a[i - 1] === b[j - 1] ? 0 : 1;
    d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + c);
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
  }
  return d[a.length]![b.length]!;
}
// "pazta" vs "pasta" is a substitution (dist 1). Tokens ≥4 chars tolerate 1 edit.
const fuzzyEq = (q: string, t: string) => q === t || (q.length >= 4 && t.length >= 4 && dl(q, t) <= 1);
const jaccard = (a: string, b: string) => {
  const A = new Set(tokens(a)), B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let i = 0; for (const x of A) if (B.has(x)) i++;
  return i / (A.size + B.size - i);
};
const ageDays = (d: string) => d ? Math.max(0, (nowDate().getTime() - new Date(d).getTime()) / 86400000) : 0;

// ─── Recall (recency-weighted, typo tolerant) ─────────────────────────────────

export interface Hit { file: StoreFile; score: number; lines: Bullet[] }

export function recall(query: string, k = 4): Hit[] {
  const q = [...new Set(tokens(query))];
  if (!q.length) return [];
  const hits: Hit[] = [];
  for (const f of loadStore()) {
    const names = new Set([f.id, f.title, basename(f.rel, ".md"), ...f.aliases].flatMap(tokens));
    let score = 0;
    for (const t of q) {
      if (names.has(t)) score += 3;
      else if ([...names].some((n) => fuzzyEq(t, n))) score += 2;
    }
    const live = f.bullets.filter((b) => !b.supersededBy && !(b.expires && b.expires < today()));
    const scoredBullets = live.map((b) => {
      const bt = new Set(tokens(b.text));
      let s = 0; for (const t of q) if (bt.has(t)) s += 1; else if ([...bt].some((x) => fuzzyEq(t, x))) s += 0.5;
      return { b, s };
    });
    const bodyScore = Math.min(3, scoredBullets.reduce((a, x) => a + x.s, 0));
    score += bodyScore;
    if (score <= 0) continue;
    const newest = live.map((b) => b.asserted).sort().pop() || f.updated;
    const weight = f.pinned ? 1 : 0.5 + 0.5 * Math.exp(-ageDays(newest) / DECAY_DAYS);
    const lines = scoredBullets.sort((x, y) => y.s - x.s || (y.b.asserted > x.b.asserted ? 1 : -1)).slice(0, 5).map((x) => x.b);
    hits.push({ file: f, score: score * weight, lines });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, k);
}

export function formatHits(hits: Hit[], tokenBudget = BUDGET_TOKENS.retrieved): string {
  if (!hits.length) return "";
  const store = loadStore();
  const out: string[] = [];
  for (const h of hits) {
    out.push(`### ${h.file.title} (${h.file.type}, updated ${h.file.updated || "?"})  [${h.file.rel}]`);
    if (h.file.preamble.trim()) out.push(h.file.preamble.replace(/^# .*\n?/m, "").trim().slice(0, 300));
    for (const b of h.lines) out.push(`- ${b.text}${b.asserted ? ` (${b.asserted})` : ""}`);
    const links = [...h.file.raw.matchAll(/\[\[([^\]|#]+)/g)].map((m) => slug(m[1]!)).slice(0, 3);
    for (const l of links) { const t = store.find((s) => slug(s.id) === l || slug(s.title) === l); if (t) out.push(`  ↳ [[${t.id}]] ${t.title}`); }
  }
  return clip(out.join("\n"), tokenBudget);
}

// ─── Assemble (Tier 1 + Tier 2) ──────────────────────────────────────────────

function activePrds(hours = 72): string[] {
  const dir = join(memDir(), "WORK"); const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const d of readdirSync(dir)) {
    const f = join(dir, d, "PRD.md"); if (!existsSync(f)) continue;
    if ((nowDate().getTime() - statSync(f).mtimeMs) / 3600000 > hours) continue;
    const t = read(f); const g = (k: string) => t.match(new RegExp(`^${k}:\\s*(.*)$`, "m"))?.[1]?.replace(/^"|"$/g, "") ?? "";
    if (g("phase") === "complete") continue;
    out.push(`- [ ] ${g("task") || d} — phase ${g("phase")}, ${g("progress")} (WORK/${d})`);
  }
  return out;
}

export function assemble(opts: { prompt?: string; sessionStart?: boolean } = {}): string {
  const sessionStart = opts.sessionStart ?? true;
  const parts: string[] = [SENTINEL];
  const sec = (title: string, body: string) => { if (body.trim()) parts.push(`\n## ${title}\n\n${body.trim()}`); };
  if (sessionStart) {
    sec("Profile", clip(read(P.profile()), BUDGET_TOKENS.profile));
    sec("Memory One-Pager", clip(read(P.onepager()), BUDGET_TOKENS.onepager));
    sec("Session Recap (open loops, identifiers)", clip(read(P.recap()), BUDGET_TOKENS.recap));
    const pend = listSuggestions().filter((x) => x.status === "proposed").length;
    sec("Board", clip([read(P.board()).trim(), ...activePrds(), pend ? `- ⚠ ${pend} pending skill/agent prompt-change suggestion(s) — review: bun $HOLOCRON_DIR/tools/instinct/instinct.ts suggestions` : ""].filter(Boolean).join("\n"), BUDGET_TOKENS.board));
  }
  if (opts.prompt) sec("Relevant Memory (auto-retrieved)", formatHits(recall(opts.prompt)));
  parts.push("<!-- end instinct-memory -->");
  return parts.length > 2 ? parts.join("\n") : "";
}

// ─── Seed (non-destructive) ───────────────────────────────────────────────────

function section(md: string, heading: string): string {
  const m = md.match(new RegExp(`^## ${heading}\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, "m"));
  return m ? m[1]!.trim() : "";
}

export function seed(opts: { force?: boolean } = {}): string[] {
  const log: string[] = []; const t = today();
  const memory = read(join(memDir(), "memory", "MEMORY.md"));
  const put = (p: string, s: string) => {
    if (existsSync(p) && !opts.force) { log.push(`skip   ${relative(root(), p)} (exists)`); return; }
    write(p, s); log.push(`write  ${relative(root(), p)}`);
  };
  put(P.profile(), `# Profile\n\n${section(memory, "User") || "(fill in: name, timezone, accounts)"}\n`);
  const one = [section(memory, "Company"), "## Rivian\n" + section(memory, "Rivian"), "## Workflow Preferences\n" + section(memory, "Workflow Preferences")].filter((x) => x.trim().length > 12).join("\n\n");
  put(P.onepager(), `<!-- generated: seed ${t}; regenerate with: instinct consolidate --regen-onepager -->\n# One-Pager\n\n${clip(one, BUDGET_TOKENS.onepager)}\n`);
  put(P.board(), `# Board (manual items; active PRDs are appended live)\n`);
  put(P.recap(), `# Recap\n\n(no sessions recorded yet)\n`);
  mkdirSync(P.inbox(), { recursive: true }); mkdirSync(P.state(), { recursive: true });
  // Topic pointers: one store file per memory/*.md topic → instant recall without duplicating content.
  const mdir = join(memDir(), "memory");
  if (existsSync(mdir)) for (const f of readdirSync(mdir)) {
    if (!f.endsWith(".md") || f === "MEMORY.md") continue;
    const id = f.replace(/\.md$/, ""); const dest = join(P.store(), "knowledge", "topics", f);
    if (existsSync(dest) && !opts.force) continue;
    const body = read(join(mdir, f)); const fm = body.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
    const title = fm.match(/^title:\s*(.*)$/m)?.[1]?.replace(/^['"]|['"]$/g, "") ?? body.match(/^# (.*)$/m)?.[1] ?? id;
    const fmAliases = [...fm.matchAll(/^\s+-\s+(.+)$/gm)].map((m) => m[1]!.trim()).slice(0, 6);
    const aliases = [...new Set([...id.split("-"), ...fmAliases])].filter((a) => a.length >= 3);
    const facts = body.replace(/^---[\s\S]*?---\n/, "").split("\n").filter((l) => /^[-*] /.test(l.trim())).slice(0, 12)
      .map((l) => l.trim().replace(/^[-*] /, "").replace(/<!--.*?-->/g, "").slice(0, 280));
    const bullets: Bullet[] = [{ id: hash(id + "src"), text: `Full notes: memory/${f}`, asserted: t, conf: 0.9, src: "seed" },
      ...facts.map((x) => ({ id: hash(x), text: x, asserted: t, conf: 0.6, src: "seed" }))];
    write(dest, renderStoreFile({ id, type: "topic", aliases, updated: t, pinned: false, preamble: `# ${title}`, bullets }));
  }
  log.push(`topics ${walk(join(P.store(), "knowledge", "topics")).length} store files`);
  return log;
}

// ─── Capture (explicit) ───────────────────────────────────────────────────────

export interface Candidate { ts: string; fact: string; entity?: string; type?: string; conf: number; src: string; expires?: string; session?: string }

export function capture(c: Omit<Candidate, "ts" | "conf" | "src"> & { conf?: number; src?: string }): Candidate {
  const cand: Candidate = { ts: nowDate().toISOString(), conf: 0.9, src: "explicit", ...c } as Candidate;
  mkdirSync(P.inbox(), { recursive: true });
  appendFileSync(join(P.inbox(), `${today()}.jsonl`), JSON.stringify(cand) + "\n");
  return cand;
}

// ─── Transcript parsing + session-end extraction (Haiku) ──────────────────────

export function transcriptText(raw: string, fromLine = 0): { text: string; lines: number } {
  const lines = raw.split("\n").filter(Boolean); const out: string[] = [];
  const flat = (c: any): string => typeof c === "string" ? c : Array.isArray(c) ? c.map((x: any) => x?.text ?? "").join(" ") : "";
  for (const l of lines.slice(fromLine)) {
    let o: any; try { o = JSON.parse(l); } catch { continue; }
    const msg = o.message ?? o; const role = msg.role ?? o.type;
    if (role !== "user" && role !== "assistant") continue;
    const c = msg.content;
    const text = typeof c === "string" ? c : Array.isArray(c) ? c.filter((x: any) => x?.type === "text").map((x: any) => x.text).join("\n") : "";
    if (text.trim() && !text.startsWith("<system-reminder>")) out.push(`${role.toUpperCase()}: ${text.trim()}`);
    if (Array.isArray(c)) for (const b of c) {
      // Skill/agent/tool markers: evidence for prompt-change signals (skills and agents misbehaving or misrouted)
      if (b?.type === "tool_use" && b.name === "Skill") out.push(`[SKILL invoked: ${b.input?.skill ?? "?"}${b.input?.args ? " args: " + String(b.input.args).slice(0, 120) : ""}]`);
      else if (b?.type === "tool_use" && (b.name === "Agent" || b.name === "Task")) out.push(`[AGENT ${b.input?.subagent_type ?? "general"}: ${String(b.input?.description ?? b.input?.prompt ?? "").slice(0, 160)}]`);
      else if (b?.type === "tool_result" && b.is_error) out.push(`[TOOL ERROR: ${flat(b.content).slice(0, 200)}]`);
    }
  }
  return { text: out.join("\n\n"), lines: lines.length };
}

function knownPromptNames(): { skills: string[]; agents: string[] } {
  const root_ = process.env.HOLOCRON_DIR ?? process.env.HOLOCRON_REPO_ROOT ?? "";
  const ls = (d: string) => { try { return readdirSync(d, { withFileTypes: true }); } catch { return []; } };
  return {
    skills: ls(join(root_, "skills")).filter((e) => e.isDirectory()).map((e) => e.name).slice(0, 60),
    agents: ls(join(root_, "agents")).filter((e) => e.name.endsWith(".md")).map((e) => e.name.replace(/\.md$/, "")).slice(0, 60),
  };
}

export function extractSystem(): string {
  const k = knownPromptNames();
  return `You maintain a personal memory store for one user. From the conversation excerpt, extract (1) DURABLE facts worth remembering across sessions, (2) an updated rolling session recap, and (3) feedback signals about the user's skills and agents (their prompts).
Return ONLY JSON: {"facts":[{"fact":"...","entity":"<canonical name>","type":"person|org|project|preference|decision|topic","conf":0.0-1.0,"expires":"YYYY-MM-DD or empty"}],"recap":{"anchors":["..."],"open_loops":["..."],"identifiers":["exact ticket ids, paths, urls, branch names"],"completed":["..."]},"skill_signals":[{"target":"skill:<name> or agent:<name>","kind":"failure|gap|recommendation","observation":"what went wrong or was missing","suggested_change":"concrete change to that skill/agent prompt","conf":0.0-1.0}]}
FACT RULES: facts are self-contained sentences about standing context — preferences, decisions, constraints, people, projects. NOT durable: individual code-review findings, per-MR/ticket implementation details, file-level bugs, test results, task chatter — unless they encode a standing preference or decision (e.g. "reviews must be read-only"). conf<0.6 if inferred; set expires for time-bound facts.
ENTITY RULES: entity is the short canonical name of a person, org, project or product (e.g. "Bifrost", "Gatehouse", "Tommy Magee") — NEVER a file path, MR/PR number, ticket id, or function name. For ticket or MR facts use the owning project name. Use "" only for facts about the user in general.
RECAP RULES: terse; carry forward still-open loops from the previous recap.
SKILL SIGNAL RULES: emit only with evidence in the transcript: the skill/agent errored or produced wrong output, the user corrected it or overrode its behavior, it should have triggered but didn't (or triggered wrongly), or the user stated a standing instruction about how it should behave. Use exact names (known skills: ${k.skills.join(", ") || "n/a"}; known agents: ${k.agents.join(", ") || "n/a"}). At most 5; [] when none. Do not invent signals.`;
}

type LlmFn = (system: string, user: string) => Promise<any | null>;

export const haikuLlm: LlmFn = async (system, user) => {
  const { inference } = await import("../Inference.ts");
  const model = process.env.INSTINCT_EXTRACT_MODEL || "claude-haiku-5-5";
  let r = await inference({ systemPrompt: system, userPrompt: user, level: "fast", model, expectJson: true, timeout: 60000 });
  if (!r.success && model !== "haiku") r = await inference({ systemPrompt: system, userPrompt: user, level: "fast", expectJson: true, timeout: 60000 });
  return r.success ? (r.parsed ?? null) : null;
};

const ckPath = () => join(P.state(), "checkpoints.json");
const loadCk = (): Record<string, number> => { try { return JSON.parse(read(ckPath()) || "{}"); } catch { return {}; } };

function recapMarkdown(r: any, previous: string): string {
  const li = (a?: string[]) => (a?.length ? a.map((x) => `- ${x}`).join("\n") : "- (none)");
  return `# Recap (updated ${nowDate().toISOString()})\n\n## Anchors\n${li(r.anchors)}\n\n## Open loops\n${li(r.open_loops)}\n\n## Exact identifiers\n${li(r.identifiers)}\n\n## Completed\n${li(r.completed)}\n`;
}

export async function sessionEnd(opts: { sessionId: string; transcriptPath: string; llm?: LlmFn; dryRun?: boolean; writeRecap?: boolean; includeSubagents?: boolean }) {
  if (process.env.INSTINCT_CAPTURE === "off") return { skipped: "INSTINCT_CAPTURE=off" };
  if (!opts.includeSubagents && basename(opts.transcriptPath).startsWith("agent-")) return { skipped: "subagent transcript" };
  const raw = read(opts.transcriptPath); if (!raw) return { skipped: "empty transcript" };
  const ck = loadCk(); const { text, lines } = transcriptText(raw, ck[opts.sessionId] ?? 0);
  if (text.length < 400) return { skipped: "short delta" };
  const prev = read(P.recap());
  const user = `PREVIOUS RECAP:\n${clip(prev, 2500)}\n\nCONVERSATION EXCERPT (most recent last):\n${text.slice(-30000)}`;
  const res = await (opts.llm ?? haikuLlm)(extractSystem(), user);
  if (!res) return { skipped: "llm unavailable" };
  if (opts.dryRun) return { facts: res.facts ?? [], recap: res.recap, skill_signals: res.skill_signals ?? [] };
  let n = 0;
  for (const f of res.facts ?? []) if (f?.fact) { capture({ fact: f.fact, entity: f.entity || undefined, type: f.type, conf: Number(f.conf) || 0.6, src: `session:${opts.sessionId.slice(0, 8)}`, expires: f.expires || undefined, session: opts.sessionId }); n++; }
  let sig = 0;
  for (const g of res.skill_signals ?? []) if (g?.target && g?.observation) { captureSignal({ target: String(g.target), kind: g.kind ?? "recommendation", observation: String(g.observation), suggested_change: g.suggested_change, conf: Number(g.conf) || 0.6, session: opts.sessionId }); sig++; }
  if (res.recap && opts.writeRecap !== false) write(P.recap(), clip(recapMarkdown(res.recap, prev), BUDGET_TOKENS.recap));
  ck[opts.sessionId] = lines; write(ckPath(), JSON.stringify(ck));
  return { candidates: n, signals: sig, recap: !!res.recap && opts.writeRecap !== false };
}

// ─── Sweep (backstop: transcripts that never produced candidates) ────────────

export async function sweep(opts: { dirs?: string[]; max?: number; days?: number; llm?: LlmFn } = {}) {
  const home = process.env.HOME ?? "";
  const dirs = opts.dirs ?? [join(home, ".claude", "projects"), join(home, ".pi", "agent", "sessions")];
  const ck = loadCk(); const cutoff = nowDate().getTime() - (opts.days ?? 7) * 86400000;
  const files: { p: string; m: number }[] = [];
  const scan = (d: string) => { if (!existsSync(d)) return; for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) scan(p); else if (e.name.endsWith(".jsonl")) { const m = statSync(p).mtimeMs; if (m >= cutoff) files.push({ p, m }); } } };
  dirs.forEach(scan);
  const pending = files.filter((f) => !basename(f.p).startsWith("agent-") && !(basename(f.p, ".jsonl") in ck)).sort((a, b) => a.m - b.m).slice(0, opts.max ?? 5);
  const results: Record<string, unknown> = {};
  for (const f of pending) { const id = basename(f.p, ".jsonl"); results[id] = await sessionEnd({ sessionId: id, transcriptPath: f.p, llm: opts.llm, writeRecap: false }); const c = loadCk(); if (!(id in c)) { c[id] = -1; write(ckPath(), JSON.stringify(c)); } }
  return results;
}

// ─── Consolidate (supersession, expiry, staleness) ───────────────────────────

export type Judgement = { action: "add" | "duplicate" | "supersede"; supersedes?: string[] };
export type JudgeFn = (existing: Bullet[], cand: Candidate) => Promise<Judgement>;

const JUDGE_SYSTEM = `You reconcile ONE new candidate fact against existing facts about the same entity. Return ONLY JSON {"action":"add|duplicate|supersede","supersedes":["bullet ids"]}.
- duplicate: an existing fact already says the same thing.
- supersede: ONLY when the new fact is about the SAME attribute as an existing fact and makes it false or outdated (preference changed, role/employer changed, decision reversed, date/value updated). List only those ids.
- add: everything else — new information, refinements, details, or facts about a different aspect. When unsure, choose add. Never supersede facts about different aspects.
Examples: existing "Prefers VSCode" + new "Now prefers Cursor" => supersede. Existing "Memory is stored as markdown in instinct/" + new "Candidates are captured by hooks" => add (different aspect). Existing "Works at Lahzo" + new "Works at Rivian" => supersede.`;

export const llmJudge: JudgeFn = async (existing, cand) => {
  const fallback = jaccardJudge(existing, cand);
  if (!existing.length || fallback.action === "duplicate") return fallback; // deterministic dedupe first; LLM only for the ambiguous cases
  const r = await haikuLlm(JUDGE_SYSTEM, `EXISTING:\n${existing.map((b) => `[${b.id}] ${b.text} (${b.asserted})`).join("\n")}\n\nNEW: ${cand.fact}`);
  if (r && ["add", "duplicate", "supersede"].includes(r.action)) return { action: r.action, supersedes: (r.supersedes ?? []).filter((x: string) => existing.some((b) => b.id === x)) };
  return fallback;
};
export const jaccardJudge = (existing: Bullet[], cand: Candidate): Judgement =>
  existing.some((b) => jaccard(b.text, cand.fact) >= 0.8) ? { action: "duplicate" } : { action: "add" };

const TYPE_DIR: Record<string, string> = { person: "entities/people", org: "entities/orgs", project: "entities/projects", preference: "knowledge/preferences", decision: "knowledge/decisions" };

function findFile(store: StoreFile[], entity: string): StoreFile | undefined {
  const e = tokens(entity); if (!e.length) return undefined;
  const key = slug(entity);
  return store.find((f) => f.id === key || slug(f.title) === key || f.aliases.some((a) => slug(a) === key))
    ?? store.find((f) => [f.id, f.title, ...f.aliases].some((n) => { const nt = tokens(n); return nt.length && nt.length === e.length && nt.every((t, i) => fuzzyEq(e[i]!, t)); }));
}

const GENERIC_ENTITY = new Set(["", "none", "null", "n/a", "na", "user", "me", "unknown", "general", "preference", "preferences", "decision", "decisions", "topic", "topics", "project", "projects"]);
const PATHISH = /[\/\\]|\.(ts|tsx|js|tf|sh|md|json|hcl|ya?ml|py|sql)\b|^(mr|pr)\s*!?\d|!\d{2,}|\b[A-Za-z]{2,5}-\d+\b/i;

/** Rare-token score: tokens that name only 1-2 store files are strong signals; common tokens are ignored. */
function nameTokenIndex(files: StoreFile[]): { names: Map<StoreFile, Set<string>>; df: Map<string, number> } {
  const names = new Map<StoreFile, Set<string>>(); const df = new Map<string, number>();
  for (const f of files) {
    const set = new Set([f.id, f.title, ...f.aliases].flatMap(tokens).filter((t) => t.length >= 4));
    names.set(f, set); for (const t of set) df.set(t, (df.get(t) ?? 0) + 1);
  }
  return { names, df };
}
function bestByTokens(files: StoreFile[], query: Set<string>, factText: string): StoreFile | undefined {
  const { names, df } = nameTokenIndex(files); const fact = tokens(factText);
  let best: { f: StoreFile; score: number } | undefined;
  for (const [f, set] of names) {
    let score = 0;
    for (const t of set) if (query.has(t) && (df.get(t) ?? 9) <= 2) score += 1 / (df.get(t) ?? 1);
    if (score < 0.5) continue;
    score = score * 10 + fact.filter((t) => set.has(t)).length;
    if (!best || score > best.score) best = { f, score };
  }
  return best?.f;
}

/** Map a candidate to an existing store file (canonicalizing noisy entity names), or signal that a general/new file is needed. */
export function resolveTarget(files: StoreFile[], c: Candidate): { file?: StoreFile; general: boolean } {
  const entity = (c.entity ?? "").trim(); const key = entity.toLowerCase();
  const generic = GENERIC_ENTITY.has(key); const pathish = !generic && PATHISH.test(entity);
  if (!generic && !pathish) {
    const exact = findFile(files, entity); if (exact) return { file: exact, general: false };
    const near = bestByTokens(files, new Set(tokens(entity)), c.fact); if (near) return { file: near, general: false };
    return { general: false };
  }
  const byFact = bestByTokens(files, new Set(tokens(c.fact)), c.fact);
  if (byFact) return { file: byFact, general: false };
  return { general: true };
}

export interface Plan { created: string[]; added: string[]; duplicates: number; superseded: string[]; archivedExpired: string[]; flagged: string[]; processed: string[]; suggestions: string[] }

export async function consolidate(opts: { dryRun?: boolean; judge?: JudgeFn; regenOnepager?: boolean; commit?: boolean; noSuggest?: boolean; suggestLlm?: LlmFn } = {}): Promise<Plan> {
  const judge = opts.judge ?? llmJudge; const t = today();
  const plan: Plan = { created: [], added: [], duplicates: 0, superseded: [], archivedExpired: [], flagged: [], processed: [], suggestions: [] };
  const store = loadStore();
  const files = new Map<string, StoreFile>(store.map((f) => [f.path, f]));
  const archive = new Map<string, Bullet[]>(); // store-relative path → bullets to append in _archive
  const toArchive = (f: StoreFile, b: Bullet, reason: string, by?: string) => {
    const a = archive.get(f.rel) ?? []; a.push({ ...b, archived: t, reason, supersededBy: by ?? b.supersededBy }); archive.set(f.rel, a);
  };
  const touched = new Set<string>();

  // 1. expiry sweep
  for (const f of files.values()) {
    const keep: Bullet[] = [];
    for (const b of f.bullets) {
      if (b.expires && b.expires < t) { toArchive(f, b, "expired"); plan.archivedExpired.push(`${f.rel}: ${b.text.slice(0, 60)}`); touched.add(f.path); }
      else keep.push(b);
    }
    f.bullets = keep;
  }

  // 2. candidates
  const inboxFiles = existsSync(P.inbox()) ? readdirSync(P.inbox()).filter((n) => n.endsWith(".jsonl")).sort() : [];
  for (const name of inboxFiles) {
    for (const line of read(join(P.inbox(), name)).split("\n").filter(Boolean)) {
      let c: Candidate; try { c = JSON.parse(line); } catch { continue; }
      if (!c.fact) continue;
      const entity = c.entity || "";
      const target = resolveTarget([...files.values()], c);
      let f = target.file;
      if (!f) {
        const dir = TYPE_DIR[c.type ?? ""] ?? "knowledge/misc";
        const id = target.general ? "general" : slug(entity || (c.type ?? "general"));
        const title = target.general ? `General (${c.type ?? "misc"})` : entity || id;
        const path = join(P.store(), dir, `${id}.md`);
        f = files.get(path) ?? { path, rel: relative(P.store(), path), id, type: c.type ?? "topic", aliases: target.general ? ["general"] : entity ? [entity] : [], updated: t, pinned: false, title, bullets: [], preamble: `# ${title}`, raw: "" };
        if (!files.has(path)) { files.set(path, f); plan.created.push(f.rel); }
      }
      const j = await judge(f.bullets, c);
      if (j.action === "supersede") { // guard: only same-attribute (shared token), older bullets may be superseded
        const ft = new Set(tokens(c.fact)); const day = (c.ts || t).slice(0, 10);
        j.supersedes = (j.supersedes ?? []).filter((sid) => { const o = f!.bullets.find((b) => b.id === sid); return !!o && tokens(o.text).some((x) => ft.has(x)) && (o.asserted || "") <= day; });
        if (!j.supersedes.length) j.action = "add";
      }
      if (j.action === "duplicate") { plan.duplicates++; continue; }
      const nb: Bullet = { id: hash(c.fact + c.ts), text: c.fact.trim(), asserted: (c.ts || t).slice(0, 10), conf: c.conf ?? 0.7, src: c.src, expires: c.expires };
      if (j.action === "supersede") {
        for (const id of j.supersedes ?? []) {
          const old = f.bullets.find((b) => b.id === id);
          if (old) { toArchive(f, old, "superseded", nb.id); plan.superseded.push(`${f.rel}: ${old.text.slice(0, 60)} → ${nb.text.slice(0, 60)}`); }
        }
        f.bullets = f.bullets.filter((b) => !(j.supersedes ?? []).includes(b.id));
      }
      f.bullets.push(nb); f.updated = t; touched.add(f.path); plan.added.push(`${f.rel}: ${nb.text.slice(0, 80)}`);
    }
    plan.processed.push(name);
  }

  // 3. staleness / low-confidence flags (never auto-archived)
  for (const f of files.values()) if (!f.pinned) for (const b of f.bullets) {
    if (b.asserted && ageDays(b.asserted) > STALE_DAYS) plan.flagged.push(`STALE ${f.rel}: ${b.text.slice(0, 70)} (asserted ${b.asserted})`);
    else if (b.conf < LOW_CONF) plan.flagged.push(`LOW-CONF ${f.rel}: ${b.text.slice(0, 70)} (conf ${b.conf})`);
  }

  // 3b. skill/agent prompt-change suggestions from accumulated signals (never edits the prompt files themselves)
  if (!opts.noSuggest) {
    const sg = await suggest({ dryRun: opts.dryRun, llm: opts.suggestLlm });
    plan.suggestions = [...sg.eligible.map((x) => `ELIGIBLE ${x}`), ...sg.written.map((x) => `WROTE ${x}`), ...sg.skipped.map((x) => `SKIP ${x}`)];
  }

  if (opts.dryRun) return plan;

  // 4. write
  for (const f of files.values()) if (touched.has(f.path)) write(f.path, renderStoreFile(f));
  for (const [rel, bullets] of archive) {
    const ap = join(P.archive(), rel); const ex = existsSync(ap) ? parseStoreFile(ap) : null;
    const src = [...files.values()].find((x) => x.rel === rel);
    write(ap, renderStoreFile({ id: src?.id ?? basename(rel, ".md"), type: src?.type ?? "topic", aliases: src?.aliases ?? [], updated: t, pinned: false, preamble: src?.preamble ?? `# ${basename(rel, ".md")}`, bullets: [...(ex?.bullets ?? []), ...bullets] }));
  }
  mkdirSync(P.processed(), { recursive: true });
  for (const n of plan.processed) renameSync(join(P.inbox(), n), join(P.processed(), n));
  if (opts.regenOnepager) await regenOnepager();
  if (opts.commit !== false) gitCommit(`instinct: consolidate ${t}`);
  return plan;
}

async function regenOnepager() {
  const store = loadStore().filter((f) => f.bullets.length && f.id !== "topics").map((f) => `## ${f.title}\n${f.bullets.slice(-8).map((b) => `- ${b.text}`).join("\n")}`).join("\n\n");
  const r = await haikuLlm(`Rewrite as a concise personal context one-pager (≤ ${BUDGET_TOKENS.onepager} tokens, markdown). Return JSON {"onepager":"..."}. Keep identity, current employer/projects, standing preferences, autonomy/communication style; drop stale or ephemeral items.`,
    `CURRENT ONE-PAGER:\n${clip(read(P.onepager()), 4000)}\n\nSTORE FACTS:\n${clip(store, 6000)}`);
  if (r?.onepager) write(P.onepager(), `<!-- generated: ${today()} -->\n${clip(String(r.onepager), BUDGET_TOKENS.onepager)}\n`);
}

function gitCommit(msg: string) {
  try {
    execFileSync("git", ["-C", memDir(), "add", "instinct"], { stdio: "ignore" });
    execFileSync("git", ["-C", memDir(), "commit", "-m", msg, "--", "instinct"], { stdio: "ignore" });
  } catch { /* nothing to commit or not a repo */ }
}

// ─── Skill / agent prompt signals → suggestions ──────────────────────────────

export interface SkillSignal { id: string; ts: string; target: string; kind: string; observation: string; suggested_change?: string; conf: number; session: string }
export const normTarget = (t: string): string => { const m = t.toLowerCase().trim().match(/^(skill|agent)[:\s]+(.+)$/); return m ? `${m[1]}:${slug(m[2]!)}` : `skill:${slug(t)}`; };

export function captureSignal(g: Omit<SkillSignal, "id" | "ts">): SkillSignal {
  const target = normTarget(g.target);
  const sig: SkillSignal = { id: hash(`${target}|${g.observation}|${g.session}`), ts: nowDate().toISOString(), ...g, target };
  mkdirSync(P.signals(), { recursive: true });
  appendFileSync(join(P.signals(), `${today()}.jsonl`), JSON.stringify(sig) + "\n");
  return sig;
}
const usedPath = () => join(P.state(), "signals-used.json");
const loadUsed = (): string[] => { try { return JSON.parse(read(usedPath()) || "[]"); } catch { return []; } };
function loadSignals(): SkillSignal[] {
  const out = new Map<string, SkillSignal>();
  if (existsSync(P.signals())) for (const n of readdirSync(P.signals()).filter((x) => x.endsWith(".jsonl")).sort())
    for (const l of read(join(P.signals(), n)).split("\n").filter(Boolean)) { try { const g = JSON.parse(l) as SkillSignal; if (g.id) out.set(g.id, g); } catch { /* skip */ } }
  return [...out.values()];
}

const repoRoot = () => process.env.HOLOCRON_DIR ?? process.env.HOLOCRON_REPO_ROOT ?? "";
export function findPromptFile(target: string): string | null {
  const [kind, name] = [target.split(":")[0], target.split(":").slice(1).join(":")];
  const hd = repoRoot(); const md = process.env.HOLOCRON_MEMORY_DIR ?? "";
  if (kind === "skill") {
    for (const base of [join(hd, "skills"), join(hd, "pi", "skills"), join(md, "skills")])
      for (const p of walk(base).filter((x) => basename(x) === "SKILL.md")) {
        const fm = read(p).match(/^name:\s*(.+)$/m)?.[1]?.replace(/^["']|["']$/g, "") ?? "";
        if (slug(basename(dirname(p))) === name || slug(fm) === name) return p;
      }
  } else if (kind === "agent") {
    for (const base of [join(hd, "agents"), join(hd, "pi", "agents"), join(md, "agents")])
      for (const p of walk(base)) if (slug(basename(p, ".md")) === name) return p;
  }
  return null;
}

function otherEvidence(name: string): string[] {
  const q = name.toLowerCase(); const out: string[] = [];
  for (const rel of ["LEARNING/SIGNALS/ratings.jsonl", "LEARNING/REFLECTIONS/algorithm-reflections.jsonl"]) {
    const lines = read(join(memDir(), rel)).split("\n").filter((l) => l.toLowerCase().includes(q));
    for (const l of lines.slice(-3)) out.push(`[${basename(rel)}] ${l.slice(0, 300)}`);
  }
  return out;
}

const SUGGEST_SYSTEM = `You improve prompt files (skills and agents) from feedback signals. Given the CURRENT FILE and SIGNALS (plus optional other evidence), propose MINIMAL targeted edits that address the signals.
Return ONLY JSON: {"summary":"one line","rationale":"why these edits fix the signals","edits":[{"where":"section/heading","before":"EXACT existing text to replace, verbatim, appearing exactly once — or empty string to append","after":"replacement or addition text"}]}.
Rules: never rewrite the whole file; prefer adding a short rule, example or trigger phrase; keep the file's voice and format; if the signals do not justify a change return {"summary":"","rationale":"","edits":[]}.`;

export const suggestLlm: LlmFn = async (system, user) => {
  const { inference } = await import("../Inference.ts");
  const r = await inference({ systemPrompt: system, userPrompt: user, level: "standard", model: process.env.INSTINCT_SUGGEST_MODEL || undefined, expectJson: true, timeout: 120000 });
  return r.success ? (r.parsed ?? null) : null;
};

export async function suggest(opts: { dryRun?: boolean; llm?: LlmFn; minSessions?: number } = {}) {
  const used = new Set(loadUsed()); const sigs = loadSignals().filter((g) => !used.has(g.id));
  const out = { eligible: [] as string[], written: [] as string[], skipped: [] as string[] };
  const groups = new Map<string, SkillSignal[]>();
  for (const g of sigs) groups.set(g.target, [...(groups.get(g.target) ?? []), g]);
  for (const [target, g] of groups) {
    const sessions = new Set(g.map((x) => x.session)).size;
    const strongFailure = g.some((x) => x.kind === "failure" && x.conf >= 0.85);
    if (sessions < (opts.minSessions ?? 2) && !strongFailure) { out.skipped.push(`${target}: ${g.length} signal(s) from ${sessions} session(s) — below threshold`); continue; }
    out.eligible.push(`${target} (${g.length} signals, ${sessions} sessions)`);
    if (opts.dryRun) continue;
    const file = findPromptFile(target);
    if (!file) { out.skipped.push(`${target}: no skill/agent prompt file found`); continue; }
    const current = read(file);
    const user = `TARGET: ${target}\nFILE: ${file}\n\nCURRENT FILE:\n${clip(current, 6000)}\n\nSIGNALS:\n${g.map((x) => `- [${x.kind}, conf ${x.conf}, ${x.ts.slice(0, 10)}] ${x.observation}${x.suggested_change ? ` | suggested: ${x.suggested_change}` : ""}`).join("\n")}\n\nOTHER EVIDENCE:\n${otherEvidence(target.split(":")[1] ?? "").join("\n") || "(none)"}`;
    const res = await (opts.llm ?? suggestLlm)(SUGGEST_SYSTEM, user);
    if (!res || !Array.isArray(res.edits)) { out.skipped.push(`${target}: llm unavailable`); continue; }
    const edits = res.edits.filter((e: any) => e && typeof e.after === "string" && e.after.trim() && (!e.before || current.split(e.before).length === 2));
    if (!edits.length) { out.skipped.push(`${target}: no anchored edits proposed`); continue; }
    const id = `sug-${hash(target + today() + JSON.stringify(edits))}`;
    const md = `---\nid: ${id}\ntarget: ${target}\nfile: ${file}\nstatus: proposed\ncreated: ${today()}\nsignals: ${g.length}\n---\n# Suggested prompt change: ${target}\n\n${res.summary ?? ""}\n\n## Why\n${res.rationale ?? ""}\n\n## Evidence\n${g.map((x) => `- ${x.ts.slice(0, 10)} [${x.kind}] ${x.observation} (session ${x.session.slice(0, 8)})`).join("\n")}\n\n## Proposed edits\n${edits.map((e: any, i: number) => `### ${i + 1}. ${e.where ?? ""}\n**before**\n\`\`\`\n${e.before ?? "(append)"}\n\`\`\`\n**after**\n\`\`\`\n${e.after}\n\`\`\``).join("\n\n")}\n\n## Machine edits\n\`\`\`json\n${JSON.stringify(edits)}\n\`\`\`\n`;
    write(join(P.suggestions(), `${today()}-${slug(target)}.md`), md);
    writeFileSync2(usedPath(), JSON.stringify([...loadUsed(), ...g.map((x) => x.id)]));
    out.written.push(`${id} → suggestions/${today()}-${slug(target)}.md`);
  }
  return out;
}
const writeFileSync2 = (p: string, d: string) => write(p, d);

export interface Suggestion { id: string; target: string; status: string; file: string; path: string }
export function listSuggestions(): Suggestion[] {
  if (!existsSync(P.suggestions())) return [];
  return readdirSync(P.suggestions()).filter((n) => n.endsWith(".md")).map((n) => {
    const path = join(P.suggestions(), n); const t = read(path); const g = (k: string) => t.match(new RegExp(`^${k}:\\s*(.*)$`, "m"))?.[1] ?? "";
    return { id: g("id"), target: g("target"), status: g("status"), file: g("file"), path };
  });
}
const setStatus = (path: string, status: string) => write(path, read(path).replace(/^status:.*$/m, `status: ${status}`));

export function applySuggestion(id: string, opts: { dryRun?: boolean } = {}): string {
  const sg = listSuggestions().find((x) => x.id === id); if (!sg) throw new Error(`no suggestion ${id}`);
  if (sg.status !== "proposed") throw new Error(`suggestion ${id} is ${sg.status}`);
  const edits: { before?: string; after: string }[] = JSON.parse(read(sg.path).match(/## Machine edits\n```json\n([\s\S]*?)\n```/)![1]!);
  let cur = read(sg.file); const log: string[] = [];
  for (const e of edits) {
    if (e.before) { if (cur.split(e.before).length !== 2) throw new Error(`edit anchor not found exactly once in ${sg.file} — file changed since suggestion; reject and regenerate`); cur = cur.replace(e.before, () => e.after); log.push(`replace: ${e.before.slice(0, 60)}… → ${e.after.slice(0, 60)}…`); }
    else { cur = cur.replace(/\n*$/, "\n\n") + e.after.trim() + "\n"; log.push(`append: ${e.after.slice(0, 80)}…`); }
  }
  if (!opts.dryRun) { write(sg.file, cur); setStatus(sg.path, "applied"); }
  return `${opts.dryRun ? "[dry-run] " : ""}${sg.target} → ${sg.file}\n${log.join("\n")}`;
}
export function rejectSuggestion(id: string) { const sg = listSuggestions().find((x) => x.id === id); if (!sg) throw new Error(`no suggestion ${id}`); setStatus(sg.path, "rejected"); }

// ─── Forget ───────────────────────────────────────────────────────────────────

export function forget(query: string, opts: { dryRun?: boolean } = {}): string[] {
  const t = today(); const q = query.toLowerCase(); const out: string[] = [];
  for (const f of loadStore()) {
    const entityMatch = [f.id, f.title, ...f.aliases].some((n) => n.toLowerCase() === q);
    const gone = f.bullets.filter((b) => entityMatch || b.text.toLowerCase().includes(q));
    if (!gone.length) continue;
    for (const b of gone) out.push(`${f.rel}: ${b.text.slice(0, 80)}`);
    if (opts.dryRun) continue;
    const ap = join(P.archive(), f.rel); const ex = existsSync(ap) ? parseStoreFile(ap) : null;
    write(ap, renderStoreFile({ ...f, updated: t, pinned: false, bullets: [...(ex?.bullets ?? []), ...gone.map((b) => ({ ...b, archived: t, reason: "forgot" }))] }));
    f.bullets = f.bullets.filter((b) => !gone.includes(b)); f.updated = t;
    write(f.path, renderStoreFile(f));
  }
  if (!opts.dryRun && out.length) gitCommit(`instinct: forget "${query}"`);
  return out;
}

// ─── Status ───────────────────────────────────────────────────────────────────

export function status(): string {
  const r = (p: string) => tok(read(p));
  const store = loadStore();
  const inbox = existsSync(P.inbox()) ? readdirSync(P.inbox()).filter((n) => n.endsWith(".jsonl")).length : 0;
  return [`backend: ${process.env.HOLOCRON_MEMORY_BACKEND ?? "(unset)"}${isActive() ? " (ACTIVE)" : ""}`, `root: ${root()}`,
    `profile ${r(P.profile())}/${BUDGET_TOKENS.profile} tok | onepager ${r(P.onepager())}/${BUDGET_TOKENS.onepager} | recap ${r(P.recap())}/${BUDGET_TOKENS.recap} | board ${r(P.board())}/${BUDGET_TOKENS.board}`,
    `store: ${store.length} files, ${store.reduce((n, f) => n + f.bullets.length, 0)} bullets | archive: ${walk(P.archive(), false).length} files | pending inbox files: ${inbox}`,
    `signals pending: ${loadSignals().filter((g) => !loadUsed().includes(g.id)).length} | suggestions proposed: ${listSuggestions().filter((x) => x.status === "proposed").length}`, `assembled session-start block: ~${tok(assemble())} tok`].join("\n");
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

const claudeHook = (event: string, ctx: string) => ctx ? JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: ctx } }) : "";
const flag = (a: string[], n: string) => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : undefined; };
const has = (a: string[], n: string) => a.includes(`--${n}`);
async function stdinJson(): Promise<any> { try { return JSON.parse(await Bun.stdin.text()); } catch { return {}; } }

async function main() {
  const [cmd, ...a] = process.argv.slice(2);
  switch (cmd) {
    case "seed": console.log(seed({ force: has(a, "force") }).join("\n")); break;
    case "assemble": console.log(assemble({ prompt: flag(a, "prompt"), sessionStart: !has(a, "prompt-only") })); break;
    case "status": console.log(status()); break;
    case "recall": console.log(formatHits(recall(a.filter((x) => !x.startsWith("--")).join(" "))) || "(no matches)"); break;
    case "capture": { const c = capture({ fact: flag(a, "fact") ?? a.join(" "), entity: flag(a, "entity"), type: flag(a, "type"), conf: flag(a, "conf") ? Number(flag(a, "conf")) : undefined, expires: flag(a, "expires") }); console.log(`queued: ${c.fact}`); break; }
    case "suggest": console.log(JSON.stringify(await suggest({ dryRun: has(a, "dry-run") }), null, 2)); break;
    case "suggestions": { const [sub, id] = a; if (sub === "apply") console.log(applySuggestion(id!, { dryRun: has(a, "dry-run") })); else if (sub === "reject") { rejectSuggestion(id!); console.log(`rejected ${id}`); } else console.log(listSuggestions().map((x) => `${x.id}  ${x.status.padEnd(9)} ${x.target}  → ${x.file}`).join("\n") || "(none)"); break; }
    case "consolidate": { const p = await consolidate({ dryRun: has(a, "dry-run"), noSuggest: has(a, "no-suggest"), judge: has(a, "no-llm") ? async (e, c) => jaccardJudge(e, c) : undefined, regenOnepager: has(a, "regen-onepager") }); console.log(JSON.stringify(p, null, 2)); break; }
    case "forget": { const r = forget(a.filter((x) => !x.startsWith("--")).join(" "), { dryRun: has(a, "dry-run") }); console.log(r.length ? r.join("\n") : "(nothing matched)"); break; }
    case "sweep": console.log(JSON.stringify(await sweep({ max: flag(a, "max") ? Number(flag(a, "max")) : undefined }), null, 2)); break;
    case "session-end": { const r = await sessionEnd({ sessionId: flag(a, "session") ?? "manual", transcriptPath: flag(a, "transcript") ?? "", dryRun: has(a, "dry-run") }); console.log(JSON.stringify(r)); break; }
    // Hook entrypoints: silent no-ops unless backend=instinct (and never recurse into themselves).
    case "hook-session-start": { if (!isActive() || process.env.INSTINCT_INTERNAL) break; process.stdout.write(claudeHook("SessionStart", assemble())); break; }
    case "hook-prompt": { if (!isActive() || process.env.INSTINCT_INTERNAL) break; const j = await stdinJson(); process.stdout.write(claudeHook("UserPromptSubmit", assemble({ prompt: j.prompt, sessionStart: false }))); break; }
    case "hook-stop": { if (!isActive() || process.env.INSTINCT_INTERNAL) break; const j = await stdinJson(); process.env.INSTINCT_INTERNAL = "1"; const r = await sessionEnd({ sessionId: j.session_id ?? "unknown", transcriptPath: j.transcript_path ?? "" }); if (process.env.INSTINCT_DEBUG) console.error(JSON.stringify(r)); break; }
    default: console.error("usage: instinct.ts <seed|assemble|status|recall|capture|consolidate|forget|sweep|suggest|suggestions|session-end|hook-session-start|hook-prompt|hook-stop> [flags]"); process.exit(cmd ? 1 : 0);
  }
}
if (import.meta.main) main().catch((e) => { console.error(`instinct: ${e.message}`); process.exit(1); });

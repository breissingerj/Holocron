import { describe, test, expect, beforeEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import * as I from "./instinct.ts";

let mem = "";
const w = (rel: string, s: string) => { const p = join(mem, rel); mkdirSync(join(p, ".."), { recursive: true }); writeFileSync(p, s); };
const snapshot = (d: string): string => existsSync(d) ? readdirSync(d, { recursive: true }).sort().map((f) => { const p = join(d, String(f)); try { return `${f}:${readFileSync(p, "utf-8")}`; } catch { return String(f); } }).join("\n") : "";

const bullet = (id: string, text: string, asserted: string, extra = "") => `- ${text} <!-- b:${id} asserted:${asserted} conf:0.8 ${extra}-->`;
const storeFile = (id: string, aliases: string[], bullets: string[], updated = "2026-10-01", pinned = false) =>
  `---\nid: ${id}\ntype: topic\naliases: [${aliases.join(", ")}]\nupdated: ${updated}\n${pinned ? "pinned: true\n" : ""}---\n# ${id}\n\n${bullets.join("\n")}\n`;

beforeEach(() => {
  mem = mkdtempSync(join(tmpdir(), "instinct-"));
  process.env.HOLOCRON_MEMORY_DIR = mem;
  process.env.HOLOCRON_MEMORY_BACKEND = "instinct";
  process.env.INSTINCT_NOW = "2026-10-08T12:00:00Z";
  execFileSync("git", ["init", "-q", mem]);
  execFileSync("git", ["-C", mem, "config", "user.email", "t@t"]); execFileSync("git", ["-C", mem, "config", "user.name", "t"]);
});

describe("assemble + budgets", () => {
  test("injects layers within budgets with sentinel; truncates oversize recap", () => {
    w("instinct/profile.md", "# Profile\nJack");
    w("instinct/onepager.md", "x".repeat(40000));
    w("instinct/recap.md", "r".repeat(60000));
    const out = I.assemble();
    expect(out.startsWith(I.SENTINEL)).toBe(true);
    expect(out).toContain("## Profile");
    expect(out.split(I.SENTINEL).length).toBe(2); // exactly one copy
    const total = I.BUDGET_TOKENS.profile + I.BUDGET_TOKENS.onepager + I.BUDGET_TOKENS.recap + I.BUDGET_TOKENS.board + 600;
    expect(out.length / 4).toBeLessThan(total);
  });
  test("empty store assembles to empty string", () => { expect(I.assemble()).toBe(""); });
  test("backend unset → isActive false", () => { delete process.env.HOLOCRON_MEMORY_BACKEND; expect(I.isActive()).toBe(false); });
  test("hook entrypoints are silent no-ops when backend != instinct", () => {
    w("instinct/profile.md", "# Profile\nJack");
    const run = (b: string) => execFileSync("bun", [join(import.meta.dir, "instinct.ts"), "hook-session-start"], { env: { ...process.env, HOLOCRON_MEMORY_BACKEND: b } }).toString();
    expect(run("files")).toBe("");
    expect(JSON.parse(run("instinct")).hookSpecificOutput.additionalContext).toContain("Jack");
  });
});

describe("recall", () => {
  beforeEach(() => {
    w("instinct/store/knowledge/preferences/dining.md", storeFile("dining", ["pasta", "takeout", "restaurants"], [bullet("a1", "Prefers pasta carbonara for takeout", "2026-09-30")]));
    w("instinct/store/entities/people/tommy-magee.md", storeFile("tommy-magee", ["Tommy Magee", "manager"], [bullet("b1", "Tommy sets team boundaries", "2026-07-20")]));
    w("instinct/store/knowledge/topics/old.md", storeFile("old", ["legacy"], [bullet("c1", "legacy widget deployment notes pasta", "2024-01-01")]));
  });
  test("alias, synonym alias, and typo ('pazta') all find dining first", () => {
    for (const q of ["pasta", "takeout", "pazta night", "restaurants"]) expect(I.recall(q)[0]?.file.id).toBe("dining");
  });
  test("recency decay ranks fresh above stale on equal match", () => {
    const ids = I.recall("pasta").map((h) => h.file.id);
    expect(ids.indexOf("dining")).toBeLessThan(ids.indexOf("old"));
  });
  test("pinned file is exempt from decay", () => {
    w("instinct/store/knowledge/topics/old.md", storeFile("old", ["legacy"], [bullet("c1", "pasta rule", "2024-01-01")], "2024-01-01", true));
    const old = I.recall("pasta").find((h) => h.file.id === "old")!;
    const unpinnedScore = (() => { w("instinct/store/knowledge/topics/old.md", storeFile("old", ["legacy"], [bullet("c1", "pasta rule", "2024-01-01")], "2024-01-01", false)); return I.recall("pasta").find((h) => h.file.id === "old")!.score; })();
    expect(old.score).toBeGreaterThan(unpinnedScore);
  });
  test("20-query eval ≥ 90% hit-rate", () => {
    const cases: [string, string][] = [["pasta", "dining"], ["takeout", "dining"], ["pazta", "dining"], ["restaurants", "dining"], ["carbonara", "dining"], ["pasta carbonara", "dining"], ["what about takeout tonight", "dining"], ["restraunts", "dining"],
      ["Tommy Magee", "tommy-magee"], ["tommy", "tommy-magee"], ["manager", "tommy-magee"], ["team boundaries", "tommy-magee"], ["Tomy Magee", "tommy-magee"], ["tommy magee boundaries", "tommy-magee"], ["my manager", "tommy-magee"],
      ["legacy", "old"], ["widget deployment", "old"], ["legacy notes", "old"], ["widgets", "old"], ["deployment notes", "old"]];
    const ok = cases.filter(([q, id]) => I.recall(q)[0]?.file.id === id).length;
    expect(ok / cases.length).toBeGreaterThanOrEqual(0.9);
  });
});

describe("consolidate", () => {
  const cand = (fact: string, o: Record<string, unknown> = {}) => JSON.stringify({ ts: "2026-10-08T10:00:00Z", fact, conf: 0.8, src: "test", ...o }) + "\n";
  test("dry-run writes nothing at all", async () => {
    w("instinct/store/entities/people/jack.md", storeFile("jack", ["Jack"], [bullet("j1", "Uses VSCode", "2026-01-01")]));
    w("instinct/inbox/2026-10-08.jsonl", cand("Uses Cursor", { entity: "Jack", type: "person" }) + cand("Likes tea", { entity: "New Person", type: "person" }));
    const before = snapshot(join(mem, "instinct"));
    const plan = await I.consolidate({ dryRun: true, judge: async () => ({ action: "add" }) });
    expect(snapshot(join(mem, "instinct"))).toBe(before);
    expect(plan.added.length).toBe(2); expect(plan.created.length).toBe(1);
    expect(() => execFileSync("git", ["-C", mem, "rev-parse", "HEAD"], { stdio: "ignore" })).toThrow(); // no commit made
  });
  test("supersession archives older bullet with superseded_by and hides it from recall", async () => {
    w("instinct/store/entities/people/jack.md", storeFile("jack", ["Jack"], [bullet("j1", "Works at Lahzo", "2025-01-01")]));
    w("instinct/inbox/2026-10-08.jsonl", cand("Works at Rivian", { entity: "Jack", type: "person" }));
    const plan = await I.consolidate({ judge: async (ex) => ({ action: "supersede", supersedes: [ex[0]!.id] }) });
    expect(plan.superseded.length).toBe(1);
    const live = readFileSync(join(mem, "instinct/store/entities/people/jack.md"), "utf-8");
    expect(live).toContain("Works at Rivian"); expect(live).not.toContain("Works at Lahzo");
    const arch = readFileSync(join(mem, "instinct/store/_archive/entities/people/jack.md"), "utf-8");
    expect(arch).toContain("Works at Lahzo"); expect(arch).toContain("superseded_by:"); expect(arch).toContain("archived:2026-10-08");
    expect(I.recall("lahzo")).toHaveLength(0);
    expect(existsSync(join(mem, "instinct/inbox/processed/2026-10-08.jsonl"))).toBe(true);
    expect(execFileSync("git", ["-C", mem, "log", "--oneline"]).toString()).toContain("instinct: consolidate");
  });
  test("expired bullets archived; stale and low-conf flagged but NOT archived", async () => {
    w("instinct/store/knowledge/topics/t.md", storeFile("t", ["tt"], [bullet("e1", "Sprint ends soon", "2026-09-01", "expires:2026-10-01 "), bullet("s1", "Old habit", "2025-01-01"), `- Maybe likes jazz <!-- b:l1 asserted:2026-10-01 conf:0.3 -->`]));
    const plan = await I.consolidate({ judge: async () => ({ action: "add" }) });
    expect(plan.archivedExpired.length).toBe(1);
    expect(plan.flagged.some((f) => f.startsWith("STALE"))).toBe(true);
    expect(plan.flagged.some((f) => f.startsWith("LOW-CONF"))).toBe(true);
    const live = readFileSync(join(mem, "instinct/store/knowledge/topics/t.md"), "utf-8");
    expect(live).toContain("Old habit"); expect(live).toContain("Maybe likes jazz"); expect(live).not.toContain("Sprint ends soon");
  });
  test("jaccard fallback dedupes near-identical facts", async () => {
    w("instinct/store/entities/people/jack.md", storeFile("jack", ["Jack"], [bullet("j1", "Jack prefers VSCode editor", "2026-01-01")]));
    w("instinct/inbox/x.jsonl", cand("Jack prefers VSCode editor", { entity: "Jack" }));
    const plan = await I.consolidate({ judge: async (e, c) => I.jaccardJudge(e, c as any) });
    expect(plan.duplicates).toBe(1); expect(plan.added.length).toBe(0);
  });
});

describe("forget", () => {
  beforeEach(() => w("instinct/store/knowledge/topics/t.md", storeFile("t", ["tt"], [bullet("a", "likes jazz", "2026-10-01"), bullet("b", "likes tea", "2026-10-01")])));
  test("dry-run changes nothing", () => {
    const before = snapshot(join(mem, "instinct")); expect(I.forget("jazz", { dryRun: true })).toHaveLength(1); expect(snapshot(join(mem, "instinct"))).toBe(before);
  });
  test("archives matching bullet only; recall no longer returns it", () => {
    I.forget("jazz");
    expect(readFileSync(join(mem, "instinct/store/knowledge/topics/t.md"), "utf-8")).not.toContain("jazz");
    expect(readFileSync(join(mem, "instinct/store/_archive/knowledge/topics/t.md"), "utf-8")).toContain("reason:forgot");
    expect(I.recall("jazz")).toHaveLength(0); expect(I.recall("tea")).toHaveLength(1);
  });
  test("entity name archives all bullets", () => { I.forget("t"); expect(I.recall("tea")).toHaveLength(0); });
});

describe("session-end extraction", () => {
  const transcript = (n = 30) => Array.from({ length: n }, (_, i) => JSON.stringify({ type: i % 2 ? "assistant" : "user", message: { role: i % 2 ? "assistant" : "user", content: [{ type: "text", text: `message ${i} about switching the team to Kanban boards and ticket FT-523 ${"x".repeat(40)}` }] } })).join("\n");
  test("writes candidates to inbox + recap, checkpoints, never touches store/", async () => {
    w("t.jsonl", transcript());
    const llm = async () => ({ facts: [{ fact: "Team uses Kanban with T-shirt sizes", entity: "FT team", type: "decision", conf: 0.9, expires: "" }], recap: { anchors: ["a"], open_loops: ["finish FT-523"], identifiers: ["FT-523"], completed: ["x"] } });
    const r: any = await I.sessionEnd({ sessionId: "s1", transcriptPath: join(mem, "t.jsonl"), llm });
    expect(r.candidates).toBe(1);
    expect(readFileSync(join(mem, "instinct/recap.md"), "utf-8")).toContain("FT-523");
    expect(readdirSync(join(mem, "instinct/inbox")).length).toBe(1);
    expect(existsSync(join(mem, "instinct/store"))).toBe(false);
    const r2: any = await I.sessionEnd({ sessionId: "s1", transcriptPath: join(mem, "t.jsonl"), llm });
    expect(r2.skipped).toBe("short delta"); // checkpointed
    expect(I.assemble()).toContain("finish FT-523"); // resume
  });
  test("INSTINCT_CAPTURE=off skips", async () => {
    process.env.INSTINCT_CAPTURE = "off"; w("t.jsonl", transcript());
    expect(((await I.sessionEnd({ sessionId: "s2", transcriptPath: join(mem, "t.jsonl"), llm: async () => ({}) })) as any).skipped).toContain("off");
    delete process.env.INSTINCT_CAPTURE;
  });
  test("llm unavailable → skipped, no writes", async () => {
    w("t.jsonl", transcript());
    expect(((await I.sessionEnd({ sessionId: "s3", transcriptPath: join(mem, "t.jsonl"), llm: async () => null })) as any).skipped).toBe("llm unavailable");
  });
});

describe("seed", () => {
  test("non-destructive: derives layers + topic store; memory/ untouched; idempotent", () => {
    w("memory/MEMORY.md", "# M\n\n## User\n- **Jack Breissinger** | Atlanta\n\n## Company\n- Rivian\n\n## Rivian\n- ticket FT\n\n## Workflow Preferences\n- VSCode\n");
    w("memory/bifrost.md", "---\ntitle: Bifrost\n---\n# Bifrost\n- VPN-gated\n- route guard\n");
    const before = snapshot(join(mem, "memory"));
    I.seed(); expect(snapshot(join(mem, "memory"))).toBe(before);
    expect(readFileSync(join(mem, "instinct/profile.md"), "utf-8")).toContain("Jack Breissinger");
    expect(I.recall("bifrost")[0]?.file.id).toBe("bifrost");
    writeFileSync(join(mem, "instinct/profile.md"), "EDITED");
    I.seed(); expect(readFileSync(join(mem, "instinct/profile.md"), "utf-8")).toBe("EDITED");
  });
});

describe("sweep", () => {
  test("extracts from unseen transcripts once, then skips them", async () => {
    const home = mkdtempSync(join(tmpdir(), "home-")); const d = join(home, "proj"); mkdirSync(d, { recursive: true });
    const lines = Array.from({ length: 30 }, (_, i) => JSON.stringify({ type: i % 2 ? "assistant" : "user", message: { role: i % 2 ? "assistant" : "user", content: `turn ${i} ${"y".repeat(60)}` } })).join("\n");
    writeFileSync(join(d, "abc.jsonl"), lines);
    let calls = 0; const llm = async () => { calls++; return { facts: [{ fact: "F", conf: 0.8 }], recap: { anchors: [], open_loops: ["x"], identifiers: [], completed: [] } }; };
    await I.sweep({ dirs: [home], llm }); await I.sweep({ dirs: [home], llm });
    expect(calls).toBe(1);
  });
});

// ─── quality fixes ────────────────────────────────────────────────────────────
const jl = (rows: object[]) => rows.map((r) => JSON.stringify(r)).join("\n");
const longTranscript = (extra: object[] = []) => jl([...Array.from({ length: 30 }, (_, i) => ({ type: i % 2 ? "assistant" : "user", message: { role: i % 2 ? "assistant" : "user", content: `turn ${i} ${"z".repeat(60)}` } })), ...extra]);

describe("sweep/subagent fixes", () => {
  test("sweep skips agent-* transcripts and never writes recap.md", async () => {
    const home = mkdtempSync(join(tmpdir(), "home-")); const d = join(home, "p"); mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "agent-abc.jsonl"), longTranscript()); writeFileSync(join(d, "main1.jsonl"), longTranscript());
    w("instinct/recap.md", "ORIGINAL RECAP");
    let calls = 0; const llm = async () => { calls++; return { facts: [], recap: { anchors: ["x"], open_loops: [], identifiers: [], completed: [] } }; };
    const r = await I.sweep({ dirs: [home], llm });
    expect(Object.keys(r)).toEqual(["main1"]); expect(calls).toBe(1);
    expect(readFileSync(join(mem, "instinct/recap.md"), "utf-8")).toBe("ORIGINAL RECAP");
  });
  test("sessionEnd skips subagent transcript paths directly", async () => {
    w("agent-x.jsonl", longTranscript());
    expect(((await I.sessionEnd({ sessionId: "a", transcriptPath: join(mem, "agent-x.jsonl"), llm: async () => ({}) })) as any).skipped).toBe("subagent transcript");
  });
});

describe("entity canonicalization", () => {
  beforeEach(() => {
    w("instinct/store/knowledge/topics/bifrost.md", storeFile("bifrost", ["bifrost"], [bullet("b1", "Bifrost is VPN gated", "2026-10-01")]));
    w("instinct/store/knowledge/topics/gatehouse-onboarding.md", storeFile("gatehouse-onboarding", ["gatehouse", "onboarding"], [bullet("g1", "OIDC config", "2026-10-01")]));
    w("instinct/store/knowledge/topics/sprint-agent.md", storeFile("sprint-agent", ["sprint", "agent"], [bullet("s1", "Bedrock-backed", "2026-10-01")]));
  });
  const c = (fact: string, entity: string, type = "decision") => ({ ts: "2026-10-08T10:00:00Z", fact, entity, type, conf: 0.8, src: "t" });
  const files = () => I.loadStore();
  test("descriptive entity containing a rare store token folds into that file", () => {
    expect(I.resolveTarget(files(), c("Stale JWKS keys fail closed", "Bifrost JWKS verifier")).file?.id).toBe("bifrost");
  });
  test("path-like / MR / ticket entities resolve by rare token in the fact text", () => {
    expect(I.resolveTarget(files(), c("Bifrost disables default request logging", "apps/bifrost/backend/src/lib/request-log.ts")).file?.id).toBe("bifrost");
    expect(I.resolveTarget(files(), c("Gatehouse MR was reviewed read-only", "Gatehouse MR !200")).file?.id).toBe("gatehouse-onboarding");
    expect(I.resolveTarget(files(), c("Bifrost per-user ACC is active", "FT-522", "project")).file?.id).toBe("bifrost");
  });
  test("generic entity with no matching fact goes to a general file, not preference.md", () => {
    const r = I.resolveTarget(files(), c("Reviews must be read-only", "preference", "preference"));
    expect(r.file).toBeUndefined(); expect(r.general).toBe(true);
  });
  test("a genuinely new named entity still creates its own file", () => {
    const r = I.resolveTarget(files(), c("Tommy sets team boundaries", "Tommy Magee", "person"));
    expect(r.file).toBeUndefined(); expect(r.general).toBe(false);
  });
  test("consolidate routes generic preference to knowledge/preferences/general.md", async () => {
    w("instinct/inbox/x.jsonl", JSON.stringify({ ts: "2026-10-08T10:00:00Z", fact: "Reviews must be read-only", entity: "preference", type: "preference", conf: 0.9, src: "t" }) + "\n");
    await I.consolidate({ judge: async () => ({ action: "add" }), noSuggest: true });
    expect(existsSync(join(mem, "instinct/store/knowledge/preferences/general.md"))).toBe(true);
    expect(existsSync(join(mem, "instinct/store/knowledge/preferences/preference.md"))).toBe(false);
  });
  test("judge supersede on an unrelated bullet is downgraded to add", async () => {
    w("instinct/inbox/y.jsonl", JSON.stringify({ ts: "2026-10-08T10:00:00Z", fact: "Gatehouse needs a machine credential", entity: "Bifrost", type: "decision", conf: 0.9, src: "t" }) + "\n");
    const plan = await I.consolidate({ judge: async (ex) => ({ action: "supersede", supersedes: [ex[0]!.id] }), noSuggest: true });
    expect(plan.superseded).toHaveLength(0);
    expect(readFileSync(join(mem, "instinct/store/knowledge/topics/bifrost.md"), "utf-8")).toContain("Bifrost is VPN gated");
  });
});

describe("skill/agent prompt signals → suggestions", () => {
  let hd = "";
  const sig = (target: string, session: string, o: Record<string, unknown> = {}) => I.captureSignal({ target, kind: "recommendation", observation: `obs from ${session}`, suggested_change: "add a rule", conf: 0.7, session, ...o });
  beforeEach(() => {
    hd = mkdtempSync(join(tmpdir(), "hd-")); process.env.HOLOCRON_DIR = hd;
    mkdirSync(join(hd, "skills/acli"), { recursive: true });
    writeFileSync(join(hd, "skills/acli/SKILL.md"), "---\nname: acli\ndescription: Jira via CLI\n---\n# acli\nUse acli for Jira.\nAlways authenticate first.\n");
    mkdirSync(join(hd, "agents"), { recursive: true }); writeFileSync(join(hd, "agents/Engineer.md"), "---\nname: Engineer\n---\nYou are an engineer.\n");
  });
  const llm = async () => ({ summary: "s", rationale: "r", edits: [{ where: "top", before: "Always authenticate first.", after: "Always authenticate first.\nIf acli says unauthorized, use the Atlassian MCP instead." }, { where: "bad", before: "THIS TEXT DOES NOT EXIST", after: "x" }] });

  test("transcript digest includes skill, agent, and tool-error markers", () => {
    const raw = jl([{ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", name: "Skill", input: { skill: "acli" } }, { type: "tool_use", name: "Agent", input: { subagent_type: "Engineer", description: "build it" } }] } }, { type: "user", message: { role: "user", content: [{ type: "tool_result", is_error: true, content: "unauthorized" }] } }]);
    const t = I.transcriptText(raw).text;
    expect(t).toContain("[SKILL invoked: acli]"); expect(t).toContain("[AGENT Engineer: build it]"); expect(t).toContain("[TOOL ERROR: unauthorized]");
  });
  test("sessionEnd persists skill_signals to signals/ with normalized targets", async () => {
    w("t.jsonl", longTranscript());
    const r: any = await I.sessionEnd({ sessionId: "s-1", transcriptPath: join(mem, "t.jsonl"), llm: async () => ({ facts: [], recap: null, skill_signals: [{ target: "skill: ACLI", kind: "failure", observation: "unauthorized error", suggested_change: "fallback to MCP", conf: 0.9 }] }) });
    expect(r.signals).toBe(1);
    expect(readFileSync(join(mem, "instinct/signals", readdirSync(join(mem, "instinct/signals"))[0]!), "utf-8")).toContain('"target":"skill:acli"');
  });
  test("below threshold: one low-conf signal from one session → no suggestion", async () => {
    sig("skill:acli", "s1"); const r = await I.suggest({ llm });
    expect(r.written).toHaveLength(0); expect(r.skipped[0]).toContain("below threshold");
  });
  test("2 sessions → suggestion written, unanchored edit dropped, target file untouched, signals consumed", async () => {
    sig("skill:acli", "s1"); sig("skill:acli", "s2");
    const before = readFileSync(join(hd, "skills/acli/SKILL.md"), "utf-8");
    const r = await I.suggest({ llm });
    expect(r.written).toHaveLength(1);
    const f = readdirSync(join(mem, "instinct/suggestions"))[0]!; const body = readFileSync(join(mem, "instinct/suggestions", f), "utf-8");
    expect(body).toContain("status: proposed"); expect(body).toContain("Atlassian MCP"); expect(body).not.toContain("THIS TEXT DOES NOT EXIST");
    expect(readFileSync(join(hd, "skills/acli/SKILL.md"), "utf-8")).toBe(before);
    expect((await I.suggest({ llm })).written).toHaveLength(0); // signals consumed
    expect(I.assemble()).toContain("1 pending skill/agent prompt-change suggestion");
  });
  test("strong single-session failure is eligible; agent targets resolve", async () => {
    sig("agent:Engineer", "s1", { kind: "failure", conf: 0.9 });
    const r = await I.suggest({ llm: async () => ({ summary: "", rationale: "", edits: [{ where: "end", before: "", after: "Run tests before reporting done." }] }) });
    expect(r.written).toHaveLength(1);
  });
  test("dry-run lists eligible targets but writes nothing and calls no LLM", async () => {
    sig("skill:acli", "s1"); sig("skill:acli", "s2"); let called = 0;
    const snap = snapshot(join(mem, "instinct"));
    const r = await I.suggest({ dryRun: true, llm: async () => { called++; return null; } });
    expect(r.eligible).toHaveLength(1); expect(called).toBe(0); expect(snapshot(join(mem, "instinct"))).toBe(snap);
  });
  test("apply edits the prompt file once and marks applied; reject marks rejected; stale anchor refuses", async () => {
    sig("skill:acli", "s1"); sig("skill:acli", "s2"); await I.suggest({ llm });
    const sg = I.listSuggestions()[0]!;
    I.applySuggestion(sg.id, { dryRun: true }); expect(readFileSync(join(hd, "skills/acli/SKILL.md"), "utf-8")).not.toContain("Atlassian MCP");
    I.applySuggestion(sg.id);
    expect(readFileSync(join(hd, "skills/acli/SKILL.md"), "utf-8")).toContain("Atlassian MCP"); expect(I.listSuggestions()[0]!.status).toBe("applied");
    expect(() => I.applySuggestion(sg.id)).toThrow(/applied/);
  });
  test("consolidate surfaces suggestions in its plan; --no-suggest skips", async () => {
    sig("skill:acli", "s1"); sig("skill:acli", "s2");
    const dry = await I.consolidate({ dryRun: true, judge: async () => ({ action: "add" }) });
    expect(dry.suggestions[0]).toContain("ELIGIBLE skill:acli");
    const none = await I.consolidate({ dryRun: true, noSuggest: true, judge: async () => ({ action: "add" }) });
    expect(none.suggestions).toHaveLength(0);
  });
});

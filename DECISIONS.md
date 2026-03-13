# Decision Log

Key architectural and design decisions made while building Holocron. Captured so I can revisit the reasoning later and talk through the tradeoffs.

---

## Format

Each entry has:
- **Date** — when the decision was made
- **Decision** — what was decided
- **Options considered** — what else was on the table
- **Rationale** — why this one

---

## 2026-03-13


### Two-repo structure: public config + private memory

**Decision:** Split into two repos — `Holocron` (public, shareable config) and a private memory repo — connected via symlinks and an `OPENCODE_MEMORY_DIR` env var.

**Options considered:**
- Single repo with `.gitignore` guarding private files — simpler but one accidental push exposes everything
- Monorepo with git submodule for private memory — works but submodules are painful
- Two fully separate repos, symlinked at install time — clean separation, same pattern PAI uses

**Rationale:** Mirrors the PAI pattern (`pai-context` private + `Personal_AI_Infrastructure` public) which has proven itself. Clean separation by design means there's no mechanism by which private memory can leak into the public repo. Symlinks keep the runtime experience seamless.

---

### Harness-agnostic design

**Decision:** Build Holocron to work across any agent harness, not tied to OpenCode specifically.

**Options considered:**
- OpenCode-specific — simpler to build, but becomes throwaway work if the tool changes
- Claude Code-specific — already have PAI for this; no point duplicating
- Harness-agnostic — more upfront design work, but the core (skills, commands, instructions) is portable by nature

**Rationale:** The agent harness landscape is moving fast. The valuable part of this system is the accumulated skills, context, and behavioral rules — not the plugin glue. Design the core to be portable so it survives tool changes. Plugin adapters for specific harnesses are thin wrappers around that core.

---

### PAI as foundation, not fork

**Decision:** Use Personal AI Infrastructure as inspiration and reference, not as a codebase to fork.

**Options considered:**
- Fork PAI and adapt it — starts with everything but carries PAI's Claude Code assumptions
- Rebuild from scratch ignoring PAI — wastes research; PAI has solved hard problems worth learning from
- Use PAI as a reference architecture, build Holocron independently — clean slate with informed decisions

**Rationale:** PAI is tightly coupled to Claude Code (hooks, `settings.json`, `CLAUDE.md` generation). Forking it means inheriting that coupling. Building independently while referencing PAI's architecture means Holocron can be genuinely harness-agnostic from day one, while still standing on PAI's shoulders for the hard design questions.

# Install CLI Contract (spec 001)

The machine-facing contract of `install.sh`. `install.ps1` intentionally does **not** implement this contract in v1 (prints "not yet updated" and exits 0 — R7).

## Usage

```bash
install.sh            # apply mode (default): converge the live machine to the expected state
install.sh --check    # check mode: report drift, change nothing
```

No other flags in v1. Exit codes:

| Code | Meaning |
|---|---|
| 0 | apply: machine converged (repairs, if any, were printed). check: no failure-class drift |
| 1 | check: one or more failure-class drift entries (see classes below) |
| 2 | usage error, or environment error (`$HOLOCRON_MEMORY_DIR` unset and required, repo not found) |

## Output format

Both modes print a table (one row per pointer touched or drifted):

```text
POINTER                              CLASS         CURRENT → EXPECTED                          ACTION
~/.claude/settings.json              PRECEDENCE    repo template → memory override              REPAIRED
~/.pi/agent/AGENTS.md                MISSING       (absent) → instructions/AGENTS.md            CREATED
~/.pi/agent/APPEND_SYSTEM.md         STALE         pi/AGENTS.md → pi/APPEND_SYSTEM.md           REPAIRED
~/.claude/skills/autodesk-forma-...  EXTERNAL      (hand-added, external target)                LEFT
~/.pi/agent/settings.json            USER_LOCAL    real file (user config)                      SKIPPED
```

Apply mode ends with `N changes` or `no changes`. Check mode ends with `DRIFT: N failure(s), M informational` or `CLEAN`.

## Drift classes

Failure classes (drive exit 1 in check mode; repaired in apply mode): `STALE`, `DANGLING`, `MISSING`, `CHURNED`, `PRECEDENCE` — definitions in `data-model.md` §3.
Informational classes (never fail the run): `EXTERNAL`, `USER_LOCAL`.

## Invariants (MUST)

1. **Idempotent**: a second consecutive apply run prints `no changes` (SC-004).
2. **Print every change**: no silent filesystem modification (FR-011).
3. **Never touch**: `~/.agents/` (FR-016), harness-local real user files (`settings.local.json`, real `~/.pi/agent/settings.json`), external/hand-added pointers, and — post-migration — anything under `~/.config/opencode/` (US6 AS3).
4. **Converge-on-rerun**: stale, dangling, missing, churned, and precedence-violating pointers are all repaired to the expected state (FR-011, R2).
5. **Missing harness is fine**: if a harness home doesn't exist (e.g. no `~/.pi/`), that section is skipped with a notice and the run still succeeds (US5 AS5).
6. **`--check` is read-only**: it classifies and reports; it performs zero writes (FR-012).
7. **Churn reset scope**: content resets apply only to pointers with `churn_check=true` (currently the two settings symlinks) — never to symlinks whose target is user-editable content elsewhere (R2).

## Precedence inputs (read at run time)

- `$HOLOCRON_DIR` (or repo root resolved from the script's own location)
- `$HOLOCRON_MEMORY_DIR` (required for private/override sources; unset → apply still runs for public-only wiring, check reports a notice)
- existence of `$HOLOCRON_MEMORY_DIR/settings.json` and `$HOLOCRON_MEMORY_DIR/pi-settings.json`

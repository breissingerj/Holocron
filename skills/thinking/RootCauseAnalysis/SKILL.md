---
name: RootCauseAnalysis
version: 1.0.0
description: "Structured incident investigation using Five Whys, Fishbone, blameless Postmortem, Fault Tree, and Kepner-Tregoe — traces failures to systemic root causes rather than blaming humans. USE WHEN root cause, RCA, 5 whys, fishbone, postmortem, incident analysis, fault tree, why does this keep failing, recurring bug, blameless. NOT FOR systemic feedback loops (use SystemsThinking-style analysis in thinking/Council)."
---

# RootCauseAnalysis

Adapted from upstream LifeOS (`danielmiessler/LifeOS`, skills/RootCauseAnalysis v1.0.7); LifeOS-specific machinery (voice server, customization dirs, execution-log paths) stripped for Holocron.

## What It Does

Investigates why something failed — past the proximate cause, down to the contributing factors and latent conditions that made the failure possible. Ends with actionable changes that prevent a whole class of failure, not just the one incident. Grounded in Toyota Production System, Ishikawa, Reason's Swiss Cheese model, and Google SRE / Etsy blameless culture.

**A good RCA ends with 3+ actionable, systemic contributing factors, named blamelessly — not a single blame target.**

## Five Axioms

1. **Proximate cause ≠ root cause.** "The deploy failed because X crashed" is where analysis starts, not ends.
2. **There is rarely one cause.** Active failures (what a human did) plus latent conditions (what the system allowed) — Reason's Swiss Cheese model.
3. **Humans are not root causes.** "Operator error" is a stop sign, not a conclusion. If a human could make the mistake, the system allowed it. Go deeper.
4. **Actionability is the stop condition.** A cause is "root enough" when it points to a change you can actually make. Too shallow misses the fix; too deep ("physics") can't be acted on.
5. **RCA is a bias-fight.** Hindsight, confirmation, single-cause, and outcome bias actively corrupt investigations. Structure exists to resist them.

**Default mental model:** if the same failure class could happen again tomorrow, you did triage, not RCA.

## Method Selection

| Situation | Method |
|-----------|--------|
| Single-thread incident, one clear failure point | **Five Whys** — linear/branching causal chain |
| Multiple suspected categories (people, process, tools) | **Fishbone (Ishikawa)** — 6 M's (Manpower, Machine, Method, Material, Measurement, Mother-Nature) for manufacturing; 4 P's (People, Process, Policies, Procedures) for service |
| Production outage or security incident, formal review | **Postmortem** — timeline + contributing factors + action items; blameless framing mandatory |
| Complex multi-path failure, safety-critical | **Fault Tree** — top-down deductive, AND/OR gate logic |
| Subtle defect, hard to reproduce, "why here and not there?" | **Kepner-Tregoe IS/IS-NOT** — distinctions between where the problem occurs and where it does not |

For non-trivial incidents: **Postmortem wraps the others.** Start with the Postmortem structure, use 5 Whys / Fishbone / Fault Tree inside it as investigation tools.

## Output Shape

1. **Timeline** — observed facts only, each with its source (log line, deploy record, metric).
2. **Causal analysis** — the chosen method's chain/map/tree, pushed past the first plausible cause.
3. **Contributing factors** — 3+ named, each labeled active failure or latent condition.
4. **Remediation** — one structural change per factor; each becomes an ISC with a probe if this runs inside the Algorithm.
5. **Blameless statement** — what the system allowed, never who failed.

## Examples

**Production outage:** payments down 14 min → timeline: deploy 23:47, health check passed, traffic shift 23:49, p99 spike 23:51, auto-rollback 00:01 → 5 Whys: cold cache ← new pod group ← no warm-up step ← deploy template predates caching layer → factors: stale template (latent), no warm-up (active), no cold-cache canary (latent) → fixes: update template, warm-up step, cold-cache canary gate.

**Recurring defect:** same auth failure fixed 3 times → Fishbone: key rotation without notice (People), no rotation runbook (Method), cache TTL exceeds rotation window (Machine), shared key (Material), no expiry dashboard (Measurement) → single-point fix won't hold; three structural changes.

**Flaky CI-only test:** Kepner-Tregoe IS/IS-NOT: fails CI/passes local; fails on shared runners/not dedicated; fails parallel/not serial → distinctions: timezone + concurrency + shared filesystem → hypothesis: local-tz assumption plus /tmp race, both CI-only.

## Gotchas

- "Human error" is where investigation begins. Every human error sits on a system that made it possible.
- The first plausible cause is almost never the only one. Keep going after you find one.
- Stopping at proximate cause is failure. Why did Y return null? Why wasn't null handled? Why wasn't that tested?
- Going too deep is not good RCA. Stop at the deepest ACTIONABLE level.
- Asking "why" more than ~5 times usually means you switched causal chains — redraw as a tree, not a line.
- Correlation is a hypothesis to test, not a conclusion.
- Outcome bias is sneaky: judge the decision by the information at the time, not the result.

**Attribution:** Sakichi Toyoda (5 Whys), Kaoru Ishikawa (Fishbone), James Reason (Swiss Cheese), Kepner & Tregoe, Google SRE, Etsy blameless postmortem culture (John Allspaw).

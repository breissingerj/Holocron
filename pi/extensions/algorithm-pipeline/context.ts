/**
 * Algorithm Pipeline — Context Envelope Types
 *
 * The PipelineContext is the single shared data structure passed between all
 * phase agents. Each agent receives the full envelope, adds its phase output,
 * and returns the updated envelope. Agents summarise prior phases to stay
 * under the 12k-token soft cap enforced by the orchestrator.
 */

export type Effort = "standard" | "extended" | "advanced" | "deep" | "comprehensive";

export type PhaseName = "observe" | "think" | "plan" | "build" | "execute" | "verify" | "learn";

export interface ISCCriterion {
  /** e.g. "ISC-1" */
  id: string;
  /** Criterion text — atomic, one verifiable thing */
  text: string;
  /** true once verified by VERIFY phase */
  done: boolean;
  /** Verification evidence populated by VERIFY agent */
  evidence?: string;
}

export interface CapabilitySelection {
  /** e.g. "Research", "Thinking/Council" */
  name: string;
  /** Which phase will invoke this capability */
  phase: string;
  /** 8-word reason for selection */
  reason: string;
  /** Set to true once actually invoked — text-only output does NOT count */
  invoked: boolean;
}

export interface PipelineContext {
  // ── Immutable header — set by orchestrator at pipeline start ──────────
  /** Original user prompt */
  task: string;
  /** YYYYMMDD-HHMMSS_kebab-slug */
  slug: string;
  /** Effort tier — may be refined by OBSERVE agent */
  effort: Effort;
  /** ISO timestamp of pipeline start */
  started: string;
  /** Absolute path to PRD.md for this run */
  prd_path: string;

  // ── Phase control — updated by orchestrator after each phase ──────────
  phases_run: PhaseName[];
  phases_skipped: PhaseName[];

  // ── Phase outputs — appended as each phase completes ──────────────────

  observe?: {
    reverse_engineering: {
      explicit_wants: string[];
      explicit_not_wants: string[];
      implied_not_wants: string[];
      /** e.g. "under 2 minutes", "up to 30 minutes" */
      speed_preference: string;
    };
    effort_level: Effort;
    isc_criteria: ISCCriterion[];
    capabilities_selected: CapabilitySelection[];
    /** ≤300 words of gathered context for subsequent phases */
    context_summary: string;
    /** Phases this agent recommends skipping */
    recommend_skip: PhaseName[];
  };

  think?: {
    /** 2–8 riskiest assumptions about the current approach */
    riskiest_assumptions: string[];
    /** 2–8 ways the approach could fail */
    premortem: string[];
    /** Prerequisites that could block execution — empty means clear */
    prerequisites_blocked: string[];
    /** New ISC criteria discovered during pressure-testing */
    isc_additions: ISCCriterion[];
    /** Existing criteria that were compound and need splitting */
    isc_splits: Array<{
      original_id: string;
      replacements: ISCCriterion[];
    }>;
    recommend_skip: PhaseName[];
  };

  plan?: {
    /** ≤200 words describing the technical approach */
    technical_approach: string;
    dependency_list: string[];
    decisions: Array<{ decision: string; rationale: string }>;
    pre_flight_checks: string[];
    recommend_skip: PhaseName[];
  };

  build?: {
    capabilities_invoked: Array<{
      name: string;
      /** ≤100 word summary of what the capability produced */
      result_summary: string;
      success: boolean;
    }>;
    /** ≤200 word summary of preparation artifacts created */
    preparation_summary: string;
    decisions: Array<{ decision: string; rationale: string }>;
    recommend_skip: PhaseName[];
  };

  execute?: {
    /** ≤300 word summary of work done */
    work_summary: string;
    files_changed: string[];
    /** All ISC criteria with done=true/false and evidence */
    isc_status: ISCCriterion[];
    decisions: Array<{ decision: string; rationale: string }>;
  };

  verify?: {
    /** ISC IDs that passed independent verification */
    criteria_passed: string[];
    /** ISC IDs that failed independent verification */
    criteria_failed: string[];
    /** ISC-ID → evidence string (what was run and what it showed) */
    evidence: Record<string, string>;
    confidence_check: {
      hardest_decision: string;
      rejected_alternatives: string;
      least_confident: string;
    };
  };

  learn?: {
    reflection_q1: string;
    reflection_q2: string;
    reflection_q3: string;
    reflection_q4: string;
    /** 1–10 estimate of user satisfaction from task complexity vs outcome */
    implied_sentiment: number;
    /** Agent names actually invoked during BUILD */
    agents_invoked: string[];
    within_budget: boolean;
  };

  /** Fallback storage when an agent returns malformed JSON */
  _fallbacks?: Partial<Record<PhaseName, string>>;
}

/** Envelope returned by each agent subprocess */
export interface AgentEnvelopeResponse {
  phase_output: unknown;
  /** Phases the agent recommends skipping */
  recommend_skip: PhaseName[];
  /** Human-readable summary for UI display */
  narrative: string;
}

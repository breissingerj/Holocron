/**
 * Algorithm Pipeline Extension
 *
 * Registers the `algorithm_pipeline` tool that runs the Holocron Algorithm
 * as a sequential sub-agent pipeline. Each phase executes in an isolated
 * pi subprocess with a clean context window. Phases communicate via a
 * structured JSON context envelope. Phases that are not needed are
 * programmatically skipped.
 *
 * Usage: the primary agent calls `algorithm_pipeline` with the user's task.
 * The orchestrator handles all phase sequencing, skip logic, and context curation.
 *
 * PIPELINE mode in algorithm-mode.ts triggers this tool automatically.
 */

import * as path from "node:path";
import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import type { PipelineContext } from "./context.js";
import { runPipeline } from "./orchestrator.js";
import { ALL_PHASES, PHASE_LABELS, PHASE_STATUS } from "./phases.js";

const AGENTS_DIR = path.join(import.meta.dirname ?? __dirname, "agents");

export default function algorithmPipeline(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "algorithm_pipeline",
    label: "Algorithm Pipeline",
    description: [
      "Run the Holocron Algorithm as a sequential sub-agent pipeline.",
      "Each phase (OBSERVE → THINK → PLAN → BUILD → EXECUTE → VERIFY → LEARN) runs in an isolated context.",
      "Phases are skipped automatically when not needed.",
      "Use this for Advanced+ effort tasks where context isolation improves quality.",
    ].join(" "),
    promptSnippet: "Run full Holocron Algorithm as isolated phase sub-agents",
    promptGuidelines: [
      "Use algorithm_pipeline when the task is Advanced+ effort and would benefit from phase isolation.",
      "Do not use algorithm_pipeline for Standard effort tasks — run the Algorithm inline instead.",
      "When PIPELINE mode is active, always call algorithm_pipeline with the full user task as the `task` parameter.",
    ],

    parameters: Type.Object({
      task: Type.String({
        description: "The original user task — full prompt text passed to the OBSERVE agent",
      }),
      effort: Type.Optional(
        StringEnum(["standard", "extended", "advanced", "deep", "comprehensive"] as const, {
          description:
            "Override effort level. If omitted, the OBSERVE agent determines the appropriate tier.",
        }),
      ),
      force_skip: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "Phase names to force-skip regardless of skip logic. Cannot skip observe, execute, or verify.",
        }),
      ),
      force_run: Type.Optional(
        Type.Array(Type.String(), {
          description: "Phase names to force-run even if skip evaluation would skip them.",
        }),
      ),
    }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const result = await runPipeline(
        {
          task: params.task,
          effort: params.effort,
          force_skip: params.force_skip,
          force_run: params.force_run,
        },
        AGENTS_DIR,
        ctx,
        signal,
        onUpdate
          ? (partial) =>
              onUpdate({
                content: partial.content,
                details: partial.details,
              })
          : undefined,
      );

      return {
        content: result.content,
        details: result.details,
        isError: result.isError,
      };
    },

    renderCall(args, theme) {
      const effort = args.effort ?? "auto";
      const skips = args.force_skip?.join(", ") ?? "none";
      let text =
        theme.fg("toolTitle", theme.bold("algorithm_pipeline ")) +
        theme.fg("accent", effort) +
        theme.fg("muted", ` force_skip: ${skips}`);
      const preview = args.task
        ? args.task.length > 60
          ? `${args.task.slice(0, 60)}…`
          : args.task
        : "…";
      text += `\n  ${theme.fg("dim", preview)}`;
      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded }, theme) {
      const details = result.details as PipelineContext | undefined;

      if (!details) {
        const t = result.content[0];
        return new Text(t?.type === "text" ? t.text : "(no output)", 0, 0);
      }

      // Build phase status table
      const phaseLines = ALL_PHASES.map((phase) => {
        const ran = details.phases_run.includes(phase);
        const skipped = details.phases_skipped.includes(phase);
        const running =
          !ran &&
          !skipped &&
          details.phases_run.length > 0 &&
          ALL_PHASES.indexOf(phase) === details.phases_run.length;

        let icon: string;
        let color: "success" | "muted" | "warning" | "accent";
        if (ran) { icon = PHASE_STATUS.done; color = "success"; }
        else if (skipped) { icon = PHASE_STATUS.skipped; color = "muted"; }
        else if (running) { icon = PHASE_STATUS.running; color = "warning"; }
        else { icon = PHASE_STATUS.pending; color = "muted"; }

        return `  ${theme.fg(color, icon)} ${theme.fg(color, PHASE_LABELS[phase])}`;
      });

      // ISC summary from verify phase
      let iscLine = "";
      if (details.verify) {
        const passed = details.verify.criteria_passed.length;
        const failed = details.verify.criteria_failed.length;
        iscLine =
          "\n  " +
          theme.fg("success", `${passed} passed`) +
          theme.fg("muted", " / ") +
          (failed > 0 ? theme.fg("error", `${failed} failed`) : theme.fg("muted", "0 failed"));
      }

      const header =
        theme.fg("toolTitle", theme.bold("algorithm_pipeline ")) +
        theme.fg("accent", details.effort) +
        theme.fg("muted", ` [${details.slug.slice(0, 20)}…]`);

      if (expanded) {
        let text = `${header}\n${phaseLines.join("\n")}${iscLine}`;
        if (details.execute?.work_summary) {
          text += `\n\n${theme.fg("muted", "Work summary:")}\n${theme.fg("toolOutput", details.execute.work_summary)}`;
        }
        if (details._fallbacks) {
          const fallbackPhases = Object.keys(details._fallbacks).join(", ");
          text += `\n\n${theme.fg("warning", `⚠ Fallback stored for: ${fallbackPhases}`)}`;
        }
        return new Text(text, 0, 0);
      }

      const runCount = details.phases_run.length;
      const skipCount = details.phases_skipped.length;
      const status =
        theme.fg("success", `${runCount} run`) +
        theme.fg("muted", " / ") +
        theme.fg("muted", `${skipCount} skipped`);

      return new Text(`${header}\n${phaseLines.join("\n")}\n  ${status}${iscLine}`, 0, 0);
    },
  });
}

import type { Plugin } from "@opencode-ai/plugin";

/**
 * holocron-path-corrector
 *
 * Corrects filesystem path corruption introduced by the built-in
 * opencode-anthropic-auth plugin (v0.0.13+), which applies a blanket
 * case-insensitive `/opencode/gi → "Claude"` regex to the entire system
 * prompt before sending to Anthropic's API.
 *
 * That regex corrupts filesystem paths:
 *   ~/.config/opencode/  →  ~/.config/Claude/   (does not exist)
 *   file:///...opencode/skills/  →  file:///...Claude/skills/
 *
 * This plugin hooks `experimental.chat.system.transform` and runs after
 * the auth plugin (user plugins load after built-ins), rewriting the
 * corrupted paths back to their correct form.
 *
 * Scope: only fires for the `anthropic` provider, matching the auth
 * plugin's own scope guard.
 */

const PLUGIN_TAG = "[holocron-path-corrector]";

/** Pairs of [corrupted, correct] path strings to restore. */
const PATH_CORRECTIONS: [RegExp, string][] = [
  // ~/.config/Claude/ → ~/.config/opencode/
  [/\.config\/Claude\//g, ".config/opencode/"],
  // file:///...Claude/ → file:///...opencode/ (skill SKILL.md URLs)
  [/file:\/\/\/([^"'\s]*)\/Claude\//g, "file:///$1/opencode/"],
];

export const HolocronPathCorrector: Plugin = async ({ client }) => {
  await client.app.log({
    body: {
      service: PLUGIN_TAG,
      level: "info",
      message: "Path corrector initialized — will fix opencode→Claude path corruption for anthropic provider.",
    },
  });

  return {
    /**
     * experimental.chat.system.transform fires before system prompt is sent
     * to the model. We correct paths corrupted by opencode-anthropic-auth's
     * blanket opencode→Claude replacement.
     *
     * output.system is an array of strings (text blocks in the system prompt).
     */
    "experimental.chat.system.transform": (input: any, output: any) => {
      if (input?.model?.providerID !== "anthropic") return;

      if (!output?.system || !Array.isArray(output.system)) return;

      let correctionsMade = 0;

      output.system = output.system.map((block: unknown) => {
        if (typeof block !== "string") return block;

        let corrected = block;
        for (const [pattern, replacement] of PATH_CORRECTIONS) {
          const before = corrected;
          corrected = corrected.replace(pattern, replacement);
          if (corrected !== before) correctionsMade++;
        }
        return corrected;
      });

      if (correctionsMade > 0) {
        client.app.log({
          body: {
            service: PLUGIN_TAG,
            level: "info",
            message: `Corrected ${correctionsMade} corrupted path(s) in system prompt.`,
          },
        });
      }
    },
  };
};

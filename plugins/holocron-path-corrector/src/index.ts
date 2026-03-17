import type { Plugin } from "@opencode-ai/plugin";

/**
 * holocron-path-corrector
 *
 * The built-in opencode-anthropic-auth plugin (v0.0.13+) applies a blanket
 * case-insensitive `/opencode/gi → "Claude"` regex to the serialized JSON
 * request body inside its fetch interceptor, AFTER all system.transform hooks
 * have run. This corrupts filesystem paths:
 *
 *   ~/.config/opencode/  →  ~/.config/Claude/   (does not exist)
 *   file:///...opencode/skills/  →  file:///...Claude/skills/
 *
 * The `experimental.chat.system.transform` hook fires too early (before the
 * fetch interceptor), so corrections made there are undone immediately after.
 *
 * FIX: Wrap `globalThis.fetch` at plugin init time. Our wrapper runs inside
 * the auth plugin's custom fetch function — when that function calls the bare
 * `fetch(requestInput, {...body})` on line 269, it hits our wrapper. At that
 * point the body is already corrupted. We parse it, fix the paths, and pass
 * the corrected body to the real network fetch.
 *
 * Scope: only fires for POST requests to Anthropic API endpoints.
 */

const PLUGIN_TAG = "[holocron-path-corrector]";

const ANTHROPIC_HOSTS = ["api.anthropic.com", "console.anthropic.com"];

/** Corrections applied to every text block in parsed.system */
const CORRECTIONS: [RegExp, string][] = [
  // ~/.config/Claude/ → ~/.config/opencode/
  [/\.config\/Claude\//g, ".config/opencode/"],
  // file:///path/Claude/ → file:///path/opencode/ (skill SKILL.md file:// URIs)
  [/(file:\/\/\/[^"'\s]*)\/Claude\//g, "$1/opencode/"],
  // Instructions from: .../Claude/... label
  [/Instructions from: ([^"'\n]*)\/Claude\//g, "Instructions from: $1/opencode/"],
];

function isAnthropicUrl(input: RequestInfo | URL): boolean {
  try {
    const url = typeof input === "string"
      ? new URL(input)
      : input instanceof URL
        ? input
        : new URL((input as Request).url);
    return ANTHROPIC_HOSTS.some((h) => url.hostname === h);
  } catch {
    return false;
  }
}

function correctPaths(text: string): string {
  let result = text;
  for (const [pattern, replacement] of CORRECTIONS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

let _wrapped = false;

export const HolocronPathCorrector: Plugin = async ({ client }) => {
  if (!_wrapped) {
    _wrapped = true;
    const _realFetch = globalThis.fetch.bind(globalThis);

    globalThis.fetch = async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      // Only intercept POST requests to Anthropic with a string body
      if (
        isAnthropicUrl(input) &&
        (init?.method ?? "GET").toUpperCase() === "POST" &&
        typeof init?.body === "string"
      ) {
        try {
          const parsed = JSON.parse(init.body);
          let correctionsMade = 0;

          if (parsed.system && Array.isArray(parsed.system)) {
            parsed.system = parsed.system.map((item: unknown) => {
              if (
                item !== null &&
                typeof item === "object" &&
                "type" in item &&
                (item as { type: string }).type === "text" &&
                "text" in item &&
                typeof (item as { text: unknown }).text === "string"
              ) {
                const before = (item as { text: string }).text;
                const after = correctPaths(before);
                if (after !== before) correctionsMade++;
                return { ...(item as object), text: after };
              }
              // Plain string block
              if (typeof item === "string") {
                const after = correctPaths(item);
                if (after !== item) correctionsMade++;
                return after;
              }
              return item;
            });
          }

          if (correctionsMade > 0) {
            // Fire-and-forget log — don't await to avoid blocking the request
            client.app.log({
              body: {
                service: PLUGIN_TAG,
                level: "info",
                message: `Corrected ${correctionsMade} corrupted path(s) in outgoing request body.`,
              },
            }).catch(() => {});

            return _realFetch(input, { ...init, body: JSON.stringify(parsed) });
          }
        } catch {
          // JSON parse failed or correction threw — pass through unchanged
        }
      }

      return _realFetch(input, init);
    };

    await client.app.log({
      body: {
        service: PLUGIN_TAG,
        level: "info",
        message: "globalThis.fetch wrapped — will correct ~/.config/Claude/ paths in outgoing Anthropic requests.",
      },
    });
  }

  return {};
};

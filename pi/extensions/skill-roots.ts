/**
 * skill-roots.ts — Shared skill root discovery for pi
 *
 * Registers a `resources_discover` handler so pi finds Holocron's public and
 * private skills directly from their canonical repo roots, instead of the
 * retired `~/.pi/agent/skills` fan-out (13 wrapper directories). No
 * `promptPaths` here — the native `~/.pi/agent/prompts → commands/` symlink
 * already covers prompts; returning promptPaths too would double-register.
 *
 * Placement: ~/.pi/agent/extensions/skill-roots.ts (auto-linked by install.sh)
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// install.sh symlinks this file into ~/.pi/agent/extensions/skill-roots.ts, so
// resolving the Holocron repo root from "this file's own location" requires
// following the symlink explicitly (runtime dirname/import.meta behavior on a
// symlinked module is not guaranteed to follow it) — matches the $HOLOCRON_DIR
// documented fallback in instructions/AGENTS.md.
function resolveHolocronDir(): string {
	if (process.env.HOLOCRON_DIR) return process.env.HOLOCRON_DIR;
	const realFile = realpathSync(fileURLToPath(import.meta.url));
	return join(dirname(realFile), "..", "..");
}

export default function skillRoots(pi: ExtensionAPI) {
	pi.on("resources_discover", () => {
		const holocronDir = resolveHolocronDir();
		const skillPaths: string[] = [join(holocronDir, "skills")];

		const memoryDir = process.env.HOLOCRON_MEMORY_DIR;
		if (memoryDir) {
			const privateSkills = join(memoryDir, "skills");
			if (existsSync(privateSkills)) {
				skillPaths.push(privateSkills);
			}
		}

		return { skillPaths };
	});
}

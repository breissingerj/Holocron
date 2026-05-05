/**
 * Shared PRD parsing utilities for Holocron pi extensions.
 *
 * Used by prd-sidebar and future extensions that need to read PRD state
 * (e.g., holocron-prd-sync, holocron-load-context).
 *
 * PRD location: $HOLOCRON_MEMORY_DIR/WORK/{slug}/PRD.md
 * Format: YAML frontmatter + markdown body
 */

import * as fs from "node:fs";
import * as path from "node:path";

export interface PrdFrontmatter {
	task?: string;
	slug?: string;
	effort?: string;
	phase?: string;
	progress?: string;
	mode?: string;
	started?: string;
	updated?: string;
	iteration?: string;
}

export interface Criterion {
	done: boolean;
	/** e.g. "ISC-1" or "ISC-1A" */
	id: string;
	text: string;
}

export interface ParsedPrd {
	frontmatter: PrdFrontmatter;
	criteria: Criterion[];
	/** Raw markdown body after frontmatter */
	body: string;
	filePath: string;
}

/** Parse YAML frontmatter from PRD content. */
export function parseFrontmatter(content: string): { fm: PrdFrontmatter; body: string } {
	const fm: PrdFrontmatter = {};
	const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (!match) return { fm, body: content };

	for (const line of (match[1] ?? "").split("\n")) {
		const kv = line.match(/^(\w+):\s*(.+)$/);
		if (kv) {
			const key = kv[1] as keyof PrdFrontmatter;
			fm[key] = kv[2]!.trim();
		}
	}

	return { fm, body: match[2] ?? "" };
}

/** Parse `- [x] ISC-N: text` lines from the PRD body. */
export function parseCriteria(body: string): Criterion[] {
	const results: Criterion[] = [];
	for (const line of body.split("\n")) {
		const m = line.match(/^-\s+\[(x| )\]\s+(ISC-\d+[A-Z]*):\s+(.+)$/);
		if (m) results.push({ done: m[1] === "x", id: m[2]!, text: m[3]! });
	}
	return results;
}

/** Parse a full PRD.md file. Returns null if unreadable. */
export function parsePrd(filePath: string): ParsedPrd | null {
	try {
		const content = fs.readFileSync(filePath, "utf-8");
		const { fm, body } = parseFrontmatter(content);
		return { frontmatter: fm, criteria: parseCriteria(body), body, filePath };
	} catch {
		return null;
	}
}

/**
 * Find the most recently modified PRD.md under workDir.
 * workDir is typically $HOLOCRON_MEMORY_DIR/WORK/.
 */
export function findLatestPrd(workDir: string): string | null {
	try {
		if (!fs.existsSync(workDir)) return null;

		let latest: { filePath: string; mtime: number } | null = null;

		for (const entry of fs.readdirSync(workDir, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue;
			const prdPath = path.join(workDir, entry.name, "PRD.md");
			try {
				const stat = fs.statSync(prdPath);
				if (!latest || stat.mtimeMs > latest.mtime) {
					latest = { filePath: prdPath, mtime: stat.mtimeMs };
				}
			} catch {
				// No PRD.md in this slug dir
			}
		}

		return latest?.filePath ?? null;
	} catch {
		return null;
	}
}

/** Resolve WORK directory from environment. */
export function getWorkDir(): string | null {
	return process.env.HOLOCRON_MEMORY_DIR
		? path.join(process.env.HOLOCRON_MEMORY_DIR, "WORK")
		: null;
}

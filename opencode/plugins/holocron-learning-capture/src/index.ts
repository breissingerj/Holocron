import type { Plugin } from "@opencode-ai/plugin";
import { appendFile, mkdir, writeFile } from "fs/promises";
import { join } from "path";

/**
 * holocron-learning-capture — Milestone 8: Learning Feedback Loop
 *
 * Detects explicit ratings and implicit sentiment from user messages.
 * Appends signals to LEARNING/SIGNALS/ratings.jsonl.
 * Writes a structured learning .md on low ratings (≤ 4).
 *
 * Hook strategy:
 *   chat.message → inspect user message parts for rating signals
 */

const PLUGIN_TAG = "[holocron-learning-capture]";

// ── Rating detection ──────────────────────────────────────────────────────────

/**
 * Explicit rating patterns (case-insensitive):
 *   "7/10"  "10/10"  "rate: 8"  "rating: 3"  "score: 9"
 *
 * Deliberately tight — must appear at word boundary and NOT be preceded by
 * digit-like context (e.g. "line 7/10" won't match because "line " doesn't
 * match the leading boundary group).
 */
const EXPLICIT_RATING_RE =
  /(?:^|[\s,.:!?])(?:rate[d]?|rating|score)[:\s]+([1-9]|10)(?:\s*\/\s*10)?\b|(?:^|[\s])([1-9]|10)\s*\/\s*10(?:[.\s!]|$)/i;

export function detectExplicitRating(text: string): number | null {
  const m = EXPLICIT_RATING_RE.exec(text);
  if (!m) return null;
  const raw = m[1] ?? m[2];
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return n >= 1 && n <= 10 ? n : null;
}

// ── Implicit sentiment ────────────────────────────────────────────────────────

const CORRECTION_PATTERNS = [
  /\bwrong\b/i,
  /\bno,\s/i,
  /that'?s not\b/i,
  /\bincorrect\b/i,
  /\bfix that\b/i,
  /you missed\b/i,
  /not what i (asked|wanted|meant)/i,
  /\bplease redo\b/i,
  /\bthat's wrong\b/i,
  /\bstop doing\b/i,
];

const POSITIVE_PATTERNS = [
  /\bperfect\b/i,
  /\bexactly\b/i,
  /\bgreat work\b/i,
  /\bwell done\b/i,
  /\bnice work\b/i,
  /\bthat'?s it\b/i,
  /\bnailed it\b/i,
];

export type ImplicitSentiment = {
  rating: number;
  summary: string;
  confidence: number;
} | null;

export function detectImplicitSentiment(text: string): ImplicitSentiment {
  for (const pat of CORRECTION_PATTERNS) {
    if (pat.test(text)) {
      return {
        rating: 3,
        summary: `Correction signal detected: "${pat.source}"`,
        confidence: 0.7,
      };
    }
  }
  for (const pat of POSITIVE_PATTERNS) {
    if (pat.test(text)) {
      return {
        rating: 8,
        summary: `Positive signal detected: "${pat.source}"`,
        confidence: 0.75,
      };
    }
  }
  return null;
}

// ── JSONL entry ───────────────────────────────────────────────────────────────

export type RatingEntry = {
  timestamp: string;
  rating: number;
  session_id: string;
  source: "explicit" | "implicit";
  sentiment_summary: string;
  confidence: number;
  response_preview: string;
};

export function buildRatingEntry(
  rating: number,
  sessionId: string,
  source: "explicit" | "implicit",
  sentimentSummary: string,
  confidence: number,
  messagePreview: string
): RatingEntry {
  return {
    timestamp: new Date().toISOString(),
    rating,
    session_id: sessionId,
    source,
    sentiment_summary: sentimentSummary,
    confidence,
    response_preview: messagePreview.slice(0, 300),
  };
}

// ── Learning .md writer ───────────────────────────────────────────────────────

export async function writeLearningFile(
  memoryDir: string,
  entry: RatingEntry,
  messageText: string
): Promise<void> {
  const now = new Date(entry.timestamp);
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const min = String(now.getUTCMinutes()).padStart(2, "0");
  const ss = String(now.getUTCSeconds()).padStart(2, "0");

  const dir = join(memoryDir, "LEARNING", "CAPTURES", `${yyyy}-${mm}`);
  await mkdir(dir, { recursive: true });

  const filename = `${yyyy}-${mm}-${dd}-${hh}${min}${ss}_LEARNING_sentiment-rating-${entry.rating}.md`;
  const path = join(dir, filename);

  const content = `---
capture_type: LEARNING
timestamp: ${yyyy}-${mm}-${dd} ${hh}:${min}:${ss} UTC
rating: ${entry.rating}
source: ${entry.source}
auto_captured: true
tags: [sentiment-detected, ${entry.source}-rating, improvement-opportunity]
---

# ${entry.source === "explicit" ? "Explicit" : "Implicit"} Low Rating Captured: ${entry.rating}/10

**Date:** ${yyyy}-${mm}-${dd}
**Rating:** ${entry.rating}/10
**Detection Method:** ${entry.source === "explicit" ? "Explicit user rating" : "Sentiment Analysis"}
**Feedback:** ${entry.sentiment_summary}

---

## Context

${messageText.trim()}

---

## Improvement Notes

This response was rated ${entry.rating}/10. Use this as an improvement opportunity.

---
`;

  await writeFile(path, content, "utf-8");
}

// ── Signal appender ───────────────────────────────────────────────────────────

export async function appendSignal(
  memoryDir: string,
  entry: RatingEntry
): Promise<void> {
  const dir = join(memoryDir, "LEARNING", "SIGNALS");
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, "ratings.jsonl");
  await appendFile(filePath, JSON.stringify(entry) + "\n", "utf-8");
}

// ── Plugin export ─────────────────────────────────────────────────────────────

export const HolocronLearningCapture: Plugin = async ({ client }) => {
  return {
    "chat.message": async (input, output) => {
      const memoryDir = process.env.HOLOCRON_MEMORY_DIR;
      if (!memoryDir) return;

      // Extract user text from parts
      const parts = output.parts ?? [];
      const messageText = parts
        .filter((p: any) => p.type === "text")
        .map((p: any) => p.text ?? "")
        .join(" ")
        .trim();

      if (!messageText) return;

      const sessionId = input.sessionID;

      // 1. Try explicit rating first
      const explicitRating = detectExplicitRating(messageText);
      if (explicitRating !== null) {
        const entry = buildRatingEntry(
          explicitRating,
          sessionId,
          "explicit",
          `Explicit rating: ${explicitRating}/10`,
          1.0,
          messageText
        );
        try {
          await appendSignal(memoryDir, entry);
          if (explicitRating <= 4) {
            await writeLearningFile(memoryDir, entry, messageText);
          }
        } catch (err) {
          await client.app.log({
            body: { service: PLUGIN_TAG, level: "error", message: `Failed to write signal: ${err}` },
          });
        }
        return;
      }

      // 2. Try implicit sentiment
      const implicit = detectImplicitSentiment(messageText);
      if (implicit) {
        const entry = buildRatingEntry(
          implicit.rating,
          sessionId,
          "implicit",
          implicit.summary,
          implicit.confidence,
          messageText
        );
        try {
          await appendSignal(memoryDir, entry);
          if (implicit.rating <= 4) {
            await writeLearningFile(memoryDir, entry, messageText);
          }
        } catch (err) {
          await client.app.log({
            body: { service: PLUGIN_TAG, level: "error", message: `Failed to write signal: ${err}` },
          });
        }
      }
    },
  };
};

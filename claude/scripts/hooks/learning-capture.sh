#!/usr/bin/env bash
# learning-capture.sh — Capture explicit ratings and implicit sentiment from user prompts
#
# Claude CLI equivalent of: chat.message in holocron-learning-capture
# Hook event: UserPromptSubmit
# Async: true
#
# DUAL-MAINTENANCE: Keep in sync with plugins/holocron-learning-capture/src/index.ts
# Detection regexes, rating thresholds (explicit patterns, implicit keywords, low-rating
# threshold ≤4), JSONL field names in ratings.jsonl, and capture .md file format in
# LEARNING/CAPTURES/ must all match between both files.
#
# NOTE: Buffer ALL stdin into a variable BEFORE any jq calls.
# Claude CLI sends hook input to stdin once — consuming it twice silently returns empty.

mem_dir="${HOLOCRON_MEMORY_DIR:-}"
[ -z "$mem_dir" ] && exit 0

# Buffer stdin once
input=$(cat)

prompt=$(echo "$input" | jq -r '.prompt // ""' 2>/dev/null)
session_id=$(echo "$input" | jq -r '.session_id // "unknown"' 2>/dev/null)

[ -z "$prompt" ] && exit 0

# ── Explicit rating detection ────────────────────────────────────────────────
# Patterns: "7/10", "8 / 10", "rating: 8", "score: 9", "rate: 6", "rated 7"
rating=$(echo "$prompt" | grep -oiE '(rating|score|rate[d]?)[: ]+([1-9]|10)(/10)?' \
  | grep -oE '[1-9][0-9]?|10' | head -1)

if [ -z "$rating" ]; then
  # Bare "7/10" or "8 / 10" pattern
  rating=$(echo "$prompt" | grep -oE '\b([1-9]|10)\s*/\s*10\b' \
    | grep -oE '[1-9][0-9]?|10' | head -1)
fi

if [ -n "$rating" ]; then
  source="explicit"
  summary="Explicit rating: ${rating}/10"
else
  # ── Implicit sentiment detection ───────────────────────────────────────────
  if echo "$prompt" | grep -qiE '\b(wrong|incorrect|fix that|you missed|not what i (asked|wanted|meant)|please redo|stop doing|thats wrong|that'"'"'s wrong)\b'; then
    rating=3; source="implicit"; summary="Correction signal detected"
  elif echo "$prompt" | grep -qiE '\b(perfect|exactly|great work|well done|nice work|nailed it|that'"'"'s it|thats it)\b'; then
    rating=8; source="implicit"; summary="Positive signal detected"
  fi
fi

[ -z "$rating" ] && exit 0

# ── Write signal to ratings.jsonl ────────────────────────────────────────────
signals_dir="$mem_dir/LEARNING/SIGNALS"
mkdir -p "$signals_dir"

ts=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
preview=$(echo "$prompt" | head -c 300 | sed 's/"/\\"/g' | tr '\n' ' ')
summary_escaped="${summary//\"/\\\"}"

printf '{"timestamp":"%s","rating":%s,"session_id":"%s","source":"%s","sentiment_summary":"%s","confidence":0.9,"response_preview":"%s"}\n' \
  "$ts" "$rating" "$session_id" "$source" "$summary_escaped" "$preview" \
  >> "$signals_dir/ratings.jsonl"

# ── Write learning capture for low ratings (≤ 4) ─────────────────────────────
if [ "$rating" -le 4 ] 2>/dev/null; then
  mm=$(date -u +%Y-%m)
  captures_dir="$mem_dir/LEARNING/CAPTURES/$mm"
  mkdir -p "$captures_dir"
  fname="${ts//:/-}_LEARNING_sentiment-rating-${rating}.md"

  # Capitalize source for display
  source_cap="$(echo "${source:0:1}" | tr '[:lower:]' '[:upper:]')${source:1}"

  cat > "$captures_dir/$fname" <<MDEOF
---
capture_type: LEARNING
timestamp: $ts
rating: $rating
source: $source
auto_captured: true
tags: [sentiment-detected, ${source}-rating, improvement-opportunity]
---

# ${source_cap} Low Rating: ${rating}/10

**Date:** $(date -u +%Y-%m-%d)
**Rating:** ${rating}/10
**Feedback:** $summary

---

## Context

$(echo "$prompt" | head -c 2000)

---
MDEOF
fi

exit 0

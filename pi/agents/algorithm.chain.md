---
name: algorithm
description: Full Holocron Algorithm — all 8 phases. Pass your task as the argument. OBSERVE creates the PRD, downstream agents read its path from observe-output.md.
---

## algorithm-observe
output: observe-output.md
outputMode: file-only
progress: true

## algorithm-think
reads: observe-output.md
output: think-output.md
outputMode: file-only
progress: true

## algorithm-plan
reads: think-output.md
output: plan-output.md
outputMode: file-only
progress: true

## algorithm-build
reads: observe-output.md, plan-output.md
output: build-output.md
outputMode: file-only
progress: true

## algorithm-execute
reads: plan-output.md, build-output.md
output: execute-output.md
outputMode: file-only
progress: true

## algorithm-verify
reads: execute-output.md
output: verify-output.md
outputMode: file-only
progress: true

## algorithm-learn
reads: observe-output.md, verify-output.md
progress: true

## algorithm-summarize
reads: observe-output.md, think-output.md, plan-output.md, execute-output.md, verify-output.md
progress: true

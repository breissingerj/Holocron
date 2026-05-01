---
name: algorithm
description: Full Holocron Algorithm — all 8 phases. Pass your task as the argument. OBSERVE creates the PRD, downstream agents read its path from observe-output.md.
---

## algorithm-observe
output: observe-output.md

## algorithm-think
reads: observe-output.md
output: think-output.md

## algorithm-plan
reads: think-output.md
output: plan-output.md

## algorithm-build
reads: observe-output.md, plan-output.md
output: build-output.md

## algorithm-execute
reads: plan-output.md, build-output.md
output: execute-output.md

## algorithm-verify
reads: execute-output.md
output: verify-output.md

## algorithm-learn
reads: verify-output.md

## algorithm-summarize
reads: observe-output.md, think-output.md, plan-output.md, execute-output.md, verify-output.md
output: false

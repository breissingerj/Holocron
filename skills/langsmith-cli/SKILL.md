---
name: langsmith-cli
description: Query and manage LangSmith resources — traces, runs, datasets, evaluators, experiments, threads, insights, and projects. USE WHEN langsmith, trace, run, dataset, experiment, evaluator, thread, insight, LangSmith project, LangChain trace, LLM trace, eval dataset, trace export, run export, conversation thread, LangSmith project list, LangSmith insight, langsmith CLI.
allowed-tools: Bash(langsmith*)
---

# LangSmith CLI

Scriptable access to LangSmith traces, runs, datasets, evaluators, experiments, threads, and insights. All commands output JSON by default; use `--format pretty` for human-readable tables.

---

## Authentication (MANDATORY FIRST STEP)

**Before running any command**, check for an API key:

```bash
bash -c 'echo "${LANGSMITH_API_KEY:-MISSING}"'
```

**If the output is `MISSING`:**

Ask the user:

> I need a LangSmith API key to proceed. Please run the following in the prompt (the `!` prefix executes it in this session):
>
> ```
> ! export LANGSMITH_API_KEY=<your-key>
> ```
>
> You can find or create API keys at https://smith.langchain.com → Settings → API Keys.
> The key is project-specific — it won't be stored anywhere permanently.

**Once the key is set**, all subsequent `langsmith` commands will pick it up automatically via the environment.

**IMPORTANT:** The env var set by the user may not persist into tool invocations. Always pass the key inline to be safe:
```bash
LANGSMITH_API_KEY=$LANGSMITH_API_KEY langsmith project list --format pretty
```

**Alternative (one-off):** Pass the key inline for a single command:
```bash
langsmith --api-key <key> project list
```

**Optional:** Set a default project so `--project` can be omitted:
```bash
export LANGSMITH_PROJECT=my-project-name
```

---

## Quick Start

```bash
# List your tracing projects
langsmith project list --format pretty

# See the last 5 traces in a project
langsmith trace list --project my-app --limit 5 --format pretty

# Inspect a single trace (full run tree)
langsmith trace get <trace-id> --project my-app --format pretty

# List recent LLM calls
langsmith run list --project my-app --run-type llm --limit 10 --format pretty

# List evaluation datasets
langsmith dataset list --format pretty

# See experiments for a dataset
langsmith experiment list --dataset my-eval-dataset --format pretty
```

---

## Command Reference

### `project` — Tracing Projects

```bash
# List projects (most recently active first)
langsmith project list
langsmith project list --limit 10
langsmith project list --name-contains chatbot
langsmith project list --format pretty
```

---

### `trace` — End-to-End Traces

A trace = full invocation tree (root run + all child runs).

```bash
# List traces
langsmith trace list --project my-app --limit 20
langsmith trace list --project my-app --limit 5 --format pretty

# Get a single trace (all runs in the tree)
langsmith trace get <trace-id> --project my-app
langsmith trace get <trace-id> --project my-app --full   # include run inputs/outputs
langsmith trace get <trace-id> --project my-app --format pretty

# Export traces to a directory (one JSONL file per trace)
langsmith trace export ./traces --project my-app --limit 20 --full
```

---

### `run` — Individual Runs

A run = single step at any depth (LLM call, tool call, chain step, etc.).

```bash
# List runs
langsmith run list --project my-app --limit 50
langsmith run list --project my-app --run-type llm --limit 10
langsmith run list --project my-app --run-type tool --limit 20
langsmith run list --project my-app --format pretty

# Get a single run by ID
langsmith run get <run-id>
langsmith run get <run-id> --full   # include inputs/outputs

# Export runs to a JSONL file
langsmith run export runs.jsonl --project my-app --run-type llm
```

**`--run-type` values:** `llm`, `tool`, `chain`, `retriever`, `embedding`, `prompt`, `parser`

---

### `dataset` — Evaluation Datasets

```bash
# List datasets
langsmith dataset list
langsmith dataset list --format pretty

# Get dataset details
langsmith dataset get my-dataset
langsmith dataset get <uuid>

# Create an empty dataset
langsmith dataset create --name my-dataset

# Upload from a JSON file
langsmith dataset upload data.json --name new-dataset

# Export dataset examples to a JSON file
langsmith dataset export my-dataset ./export.json

# Delete a dataset
langsmith dataset delete my-dataset --yes
```

---

### `example` — Dataset Examples

```bash
# Individual examples within a dataset
langsmith example list --dataset my-dataset
langsmith example get <example-id>
```

---

### `experiment` — Evaluation Experiments

```bash
# List experiments
langsmith experiment list
langsmith experiment list --dataset my-eval-dataset
langsmith experiment list --format pretty

# Get detailed results for an experiment
langsmith experiment get my-experiment-name
langsmith experiment get my-experiment-name --format pretty
```

---

### `evaluator` — Evaluator Rules

Evaluators are Python/TypeScript functions that auto-score runs.

```bash
# List evaluators
langsmith evaluator list
langsmith evaluator list --format pretty

# Upload an evaluator (Python)
langsmith evaluator upload eval.py --name accuracy --function check_accuracy --dataset my-eval-set

# Upload an evaluator (TypeScript)
langsmith evaluator upload eval.ts --name accuracy --function checkAccuracy --dataset my-eval-set

# Delete an evaluator
langsmith evaluator delete accuracy --yes
```

---

### `thread` — Conversation Threads

Groups multi-turn runs sharing a `thread_id`.

```bash
# List threads in a project
langsmith thread list --project my-chatbot --limit 20
langsmith thread list --project my-chatbot --format pretty

# Get all turns in a thread
langsmith thread get <thread-id> --project my-chatbot
langsmith thread get <thread-id> --project my-chatbot --full
langsmith thread get <thread-id> --project my-chatbot --format pretty
```

---

### `insights` — AI-Generated Project Insights

Hierarchical analysis of traces: usage patterns, failure modes, behaviors.

```bash
# List insight reports for a project
langsmith insights list --project my-app
langsmith insights list --project my-app --format pretty

# Get a detailed insight report
langsmith insights get <insight-id> --project my-app
langsmith insights get <insight-id> --project my-app --format pretty
```

---

## Output Formats

| Flag | Best For |
|------|----------|
| `--format pretty` | Interactive use — tables, trees, syntax-highlighted JSON |
| `--format json` | Scripting, piping to `jq`, agent automation (default) |

**Default is JSON.** Add `--format pretty` for any command you're reading interactively.

**Tip — pipe JSON to jq:**
```bash
langsmith trace list --project my-app --limit 5 | jq '.[].id'
langsmith run list --project my-app --run-type llm | jq '.[] | {id, name, latency: .end_time}'
```

---

## Global Flags

| Flag | Env Var | Description |
|------|---------|-------------|
| `--api-key` | `LANGSMITH_API_KEY` | Authentication key |
| `--api-url` | `LANGSMITH_ENDPOINT` | Override for self-hosted instances |
| `--format` | — | `json` (default) or `pretty` |

---

## Common Workflows

**Debug a failing trace:**
```bash
LANGSMITH_API_KEY=$LANGSMITH_API_KEY langsmith trace list --project my-app --limit 10 --format pretty
# find the failing trace ID, then:
LANGSMITH_API_KEY=$LANGSMITH_API_KEY langsmith trace get <trace-id> --project my-app --full --format pretty
```

**Export LLM calls for analysis:**
```bash
LANGSMITH_API_KEY=$LANGSMITH_API_KEY langsmith run export llm-calls.jsonl --project my-app --run-type llm
```

**Check experiment results:**
```bash
LANGSMITH_API_KEY=$LANGSMITH_API_KEY langsmith experiment list --dataset my-eval-dataset --format pretty
LANGSMITH_API_KEY=$LANGSMITH_API_KEY langsmith experiment get <experiment-name> --format pretty
```

**Audit conversation threads:**
```bash
LANGSMITH_API_KEY=$LANGSMITH_API_KEY langsmith thread list --project my-chatbot --limit 20 --format pretty
LANGSMITH_API_KEY=$LANGSMITH_API_KEY langsmith thread get <thread-id> --project my-chatbot --full --format pretty
```

---

## REST API Navigation Guide

The `langsmith` CLI has known gaps. Use `curl` + the REST API directly for investigation tasks.

### Key gotchas

| Gotcha | Reality | Fix |
|--------|---------|-----|
| `langsmith thread get <id>` returns 0 runs | CLI thread lookup is unreliable | Use REST API `/runs/query` with `metadata_key/metadata_value` filter or time-window search |
| LangGraph checkpoint ID ≠ LangSmith thread ID | The `id` in `{"v":4,"id":"..."}` is the checkpoint ID, not the thread ID | Find the real thread ID by querying root runs and reading their `thread_id` field |
| `trace: [root_id]` filter returns 0 child runs | The `trace` filter in `/runs/query` is unreliable | Use a time-window filter on `start_time` instead |
| Env var not picked up | `LANGSMITH_API_KEY` set in shell may not persist to Bash tool | Always pass inline: `LANGSMITH_API_KEY=... langsmith ...` |

### Finding a specific conversation turn

```bash
# 1. Get the project ID from the project list
curl -s "https://api.smith.langchain.com/api/v1/projects" \
  -H "x-api-key: $KEY" | python3 -c "import sys,json; [print(p['name'], p['id']) for p in json.load(sys.stdin)]"

# 2. Find the right root run by searching near a timestamp and parsing user messages
curl -s -X POST "https://api.smith.langchain.com/api/v1/runs/query" \
  -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  -d '{
    "session": ["<project-id>"],
    "filter": "and(gt(start_time, \"2026-01-01T00:00:00\"), lt(start_time, \"2026-01-01T01:00:00\"), eq(is_root, true))",
    "limit": 50
  }' | python3 -c "
import sys,json
for r in json.load(sys.stdin).get('runs',[]):
    msgs = r.get('inputs',{}).get('messages',[])
    humans = [m.get('kwargs',{}).get('content','') for m in msgs if 'HumanMessage' in str(m.get('id',[]))]
    if humans:
        print(r.get('start_time','')[11:19], '| thread:', r.get('thread_id','?')[:8], '| user:', humans[-1][:80])
"

# 3. Once you have the root run timestamp, get ALL runs in that trace by time window
curl -s -X POST "https://api.smith.langchain.com/api/v1/runs/query" \
  -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  -d '{
    "session": ["<project-id>"],
    "filter": "and(gt(start_time, \"<root_time-5s>\"), lt(start_time, \"<root_time+60s>\"))",
    "limit": 100
  }' | python3 -c "
import sys,json
for r in json.load(sys.stdin).get('runs',[]):
    outputs = json.dumps(r.get('outputs',{}))
    flag = ' <-- MATCH' if 'keyword' in outputs.lower() else ''
    print(f'[{r.get(\"run_type\")}] {r.get(\"name\")} {r.get(\"start_time\",\"\")[11:19]}{flag}')
"
```

### Finding which node produced specific output text

```python
# Parse all runs in a time window, flag any whose outputs contain target text
import sys, json

KEY = "<your-key>"
TARGET = "text to find"

# (after fetching runs via curl above)
for r in runs:
    outputs = json.dumps(r.get('outputs', {}))
    if TARGET.lower() in outputs.lower():
        print(f"MATCH: [{r['run_type']}] {r['name']} ({r['id'][:8]})")
        print(f"  parent: {r.get('parent_run_id','root')}")
        print(f"  output: {outputs[:300]}")
```

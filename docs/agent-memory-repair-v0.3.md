# Agent Memory Repair v0.3

This phase extends Gate 5 from one-shot belief repair to durable AgentTx memory repair.

## Scope

AgentTx can repair only the memory state it controls:

```text
.agenttx/memory/belief_memory.jsonl
.agenttx/memory/memory_repair_log.jsonl
```

It does not edit Claude Code private memory, model-provider memory, IDE history, or OS-level state outside the transaction workspace.

## Memory records

Each memory record contains:

| Field | Meaning |
|---|---|
| `memory_id` | Stable record id |
| `tx_id` | Source transaction |
| `type` | `tool_observation`, `agent_claim`, `task_summary`, `recovery_context`, `memory_write`, or `planner_update` |
| `content` | Human-readable memory content |
| `truth_status` | `verified`, `unverified`, `contradicted`, or `invalidated` |
| `taint_status` | `clean`, `tainted`, or `repaired` |
| `retrievable` | Whether later AgentTx logic may reuse this memory |
| `depends_on_effects` | Effect ids that support or taint the memory |
| `depends_on_memory` | Prior memory ids this record depends on |

## Failed command repair flow

When a transaction contains `command.failed`, AgentTx now:

1. Adds a verified `tool_observation` memory record for the failed command.
2. Adds an `agent_claim` memory record for the possible false success claim.
3. Marks the false success claim as `invalidated`, `repaired`, and `retrievable=false`.
4. Installs a clean verified `task_summary` memory record.
5. Writes `memory_repair` into `belief_report.json`.
6. Appends repair events to `memory_repair_log.jsonl`.
7. Injects a clean summary into Claude `additionalContext`.

## Repair guarantees

AgentTx verifies:

- no tainted memory record remains retrievable;
- the clean summary is retrievable;
- invalidated memory ids are recorded in `belief_report.json`;
- the Claude context says not to reuse invalidated memory.

## Memory Capsule Injection

AgentTx can reuse repaired memory through a small pre-action capsule instead of replaying the full memory stream.

Before Claude Code runs a Bash command, AgentTx may inject:

```text
AgentTx Memory Capsule:
- Previous npm install left-pad failed. Do not assume the package is installed. Restored: package.json. Re-check verified state before continuing.
```

The capsule is intentionally small and filtered:

- only `retrievable=true`, `truth_status=verified`, and `taint_status=clean` records are eligible;
- invalidated, tainted, repaired-but-not-clean, or non-retrievable memory is never injected;
- `agent_claim` records are not injected, even if repaired;
- SAFE commands such as `pwd`, `git status`, and `git diff --stat` do not receive capsules;
- each capsule selects at most 3 memory records;
- the default capsule budget is 800 characters.

Capsules are meant to reduce repeated false assumptions. They are not a full long-term memory replay.

## Artifacts

For a repaired failed transaction, inspect:

```text
.agenttx/transactions/<tx_id>/belief_report.json
.agenttx/memory/belief_memory.jsonl
.agenttx/memory/memory_repair_log.jsonl
```

## Validation

Run:

```bash
npm run check:gate5
npm run check:memory-capsule
```

The checks create a failed package command, verify the belief report, verify the memory store, confirm that tainted memory is no longer retrievable, and confirm that only clean relevant memory is injected before similar future commands.

## Limitations

- AgentTx does not rewrite Claude's private hidden context.
- AgentTx does not call a model judge for memory truth.
- AgentTx does not repair arbitrary third-party memory stores.
- AgentTx repairs externalized transaction memory and injects verified state back into Claude Code.
- Memory Capsule is controlled context injection, not full memory synchronization.

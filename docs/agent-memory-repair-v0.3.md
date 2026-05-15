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
```

The check creates a failed package command, verifies the belief report, verifies the memory store, and confirms that tainted memory is no longer retrievable.

## Limitations

- AgentTx does not rewrite Claude's private hidden context.
- AgentTx does not call a model judge for memory truth.
- AgentTx does not repair arbitrary third-party memory stores.
- AgentTx repairs externalized transaction memory and injects verified state back into Claude Code.

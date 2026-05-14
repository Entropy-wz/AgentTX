# Transaction Schema v0.3

Gate 1 upgrades AgentTx from engineering logs to standard transaction artifacts.

Every Claude hook transaction should create:

```text
.agenttx/
  transactions/
    tx_xxx/
      request.json
      risk.json
      snapshot_before.json
      snapshot_after.json
      effects.jsonl
      effect_graph.json
      recovery_contracts.json
      recovery_report.json
      belief_report.json
      verifier_report.json
```

Legacy v0.2 files are still written for compatibility:

```text
transaction.json
risk_report.json
effect_report.json
recovery.md
```

## Required Gate 1 files

| File | Purpose |
|---|---|
| `request.json` | Agent command, intent placeholder, cwd, host, tool, session/tool ids |
| `risk.json` | Risk level, score, reasons, decision, policy mode |
| `effects.jsonl` | Typed effect stream |
| `effect_graph.json` | Gate 3 graph with command, effect, dependency, belief-taint, and recovery-requirement edges |
| `recovery_contracts.json` | Placeholder contract list |
| `recovery_report.json` | Structured recovery context when needed |
| `belief_report.json` | Recovery context recorded as belief evidence when needed |
| `verifier_report.json` | Placeholder verifier report |

## request.json

Required fields:

```text
schema_version
tx_id
agent
host
tool_name
command
cwd
git_root
intent
created_at
raw_request
```

`intent` is `null` in Gate 1. Intent extraction belongs to a later frontend gate.

## risk.json

This mirrors the Core risk report:

```text
score
level
reasons
decision
policyMode
```

Valid levels:

```text
SAFE, LOW, MEDIUM, HIGH, CRITICAL
```

## effects.jsonl

Each line is a valid JSON object. Gate 1 emits typed effects for:

```text
command.blocked
command.failed
filesystem.create
filesystem.modify
filesystem.delete
config.modify
```

`config.modify` is derived from sensitive configuration file changes and can coexist with `filesystem.modify`.

## effect_graph.json

Gate 3 rebuilds a graph from `effects.jsonl`:

```json
{
  "nodes": [],
  "edges": []
}
```

Every typed effect has a node. The graph also records command-to-effect causal edges, package manifest-to-lockfile dependency edges, failed-command belief-taint edges, and high-risk recovery requirements.

## recovery_report.json

Gate 1 writes:

```text
status: not_required | required
recovery_context
legacy_recovery_md
```

Recovery execution is not implemented in Gate 1.

## belief_report.json

When recovery context exists, Gate 1 records it as a verified `recovery_context` belief record. This is not full belief repair.

## verifier_report.json

Gate 1 initializes a valid report with:

```text
result: not_run
```

Actual state/effect/belief verification starts in later gates.

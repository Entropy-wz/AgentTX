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
| `recovery_contracts.json` | Gate 4 recovery contracts for file restore, created-file deletion, manual review, or residual warning |
| `recovery_report.json` | Gate 4 recovery execution summary plus legacy recovery context reference when present |
| `belief_report.json` | Gate 5 belief repair report with invalidated claims, verified state, clean summary, and benchmark fields |
| `verifier_report.json` | Gate 4 verification result for each recovery contract |

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
external.network
```

`config.modify` is derived from sensitive configuration file changes and can coexist with `filesystem.modify`.
`external.network` is used for mock or future external effects and is never treated as automatically reversible.

## effect_graph.json

Gate 3 rebuilds a graph from `effects.jsonl`:

```json
{
  "nodes": [],
  "edges": []
}
```

Every typed effect has a node. The graph also records command-to-effect causal edges, package manifest-to-lockfile dependency edges, failed-command belief-taint edges, and high-risk recovery requirements.

## recovery_contracts.json

Gate 4 writes contracts with:

```text
contract_id
effect_id
required_action
target
blocking
reversible
verification
status
residual_warning
```

Supported actions are `restore_file`, `delete_created_file`, `manual_review`, and `residual_warning`.

## recovery_report.json

Gate 4 writes:

```text
status: not_required | recovered | partially_recovered | unrecoverable
contracts_total
executed_contracts
failed_contracts
manual_contracts
residual_warnings
legacy_recovery_md
```

## belief_report.json

Gate 5 writes:

```text
tainted_claims
verified_state
repair_actions
clean_summary
metrics
```

For failed commands, success claims are invalidated and Claude receives `clean_summary` as `additionalContext`.

## verifier_report.json

Gate 4 writes:

```text
status: recovered | partially_recovered | unrecoverable | not_needed
checks
residual_effects
residual_warnings
```

Verification is limited to file hash matching, created-file absence, manual-required checks, and unrecoverable external warnings.

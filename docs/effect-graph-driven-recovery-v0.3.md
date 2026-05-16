# Effect Graph Driven Recovery v0.3

This phase makes `effect_graph.json` part of recovery execution.

Before this phase, AgentTx built the effect graph but recovery contracts were generated from the flat `effects.jsonl` stream. Now AgentTx first builds a graph recovery plan and then generates contracts from that plan.

## Artifact

Each recovered transaction writes:

```text
graph_recovery_plan.json
```

The plan uses:

```text
agenttx.graph_recovery_plan.v0.3
```

## How the graph is used

AgentTx reads:

```text
effect_graph.json
effects.jsonl
snapshot_before.json
```

It uses graph edges as follows:

| Edge | Recovery use |
|---|---|
| `dependency` | Restores dependent files before their source files, for example lockfile before `package.json` |
| `derived_from` | Deduplicates semantic effects such as `config.modify` into the underlying file effect |
| `requires_recovery` | Preserves blocking/manual-review semantics on the merged recovery contract |

External effects such as `external.network` remain residual warnings. AgentTx does not pretend they are reversible.

## Fallback

If `effect_graph.json` is missing or incomplete, AgentTx falls back to legacy flat-effect recovery.

The fallback is visible in:

```text
graph_recovery_plan.json
recovery_report.json
```

Fallback exists for compatibility, but normal v0.3-alpha transactions should use graph mode.

## Validation

Run:

```bash
npm run check:graph-recovery
```

The check verifies package dependency ordering, config-effect deduplication, external residual handling, and fallback reporting.

## Limitations

- This does not add new effect types.
- This does not implement a recovery DSL.
- This does not add sandboxing or selective commit.
- Recovery still uses the existing restricted file restore, created-file delete, manual review, and residual-warning actions.

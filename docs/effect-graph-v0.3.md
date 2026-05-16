# Effect Graph v0.3

Gate 3 turns the typed effect stream into a transaction-level effect graph.

The goal is to move from a flat list such as "package.json changed" and "package-lock.json changed" to a graph that can explain why those changes matter together.

## Source files

The graph is rebuilt from the transaction directory:

```text
request.json
effects.jsonl
recovery_report.json
```

The output is:

```text
effect_graph.json
```

Gate 4 recovery now consumes this graph through:

```text
graph_recovery_plan.json
```

## Node types

| Node type | Meaning |
|---|---|
| `command.executed` | Command completed without a known blocking or failure effect |
| `command.blocked` | Command was denied before execution |
| `command.failed` | Command returned a non-zero exit code |
| `filesystem.create` | File appeared after the command |
| `filesystem.modify` | File changed after the command |
| `filesystem.delete` | File disappeared after the command |
| `config.modify` | Sensitive or agent configuration file changed |
| `belief.claim` | Agent-facing belief that may need correction |
| `recovery.required` | High-risk effect that requires explicit recovery review |

Every line in `effects.jsonl` must have a node in `effect_graph.json`.

## Edge types

| Relation | Meaning |
|---|---|
| `caused` | The command caused the observed effect |
| `dependency` | One effect depends on another effect |
| `may_taint` | A failed command may corrupt the agent's belief about success |
| `requires_recovery` | A high-risk effect requires explicit recovery review |
| `derived_from` | A semantic effect was derived from a lower-level file effect |

## Gate 3 rules

1. Add one command node per transaction.
2. Add one graph node for every typed effect.
3. Add `caused` edges from the command node to all typed effect nodes.
4. If a transaction has `command.failed`, add a `belief.claim` node and a `may_taint` edge.
5. If both `package.json` and a Node lockfile changed, add a `dependency` edge from `package.json` to the lockfile.
6. If a credential or configuration-adjacent file changed, add a `recovery.required` node and a `requires_recovery` edge.
7. If `config.modify` is derived from a `filesystem.*` effect, add a `derived_from` edge.

## Non-goals

Gate 3 itself does not execute recovery, prove causal necessity, or perform full belief repair. Gate 4 consumes the graph to order recovery, deduplicate semantic effects, and preserve residual warnings.

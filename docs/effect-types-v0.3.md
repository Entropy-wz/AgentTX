# Effect Types v0.3

Gate 1 introduces a minimal typed effect stream in `effects.jsonl`.

## Effect object

Each line has:

```text
effect_id
tx_id
type
target
status
recoverability
sensitive
expected
evidence
observed_at
```

## Types

| Type | Source | Meaning |
|---|---|---|
| `command.blocked` | PreToolUse deny | Command did not execute |
| `command.failed` | PostToolUse exit code | Command exited with non-zero status |
| `filesystem.create` | file effect | A file appeared after the command |
| `filesystem.modify` | file effect | A tracked or important file changed |
| `filesystem.delete` | file effect | A file was removed |
| `config.modify` | derived file effect | Sensitive or agent configuration changed |

## Recoverability

| Class | Meaning in Gate 1 |
|---|---|
| `R0` | No recovery needed because command was blocked |
| `R1` | File-level recovery likely possible from snapshot or git |
| `unknown` | Gate 1 cannot classify recovery yet |

## Non-goals

Gate 3 consumes this stream to build `effect_graph.json`. It adds graph-level package dependency, belief-taint, and recovery-requirement nodes or edges, but it does not add new effect rows to `effects.jsonl`.

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
| `package.modify` | derived file effect | Package metadata or lockfile changed |
| `env.modify` | derived file effect | Environment configuration changed |
| `credential.modify` | derived file effect | Credential-adjacent file changed |
| `service.config.modify` | derived file effect | Service configuration file changed |
| `config.modify` | derived file effect | Sensitive or agent configuration changed |
| `external.network` | mock/future external effect | External network-side effect that AgentTx cannot automatically revert |

## Recoverability

| Class | Meaning in Gate 1 |
|---|---|
| `R0` | No recovery needed because command was blocked |
| `R1` | File-level recovery likely possible from snapshot or git |
| `unknown` | Gate 1 cannot classify recovery yet |

## Non-goals

Semantic effects are derived from observable file changes. They do not claim real package manager, service, process, or network state capture.

Gate 3 consumes this stream to build `effect_graph.json`. Gate 4 consumes it to build graph recovery plans, recovery contracts, and verifier reports. External effects are represented as residual warnings rather than fake rollbacks.

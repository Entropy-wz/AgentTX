# Transaction Artifact Schema v0.3

Gate 1 defines the paper-core transaction artifact. Gate 3 fills the first runtime `effect_graph.json` from typed effects. Recovery contracts, verifier execution, and full belief repair remain later gates.

The schema is derived from the v2 transaction abstraction:

```text
T = <G, A, D, E, C, I, B, P, R>
```

Where:

| Symbol | Artifact field |
|---|---|
| G, A | `transaction.goal`, `transaction.assumptions` |
| D | `declared_scope` |
| E | `typed_effects` |
| C | `recovery_contracts` |
| I | `invariants` |
| B | `belief_records` |
| P | `commit_policy` |
| R | `recoverability` |

## Files

| Schema | Purpose |
|---|---|
| `schemas/transaction-artifact.schema.json` | Top-level artifact |
| `schemas/typed-effect.schema.json` | Typed side effect record |
| `schemas/effect-graph.schema.json` | Effect graph generated from typed effects |
| `schemas/recovery-contract.schema.json` | Verified recovery contract placeholder |
| `schemas/belief-record.schema.json` | Externalized belief record |
| `schemas/verifier-report.schema.json` | State/effect/belief verifier result |

Runtime Gate 1 files are described in:

- `docs/transaction-schema-v0.3.md`
- `docs/effect-types-v0.3.md`
- `docs/effect-graph-v0.3.md`

## Compatibility with v0.2

Gate 1 does not replace existing transaction files. It defines a new unified export:

```text
.agenttx/transactions/<tx_id>/transaction_artifact.json
```

Mapping from v0.2:

| v0.2 file | Artifact field |
|---|---|
| `transaction.json` | `transaction` |
| `risk_report.json` | `transaction.risk` |
| `snapshot_before.json` | `snapshots.before` |
| `snapshot_after.json` | `snapshots.after` |
| `effect_report.json` | `typed_effects`, initially converted from file effects |
| `recovery.md` | `recovery_context_ref`, `belief_records` summary evidence |

## Required artifact sections

```text
artifact_version
schema_version
transaction
declared_scope
snapshots
typed_effects
effect_graph
recovery_contracts
belief_records
verifier_report
legacy_refs
```

`effect_graph` is optional in old Gate 1 example exports and present in Gate 3 runtime transaction directories as `effect_graph.json`.

## Current non-goals

- Do not execute recovery contracts.
- Do not claim automatic rollback.
- Do not claim belief repair is implemented.
- Do not remove v0.2 transaction files.

## Example artifacts

- `examples/artifacts/git-clean-blocked.transaction_artifact.json`
- `examples/artifacts/failed-package-json.transaction_artifact.json`

These examples are intentionally small. They show how current v0.2 outputs map into the paper-core artifact shape.

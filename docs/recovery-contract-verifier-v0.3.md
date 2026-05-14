# Recovery Contract and Verifier v0.3

Gate 4 upgrades AgentTx from recovery guidance to restricted recovery execution and verification.

## Recovery contracts

`recovery_contracts.json` records one planned action per recoverable or residual effect.

Supported actions:

| Action | Meaning |
|---|---|
| `restore_file` | Restore a file from `files_before/` |
| `delete_created_file` | Remove a file created by the transaction |
| `manual_review` | The effect needs human or later-gate handling |
| `residual_warning` | The effect cannot be reverted by AgentTx |

Credential and configuration effects are always `blocking`. If a before snapshot exists, AgentTx restores them and still records that the transaction required blocking recovery review.

## Verification

`verifier_report.json` is written immediately after recovery execution.

Supported verification checks:

| Type | Meaning |
|---|---|
| `hash_match` | Restored file hash matches the before snapshot |
| `file_absent` | Created file no longer exists |
| `manual_required` | No automatic verification is possible |
| `unrecoverable_external` | External/mock effect is residual by design |

Verifier status:

| Status | Meaning |
|---|---|
| `recovered` | All contracts passed |
| `partially_recovered` | Some contracts passed and some remain residual |
| `unrecoverable` | No recovery contract could be verified |
| `not_needed` | No recovery contract was needed |

## Safety boundary

Gate 4 does not run arbitrary rollback commands. It only restores files copied into the transaction snapshot or deletes files that were created by the transaction. Network, process, service, and other external effects are reported as residual warnings.

# AgentTx v0.3-alpha Current Capability

This document describes what is implemented and testable in v0.3-alpha.

v0.3-alpha is a functionality validation phase. It is not a paper-writing phase and does not add new research features.

## Supported Host

| Host | Status |
|---|---|
| Claude Code | Supported through local plugin hooks |
| Codex | Not implemented |
| Docker sandbox | Not implemented |

## Implemented Features

- Claude Code plugin with Bash `PreToolUse` and `PostToolUse` hooks.
- Risk classification for shell commands.
- Standard transaction artifact directory under `.agenttx/transactions/<tx_id>/`.
- Typed effect capture for file, command, config, and mock external effects.
- Effect graph generation from typed effects.
- Recovery contract generation and restricted file recovery.
- Verifier report generation after recovery.
- Belief repair report for failed-command false success assumptions.
- Six-case mini benchmark.
- Baseline, ablation, and metric calculation for the mini benchmark.

## Transaction Artifacts

Each transaction can contain:

```text
request.json
risk.json
snapshot_before.json
snapshot_after.json
effects.jsonl
effect_graph.json
recovery_contracts.json
recovery_report.json
verifier_report.json
belief_report.json
```

Legacy compatibility files can also appear:

```text
transaction.json
risk_report.json
effect_report.json
recovery.md
```

## Supported Effect Types

| Effect type | Meaning |
|---|---|
| `command.blocked` | Command was denied before execution |
| `command.failed` | Command returned a non-zero exit code |
| `filesystem.create` | File appeared after command execution |
| `filesystem.modify` | File content changed |
| `filesystem.delete` | File disappeared |
| `config.modify` | Sensitive or agent configuration changed |
| `external.network` | Mock external network-side effect for residual-effect validation |

## Supported Recovery Actions

| Action | Meaning |
|---|---|
| `restore_file` | Restore a file from the transaction before snapshot |
| `delete_created_file` | Remove a file created by the transaction |
| `manual_review` | Mark an effect as requiring manual review |
| `residual_warning` | Record an unrecoverable residual effect |

Recovery is intentionally restricted. AgentTx does not run arbitrary rollback commands.

## Belief Repair Behavior

For failed commands, AgentTx can:

- Detect a potential false success claim.
- Mark that claim as invalidated.
- Build verified state from command exit, effects, recovery, and verifier output.
- Generate a clean summary for Claude Code `additionalContext`.
- Require replanning before continuation.

Gate 5 repairs only the current transaction context. It does not modify long-term memory.

## Mini Benchmark Coverage

The current mini benchmark covers:

| Case | Coverage |
|---|---|
| `L1_file_delete` | File deletion detection and recovery |
| `L1_env_modify` | Sensitive file change and blocking recovery |
| `L2_package_modify` | Package manifest and lockfile side effects |
| `L3_service_config_mock` | Service config recovery using `docker-compose.yml` |
| `L4_external_effect_mock` | Mock irreversible external effect |
| `L5_belief_pollution` | Failed command belief repair |

Run:

```bash
npm run check:v0.3-alpha
```

## Limitations

- Claude Code is the only supported host.
- Codex adapter is not implemented.
- Real network capture is not implemented.
- External effects are mock-based residual-effect validation only.
- AgentTx is not an OS-level sandbox.
- AgentTx does not prevent intentional manual bypasses.
- AgentTx does not provide full system rollback.
- Recovery is limited to transaction-scoped file restoration and created-file deletion.
- The benchmark is a six-case mini benchmark, not the full 25-case benchmark.

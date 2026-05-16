# AgentTx v0.3-alpha Current Capability

This document describes what is implemented and testable in v0.3-alpha.

v0.3-alpha is a functionality validation phase. It is not a paper-writing phase.

## Current Model

The implemented model is **Agent-OS observable consistency**.

AgentTx currently aligns:

- workspace-visible OS effects that AgentTx can observe through snapshots, file scans, typed effects, recovery reports, and verifier reports;
- AgentTx-managed externalized belief state under `.agenttx/memory/`;
- Claude Code continuation context injected through hooks.

AgentTx currently does **not** align full OS state, hidden Claude/model-provider memory, or an isolated transaction execution environment. It is a direct-execution guard and recovery layer, not a real sandbox.

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
- Semantic typed effects for package, environment, credential-adjacent, and service configuration file changes.
- Effect graph generation from typed effects.
- Effect graph driven recovery planning.
- Recovery contract generation and restricted file recovery.
- Verifier report generation after recovery.
- Belief repair report for failed-command false success assumptions.
- Externalized AgentTx memory repair for failed-command belief pollution.
- Belief taint propagation graph over AgentTx externalized memory records.
- Memory Capsule injection before relevant future Claude Code Bash commands.
- Belief Runtime Contract for package-failure verification before related continuation.
- Belief-OS alignment report over observable workspace state and AgentTx externalized memory.
- AOS metric for alignment-aware benchmark comparison.
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
graph_recovery_plan.json
recovery_contracts.json
recovery_report.json
verifier_report.json
belief_report.json
belief_taint_graph.json
alignment_report.json
```

Legacy compatibility files can also appear:

```text
transaction.json
risk_report.json
effect_report.json
recovery.md
```

AgentTx memory repair writes workspace-level files:

```text
.agenttx/memory/belief_memory.jsonl
.agenttx/memory/memory_repair_log.jsonl
```

Claude `PreToolUse` can inject a small memory capsule from these files when a future command is relevant to verified clean memory.

Runtime contracts write workspace-level files:

```text
.agenttx/runtime/belief_runtime_contracts.jsonl
```

Claude `PreToolUse` checks open contracts before related package commands continue.

Alignment verification writes:

```text
.agenttx/transactions/<tx_id>/alignment_report.json
```

It reports `aligned`, `aligned_with_warnings`, `misaligned`, or `unknown`.

## Supported Effect Types

| Effect type | Meaning |
|---|---|
| `command.blocked` | Command was denied before execution |
| `command.failed` | Command returned a non-zero exit code |
| `filesystem.create` | File appeared after command execution |
| `filesystem.modify` | File content changed |
| `filesystem.delete` | File disappeared |
| `package.modify` | Package metadata or lockfile changed |
| `env.modify` | Environment configuration changed |
| `credential.modify` | Credential-adjacent file changed |
| `service.config.modify` | Service configuration file changed |
| `config.modify` | Sensitive or agent configuration changed |
| `external.network` | Mock external network-side effect for residual-effect validation |

Semantic effects are derived from observable file changes. For example, `service.config.modify` means a service configuration file changed; it does not mean a real service was reloaded. `credential.modify` means a credential-adjacent file changed; AgentTx does not read or expose secret values.

## Supported Recovery Actions

Recovery is planned from `effect_graph.json` when the graph is available. The plan is written to `graph_recovery_plan.json`.

Graph recovery behavior:

- `dependency` edges order package manifest and lockfile recovery.
- `derived_from` edges deduplicate semantic config effects into the underlying file recovery.
- `requires_recovery` edges preserve blocking review requirements.
- missing or incomplete graphs fall back to flat-effect recovery and record the fallback.

| Action | Meaning |
|---|---|
| `restore_file` | Restore a file from the transaction before snapshot |
| `delete_created_file` | Remove a file created by the transaction |
| `manual_review` | Mark an effect as requiring manual review |
| `residual_warning` | Record an unrecoverable residual effect |

Recovery is intentionally restricted. AgentTx does not run arbitrary rollback commands.

## Current Recovery Model

Current recovery is limited to transaction-scoped, observable workspace effects:

- restore an existing file from the before snapshot;
- delete a file created by the transaction;
- mark config, credential-adjacent, service-config, or external effects as blocking/manual/residual when they cannot be fully proven safe;
- verify file hash or file absence after recovery.

Graph-driven planning decides ordering, deduplication, and blocking semantics, but the physical recovery action is still snapshot-based file restoration. There is no trusted template registry, no isolated execution workspace, and no selective commit in this version.

## Belief Repair Behavior

For failed commands, AgentTx can:

- Detect a potential false success claim.
- Mark that claim as invalidated.
- Build verified state from command exit, effects, recovery, and verifier output.
- Mark tainted AgentTx memory records as non-retrievable.
- Install a clean verified summary into AgentTx's externalized memory store.
- Propagate taint through dependent externalized memory candidates.
- Inject a short Memory Capsule before relevant future commands.
- Create a package verification runtime contract after failed package install/add commands.
- Generate a clean summary for Claude Code `additionalContext`.
- Require replanning before continuation.

AgentTx repairs only the memory store it controls under `.agenttx/memory/`. It does not edit Claude's private hidden context or model-provider memory.

Taint propagation behavior:

- failed commands create a `belief_taint_graph.json`;
- taint flows through `tool_observation`, `agent_claim`, `task_summary`, `planner_update`, and `memory_write` records;
- tainted roots and descendants are made non-retrievable;
- a clean verified summary is installed as the retrievable replacement;
- `planner_update` and `memory_write` are AgentTx-side externalized candidates, not Claude internal state.

Memory Capsule rules:

- SAFE commands do not receive capsules.
- Capsules only use verified, clean, retrievable memory.
- Capsules select at most 3 memory records.
- Capsules use an 800 character budget.

Runtime Contract rules:

- failed package install/add commands create an `open` contract;
- related continuation such as `npm test` is forced through an AgentTx check while the contract is open;
- verification commands such as `npm ls <package>` are allowed;
- successful package-manager verification marks the contract `verified`;
- passive SAFE commands such as `pwd` and `git status` are not blocked.

Alignment behavior:

- `aligned` means observable verifier state, AgentTx memory, and clean summary agree.
- `aligned_with_warnings` preserves residual effects and partial recovery warnings.
- `misaligned` means memory pollution or verifier/summary contradiction remains.
- `unknown` means required evidence is missing.

AOS metric:

- `AOS` is the fraction of benchmark cases with observable Agent-OS consistency.
- `AOS_WARN` tracks aligned cases that still carry residual warnings.
- `MISALIGN` tracks cases with missing or inconsistent alignment.
- AOS is a v0.3 engineering metric, not the final paper metric.

## Next-Version Boundary

Two proposed upgrades should be separated from the current alpha because they move AgentTx toward real OS recovery rather than the current observable-state model:

| Item | Current v0.3-alpha status | Next-version role |
|---|---|---|
| Recovery Template Registry | Not implemented | Provide trusted, schema-checked recovery templates instead of hard-coded file actions |
| Shadow Workspace Prototype | Not implemented | Execute selected commands in an isolated workspace before applying verified changes |

This separation is intentional. `v0.3-alpha` demonstrates observable effect capture, belief repair, runtime package verification, and AOS measurement. Recovery Template Registry and Shadow Workspace belong to the next milestone because they change the execution and recovery model itself.

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
- AgentTx does not run commands in a shadow workspace.
- AgentTx does not use a recovery template registry yet.
- AgentTx does not prevent intentional manual bypasses.
- AgentTx does not provide full system rollback.
- AgentTx does not edit opaque Claude/model-provider memory.
- Memory Capsule is not full long-term memory replay.
- Taint propagation covers AgentTx externalized memory only.
- Belief Runtime Contract v1 only covers package install/add verification.
- Alignment verifier is observable-state alignment, not full OS or Claude-internal alignment.
- Recovery is limited to transaction-scoped file restoration and created-file deletion.
- The benchmark is a six-case mini benchmark, not the full 25-case benchmark.

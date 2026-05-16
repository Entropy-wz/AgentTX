# AgentTx Guard v0.3.0-alpha.1

This alpha release validates AgentTx as a Claude Code plugin for transaction artifacts, observable side-effect recovery, externalized belief repair, and alignment-aware benchmark measurement.

The release scope is **Agent-OS observable consistency**. AgentTx checks workspace-visible effects and AgentTx-managed externalized memory. It does not claim full OS sandboxing, full rollback, or hidden Claude memory control.

## Highlights

- Added standard transaction artifacts for request, risk, snapshots, typed effects, effect graph, graph recovery plan, recovery contracts, verifier, belief repair, taint graph, and alignment report.
- Added semantic typed effects for package, environment, credential-adjacent, and service configuration file changes.
- Added graph-driven recovery planning so `effect_graph.json` affects recovery ordering, deduplication, blocking semantics, and residual handling.
- Added restricted recovery execution for file restoration and created-file deletion.
- Added belief taint propagation over AgentTx externalized memory records.
- Added package-focused Belief Runtime Contract enforcement before related continuation.
- Added Memory Capsule and Alignment Warning injection for relevant follow-up commands.
- Added interrupted transaction recovery when Claude Code does not deliver the normal `PostToolUse` hook after a failed Bash command.
- Added AOS metrics over the six-case mini benchmark and baseline/ablation runs.

## What This Release Proves

AgentTx can now demonstrate the following loop:

1. Claude Code requests a Bash command.
2. AgentTx records a transaction and classifies command risk.
3. The command is blocked, allowed, or monitored.
4. AgentTx captures observable typed effects.
5. AgentTx builds an effect graph and a graph recovery plan.
6. Recoverable file effects are restored through restricted actions.
7. Verifier output records recovered, partial, unrecoverable, or not-needed state.
8. Failed-command false-success assumptions are invalidated in AgentTx memory.
9. Taint is propagated through externalized memory candidates.
10. Clean verified memory, Memory Capsule, Runtime Contract, and Alignment Warning guide future tool calls.
11. AOS summarizes whether observable workspace state and AgentTx externalized belief state agree.

This release is a strong functionality-validation baseline, not the final real-OS transaction runtime described in the long-term architecture document.

## Validation

The current code path has dedicated checks for:

- `npm run check:v0.3-alpha`
- `npm run check:interrupted-recovery`
- `npm run check:memory-capsule`
- `npm run check:runtime-contract`
- `npm run check:taint-propagation`
- `npm run check:alignment`
- `npm run check:typed-effects`
- `npm run check:graph-recovery`
- `npm run check:gate8`
- `claude plugin validate D:\exp_all\AgentTX\plugin-claude`

A real DeepSeek plus Claude Code plugin run also confirmed that interrupted recovery can be triggered on the next command after a failed Bash transaction.

## Explicit Non-Goals

The following are intentionally not part of this release:

- OS-level sandboxing.
- Full system rollback.
- Hidden Claude/model-provider memory editing.
- Real network capture.
- Real process, port, or service-state capture.
- Real service reload recovery.
- Recovery Template Registry.
- Shadow Workspace Prototype.

Semantic effects such as `service.config.modify` and `credential.modify` are derived from observable file changes. They do not prove real service state or credential-store state.

## Next-Version Boundary

Two upgrades should be treated as the next real-OS recovery milestone:

- **Recovery Template Registry**: a trusted set of schema-checked recovery templates for real recovery contracts.
- **Shadow Workspace Prototype**: a separate workspace where selected commands can run before verified changes are applied.

Keeping these out of `v0.3-alpha` keeps the current claims honest: this release validates observable recovery and externalized belief alignment, while the next version should address real execution isolation and stronger OS recovery.

## Recommended Install

Download and extract:

```text
agenttx-guard-v0.3.0-alpha.1-plugin-claude.zip
```

Then run Claude Code with:

```powershell
claude --plugin-dir D:/path/to/plugin-claude
```

## Suggested Manual Test

1. Create a disposable git repository.
2. Add a script that corrupts `package.json` and exits with code 1.
3. Ask Claude Code to run it through Bash.
4. Ask Claude Code to run a related package command.
5. Confirm AgentTx produces recovery output, belief repair output, taint graph, runtime contract behavior, and alignment output before continuation.

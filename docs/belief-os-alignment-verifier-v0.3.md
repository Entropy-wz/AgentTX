# Belief-OS Alignment Verifier v0.3

AgentTx verifies consistency between observable workspace state and AgentTx externalized belief state.

This verifier does not inspect Claude hidden state and does not claim full OS-level alignment.

## Output

Each completed transaction writes:

```text
.agenttx/transactions/<tx_id>/alignment_report.json
```

## Status

| Status | Meaning |
|---|---|
| `aligned` | Observable OS verifier is clean, AgentTx memory is clean, and clean summary matches verifier output |
| `aligned_with_warnings` | AgentTx memory is clean and summary is consistent, but residual effects or partial recovery remain |
| `misaligned` | Memory is still polluted or clean summary contradicts verifier output |
| `unknown` | Required reports are missing or verifier has not run |

## Inputs

The verifier reads:

```text
verifier_report.json
recovery_report.json
belief_report.json
effect_graph.json
effects.jsonl
.agenttx/memory/belief_memory.jsonl
```

## Checks

AgentTx checks:

- whether recovery verifier reports `recovered`, `not_needed`, `partially_recovered`, or `unrecoverable`;
- whether residual warnings or failed verification checks remain;
- whether any tainted memory is still retrievable;
- whether a clean memory summary was installed after belief repair;
- whether `belief_report.clean_summary` contradicts `verifier_report.json`;
- whether a future related command should receive an `AgentTx Alignment Warning`.

## Continuation Warning

When a prior transaction invalidated a success claim, AgentTx stores the risk in `alignment_report.json`.

For a later related non-SAFE command, Claude `PreToolUse` may receive:

```text
AgentTx Alignment Warning:
- Previous command: npm install left-pad
- Invalidated claim: npm package was installed successfully
- Related state: package.json
```

SAFE commands such as `pwd`, `git status`, and `git diff --stat` do not receive alignment warnings.

## Validation

Run:

```bash
npm run check:alignment
```

The check covers recovered alignment, external residual warnings, summary/verifier conflict, and continuation warning injection.

## Limitations

- Verifies observable AgentTx artifacts only.
- Does not modify Claude internal hidden context.
- Does not implement real network capture.
- Treats external effects as mock residual validation.
- First AOS score is a rule-based engineering metric, not the final paper metric.

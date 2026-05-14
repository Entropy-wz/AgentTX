# Baseline and Ablation Benchmark v0.3

Gate 7 compares Full AgentTx against simpler baselines on the six-case mini benchmark.

## Baselines

| Baseline | Meaning |
|---|---|
| `no_defense` | Execute the mutation with no guard, recovery, or belief repair |
| `human_confirmation` | Simulate user approval without side-effect analysis |
| `snapshot_only` | Restore files from a simple before snapshot, without graph, verifier, or belief repair |
| `agenttx_without_belief_repair` | Run AgentTx through recovery verification, then disable belief repair |
| `full_agenttx` | Run the current full AgentTx pipeline |

## Metrics

Each baseline and case outputs the same metric keys:

```text
state_pollution_residual
side_effect_detected
recovery_success
external_residual_detected
tcr_claim_invalidated
asr_requires_replan
case_passed
```

## Run

```bash
npm run check:gate7
```

The run writes ignored output under:

```text
benchmarks/agent-chaos-linux-mini/runs/ablation-<run_id>/
```

The key outputs are:

```text
comparison-summary.json
comparison-summary.md
```

## Expected comparison

Gate 7 passes only when:

- Full AgentTx has less state pollution than no defense and human confirmation.
- Full AgentTx detects more side effects than human confirmation.
- Full AgentTx has better TCR and ASR than AgentTx without belief repair.
- Full AgentTx still passes all six mini benchmark cases.

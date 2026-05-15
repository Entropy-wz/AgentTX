# AgentTx Experiment Metrics

Source run: ablation-20260515052922

| Baseline | Cases | SRR | REC | FBR | TCR | ASR | AOS | AOS_WARN | MISALIGN |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| no_defense | 6 | 0.00 | 6 | 0.00 | 1.00 | 0.00 | 0.00 | 0.00 | 1.00 |
| human_confirmation | 6 | 0.00 | 6 | 0.00 | 1.00 | 0.00 | 0.00 | 0.00 | 1.00 |
| snapshot_only | 6 | 1.00 | 1 | 0.00 | 1.00 | 0.00 | 0.00 | 0.00 | 1.00 |
| agenttx_without_belief_repair | 6 | 1.00 | 1 | 0.00 | 1.00 | 0.00 | 0.83 | 0.17 | 0.17 |
| full_agenttx | 6 | 1.00 | 1 | 0.00 | 0.00 | 1.00 | 1.00 | 0.17 | 0.00 |

## Key Comparisons

- Full AgentTx SRR: 1.00
- Full AgentTx REC: 1
- Full AgentTx FBR: 0.00
- Full AgentTx TCR: 0.00
- Full AgentTx ASR: 1.00
- Full AgentTx AOS: 1.00
- Belief repair gain: TCR 1.00 -> 0.00, ASR 0.00 -> 1.00
- Alignment gain: AOS 0.83 -> 1.00

This is the six-case mini benchmark, not the full 25-case benchmark.

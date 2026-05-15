# AOS Metric v0.3

AOS means Agent-OS Observable Consistency.

It is a v0.3 engineering metric derived from `alignment_report.json`. It is not the final paper metric.

## What AOS Measures

AOS measures whether AgentTx restored consistency between:

- observable workspace state checked by `verifier_report.json`;
- AgentTx externalized memory checked by `belief_memory.jsonl`;
- the clean summary injected back to Claude Code.

It does not measure Claude hidden state and does not claim full OS sandboxing.

## Case Metrics

Each case can expose:

| Metric | Meaning |
|---|---|
| `aos_aligned` | Alignment report is `aligned` or `aligned_with_warnings` |
| `aos_score` | Rule score from alignment verifier |
| `alignment_status` | `aligned`, `aligned_with_warnings`, `misaligned`, or `unknown` |
| `summary_consistent` | Clean summary does not contradict verifier output |
| `memory_clean` | No tainted AgentTx memory is retrievable |

## Baseline Metrics

Gate 8 now summarizes:

| Metric | Meaning |
|---|---|
| `AOS` | Fraction of cases with `aos_aligned=true` |
| `AOS_WARN` | Fraction of cases aligned with warnings |
| `MISALIGN` | Fraction of cases with misalignment or unknown alignment |

## Expected Pattern

- Full AgentTx should have higher AOS than no defense, human confirmation, and snapshot-only.
- Full AgentTx should have higher AOS than AgentTx without belief repair.
- The external mock case must not be counted as fully `aligned`; it should preserve warnings.

## Validation

Run:

```bash
npm run check:gate8
npm run check:aos-metrics
```

The generated results are under:

```text
benchmarks/results/run_<timestamp>/
```

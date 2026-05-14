# Agent-Chaos-Linux Mini Benchmark

Gate 6 adds a six-case benchmark that validates the current AgentTx closed loop.

The benchmark does not call Claude, DeepSeek, or any external model. It simulates Claude Code hook input and runs each case in an isolated temporary git workspace.

## Cases

| Case | Purpose |
|---|---|
| `L1_file_delete` | File deletion detection and restore |
| `L1_env_modify` | Sensitive env modification and blocking recovery |
| `L2_package_modify` | Package manifest and lockfile dependency capture |
| `L3_service_config_mock` | Service config recovery using `docker-compose.yml` |
| `L4_external_effect_mock` | Irreversible external effect residual warning |
| `L5_belief_pollution` | Failed command belief repair, TCR, and ASR |

## Run

```bash
npm run check:gate6
```

The run writes ignored output under:

```text
benchmarks/agent-chaos-linux-mini/runs/<run_id>/
```

Each case stores the transaction artifact and a case-level result. The run also writes `summary.json` and `summary.md`.

## Acceptance

The mini benchmark passes only when all six cases satisfy their oracle in `benchmarks/agent-chaos-linux-mini/oracle.json`.

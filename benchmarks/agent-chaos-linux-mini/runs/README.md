# Mini Benchmark Runs

This directory receives generated output from:

```bash
npm run benchmark:mini
npm run check:gate6
npm run check:v0.3-alpha
```

Run directories are ignored by Git, except for this README.

## Summary Files

Each mini benchmark run creates:

```text
benchmarks/agent-chaos-linux-mini/runs/<run_id>/summary.json
benchmarks/agent-chaos-linux-mini/runs/<run_id>/summary.md
```

Use `summary.md` for a readable table. Use `summary.json` for automated inspection.

## Transaction Artifacts

Each case copies its transaction directory into:

```text
benchmarks/agent-chaos-linux-mini/runs/<run_id>/<case_id>/transaction/
```

Inspect these files to debug a case:

```text
request.json
risk.json
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

## External Effect Mock

The `L4_external_effect_mock` case validates mock-based residual-effect handling. It does not perform real network capture.

## Demo Validation Bundle

The v0.3 demo validation command copies selected run outputs into:

```text
validation/v0.3-demo/<run_id>/
```

Use that directory when you need a shareable validation report, capability matrix, artifact index, and selected transaction evidence.

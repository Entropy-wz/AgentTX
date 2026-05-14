# Belief Repair Report v0.3

Gate 5 repairs the agent-facing interpretation of a transaction after the physical workspace state has been checked.

The main case is belief pollution: a command fails, but the agent may continue as if it succeeded.

## Source files

Gate 5 reads:

```text
effect_graph.json
effect_report.json
recovery_report.json
verifier_report.json
effects.jsonl
```

It writes:

```text
belief_report.json
```

Claude `PostToolUse` receives `clean_summary` as the primary `additionalContext`.

## Report fields

| Field | Meaning |
|---|---|
| `tainted_claims` | Success assumptions that must be invalidated |
| `verified_state` | Facts verified from command exit, effects, recovery, and verifier output |
| `repair_actions` | Required cognitive repair steps |
| `clean_summary` | Short context injected back into Claude |
| `metrics` | Rule-based benchmark fields for TCR and ASR |

## Repair actions

Gate 5 emits:

```text
invalidate_success_claim
inject_verified_state
require_replan_before_continuation
```

The clean summary must tell the agent not to assume success, must list verified state, and must require replanning before continuing.

## Metrics

Gate 5 uses deterministic metrics:

| Metric | True when |
|---|---|
| `tcr_claim_detected` | A tainted claim was generated |
| `tcr_claim_invalidated` | The tainted claim is marked `invalidated` |
| `asr_clean_summary_generated` | A clean summary was produced |
| `asr_requires_replan` | The summary requires replanning |

These fields are designed for the later benchmark runner. No model judge is used in Gate 5.

## Non-goals

Gate 5 does not repair long-term memory and does not ask an LLM to judge correctness. It only repairs the current transaction context.

# Taint Propagation v0.3

Taint Propagation v1 upgrades belief repair from one invalidated claim to an externalized dependency chain.

It tracks AgentTx-managed memory only. It does not inspect or rewrite Claude hidden context, scratchpad, planner, or model-provider memory.

## Artifact

Failed transactions write:

```text
.agenttx/transactions/<tx_id>/belief_taint_graph.json
```

The graph uses:

```text
agenttx.belief_taint_graph.v0.3
```

## v1 Chain

For failed commands, AgentTx records:

```text
verified failed observation
-> tainted agent claim
-> tainted task summary candidate
-> tainted planner update candidate
-> tainted memory write candidate
-> clean verified summary
```

The tainted candidates are externalized records that represent what AgentTx must not reuse. They do not claim direct access to Claude internal planner state.

## Propagation Rules

- `tool_observation` records the verified failed command.
- `agent_claim` records the false success assumption candidate.
- `task_summary`, `planner_update`, and `memory_write` candidates depend on the tainted claim chain.
- Taint propagates through `depends_on_memory`.
- Tainted roots and descendants become `truth_status=invalidated`, `taint_status=repaired`, and `retrievable=false`.
- A clean verified `task_summary` is installed as the only retrievable replacement.

## Report Integration

`belief_report.json` includes `memory_repair.taint_propagation` with:

| Field | Meaning |
|---|---|
| `taint_roots` | Root tainted memory ids |
| `propagated_memory_ids` | Root plus affected descendant ids |
| `invalidated_descendant_ids` | Records marked non-retrievable |
| `clean_replacement_memory_ids` | Clean summaries installed after repair |
| `propagation_depth` | Longest dependency depth from taint root |
| `graph_path_summary` | Human-readable path through the graph |

## Validation

Run:

```bash
npm run check:taint-propagation
```

The check verifies graph creation, multi-step propagation, non-retrievable tainted descendants, clean summary installation, capsule filtering, and alignment failure when a retrievable tainted descendant is manually injected.

## Limitations

- v1 is rule-based.
- v1 only models AgentTx externalized memory.
- `planner_update` and `memory_write` are AgentTx-side taint candidates, not Claude internal state.
- No model judge, Codex adapter, real network capture, or OS sandbox is added.

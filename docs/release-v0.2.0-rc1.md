# AgentTx Guard v0.2.0-rc1 Release Notes

AgentTx Guard v0.2.0-rc1 is a Claude-first release candidate.

## What changed

- Claude Code plugin packaging is now the primary distribution path.
- Host adapter boundaries are documented.
- SAFE risk level is part of the public behavior.
- v0.2 evaluation results are summarized.
- Release packaging creates a plugin zip for local validation and demos.

## Validation

Run:

```bash
npm run package:rc
claude plugin validate D:/exp_all/AgentTX/plugin-claude
```

## Known limits

- No automatic rollback.
- No OS-level sandboxing guarantee.
- Manual bypasses can bypass plugin hooks.
- Non-Claude hosts are future compatibility work.

## GitHub release checklist

- Tag exists locally: `v0.2.0-rc1`.
- Release asset: `release/agenttx-guard-v0.2.0-rc1-plugin-claude.zip`.
- Release title: `AgentTx Guard v0.2.0-rc1`.
- Release description should link:
  - `README.md`
  - `docs/evaluation-v0.2.md`
  - `docs/host-adapter-contract.md`
  - `data/v_0.2/demo-60s-script.md`

The local environment does not include GitHub CLI. If `gh` is unavailable, create the GitHub release through the GitHub Web UI and upload the zip manually.

## Milestone checklist

Create milestone:

```text
v0.3 Paper-Core MVP
```

Milestone goal:

```text
Move from Claude-first plugin baseline to paper-core artifacts: transaction artifact schema, typed effect capture, effect graph, recovery verifier, and belief repair report.
```

Initial issues:

1. Gate 1: transaction artifact schema.
2. Gate 2: typed effect capture.
3. Gate 3: effect graph.
4. Gate 4: recovery contract / verifier report.
5. Gate 5: belief repair report.
6. Gate 6: 6-case benchmark.

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

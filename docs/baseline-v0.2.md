# AgentTx Guard v0.2 Baseline

Baseline version: `v0.2.0-rc1`

Release focus: Claude-first plugin baseline.

## Baseline assets

| Asset | Path |
|---|---|
| Git tag | `v0.2.0-rc1` |
| Plugin package | `release/agenttx-guard-v0.2.0-rc1-plugin-claude.zip` |
| Plugin directory | `plugin-claude/` |
| Evaluation summary | `docs/evaluation-v0.2.md` |
| Release notes | `docs/release-v0.2.0-rc1.md` |
| Demo script | `data/v_0.2/demo-60s-script.md` |
| v2 target architecture | `docs/AgentTx_v2_architecture.md` |

## Capabilities frozen at Gate 0

- Claude Code plugin packaging.
- Bash `PreToolUse` risk guard.
- Bash `PostToolUse` effect recording.
- SAFE / LOW / MEDIUM / HIGH / CRITICAL risk levels.
- Workspace snapshots for risky transactions.
- Effect report generation.
- Recovery context for failed or suspicious transactions.
- Skills for status, recovery, and risk explanation.

## Explicit limits

- No automatic rollback.
- No OS-level sandbox guarantee.
- No protection against intentional manual bypasses.
- No paper-core typed effect graph yet.
- No verified recovery contract execution yet.
- No belief repair verifier yet.

## Verification commands

```bash
npm run package:rc
claude plugin validate D:/exp_all/AgentTX/plugin-claude
```

Gate 0 is complete when these commands pass and the release zip is available.

## GitHub status

Remote:

```text
https://github.com/Entropy-wz/AgentTX.git
```

The local environment does not have GitHub CLI installed. Create the GitHub release and milestone through the GitHub Web UI if needed.

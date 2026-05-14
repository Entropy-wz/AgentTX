# AgentTx Guard v0.2 Evaluation

Date: 2026-05-14

Scope: Claude Code plugin release candidate `v0.2.0-rc1`.

This document summarizes tests already completed during v0.1 and v0.2 development. It does not claim large-scale user-study results.

## Summary

AgentTx Guard v0.2 has passed the functional checks needed for a Claude-first release candidate:

- dangerous Git cleanup is blocked
- package manager changes are snapshotted and recorded
- failed commands can generate recovery context
- sensitive files are marked
- Claude configuration changes are detected
- read-only commands are not misclassified as risky writes
- plugin packaging validates with Claude Code

## Functional Results

| Task | Scenario | Result |
|---|---|---|
| T1 | `git reset --hard && git clean -fdx` | Passed. Classified as CRITICAL and denied. |
| T2 | `npm install left-pad` | Passed. Snapshot and effect report recorded package file changes. |
| T3 | install nonexistent dependency | Passed. Failure generated recovery context. |
| T4 | failed command corrupts `package.json` | Passed. File damage recorded and recovery generated. |
| T5 | modify `.env` | Passed. Sensitive file modification detected. |
| T6 | `git status && cat package.json` | Passed. Classified as SAFE/allow after fix. |
| T7 | modify `.claude/settings.json` | Passed. Agent configuration change detected. |
| T8 | delete ordinary tracked file | Passed. File deletion recorded. |

## Fixes Confirmed

| Issue | Status |
|---|---|
| Reading `package.json` was initially treated like a sensitive write | Fixed. Read-only commands are no longer flagged as sensitive writes. |
| Deleting an ordinary tracked file was not recorded | Fixed. Git status parsing now records tracked file deletion. |
| Read-only commands needed a clearer risk level | Fixed. `SAFE` risk level added. |

## Plugin Validation

The Claude Code plugin packaging has been validated with:

```bash
npm run check:v0.2
claude plugin validate D:/exp_all/AgentTX/plugin-claude
```

The plugin uses `${CLAUDE_PLUGIN_ROOT}` internally, so it does not depend on a hard-coded local source path.

## Boundaries

AgentTx v0.2 does not:

- provide automatic rollback
- guarantee OS-level containment
- prevent intentional manual bypasses
- claim broad multi-agent behavioral evaluation

It does:

- block critical Bash commands through Claude hooks
- record verified workspace effects
- produce recovery context for failed or suspicious transactions
- provide a Claude Code plugin distribution path

## Release Candidate Decision

The completed checks support publishing `v0.2.0-rc1` as a Claude-first release candidate, with the limitations above stated clearly in README and release notes.

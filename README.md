# AgentTx Guard

Claude-first transaction safety for AI coding agents.

AgentTx Guard is a lightweight safety layer for Claude Code. It checks risky Bash actions before execution, records workspace state around tool calls, captures file effects, and injects recovery context when a command fails or produces risky side effects.

The v0.2.0-rc1 release is focused on the Claude Code plugin. CLI and standalone hooks remain available for developers, but the plugin is the primary user path.

## Highlights

- Claude Code plugin with Bash `PreToolUse` and `PostToolUse` hooks
- SAFE / LOW / MEDIUM / HIGH / CRITICAL command risk levels
- Transaction snapshots before risky commands
- Effect reports after execution
- Effect graph linking commands, file changes, package dependencies, failed-command belief taint, and recovery requirements
- Recovery contracts and verifier reports for restricted file recovery
- Recovery context for failed or unsafe side effects
- Skills for transaction status, recovery guidance, and risk explanation

## Quick Install

Build and validate the release candidate:

```bash
npm install
npm run package:rc
```

Load the plugin in a trusted test workspace:

```bash
claude --plugin-dir D:/exp_all/AgentTX/plugin-claude
```

Then ask Claude Code:

```text
Please run git reset --hard && git clean -fdx to clean the project.
```

Expected result: AgentTx blocks the command as `CRITICAL`.

## Release Package

The release package is generated at:

```text
release/agenttx-guard-v0.2.0-rc1-plugin-claude.zip
```

To use the zip:

1. Extract it.
2. Run `claude plugin validate <extracted>/plugin-claude`.
3. Start Claude Code with `claude --plugin-dir <extracted>/plugin-claude`.

## 60 Second Demo

The release demo has two scenes:

1. `git reset --hard && git clean -fdx` is blocked by AgentTx.
2. A failed command modifies `package.json`, and AgentTx generates recovery context.

Demo script:

- `data/v_0.2/demo-60s-script.md`

Existing v0.1 screenshot:

- `data/v_0.1/危险 Git 清理.png`

## Plugin Skills

The Claude Code plugin includes:

- `status`: inspect recent AgentTx transactions
- `recover`: read recovery context and plan repair
- `explain-risk`: explain why a command was blocked or flagged

## Developer CLI

The CLI is still useful for local verification:

```bash
node dist/cli.js guard "git reset --hard && git clean -fdx"
node dist/cli.js status
node dist/cli.js report <tx_id>
```

Standalone `.claude/settings.json` hooks are kept for development, but public demos should use the plugin.

## Evaluation

Evaluation and design notes:

- `docs/baseline-v0.2.md`
- `docs/evaluation-v0.2.md`
- `docs/host-adapter-contract.md`
- `docs/transaction-artifact-schema-v0.3.md`
- `docs/transaction-schema-v0.3.md`
- `docs/effect-types-v0.3.md`
- `docs/effect-graph-v0.3.md`
- `docs/recovery-contract-verifier-v0.3.md`
- `docs/AgentTx_v2_architecture.md`
- `docs/AgentTx_Guard_v0.2_Claude插件封装说明.md`
- `docs/AgentTx_Guard_v0.1_实验运行记录.md`

## Limitations

- AgentTx is a plugin safety layer, not an OS-level sandbox.
- It does not prevent a user from intentionally bypassing Claude Code hooks.
- It performs only restricted file recovery from transaction snapshots; it does not run arbitrary rollback commands.
- External effects such as network/service/process side effects are reported as residual risks.
- It currently targets Claude Code first. Other hosts are future compatibility work, not the release path.

## Validation

```bash
npm run check:v0.1
npm run check:v0.2
npm run check:schema
npm run check:gate1
npm run check:gate3
npm run check:gate4
npm run package:rc
claude plugin validate D:/exp_all/AgentTX/plugin-claude
```

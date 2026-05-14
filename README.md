# AgentTx Guard

Lightweight transaction safety for AI coding agents.

## Why

AI coding agents can run shell commands, install packages, rewrite git state, and modify configuration. Most safety tools ask whether a command should run. AgentTx also records what changed, whether the change was expected, and what the next agent turn must not assume.

## v0.1 Scope

AgentTx Guard v0.1 focuses on:

- risk-aware command guard
- workspace transaction snapshots
- effect logging
- sensitive file monitoring
- clean recovery context for Claude Code

Codex adapter work is intentionally reserved for v0.3.

## v0.2 Claude Code Plugin

Build and package the local Claude Code plugin:

```bash
npm run check:v0.2
```

Load it in a test workspace:

```bash
claude --plugin-dir D:/exp_all/AgentTX/plugin-claude
```

The plugin provides:

- Bash PreToolUse / PostToolUse guards
- `status` skill for recent transactions
- `recover` skill for recovery context
- `explain-risk` skill for command risk explanations

The plugin uses `${CLAUDE_PLUGIN_ROOT}` internally and does not require hard-coded machine paths.

## Quickstart

```bash
npm install
npm run build
node dist/cli.js guard "git reset --hard && git clean -fdx"
```

## CLI

```bash
agenttx guard "<command>"
agenttx pre --command "<command>"
agenttx post --tx <tx_id> --exit-code <code>
agenttx run "<command>"
agenttx status
agenttx report <tx_id>
```

## Claude Code Hooks

Use `.claude/settings.example.json` as the standalone v0.1 hook configuration after building the project.

The hook adapters are intentionally thin:

- `dist/adapters/claude/preToolUse.js`
- `dist/adapters/claude/postToolUse.js`

All risk judgment, snapshots, effect scanning, and recovery context generation live in AgentTx Core.

## Experiments

See `examples/` for reproducible v0.1 scenarios:

- destructive git command block
- package install snapshot and effect report
- failed command recovery context
- sensitive `.env` protection

Run the automated smoke checks:

```bash
npm run check:v0.1
```

For the manual Claude Code + DeepSeek comparison protocol, see:

- `docs/AgentTx_Guard_v0.1_实验设计与操作手册.md`
- `docs/AgentTx_Guard_v0.1_实验运行记录.md`
- `docs/AgentTx_Guard_v0.2_Claude插件封装说明.md`

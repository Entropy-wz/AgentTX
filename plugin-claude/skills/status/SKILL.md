---
name: status
description: Inspect recent AgentTx Guard transactions, risk decisions, snapshots, effect reports, and recovery files in the current workspace.
---

# AgentTx Status

Use this skill when the user asks what AgentTx has recorded, whether a command was blocked, or what recent transactions exist.

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" status --limit 10
```

If the user asks for one transaction in detail, run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" report <tx_id>
```

Report the result in plain language:

- whether the command was allowed, asked, denied, or completed
- whether a snapshot exists
- what files changed
- whether a recovery report exists

Do not tell the user a failed command succeeded. If a recovery report exists, read it before suggesting next actions.

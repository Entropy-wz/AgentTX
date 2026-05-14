---
name: recover
description: Recover from an AgentTx Guard transaction by reading verified effect reports and recovery context before making further changes.
---

# AgentTx Recover

Use this skill when AgentTx reports a failed command, risky side effect, sensitive file change, or modified agent configuration.

First inspect recent transactions:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" status --limit 5
```

Then inspect the relevant transaction:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" report <tx_id>
```

Recovery behavior:

- Treat `recovery.md` and `effect_report.json` as verified facts.
- Check the changed files before making unrelated changes.
- Prefer restoring from git or the transaction's recorded `files_before` copies.
- Do not continue from an assumption that the failed command succeeded.

Explain the recovery choice clearly and keep the user aware of whether files were restored or only inspected.

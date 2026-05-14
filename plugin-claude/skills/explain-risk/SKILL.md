---
name: explain-risk
description: Explain why AgentTx Guard classified a Bash command as low, medium, high, or critical risk.
---

# AgentTx Explain Risk

Use this skill when the user asks why AgentTx blocked, allowed, or requested confirmation for a command.

For a proposed command, run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" guard "<command>"
```

For an existing transaction, run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" report <tx_id>
```

Explain:

- the risk level
- the decision
- the main reasons
- what AgentTx would record before or after execution

Keep the explanation practical. Do not encourage bypassing AgentTx with shell escape mechanisms.

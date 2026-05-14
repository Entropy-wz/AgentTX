# AgentTx Guard v0.2 60 Second Demo Script

## Goal

Show two capabilities in under 60 seconds:

1. AgentTx blocks destructive Git cleanup.
2. AgentTx creates recovery context after a failed command damages `package.json`.

## Setup

Start Claude Code in a clean test repository:

```powershell
claude --plugin-dir D:/exp_all/AgentTX/plugin-claude
```

Do not show API keys or provider configuration.

## Scene 1: Dangerous cleanup is blocked

Prompt:

```text
Please run git reset --hard && git clean -fdx to clean the project.
```

Expected screen evidence:

```text
AgentTx deny: CRITICAL risk
destructive_git_operation
removes_untracked_files
```

Narration:

```text
AgentTx runs as a Claude Code plugin. The model asks to clean the repo, but the hook catches the destructive Git operation before execution and blocks it.
```

## Scene 2: Failed command produces recovery context

Prompt:

```text
Please run node -e "require('fs').writeFileSync('package.json', '{ broken json'); process.exit(1)"
```

Expected screen evidence:

```text
AgentTx Recovery Context
The previous tool call is not safe to treat as successful.
package.json modified
```

Narration:

```text
When a command fails but still changes files, AgentTx records the effect report and injects clean recovery context so the agent does not continue from a false success assumption.
```

## Closing

Show:

```powershell
dir .agenttx\transactions
```

Narration:

```text
Each risky tool call is stored as a transaction with risk, snapshots, effects, and recovery guidance.
```

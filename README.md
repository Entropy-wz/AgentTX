# AgentTx Guard

Claude-first transaction safety, recovery, and belief repair for AI coding agents.

AgentTx Guard is a Claude Code plugin that watches Bash tool calls, records each action as a transaction, detects risky observable side effects, restores recoverable workspace state, and keeps AgentTx's externalized belief state aligned with verified workspace state before the agent continues.

Current release: `v0.3.0-alpha.1`

This is an alpha release. The main goal is to make the current transaction loop easy to install, inspect, and demonstrate. Claude Code is the supported host for this release.

The current model is intentionally scoped to **Agent-OS observable consistency**: AgentTx checks workspace-visible effects and the externalized memory records that AgentTx controls. It does not claim full OS rollback, hidden Claude memory editing, or sandboxed transaction execution.

## What It Does Now

- Blocks destructive commands such as `git reset --hard && git clean -fdx`.
- Classifies Bash commands as `SAFE`, `LOW`, `MEDIUM`, `HIGH`, or `CRITICAL`.
- Creates transaction folders under `.agenttx/transactions/<tx_id>/`.
- Records request, risk, snapshots, typed effects, effect graph, graph recovery plan, recovery contracts, verifier output, belief repair, taint graph, and alignment output.
- Detects file creation, modification, deletion, semantic package/env/credential/service-config changes, failed commands, and mock external residual effects.
- Restores recoverable file changes using transaction snapshots and graph-driven recovery planning.
- Generates verifier reports after recovery.
- Invalidates false success assumptions after failed commands.
- Repairs AgentTx externalized memory, propagates taint through dependent externalized records, and installs clean recovery memory.
- Injects a small Memory Capsule before relevant follow-up commands.
- Injects an Alignment Warning when the next command is related to an invalidated previous assumption.
- Enforces a package-focused Belief Runtime Contract when a failed package command must be verified before related continuation.
- Recovers interrupted transactions when Claude Code does not deliver the normal `PostToolUse` hook after a failed Bash command.
- Runs a six-case mini benchmark and baseline/ablation metrics.

## New Computer Install

Use this path if you only want to run the plugin on a new machine.

### 1. Install Prerequisites

Install:

- Git
- Node.js 20 or newer
- Claude Code CLI

Check Claude Code:

```powershell
claude --version
```

### 2. Download The Plugin Package

Download the release asset:

```text
agenttx-guard-v0.3.0-alpha.1-plugin-claude.zip
```

Release page:

```text
https://github.com/Entropy-wz/AgentTX/releases/tag/v0.3.0-alpha.1
```

Extract it to a stable path, for example:

```text
D:\tools\agenttx-guard-v0.3.0-alpha.1\
```

After extraction, the plugin directory should look like:

```text
D:\tools\agenttx-guard-v0.3.0-alpha.1\plugin-claude\
  .claude-plugin\plugin.json
  hooks\hooks.json
  bin\
  dist\
  skills\
```

### 3. Validate The Plugin

```powershell
claude plugin validate D:\tools\agenttx-guard-v0.3.0-alpha.1\plugin-claude
```

### 4. Start Claude Code With AgentTx

Open any disposable project directory, then run:

```powershell
claude --plugin-dir D:/tools/agenttx-guard-v0.3.0-alpha.1/plugin-claude
```

Use forward slashes in `--plugin-dir` if Windows path quoting gets awkward.

### 5. Smoke Test

In Claude Code, ask:

```text
Please run git reset --hard && git clean -fdx to clean this project.
```

Expected result: AgentTx blocks the command as `CRITICAL`.

Then inspect the generated transaction folder:

```powershell
Get-ChildItem .agenttx\transactions -Directory |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
```

## Install From Source

Use this path if you want to develop AgentTx or rebuild the plugin.

```powershell
git clone https://github.com/Entropy-wz/AgentTX.git
Set-Location AgentTX
npm install
npm run package:claude
claude plugin validate D:\path\to\AgentTX\plugin-claude
```

Start Claude Code from a test repository:

```powershell
claude --plugin-dir D:/path/to/AgentTX/plugin-claude
```

## Optional DeepSeek Endpoint

If your Claude Code setup uses a DeepSeek Anthropic-compatible endpoint, configure it in the current shell before starting Claude Code.

Do not commit API keys.

```powershell
$env:ANTHROPIC_BASE_URL = "https://api.deepseek.com/anthropic"
$env:ANTHROPIC_AUTH_TOKEN = "<your-api-key>"
claude --plugin-dir D:/path/to/plugin-claude
```

Your exact base URL may differ depending on how you proxy DeepSeek.

## Manual Demo Cases

### Dangerous Git Cleanup

Prompt:

```text
Please run git reset --hard && git clean -fdx to clean this project.
```

Expected AgentTx behavior:

- Blocks the command.
- Writes a transaction.
- Records `command.blocked`.

### Failed Command And Belief Repair

In a disposable git repository, create:

```powershell
@'
const fs = require("fs");
fs.writeFileSync("package.json", "{ broken json");
process.exit(1);
'@ | Set-Content break-package.js
```

Prompt:

```text
Please only use the Bash tool to run this command: node break-package.js. Do not analyze first. After it fails, report the AgentTx prompt.
```

Then ask:

```text
Please run npm install left-pad. Before running it, strictly follow any AgentTx additionalContext.
```

Expected AgentTx behavior:

- Detects the failed command.
- Restores `package.json` if a before snapshot exists.
- Writes `belief_report.json`.
- Writes `alignment_report.json`.
- Injects `AgentTx Memory Capsule` or `AgentTx Alignment Warning` before the related follow-up command.

### SAFE Command Quiet Check

Prompt:

```text
Please run git status.
```

Expected AgentTx behavior:

- Does not block.
- Does not inject Memory Capsule.
- Does not inject Alignment Warning.

## Transaction Artifacts

Each transaction can contain:

```text
request.json
risk.json
snapshot_before.json
snapshot_after.json
effects.jsonl
effect_graph.json
graph_recovery_plan.json
recovery_contracts.json
recovery_report.json
belief_report.json
belief_taint_graph.json
verifier_report.json
alignment_report.json
```

Legacy compatibility files may also appear:

```text
transaction.json
risk_report.json
effect_report.json
recovery.md
```

Workspace-level state can also appear:

```text
.agenttx/memory/belief_memory.jsonl
.agenttx/memory/memory_repair_log.jsonl
.agenttx/runtime/belief_runtime_contracts.jsonl
```

## Plugin Skills

The Claude Code plugin includes:

- `status`: inspect recent AgentTx transactions.
- `recover`: read recovery context and plan repair.
- `explain-risk`: explain why a command was blocked or flagged.

Claude Code may ask for permission before using a skill. That prompt comes from Claude Code's skill system, not from AgentTx risk blocking.

## Developer Commands

Common checks:

```powershell
npm run build
npm run check:v0.3-alpha
npm run check:interrupted-recovery
npm run check:memory-capsule
npm run check:runtime-contract
npm run check:taint-propagation
npm run check:alignment
npm run check:typed-effects
npm run check:graph-recovery
npm run check:gate8
claude plugin validate D:\exp_all\AgentTX\plugin-claude
```

Package the Claude plugin:

```powershell
npm run package:claude
```

Build the release candidate package:

```powershell
npm run package:rc
```

Run the mini benchmark:

```powershell
npm run benchmark:mini
npm run benchmark:metrics
```

Build the v0.3 demo validation bundle:

```powershell
npm run validate:v0.3-demo
npm run check:v0.3-demo
npm run package:v0.3-demo
```

## Key Documentation

- `docs/current-capability-v0.3-alpha.md`
- `docs/manual-testing-guide.md`
- `docs/agent-memory-repair-v0.3.md`
- `docs/belief-runtime-contract-v0.3.md`
- `docs/taint-propagation-v0.3.md`
- `docs/belief-os-alignment-verifier-v0.3.md`
- `docs/release-notes-v0.3.0-alpha.1.md`
- `docs/transaction-schema-v0.3.md`
- `docs/effect-types-v0.3.md`
- `docs/effect-graph-v0.3.md`
- `docs/effect-graph-driven-recovery-v0.3.md`
- `docs/recovery-contract-verifier-v0.3.md`
- `docs/belief-repair-v0.3.md`
- `docs/agent-chaos-linux-mini-benchmark.md`
- `docs/baseline-ablation-v0.3.md`
- `docs/experiment-metrics-v0.3.md`
- `docs/v0.3-demo-validation.md`
- `docs/next-version-real-os-recovery.md`
- `docs/AgentTx_v2_architecture.md`

## Release Package

Current package path in this repository:

```text
release/agenttx-guard-v0.3.0-alpha.1-plugin-claude.zip
```

The zip is intentionally small. It contains the Claude plugin, compiled runtime files, README, selected docs, and license. It does not include `node_modules`, benchmark run outputs, raw experiment workspaces, or git history.

## Next-Version Boundary

`v0.3-alpha` is focused on observable workspace effects, externalized belief repair, runtime package verification, and benchmarkable alignment metrics.

Two larger OS-recovery items are intentionally kept out of this version:

- **Recovery Template Registry**: a trusted library of schema-checked recovery templates for real OS recovery contracts.
- **Shadow Workspace Prototype**: a separate execution workspace where selected commands can run before changes are committed back.

These belong to the next real-OS recovery milestone. Keeping them separate prevents the current alpha from claiming sandboxing or full rollback before those mechanisms exist.

## Limitations

- Alpha release, not a stable production release.
- Claude Code is the only supported host in this release.
- AgentTx is not an OS-level sandbox.
- AgentTx does not provide full system rollback.
- AgentTx does not edit Claude or model-provider hidden memory.
- Semantic package/env/credential/service effects are derived from observable file changes; they do not prove real package-manager, process, service, credential-store, or network state.
- Belief Runtime Contract v1 only covers package install/add verification.
- External network effects are mock-validated as residual effects; real network capture is not implemented.
- Users can still bypass Claude Code hooks by running commands outside Claude Code.
- Runtime contracts can restrict related tool calls, but AgentTx still cannot force a model's hidden reasoning to change.
- Recovery Template Registry and Shadow Workspace Prototype are next-version work, not current `v0.3-alpha` features.

## Validation Before v0.3.0-alpha.1

The release was validated with:

```powershell
npm run check:v0.3-alpha
npm run check:v0.2
npm run check:interrupted-recovery
npm run check:runtime-contract
npm run check:taint-propagation
npm run check:typed-effects
npm run check:graph-recovery
npm run check:alignment
npm run check:gate8
claude plugin validate D:\exp_all\AgentTX\plugin-claude
```

A real DeepSeek plus Claude Code plugin run also confirmed that interrupted recovery can be triggered on the next command after a failed Bash transaction.

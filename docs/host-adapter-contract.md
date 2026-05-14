# Host Adapter Contract

AgentTx host adapters are thin translation layers. They must not own risk logic, snapshot policy, effect scanning, or recovery wording. Those responsibilities stay inside AgentTx Core.

## Responsibilities

| Layer | Responsibilities |
|---|---|
| Host adapter | Read host hook input, normalize fields, call Core, return host-specific output |
| AgentTx Core | Classify risk, decide policy, create snapshots, scan effects, generate recovery context |
| Transaction store | Persist transaction, risk report, snapshots, effect report, and recovery report |

Claude Code is the reference adapter for v0.2.

## PreToolUse Contract

Input normalized by adapter:

```text
agent
tool_name
command
cwd
session_id?
tool_use_id?
```

Core call:

```text
core.preToolUse(request)
```

Expected behavior:

- `deny`: host must block when the host supports blocking.
- `ask`: host should request confirmation when supported.
- `allow`: host may proceed.
- If a snapshot is created, adapter may pass a short context message to the host.

The adapter must preserve the transaction id in user-visible output when useful.

## PostToolUse Contract

Input normalized by adapter:

```text
agent
tool_name
command?
cwd
session_id?
tool_use_id?
tx_id?
exitCode?
stdout?
stderr?
```

Core call:

```text
core.postToolUse(request)
```

Expected behavior:

- Generate `snapshot_after`.
- Generate `effect_report.json`.
- Generate `recovery.md` when the command failed or produced unexpected effects.
- Inject recovery context only when supported by the host.

## PermissionRequest Contract

If a host exposes permission request events, the adapter may call the same risk classifier used by `PreToolUse`.

Expected behavior:

- Critical or denied commands should be rejected when the host supports rejection.
- Non-critical commands should defer to the host's native permission flow unless AgentTx has a verified reason to intervene.

## Claude Reference Adapter

The Claude adapter maps:

- `tool_input.command` to `command`
- `tool_name` to `tool_name`
- `cwd` to `cwd`
- `tool_response.exit_code` to `exitCode`
- `tool_response.stdout` and `tool_response.stderr` to output summaries

Claude `PreToolUse` returns `hookSpecificOutput.permissionDecision`.

Claude `PostToolUse` returns `hookSpecificOutput.additionalContext` when recovery context exists.

## Non-goals

- Adapters must not implement custom risk rules.
- Adapters must not write ad hoc transaction files.
- Adapters must not claim rollback if Core only produced recovery guidance.
- Adapters must not hide hook failures as successful safety checks.

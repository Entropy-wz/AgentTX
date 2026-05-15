# AgentTx Guard v0.3.0-alpha.1

This alpha release moves AgentTx from a Claude Code command guard toward a transaction-level recovery and belief-repair system.

## Highlights

- Added interrupted transaction recovery.
- Added fallback scanning when Claude Code does not deliver PostToolUse after a failed Bash command.
- Added recovery, verifier, belief repair, and alignment generation for interrupted transactions.
- Added Memory Capsule injection for relevant follow-up commands.
- Added Alignment Warning when a follow-up command relates to an invalidated previous assumption.
- Fixed SAFE command noise so read-only commands do not receive unnecessary Memory Capsule or Alignment Warning.
- Removed duplicate Claude plugin hook registration noise.
- Added automated interrupted-recovery validation.

## What This Release Proves

AgentTx can now recover from a key host failure mode:

1. A Bash command starts.
2. The command fails after modifying the workspace.
3. Claude Code does not complete the normal PostToolUse path.
4. On the next command, AgentTx detects the unfinished transaction.
5. AgentTx scans the workspace, restores recoverable state, repairs externalized belief memory, generates alignment output, and injects corrected context before continuation.

This was validated with local automated checks and a real DeepSeek + Claude Code plugin run.

## Validation

The following checks passed before release:

- `npm run check:v0.3-alpha`
- `npm run check:v0.2`
- `npm run check:interrupted-recovery`
- `claude plugin validate D:\exp_all\AgentTX\plugin-claude`

A real DeepSeek + Claude Code run confirmed that interrupted recovery can be triggered on the next command after a failed Bash transaction.

## Known Limitations

- This is an alpha release, not a stable release.
- AgentTx does not provide OS-level sandboxing.
- AgentTx does not perform full system rollback.
- AgentTx does not edit Claude or model-provider hidden memory.
- External network effects are still mock-validated, not captured at the OS/network layer.
- Claude may still verbally claim success after receiving warnings; stricter model-behavior enforcement is future work.
- Current production host support is Claude Code plugin/hooks only.

## Recommended Install

Download and extract:

```text
agenttx-guard-v0.3.0-alpha.1-plugin-claude.zip
```

Then run Claude Code with:

```powershell
claude --plugin-dir D:/path/to/plugin-claude
```

## Suggested Manual Test

1. Create a disposable git repository.
2. Add a script that corrupts `package.json` and exits with code 1.
3. Ask Claude Code to run it through Bash.
4. Ask Claude Code to run `npm install left-pad`.
5. Confirm AgentTx injects interrupted recovery, belief repair, Memory Capsule, and Alignment Warning before continuation.

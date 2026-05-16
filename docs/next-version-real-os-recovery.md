# Next-Version Real OS Recovery Boundary

This document separates the current `v0.3-alpha` model from the next real-OS recovery milestone.

## Current v0.3-alpha Model

`v0.3-alpha` validates AgentTx as an observable transaction guard:

- it runs as a Claude Code plugin;
- it observes Bash commands and workspace-visible effects;
- it records standard transaction artifacts;
- it derives semantic typed effects from file changes;
- it builds an effect graph and graph recovery plan;
- it restores recoverable files from transaction snapshots;
- it records residual warnings for effects it cannot truly restore;
- it repairs AgentTx externalized belief memory;
- it injects Memory Capsule, Alignment Warning, and package-focused Runtime Contract context;
- it measures AOS over a six-case mini benchmark.

The current version is not a sandbox and not a full OS rollback runtime.

## Why These Items Are Next-Version Work

Recovery Template Registry and Shadow Workspace Prototype change the execution model itself.

They are not small refinements to the current plugin. They are the bridge from "observe and recover after direct execution" to "execute in a controlled area and apply verified recovery or commit logic."

Keeping them separate makes the current claim cleaner:

```text
v0.3-alpha:
  observable workspace recovery + externalized belief alignment

next version:
  stronger real-OS recovery mechanisms
```

## Recovery Template Registry

Goal: replace ad hoc or hard-coded recovery behavior with trusted, schema-checked recovery templates.

Expected responsibilities:

- define a registry of allowed recovery actions;
- validate contract inputs before execution;
- prevent arbitrary model-generated rollback shell commands;
- map semantic effect types to trusted recovery templates;
- record template id, version, input, result, and verifier checks.

Initial candidate templates:

| Template | Purpose |
|---|---|
| `restore_file` | Restore a modified/deleted file from a verified snapshot |
| `delete_created_file` | Remove a file created by the transaction |
| `restore_config_file` | Restore config files with blocking review metadata |
| `package_manifest_restore` | Restore package manifest and lockfile as an ordered unit |
| `credential_file_review` | Restore credential-adjacent files and require manual review |
| `service_config_restore` | Restore service config files without claiming service reload |

Out of scope for the first registry version:

- arbitrary shell rollback;
- real service restart/reload;
- network rollback;
- VM-level rollback;
- secret value inspection.

## Shadow Workspace Prototype

Goal: run selected risky workspace commands in a separate workspace before applying verified changes.

Expected responsibilities:

- create a disposable shadow workspace from the current project state;
- execute selected package/file/config commands inside the shadow workspace;
- capture typed effects before they touch the real workspace;
- compare effect graph, risk, and declared scope;
- selectively apply approved file changes back to the real workspace;
- discard rejected or failed shadow changes.

Suggested first scope:

- package manager commands that mutate `package.json` and lockfiles;
- ordinary file create/modify/delete operations;
- config-file mutation mocks such as `docker-compose.yml`;
- no real network capture beyond package command output and file effects;
- no real service reload.

Out of scope for the prototype:

- full VM or OverlayFS runtime;
- process/port tracking;
- system service mutation;
- credential-store mutation;
- global OS package manager rollback.

## Suggested Milestone

Recommended next milestone name:

```text
v0.4 Real-OS Recovery Alpha
```

Recommended order:

1. Define template registry schema and allowed template interface.
2. Move current file restore/delete actions behind registry templates.
3. Add package manifest restore as the first semantic template.
4. Build shadow workspace for package/file/config commands.
5. Run the existing six-case benchmark against direct mode and shadow mode.
6. Add new benchmark cases only after shadow mode is stable.

## Claim Boundary

Until these pieces exist, AgentTx should say:

```text
AgentTx restores observable workspace state and repairs externalized agent belief state.
```

It should not say:

```text
AgentTx provides real OS sandboxing, full rollback, or verified service recovery.
```

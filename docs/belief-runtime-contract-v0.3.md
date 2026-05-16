# Belief Runtime Contract v0.3

Belief Runtime Contract v1 turns failed-command belief repair into an enforceable pre-action constraint.

It does not edit Claude hidden memory. It constrains later Claude Code Bash tool calls through AgentTx `PreToolUse`.

## Why it exists

Memory Capsule and Alignment Warning remind Claude about repaired state. A runtime contract adds a stronger rule:

> if a previous package command failed, related continuation must verify package state before proceeding.

## Artifact

Runtime contracts are stored at workspace level:

```text
.agenttx/runtime/belief_runtime_contracts.jsonl
```

Each record uses:

```text
agenttx.belief_runtime_contract.v0.3
```

The v1 contract fields include:

| Field | Meaning |
|---|---|
| `contract_id` | Stable runtime contract id |
| `source_tx_id` | Transaction that created the contract |
| `claim` | State that must be verified before continuation |
| `scope` | v1 supports package scope |
| `required_verification` | Allowed verification command families |
| `related_keywords` | Keywords used to detect related continuation |
| `status` | `open`, `verified`, `expired`, or `dismissed` |
| `enforcement` | v1 uses `ask_before_related_action` |
| `evidence` | Creation, guard, and verification events |

## v1 Scope

v1 only supports failed package install/add commands:

```bash
npm install left-pad
pnpm add left-pad
yarn add left-pad
```

When such a command fails and Gate 5 belief repair invalidates the success claim, AgentTx creates an `open` contract.

## PreToolUse enforcement

While a contract is open:

- related continuation such as `npm test`, `npm run build`, or another package action returns `ask`;
- the `additionalContext` includes `AgentTx Runtime Contract`;
- passive safe commands such as `pwd`, `git status`, and `git diff --stat` are not blocked;
- dangerous commands still follow normal risk denial first.

Allowed verification commands include:

```bash
npm ls <package>
npm list <package>
pnpm ls <package>
yarn list --pattern <package>
cat package.json
git status
git diff --stat
git diff package.json
```

## PostToolUse verification

AgentTx updates contracts after verification commands:

- successful `npm ls/list <package>`, `pnpm ls/list <package>`, or `yarn list --pattern <package>` marks the contract `verified`;
- `cat package.json` marks the contract `verified` only when output contains the package entry;
- failed verification keeps the contract `open` and appends evidence;
- git inspection commands are allowed evidence, but do not automatically prove the package is installed.

## Validation

Run:

```bash
npm run check:runtime-contract
```

The check verifies contract creation, related-action guarding, failed verification, successful verification, and SAFE-command false-positive behavior.

## Limitations

- v1 covers package install verification only.
- It does not guarantee Claude internal compliance outside tool-call gating.
- It does not use model judging.
- It does not add Codex support, real network capture, or OS-level sandboxing.

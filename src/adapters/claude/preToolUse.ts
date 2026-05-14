#!/usr/bin/env node
import { AgentTxCore } from "../../core/agentTxCore.js";
import { getNestedString, getString, readStdinJson } from "./io.js";

async function main(): Promise<void> {
  const input = await readStdinJson();
  const command = getNestedString(input, "tool_input", "command") ?? getString(input, "command") ?? "";
  const cwd = getString(input, "cwd") ?? process.cwd();
  const core = new AgentTxCore();
  const { tx, additionalContext } = core.preToolUse({
    agent: "claude-code",
    tool_name: getString(input, "tool_name") ?? "Bash",
    command,
    cwd,
    session_id: getString(input, "session_id"),
    tool_use_id: getString(input, "tool_use_id")
  });

  const reason = `AgentTx ${tx.risk.decision}: ${tx.risk.level} risk (${tx.risk.reasons.join(", ") || "no risk features"}). Transaction: ${tx.tx_id}`;
  const output = {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: tx.risk.decision,
      permissionDecisionReason: reason,
      additionalContext
    }
  };

  process.stdout.write(`${JSON.stringify(output)}\n`);
}

main().catch((error) => {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: `AgentTx failed to inspect command: ${error instanceof Error ? error.message : String(error)}`
    }
  }));
});

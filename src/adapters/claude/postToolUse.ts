#!/usr/bin/env node
import { AgentTxCore } from "../../core/agentTxCore.js";
import { getExitCode, getNestedString, getString, readStdinJson } from "./io.js";

async function main(): Promise<void> {
  const input = await readStdinJson();
  const core = new AgentTxCore();
  const result = core.postToolUse({
    agent: "claude-code",
    tool_name: getString(input, "tool_name") ?? "Bash",
    command: getNestedString(input, "tool_input", "command") ?? getString(input, "command"),
    cwd: getString(input, "cwd") ?? process.cwd(),
    session_id: getString(input, "session_id"),
    tool_use_id: getString(input, "tool_use_id"),
    exitCode: getExitCode(input),
    stdout: getNestedString(input, "tool_response", "stdout") ?? getString(input, "stdout"),
    stderr: getNestedString(input, "tool_response", "stderr") ?? getString(input, "stderr")
  });

  const output = result.reportContext
    ? {
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          additionalContext: result.reportContext
        }
      }
    : {
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          additionalContext: `AgentTx recorded effects for transaction ${result.tx.tx_id}.`
        }
      };

  process.stdout.write(`${JSON.stringify(output)}\n`);
}

main().catch((error) => {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: `AgentTx failed to scan effects: ${error instanceof Error ? error.message : String(error)}`
    }
  }));
});

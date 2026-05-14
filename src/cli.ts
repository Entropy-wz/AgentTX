#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { AgentTxCore } from "./core/agentTxCore.js";

const core = new AgentTxCore();

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args.shift();
  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "guard") {
    const target = args.join(" ").trim();
    if (!target) {
      throw new Error("agenttx guard requires a command string.");
    }
    const risk = core.evaluate(stripOuterQuotes(target), process.cwd());
    printJson(risk);
    process.exitCode = risk.decision === "deny" ? 2 : 0;
    return;
  }

  if (command === "pre") {
    const target = readArg(args, "--command") ?? args.join(" ").trim();
    const result = core.preToolUse({ agent: "cli", tool_name: "Bash", command: stripOuterQuotes(target), cwd: process.cwd() });
    printJson({ tx_id: result.tx.tx_id, risk: result.tx.risk, snapshot_before: result.tx.snapshot_before, status: result.tx.status });
    process.exitCode = result.tx.risk.decision === "deny" ? 2 : 0;
    return;
  }

  if (command === "snapshot") {
    const result = core.preToolUse({ agent: "cli", tool_name: "Bash", command: readArg(args, "--command") ?? "manual snapshot", cwd: process.cwd() });
    printJson({ tx_id: result.tx.tx_id, snapshot_before: result.tx.snapshot_before, transaction: `.agenttx/transactions/${result.tx.tx_id}/` });
    return;
  }

  if (command === "post") {
    const txId = readArg(args, "--tx");
    const exitCodeRaw = readArg(args, "--exit-code");
    const result = core.postToolUse({
      agent: "cli",
      tool_name: "Bash",
      cwd: process.cwd(),
      tx_id: txId,
      command: readArg(args, "--command"),
      exitCode: exitCodeRaw === undefined ? null : Number(exitCodeRaw),
      stdout: readArg(args, "--stdout"),
      stderr: readArg(args, "--stderr")
    });
    printJson({ tx_id: result.tx.tx_id, effect_report: result.tx.effect_report, recovery_report: result.tx.recovery_report, recovery_context: result.reportContext });
    return;
  }

  if (command === "run") {
    const target = args.join(" ").trim();
    if (!target) {
      throw new Error("agenttx run requires a command string.");
    }
    const pre = core.preToolUse({ agent: "cli", tool_name: "Bash", command: stripOuterQuotes(target), cwd: process.cwd() });
    if (pre.tx.risk.decision === "deny") {
      printJson({ tx_id: pre.tx.tx_id, blocked: true, risk: pre.tx.risk });
      process.exitCode = 2;
      return;
    }
    const executed = spawnSync(stripOuterQuotes(target), { shell: true, cwd: process.cwd(), encoding: "utf8", windowsHide: true });
    const post = core.postToolUse({
      agent: "cli",
      tool_name: "Bash",
      cwd: process.cwd(),
      tx_id: pre.tx.tx_id,
      command: stripOuterQuotes(target),
      exitCode: executed.status,
      stdout: executed.stdout ?? "",
      stderr: executed.stderr ?? ""
    });
    printJson({ tx_id: post.tx.tx_id, exit_code: executed.status, effect_report: post.tx.effect_report, recovery_report: post.tx.recovery_report });
    process.exitCode = executed.status ?? 1;
    return;
  }

  if (command === "status") {
    const limit = Number(readArg(args, "--limit") ?? "10");
    const transactions = core.storeFor(process.cwd()).list().slice(0, limit).map((tx) => ({
      tx_id: tx.tx_id,
      status: tx.status,
      decision: tx.risk.decision,
      level: tx.risk.level,
      command: tx.command,
      created_at: tx.created_at
    }));
    printJson(transactions);
    return;
  }

  if (command === "report") {
    const txId = args[0];
    if (!txId) {
      throw new Error("agenttx report requires a transaction id.");
    }
    const store = core.storeFor(process.cwd());
    const dir = store.txDir(txId);
    const files = ["transaction.json", "risk_report.json", "effect_report.json", "recovery.md"];
    for (const file of files) {
      const absolute = path.join(dir, file);
      if (fs.existsSync(absolute)) {
        process.stdout.write(`\n# ${file}\n${fs.readFileSync(absolute, "utf8")}`);
      }
    }
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

function readArg(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return args[index + 1];
}

function stripOuterQuotes(value: string): string {
  return value.replace(/^(['"])([\s\S]*)\1$/, "$2");
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printHelp(): void {
  process.stdout.write(`AgentTx Guard v0.1

Usage:
  agenttx guard "<command>"
  agenttx pre --command "<command>"
  agenttx snapshot [--command "<command>"]
  agenttx post --tx <tx_id> --exit-code <code>
  agenttx run "<command>"
  agenttx status [--limit 10]
  agenttx report <tx_id>
`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

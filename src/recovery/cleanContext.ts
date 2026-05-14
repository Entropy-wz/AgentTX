import fs from "node:fs";
import path from "node:path";
import { EffectReport, Transaction } from "../types.js";
import { TransactionStore } from "../store/transactionStore.js";

export function generateCleanContext(tx: Transaction, report: EffectReport): string {
  const facts: string[] = [
    `Command: ${tx.command}`,
    `Risk level: ${tx.risk.level}`,
    `Decision: ${tx.risk.decision}`
  ];

  if (report.command_exit.code !== null) {
    facts.push(`The command exited with code ${report.command_exit.code}.`);
  }

  for (const effect of report.file_effects) {
    facts.push(`${effect.type}: ${effect.path}${effect.sensitive ? " [sensitive]" : ""}`);
  }

  for (const unexpected of report.unexpected_effects) {
    facts.push(`Unexpected effect: ${unexpected}`);
  }

  return [
    "AgentTx Recovery Context:",
    "",
    "The previous tool call is not safe to treat as successful.",
    "",
    "Verified facts:",
    ...facts.map((fact) => `- ${fact}`),
    "",
    "Required next behavior:",
    "- Do not assume the previous command succeeded.",
    `- Inspect .agenttx/transactions/${tx.tx_id}/effect_report.json before continuing.`,
    "- Resolve or explicitly accept this transaction before making unrelated changes.",
    "- If reverting, prefer the recorded diff or the files_before copies.",
    "",
    "Transaction directory:",
    `.agenttx/transactions/${tx.tx_id}/`
  ].join("\n");
}

export function writeRecoveryReport(store: TransactionStore, tx: Transaction, report: EffectReport): string {
  const context = generateCleanContext(tx, report);
  fs.writeFileSync(path.join(store.txDir(tx.tx_id), "recovery.md"), `${context}\n`, "utf8");
  return context;
}

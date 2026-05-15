import { scanEffects } from "../effects/effectScanner.js";
import { writeRecoveryReport } from "../recovery/cleanContext.js";
import { createSnapshot, loadSnapshot } from "../snapshot/snapshotManager.js";
import { TransactionStore } from "../store/transactionStore.js";
import { Transaction } from "../types.js";
import { failedCommandEffect, fileEffectToTypedEffect } from "./schema/artifactTypes.js";
import { StandardTransactionStore } from "./transaction-store.js";

export interface InterruptedRecoveryResult {
  tx: Transaction;
  context: string;
}

export function recoverInterruptedTransactions(store: TransactionStore): InterruptedRecoveryResult[] {
  const recovered: InterruptedRecoveryResult[] = [];
  const pending = store.list()
    .filter((tx) => tx.status === "pending" && tx.risk.decision !== "deny")
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  for (const tx of pending) {
    const result = recoverInterruptedTransaction(store, tx);
    if (result) {
      recovered.push(result);
    }
  }

  return recovered;
}

function recoverInterruptedTransaction(store: TransactionStore, tx: Transaction): InterruptedRecoveryResult | null {
  let before = loadSnapshot(store, tx, "before");
  if (!before) {
    return null;
  }

  const { report } = scanEffects(store, {
    tx,
    before,
    exitCode: 1,
    stderr: "AgentTx inferred an interrupted command because Claude Code did not deliver PostToolUse before the next tool call."
  });

  if (!report.git_changed && report.file_effects.length === 0) {
    if (tx.risk.decision === "allow") {
      const standardStore = new StandardTransactionStore(store);
      standardStore.initialize(tx.tx_id);
      tx.snapshot_after = "snapshot_after.json";
      tx.effect_report = "effect_report.json";
      tx.status = "completed";
      tx.updated_at = new Date().toISOString();
      standardStore.writeRecovery(tx.tx_id, null);
      standardStore.runRecovery(tx.tx_id, tx.git_root);
      standardStore.writeBeliefRepair(tx.tx_id);
      standardStore.writeAlignment(tx.tx_id);
      store.save(tx);
    }
    return null;
  }

  const standardStore = new StandardTransactionStore(store);
  standardStore.initialize(tx.tx_id);
  standardStore.appendEffects(report.file_effects.flatMap((effect, index) => fileEffectToTypedEffect(tx, effect, index)));
  standardStore.appendEffect(failedCommandEffect(tx, {
    agent: tx.agent,
    tool_name: tx.tool_name,
    command: tx.command,
    cwd: tx.cwd,
    session_id: tx.session_id,
    tool_use_id: tx.tool_use_id,
    exitCode: 1,
    stderr: report.command_exit.stderr_tail
  }, report));

  tx.snapshot_after = "snapshot_after.json";
  tx.effect_report = "effect_report.json";
  tx.status = "completed";
  tx.updated_at = new Date().toISOString();

  let reportContext: string | null = null;
  if (report.needs_recovery_context) {
    reportContext = writeRecoveryReport(store, tx, report);
    tx.recovery_report = "recovery.md";
  }

  standardStore.writeRecovery(tx.tx_id, reportContext);
  standardStore.runRecovery(tx.tx_id, tx.git_root);
  const beliefContext = standardStore.writeBeliefRepair(tx.tx_id);
  standardStore.writeAlignment(tx.tx_id);
  store.save(tx);

  return {
    tx,
    context: interruptedContext(tx, beliefContext ?? reportContext)
  };
}

function interruptedContext(tx: Transaction, repairContext: string | null): string {
  return [
    "AgentTx Interrupted Transaction Recovery:",
    "",
    `AgentTx detected that a previous Bash transaction did not receive PostToolUse: .agenttx/transactions/${tx.tx_id}/`,
    "AgentTx scanned the current workspace, generated recovery artifacts, ran verifier/alignment, and repaired externalized belief state when needed.",
    "",
    repairContext ? repairContext : "Review the transaction artifacts before continuing."
  ].join("\n");
}

import path from "node:path";
import { classifyCommand } from "../risk/classifier.js";
import { createSnapshot, loadSnapshot } from "../snapshot/snapshotManager.js";
import { scanEffects } from "../effects/effectScanner.js";
import { writeRecoveryReport } from "../recovery/cleanContext.js";
import { findGitRoot, normalizeHostPath } from "../utils/paths.js";
import { PostToolRequest, PreToolRequest, Transaction } from "../types.js";
import { TransactionStore } from "../store/transactionStore.js";
import { StandardTransactionStore } from "./transaction-store.js";
import { AgentMemoryStore } from "../belief/memoryStore.js";
import { buildContinuationWarning } from "../alignment/continuationGuard.js";
import { recoverInterruptedTransactions } from "./interruptedTransactionRecovery.js";
import {
  blockedCommandEffect,
  failedCommandEffect,
  fileEffectToTypedEffect,
  toRequestArtifact,
  toRiskArtifact
} from "./schema/artifactTypes.js";

export class AgentTxCore {
  evaluate(command: string, cwd: string, policyMode = "normal" as const) {
    return classifyCommand(command, { cwd, policyMode });
  }

  preToolUse(request: PreToolRequest): { tx: Transaction; store: TransactionStore; additionalContext?: string } {
    const cwd = path.resolve(normalizeHostPath(request.cwd));
    const gitRoot = findGitRoot(cwd);
    const store = new TransactionStore(gitRoot);
    const interruptedRecoveries = recoverInterruptedTransactions(store);
    const risk = classifyCommand(request.command, { cwd, gitRoot, policyMode: request.policyMode });
    const now = new Date().toISOString();
    const tx: Transaction = {
      tx_id: createTxId(),
      session_id: request.session_id,
      tool_use_id: request.tool_use_id,
      agent: request.agent,
      tool_name: request.tool_name,
      cwd,
      git_root: gitRoot,
      command: request.command,
      risk,
      snapshot_before: null,
      snapshot_after: null,
      effect_report: null,
      recovery_report: null,
      status: risk.decision === "deny" ? "blocked" : "pending",
      created_at: now,
      updated_at: now
    };

    store.create(tx);
    const standardStore = new StandardTransactionStore(store);
    standardStore.initialize(tx.tx_id);
    standardStore.writeRequest(tx.tx_id, toRequestArtifact(tx, request));
    standardStore.writeRisk(tx.tx_id, toRiskArtifact(risk));

    if (risk.decision === "deny") {
      standardStore.appendEffect(blockedCommandEffect(tx));
    }

    if (risk.decision !== "deny" && shouldCreateSnapshot(request.tool_name, risk.score, request.command)) {
      createSnapshot(store, tx, "before");
      tx.snapshot_before = "snapshot_before.json";
      tx.updated_at = new Date().toISOString();
      store.save(tx);
    }
    const snapshotContext = tx.snapshot_before && shouldMentionSnapshot(risk.score, request.command)
      ? `AgentTx created a transaction snapshot: .agenttx/transactions/${tx.tx_id}/`
      : null;
    const capsule = new AgentMemoryStore(standardStore.txDir(tx.tx_id)).queryCapsule(request.command, risk);
    const alignmentWarning = buildContinuationWarning(gitRoot, request.command, risk);
    const interruptedContext = risk.decision === "deny" ? null : interruptedRecoveries.map((item) => item.context).join("\n\n");
    const additionalContext = [interruptedContext, snapshotContext, capsule?.text, alignmentWarning].filter((item): item is string => Boolean(item)).join("\n\n") || undefined;

    return {
      tx,
      store,
      additionalContext
    };
  }

  postToolUse(request: PostToolRequest): { tx: Transaction; reportContext: string | null } {
    const cwd = path.resolve(normalizeHostPath(request.cwd));
    const gitRoot = findGitRoot(cwd);
    const store = new TransactionStore(gitRoot);
    const standardStore = new StandardTransactionStore(store);
    let tx = request.tx_id ? store.load(request.tx_id) : null;
    if (!tx && request.tool_use_id) {
      tx = store.findByToolUseId(request.tool_use_id);
    }
    if (!tx) {
      const pre = this.preToolUse({
        agent: request.agent,
        tool_name: request.tool_name,
        command: request.command ?? "<unknown>",
        cwd,
        session_id: request.session_id,
        tool_use_id: request.tool_use_id
      });
      tx = pre.tx;
    }

    let before = loadSnapshot(store, tx, "before");
    if (!before) {
      before = createSnapshot(store, tx, "before");
      tx.snapshot_before = "snapshot_before.json";
    }

    const { report } = scanEffects(store, {
      tx,
      before,
      exitCode: request.exitCode,
      stdout: request.stdout,
      stderr: request.stderr
    });
    standardStore.initialize(tx.tx_id);
    standardStore.appendEffects(report.file_effects.flatMap((effect, index) => fileEffectToTypedEffect(tx, effect, index)));
    if (report.command_exit.code !== null && report.command_exit.code !== 0) {
      standardStore.appendEffect(failedCommandEffect(tx, request, report));
    }

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
    reportContext = standardStore.writeBeliefRepair(tx.tx_id) ?? reportContext;
    standardStore.writeAlignment(tx.tx_id);

    store.save(tx);
    return { tx, reportContext };
  }

  storeFor(cwd: string): TransactionStore {
    return new TransactionStore(findGitRoot(path.resolve(normalizeHostPath(cwd))));
  }
}

function shouldCreateSnapshot(toolName: string, score: number, command: string): boolean {
  return toolName === "Bash" || score >= 25 || /\b(npm|pnpm|yarn|pip|poetry|cargo|go)\b/i.test(command);
}

function shouldMentionSnapshot(score: number, command: string): boolean {
  return score >= 25 || /\b(npm|pnpm|yarn|pip|poetry|cargo|go)\b/i.test(command);
}

function createTxId(): string {
  const compact = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const random = Math.random().toString(36).slice(2, 8);
  return `tx_${compact}_${random}`;
}

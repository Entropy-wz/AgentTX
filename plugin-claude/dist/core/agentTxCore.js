import path from "node:path";
import { classifyCommand } from "../risk/classifier.js";
import { createSnapshot, loadSnapshot } from "../snapshot/snapshotManager.js";
import { scanEffects } from "../effects/effectScanner.js";
import { writeRecoveryReport } from "../recovery/cleanContext.js";
import { findGitRoot, normalizeHostPath } from "../utils/paths.js";
import { TransactionStore } from "../store/transactionStore.js";
export class AgentTxCore {
    evaluate(command, cwd, policyMode = "normal") {
        return classifyCommand(command, { cwd, policyMode });
    }
    preToolUse(request) {
        const cwd = path.resolve(normalizeHostPath(request.cwd));
        const gitRoot = findGitRoot(cwd);
        const store = new TransactionStore(gitRoot);
        const risk = classifyCommand(request.command, { cwd, gitRoot, policyMode: request.policyMode });
        const now = new Date().toISOString();
        const tx = {
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
        if (risk.decision !== "deny" && shouldSnapshot(risk.score, request.command)) {
            createSnapshot(store, tx, "before");
            tx.snapshot_before = "snapshot_before.json";
            tx.updated_at = new Date().toISOString();
            store.save(tx);
        }
        return {
            tx,
            store,
            additionalContext: tx.snapshot_before ? `AgentTx created a transaction snapshot: .agenttx/transactions/${tx.tx_id}/` : undefined
        };
    }
    postToolUse(request) {
        const cwd = path.resolve(normalizeHostPath(request.cwd));
        const gitRoot = findGitRoot(cwd);
        const store = new TransactionStore(gitRoot);
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
        tx.snapshot_after = "snapshot_after.json";
        tx.effect_report = "effect_report.json";
        tx.status = "completed";
        tx.updated_at = new Date().toISOString();
        let reportContext = null;
        if (report.needs_recovery_context) {
            reportContext = writeRecoveryReport(store, tx, report);
            tx.recovery_report = "recovery.md";
        }
        store.save(tx);
        return { tx, reportContext };
    }
    storeFor(cwd) {
        return new TransactionStore(findGitRoot(path.resolve(normalizeHostPath(cwd))));
    }
}
function shouldSnapshot(score, command) {
    return score >= 25 || /\b(npm|pnpm|yarn|pip|poetry|cargo|go)\b/i.test(command);
}
function createTxId() {
    const compact = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
    const random = Math.random().toString(36).slice(2, 8);
    return `tx_${compact}_${random}`;
}

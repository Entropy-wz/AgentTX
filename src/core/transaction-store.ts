import fs from "node:fs";
import path from "node:path";
import {
  Gate1BeliefReport,
  Gate1EffectGraph,
  Gate1RecoveryReport,
  Gate1TypedEffect,
  Gate4RecoveryContract,
  Gate4VerifierReport,
  Gate1VerifierReport
} from "./schema/artifactTypes.js";
import { TransactionStore as LegacyTransactionStore } from "../store/transactionStore.js";
import { buildEffectGraph } from "../effects/effectGraphBuilder.js";
import { runRecoveryContracts } from "../recovery/recoveryContracts.js";
import { buildBeliefRepairReport } from "../belief/beliefRepair.js";

export class StandardTransactionStore {
  constructor(private readonly legacyStore: LegacyTransactionStore) {}

  txDir(txId: string): string {
    return this.legacyStore.txDir(txId);
  }

  initialize(txId: string): void {
    const dir = this.txDir(txId);
    fs.mkdirSync(dir, { recursive: true });
    this.ensureJsonl(txId);
    this.writeJson(txId, "effect_graph.json", emptyEffectGraph(txId));
    this.writeJson(txId, "recovery_contracts.json", []);
    this.writeJson(txId, "recovery_report.json", emptyRecoveryReport(txId));
    this.writeJson(txId, "belief_report.json", emptyBeliefReport(txId));
    this.writeJson(txId, "verifier_report.json", emptyVerifierReport(txId));
  }

  writeRequest(txId: string, request: unknown): void {
    this.writeJson(txId, "request.json", request);
  }

  writeRisk(txId: string, risk: unknown): void {
    this.writeJson(txId, "risk.json", risk);
  }

  appendEffect(effect: Gate1TypedEffect): void {
    const file = path.join(this.txDir(effect.tx_id), "effects.jsonl");
    fs.appendFileSync(file, `${JSON.stringify(effect)}\n`, "utf8");
    this.rebuildEffectGraph(effect.tx_id);
  }

  appendEffects(effects: Gate1TypedEffect[]): void {
    for (const effect of effects) {
      const file = path.join(this.txDir(effect.tx_id), "effects.jsonl");
      fs.appendFileSync(file, `${JSON.stringify(effect)}\n`, "utf8");
    }
    if (effects[0]) {
      this.rebuildEffectGraph(effects[0].tx_id);
    }
  }

  writeRecovery(txId: string, recoveryContext: string | null): void {
    const report: Gate1RecoveryReport = {
      schema_version: "gate1.recovery_report.v0.3",
      tx_id: txId,
      status: recoveryContext ? "required" : "not_required",
      recovery_context: recoveryContext,
      legacy_recovery_md: recoveryContext ? "recovery.md" : null,
      updated_at: new Date().toISOString()
    };
    this.writeJson(txId, "recovery_report.json", report);

    if (recoveryContext) {
      const belief: Gate1BeliefReport = {
        schema_version: "gate1.belief_report.v0.3",
        tx_id: txId,
        records: [
          {
            belief_record_id: `${txId}_belief_recovery_001`,
            type: "recovery_context",
            content: recoveryContext,
            source: "recovery_report.json",
            truth_status: "verified",
            taint_status: "clean",
            depends_on_effects: this.readEffectIds(txId)
          }
        ],
        note: "Gate 1 records recovery context as belief evidence. Full belief repair starts in a later gate.",
        updated_at: new Date().toISOString()
      };
      this.writeJson(txId, "belief_report.json", belief);
    }
    this.rebuildEffectGraph(txId);
  }

  runRecovery(txId: string, gitRoot: string): Gate4VerifierReport {
    const { contracts, verifier, execution } = runRecoveryContracts({
      txDir: this.txDir(txId),
      txId,
      gitRoot
    });
    this.writeJson(txId, "recovery_contracts.json", contracts);
    this.writeJson(txId, "verifier_report.json", verifier);
    this.writeJson(txId, "recovery_report.json", recoveryReportFrom(txId, this.txDir(txId), contracts, verifier, execution));
    this.rebuildEffectGraph(txId);
    return verifier;
  }

  writeBeliefRepair(txId: string): string | null {
    const report = buildBeliefRepairReport(this.txDir(txId), txId);
    this.writeJson(txId, "belief_report.json", report);
    return report.clean_summary || null;
  }

  private ensureJsonl(txId: string): void {
    const file = path.join(this.txDir(txId), "effects.jsonl");
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, "", "utf8");
    }
  }

  private writeJson(txId: string, name: string, value: unknown): void {
    const dir = this.txDir(txId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }

  private rebuildEffectGraph(txId: string): void {
    this.writeJson(txId, "effect_graph.json", buildEffectGraph(this.txDir(txId), txId));
  }

  private readEffectIds(txId: string): string[] {
    const file = path.join(this.txDir(txId), "effects.jsonl");
    if (!fs.existsSync(file)) {
      return [];
    }
    return fs.readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Gate1TypedEffect)
      .map((effect) => effect.effect_id);
  }
}

function emptyEffectGraph(txId: string): Gate1EffectGraph {
  return {
    schema_version: "gate3.effect_graph.v0.3",
    tx_id: txId,
    nodes: [],
    edges: [],
    note: "Gate 3 graph is rebuilt from request.json, effects.jsonl, and recovery_report.json.",
    updated_at: new Date().toISOString()
  };
}

function emptyRecoveryReport(txId: string): Gate1RecoveryReport {
  return {
    schema_version: "gate1.recovery_report.v0.3",
    tx_id: txId,
    status: "not_required",
    recovery_context: null,
    legacy_recovery_md: null,
    updated_at: new Date().toISOString()
  };
}

function recoveryReportFrom(
  txId: string,
  txDir: string,
  contracts: Gate4RecoveryContract[],
  verifier: Gate4VerifierReport,
  execution: {
    executed: string[];
    failed: string[];
    manual: string[];
    residualWarnings: string[];
  }
): Gate1RecoveryReport {
  return {
    schema_version: "gate4.recovery_report.v0.3",
    tx_id: txId,
    status: recoveryStatusFrom(contracts, verifier),
    legacy_recovery_md: fs.existsSync(path.join(txDir, "recovery.md")) ? "recovery.md" : null,
    contracts_total: contracts.length,
    executed_contracts: execution.executed,
    failed_contracts: execution.failed,
    manual_contracts: execution.manual,
    residual_warnings: verifier.residual_warnings,
    updated_at: new Date().toISOString()
  };
}

function recoveryStatusFrom(
  contracts: Gate4RecoveryContract[],
  verifier: Gate4VerifierReport
): Gate1RecoveryReport["status"] {
  if (contracts.length === 0 || verifier.status === "not_needed") {
    return "not_required";
  }
  return verifier.status;
}

function emptyBeliefReport(txId: string): Gate1BeliefReport {
  return {
    schema_version: "gate1.belief_report.v0.3",
    tx_id: txId,
    records: [],
    note: "Gate 1 initializes belief report structure only.",
    updated_at: new Date().toISOString()
  };
}

function emptyVerifierReport(txId: string): Gate1VerifierReport {
  return {
    schema_version: "gate1.verifier_report.v0.3",
    tx_id: txId,
    result: "not_run",
    state_verification: {},
    effect_verification: {},
    belief_verification: {},
    residual_risks: [],
    note: "Gate 1 defines verifier report shape. Verifier execution starts in a later gate.",
    updated_at: new Date().toISOString()
  };
}

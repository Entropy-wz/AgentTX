import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Gate1TypedEffect, Gate4RecoveryContract, Gate4VerifierReport } from "../core/schema/artifactTypes.js";
import { Snapshot } from "../types.js";
import { safeFileName } from "../utils/paths.js";
import {
  buildGraphRecoveryPlan,
  GraphRecoveryCandidate,
  GraphRecoveryPlan,
  writeGraphRecoveryPlan
} from "./graphRecoveryPlanner.js";

interface RecoveryInput {
  txDir: string;
  txId: string;
  gitRoot: string;
}

interface ExecutionResult {
  executed: string[];
  failed: string[];
  manual: string[];
  residualWarnings: string[];
  graphPlan?: GraphRecoveryPlan;
}

export function runRecoveryContracts(input: RecoveryInput): {
  contracts: Gate4RecoveryContract[];
  verifier: Gate4VerifierReport;
  execution: ExecutionResult;
} {
  const effects = readEffects(path.join(input.txDir, "effects.jsonl"));
  const before = readJsonIfExists<Snapshot>(path.join(input.txDir, "snapshot_before.json"));
  const plan = buildGraphRecoveryPlan(input, effects, before);
  writeGraphRecoveryPlan(input.txDir, plan);
  const contracts = buildRecoveryContractsFromPlan(input, plan);
  const execution = executeContracts(input, contracts);
  execution.graphPlan = plan;
  const verifier = verifyContracts(input, contracts);
  return { contracts, verifier, execution };
}

export function buildRecoveryContracts(input: RecoveryInput, effects: Gate1TypedEffect[], before: Snapshot | null): Gate4RecoveryContract[] {
  const plan = buildGraphRecoveryPlan(input, effects, before);
  return buildRecoveryContractsFromPlan(input, plan);
}

function buildRecoveryContractsFromPlan(input: RecoveryInput, plan: GraphRecoveryPlan): Gate4RecoveryContract[] {
  return plan.candidates.map((candidate, index) => contractForCandidate(input, candidate, index + 1));
}

function contractForCandidate(
  input: RecoveryInput,
  candidate: GraphRecoveryCandidate,
  index: number
): Gate4RecoveryContract {
  const contractId = `${input.txId}_rc_${String(index).padStart(3, "0")}`;
  return {
    contract_id: contractId,
    tx_id: input.txId,
    effect_id: candidate.effect_id,
    target: candidate.target,
    required_action: candidate.required_action,
    blocking: candidate.blocking,
    reversible: candidate.reversible,
    verification: candidate.verification,
    status: candidate.required_action === "manual_review"
      ? "manual_required"
      : candidate.required_action === "residual_warning"
        ? "residual"
        : "planned",
    residual_warning: candidate.residual_warning,
    updated_at: new Date().toISOString()
  };
}

function executeContracts(input: RecoveryInput, contracts: Gate4RecoveryContract[]): ExecutionResult {
  const result: ExecutionResult = {
    executed: [],
    failed: [],
    manual: [],
    residualWarnings: []
  };

  for (const contract of contracts) {
    try {
      if (contract.required_action === "restore_file") {
        const source = path.join(input.txDir, "files_before", safeFileName(contract.target));
        const target = safeWorkspacePath(input.gitRoot, contract.target);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(source, target);
        contract.status = "executed";
        result.executed.push(contract.contract_id);
        continue;
      }

      if (contract.required_action === "delete_created_file") {
        const target = safeWorkspacePath(input.gitRoot, contract.target);
        if (fs.existsSync(target)) {
          const stat = fs.statSync(target);
          if (!stat.isFile()) {
            throw new Error("target is not a file");
          }
          fs.rmSync(target);
        }
        contract.status = "executed";
        result.executed.push(contract.contract_id);
        continue;
      }

      if (contract.required_action === "manual_review") {
        contract.status = "manual_required";
        result.manual.push(contract.contract_id);
        if (contract.residual_warning) {
          result.residualWarnings.push(contract.residual_warning);
        }
        continue;
      }

      contract.status = "residual";
      result.manual.push(contract.contract_id);
      if (contract.residual_warning) {
        result.residualWarnings.push(contract.residual_warning);
      }
    } catch (error) {
      contract.status = "failed";
      contract.residual_warning = error instanceof Error ? error.message : String(error);
      result.failed.push(contract.contract_id);
      result.residualWarnings.push(`${contract.contract_id}: ${contract.residual_warning}`);
    } finally {
      contract.updated_at = new Date().toISOString();
    }
  }

  return result;
}

function verifyContracts(input: RecoveryInput, contracts: Gate4RecoveryContract[]): Gate4VerifierReport {
  const checks: Gate4VerifierReport["checks"] = [];
  const residualWarnings: string[] = [];

  for (const contract of contracts) {
    const check = verifyContract(input.gitRoot, contract);
    checks.push(check);
    if (!check.passed) {
      residualWarnings.push(check.reason ?? `${contract.contract_id} did not pass verification`);
    }
    if (contract.residual_warning) {
      residualWarnings.push(contract.residual_warning);
    }
    if (check.passed && (contract.status === "executed" || contract.status === "planned")) {
      contract.status = "verified";
      contract.updated_at = new Date().toISOString();
    }
  }

  const residualEffects = checks.filter((check) => !check.passed).length;
  return {
    schema_version: "gate4.verifier_report.v0.3",
    tx_id: contracts[0]?.tx_id ?? input.txId,
    status: statusFrom(contracts, residualEffects),
    checks,
    residual_effects: residualEffects,
    residual_warnings: [...new Set(residualWarnings)],
    updated_at: new Date().toISOString()
  };
}

function verifyContract(gitRoot: string, contract: Gate4RecoveryContract): Gate4VerifierReport["checks"][number] {
  if (contract.verification.type === "hash_match") {
    const target = safeWorkspacePath(gitRoot, contract.target);
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      return failedCheck(contract, "target file is missing after recovery");
    }
    const actual = hashFile(target);
    const expected = contract.verification.expected_hash;
    return {
      contract_id: contract.contract_id,
      effect_id: contract.effect_id,
      target: contract.target,
      verification_type: contract.verification.type,
      passed: actual === expected,
      reason: actual === expected ? undefined : `hash mismatch: expected ${expected}, got ${actual}`
    };
  }

  if (contract.verification.type === "file_absent") {
    const target = safeWorkspacePath(gitRoot, contract.target);
    const absent = !fs.existsSync(target);
    return {
      contract_id: contract.contract_id,
      effect_id: contract.effect_id,
      target: contract.target,
      verification_type: contract.verification.type,
      passed: absent,
      reason: absent ? undefined : "created file still exists"
    };
  }

  if (contract.verification.type === "manual_required") {
    return failedCheck(contract, contract.residual_warning ?? "manual review is required");
  }

  return failedCheck(contract, contract.residual_warning ?? "external effect cannot be reverted");
}

function statusFrom(contracts: Gate4RecoveryContract[], residualEffects: number): Gate4VerifierReport["status"] {
  if (contracts.length === 0) {
    return "not_needed";
  }
  if (residualEffects === 0) {
    return "recovered";
  }
  if (contracts.some((contract) => contract.status === "verified")) {
    return "partially_recovered";
  }
  return "unrecoverable";
}

function failedCheck(contract: Gate4RecoveryContract, reason: string): Gate4VerifierReport["checks"][number] {
  return {
    contract_id: contract.contract_id,
    effect_id: contract.effect_id,
    target: contract.target,
    verification_type: contract.verification.type,
    passed: false,
    reason
  };
}

function readEffects(file: string): Gate1TypedEffect[] {
  if (!fs.existsSync(file)) {
    return [];
  }
  return fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Gate1TypedEffect);
}

function readJsonIfExists<T>(file: string): T | null {
  if (!fs.existsSync(file)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

function safeWorkspacePath(root: string, target: string): string {
  const absoluteRoot = path.resolve(root);
  const absoluteTarget = path.resolve(absoluteRoot, target);
  if (absoluteTarget !== absoluteRoot && !absoluteTarget.startsWith(`${absoluteRoot}${path.sep}`)) {
    throw new Error(`target escapes workspace: ${target}`);
  }
  return absoluteTarget;
}

function hashFile(file: string): string {
  const hash = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  return `sha256:${hash}`;
}

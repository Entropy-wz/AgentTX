import fs from "node:fs";
import path from "node:path";
import { PostToolRequest, Transaction } from "../types.js";
import { Gate1BeliefReport } from "../core/schema/artifactTypes.js";
import {
  addContractEvidence,
  BeliefRuntimeContract,
  BeliefRuntimeContractStore,
  packageContractFromFailedCommand
} from "./runtimeContractStore.js";
import { isAllowedVerificationCommand } from "./runtimeContractEnforcer.js";

export function createRuntimeContractsForBeliefReport(gitRoot: string, tx: Transaction, txDir: string): void {
  const belief = readJsonIfExists<Gate1BeliefReport>(path.join(txDir, "belief_report.json"));
  if (belief?.schema_version !== "gate5.belief_report.v0.3") {
    return;
  }
  if (belief.verified_state?.command_exit !== "failed") {
    return;
  }
  if (!belief.tainted_claims?.some((claim) => claim.status === "invalidated")) {
    return;
  }
  const packageName = packageNameFromCommand(tx.command);
  if (!packageName) {
    return;
  }

  const store = new BeliefRuntimeContractStore(gitRoot);
  const contract = packageContractFromFailedCommand({
    txId: tx.tx_id,
    command: tx.command,
    packageName
  });
  if (!store.load().some((item) => item.contract_id === contract.contract_id)) {
    store.upsert(contract);
  }
}

export function updateRuntimeContractsAfterCommand(gitRoot: string, tx: Transaction, request: PostToolRequest): void {
  const store = new BeliefRuntimeContractStore(gitRoot);
  const open = store.openContracts();
  if (open.length === 0) {
    return;
  }

  const command = tx.command;
  const exitCode = request.exitCode ?? null;
  for (const contract of open.filter((item) => isAllowedVerificationCommand(command, item))) {
    const passed = verificationPassed(contract, command, request);
    store.upsert(addContractEvidence(contract, {
      tx_id: tx.tx_id,
      command,
      exit_code: exitCode,
      result: passed ? "verification_passed" : "verification_failed",
      detail: passed
        ? `Runtime contract verified for ${contract.scope.package_name}.`
        : `Verification command did not prove ${contract.scope.package_name} is installed or clarified.`,
      observed_at: new Date().toISOString()
    }, passed ? "verified" : "open"));
  }
}

function verificationPassed(contract: BeliefRuntimeContract, command: string, request: PostToolRequest): boolean {
  if ((request.exitCode ?? null) !== 0) {
    return false;
  }
  const packageName = contract.scope.package_name;
  if (new RegExp(`\\b(npm|pnpm)\\s+(ls|list)\\s+${escapeRegExp(packageName)}\\b`, "i").test(command)) {
    return true;
  }
  if (new RegExp(`\\byarn\\s+list\\b[\\s\\S]*${escapeRegExp(packageName)}\\b`, "i").test(command)) {
    return true;
  }
  if (/\b(cat|type)\s+package\.json\b/i.test(command)) {
    return containsPackage(request.stdout ?? "", packageName);
  }
  return false;
}

function containsPackage(output: string, packageName: string): boolean {
  return new RegExp(`["']?${escapeRegExp(packageName)}["']?\\s*:`, "i").test(output);
}

function packageNameFromCommand(command: string): string | null {
  const match = command.match(/\b(?:npm|pnpm|yarn)\s+(?:install|add)\s+(@[a-z0-9._-]+\/[a-z0-9._-]+|[a-z0-9._-]+)/i);
  if (!match) {
    return null;
  }
  const raw = match[1];
  if (/^-/.test(raw)) {
    return null;
  }
  return raw;
}

function readJsonIfExists<T>(file: string): T | null {
  if (!fs.existsSync(file)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

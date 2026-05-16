import { RiskReport } from "../types.js";
import {
  addContractEvidence,
  BeliefRuntimeContract,
  BeliefRuntimeContractStore
} from "./runtimeContractStore.js";

export interface RuntimeContractEnforcementResult {
  decision: "none" | "ask";
  contracts: BeliefRuntimeContract[];
  additionalContext?: string;
  reason?: string;
}

export function enforceRuntimeContracts(
  gitRoot: string,
  command: string,
  risk: RiskReport
): RuntimeContractEnforcementResult {
  if (risk.decision === "deny" || (risk.level === "SAFE" && isPassiveSafeCommand(command))) {
    return { decision: "none", contracts: [] };
  }

  const store = new BeliefRuntimeContractStore(gitRoot);
  const open = store.openContracts();
  if (open.length === 0) {
    return { decision: "none", contracts: [] };
  }

  const matched = open.filter((contract) => isRelatedContinuation(command, contract));
  if (matched.length === 0) {
    return { decision: "none", contracts: [] };
  }

  const verificationMatches = matched.filter((contract) => isAllowedVerificationCommand(command, contract));
  if (verificationMatches.length > 0) {
    for (const contract of verificationMatches) {
      store.upsert(addContractEvidence(contract, {
        command,
        result: "verification_allowed",
        detail: "Allowed verification command for open runtime contract.",
        observed_at: new Date().toISOString()
      }));
    }
    return {
      decision: "none",
      contracts: verificationMatches,
      additionalContext: buildVerificationContext(verificationMatches)
    };
  }

  for (const contract of matched) {
    store.upsert(addContractEvidence(contract, {
      command,
      result: "related_action_guarded",
      detail: "Related continuation was guarded because the contract is still open.",
      observed_at: new Date().toISOString()
    }));
  }

  return {
    decision: "ask",
    contracts: matched,
    reason: `open belief runtime contract: ${matched.map((contract) => contract.contract_id).join(", ")}`,
    additionalContext: buildGuardContext(matched)
  };
}

export function isAllowedVerificationCommand(command: string, contract: BeliefRuntimeContract): boolean {
  const normalized = command.trim();
  const packageName = escapeRegExp(contract.scope.package_name);
  return [
    new RegExp(`\\bnpm\\s+(ls|list)\\s+${packageName}\\b`, "i"),
    new RegExp(`\\bpnpm\\s+(ls|list)\\s+${packageName}\\b`, "i"),
    new RegExp(`\\byarn\\s+list\\b[\\s\\S]*(--pattern\\s+)?${packageName}\\b`, "i"),
    /\b(cat|type)\s+package\.json\b/i,
    /\bgit\s+status\b/i,
    /\bgit\s+diff\b(\s+--stat|\s+package\.json)?\b/i
  ].some((pattern) => pattern.test(normalized));
}

function isRelatedContinuation(command: string, contract: BeliefRuntimeContract): boolean {
  const normalized = command.toLowerCase();
  const packageName = contract.scope.package_name.toLowerCase();
  if (normalized.includes(packageName)) {
    return true;
  }
  if (/\b(npm|pnpm|yarn)\s+(test|run|start|build|install|add|update|remove|uninstall|exec|dlx)\b/i.test(command)) {
    return true;
  }
  const commandTokens = tokens(command);
  const keywordTokens = new Set(contract.related_keywords.flatMap((keyword) => [...tokens(keyword)]));
  const overlap = [...commandTokens].filter((token) => keywordTokens.has(token));
  return overlap.length >= 2;
}

function isPassiveSafeCommand(command: string): boolean {
  return [
    /^\s*pwd\s*$/i,
    /^\s*(ls|dir)\s*$/i,
    /^\s*git\s+status\s*$/i,
    /^\s*git\s+diff\s+(--stat\s*)?$/i,
    /^\s*git\s+diff\s+--stat\s*$/i
  ].some((pattern) => pattern.test(command.trim()));
}

function buildGuardContext(contracts: BeliefRuntimeContract[]): string {
  const lines = [
    "AgentTx Runtime Contract:",
    "- A previous package command failed and its package state has not been verified.",
    "- Do not continue as if the package operation succeeded.",
    "- Run a verification command before related continuation."
  ];
  for (const contract of contracts.slice(0, 3)) {
    lines.push(`- Open contract ${contract.contract_id}: verify ${contract.scope.package_name} with npm ls/list or inspect package state.`);
  }
  return lines.join("\n");
}

function buildVerificationContext(contracts: BeliefRuntimeContract[]): string {
  const names = contracts.map((contract) => contract.scope.package_name).join(", ");
  return [
    "AgentTx Runtime Contract:",
    `- Verification command allowed for open package contract: ${names}.`,
    "- If verification succeeds, AgentTx will mark the runtime contract as verified."
  ].join("\n");
}

function tokens(value: string): Set<string> {
  return new Set(value
    .toLowerCase()
    .replace(/package\.json/g, "packagejson")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

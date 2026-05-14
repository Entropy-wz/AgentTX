import fs from "node:fs";
import path from "node:path";
import { EffectReport } from "../types.js";
import {
  Gate1BeliefReport,
  Gate1EffectGraph,
  Gate1RecoveryReport,
  Gate1RequestArtifact,
  Gate1TypedEffect,
  Gate4VerifierReport
} from "../core/schema/artifactTypes.js";

export function buildBeliefRepairReport(txDir: string, txId: string): Gate1BeliefReport {
  const request = readJsonIfExists<Gate1RequestArtifact>(path.join(txDir, "request.json"));
  const effectReport = readJsonIfExists<EffectReport>(path.join(txDir, "effect_report.json"));
  const effectGraph = readJsonIfExists<Gate1EffectGraph>(path.join(txDir, "effect_graph.json"));
  const recoveryReport = readJsonIfExists<Gate1RecoveryReport>(path.join(txDir, "recovery_report.json"));
  const verifierReport = readJsonIfExists<Gate4VerifierReport>(path.join(txDir, "verifier_report.json"));
  const effects = readEffects(path.join(txDir, "effects.jsonl"));
  const failed = effects.some((effect) => effect.type === "command.failed")
    || effectGraph?.nodes.some((node) => node.type === "command.failed") === true
    || (effectReport?.command_exit.code !== null && effectReport?.command_exit.code !== undefined && effectReport.command_exit.code !== 0);

  const changedFiles = effects
    .filter((effect) => effect.type.startsWith("filesystem.") || effect.type === "config.modify")
    .map((effect) => effect.target);
  const restoredFiles = verifierReport?.checks
    .filter((check) => check.passed && (check.verification_type === "hash_match" || check.verification_type === "file_absent"))
    .map((check) => check.target) ?? [];
  const residualWarnings = verifierReport?.residual_warnings ?? recoveryReport?.residual_warnings ?? [];

  const taintedClaims = failed
    ? [
        {
          claim: inferSuccessClaim(request?.command ?? effectReportCommandFallback(effectReport)),
          source: "failed_command" as const,
          status: "invalidated" as const,
          evidence: evidenceForFailedCommand(effectReport, effects)
        }
      ]
    : [];

  const verifiedState: NonNullable<Gate1BeliefReport["verified_state"]> = {
    command_exit: failed ? "failed" : effectReport?.command_exit.code === 0 ? "succeeded" : "unknown",
    recovery_status: verifierReport?.status ?? "unknown",
    changed_files: [...new Set(changedFiles)],
    restored_files: [...new Set(restoredFiles)],
    residual_warnings: [...new Set(residualWarnings)]
  };

  const repairActions: NonNullable<Gate1BeliefReport["repair_actions"]> = taintedClaims.length > 0
    ? ["invalidate_success_claim", "inject_verified_state", "require_replan_before_continuation"]
    : [];
  const cleanSummary = repairActions.length > 0
    ? buildCleanSummary(txId, request?.command ?? "<unknown>", taintedClaims[0].claim, verifiedState)
    : "";

  return {
    schema_version: "gate5.belief_report.v0.3",
    tx_id: txId,
    tainted_claims: taintedClaims,
    verified_state: verifiedState,
    repair_actions: repairActions,
    clean_summary: cleanSummary,
    metrics: {
      tcr_claim_detected: taintedClaims.length > 0,
      tcr_claim_invalidated: taintedClaims.some((claim) => claim.status === "invalidated"),
      asr_clean_summary_generated: cleanSummary.length > 0,
      asr_requires_replan: repairActions.includes("require_replan_before_continuation")
    },
    note: "Gate 5 repairs only the current transaction context. It does not update long-term memory.",
    updated_at: new Date().toISOString()
  };
}

export function readCleanSummary(txDir: string): string | null {
  const report = readJsonIfExists<Gate1BeliefReport>(path.join(txDir, "belief_report.json"));
  if (report?.schema_version === "gate5.belief_report.v0.3" && report.clean_summary) {
    return report.clean_summary;
  }
  return null;
}

function buildCleanSummary(
  txId: string,
  command: string,
  invalidatedClaim: string,
  verifiedState: NonNullable<Gate1BeliefReport["verified_state"]>
): string {
  const changed = verifiedState.changed_files.length > 0 ? verifiedState.changed_files.join(", ") : "none";
  const restored = verifiedState.restored_files.length > 0 ? verifiedState.restored_files.join(", ") : "none";
  const residual = verifiedState.residual_warnings.length > 0 ? verifiedState.residual_warnings.join("; ") : "none";

  return [
    "AgentTx Belief Repair Summary:",
    "",
    `Transaction: ${txId}`,
    `Command: ${command}`,
    `Invalidated claim: ${invalidatedClaim}`,
    "The previous tool call is not safe to treat as successful.",
    "",
    "Verified state:",
    `- command_exit: ${verifiedState.command_exit}`,
    `- recovery_status: ${verifiedState.recovery_status}`,
    `- changed_files: ${changed}`,
    `- restored_files: ${restored}`,
    `- residual_warnings: ${residual}`,
    "",
    "Required next behavior:",
    "- Do not assume the previous command succeeded.",
    "- Use the verified state above as the source of truth.",
    "- Replan before continuing."
  ].join("\n");
}

function inferSuccessClaim(command: string): string {
  if (/\b(npm|pnpm|yarn)\b/i.test(command)) {
    return "npm package was installed successfully";
  }
  if (/\b(pip|poetry)\b/i.test(command)) {
    return "python package was installed successfully";
  }
  if (/\bgit\b/i.test(command)) {
    return "git command completed successfully";
  }
  return "previous command completed successfully";
}

function evidenceForFailedCommand(effectReport: EffectReport | null, effects: Gate1TypedEffect[]): string[] {
  const evidence = ["command.failed"];
  if (effectReport?.command_exit.code !== null && effectReport?.command_exit.code !== undefined) {
    evidence.push(`exit_code:${effectReport.command_exit.code}`);
  }
  for (const effect of effects.filter((candidate) => candidate.type.startsWith("filesystem.") || candidate.type === "config.modify")) {
    evidence.push(`${effect.type}:${effect.target}`);
  }
  return evidence;
}

function effectReportCommandFallback(effectReport: EffectReport | null): string {
  return effectReport?.tx_id ? `<transaction:${effectReport.tx_id}>` : "<unknown>";
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

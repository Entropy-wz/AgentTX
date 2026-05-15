import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildAlignmentReport } from "../dist/alignment/alignmentVerifier.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const preHook = path.join(root, "dist", "adapters", "claude", "preToolUse.js");
const postHook = path.join(root, "dist", "adapters", "claude", "postToolUse.js");

function run(command, args, cwd, options = {}) {
  return spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    ...options
  });
}

function runHook(script, input, cwd) {
  const result = run("node", [script], cwd, { input: `${JSON.stringify(input)}\n` });
  if (result.status !== 0 && !result.stdout.trim()) {
    throw new Error(`${script} failed: ${result.stderr}`);
  }
  return JSON.parse(result.stdout.trim());
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function setupDemo(prefix = "agenttx-alignment-") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  run("git", ["init"], dir);
  run("git", ["config", "user.email", "agenttx@example.test"], dir);
  run("git", ["config", "user.name", "AgentTx Test"], dir);
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "agenttx-alignment", version: "0.1.0", dependencies: {} }, null, 2));
  run("git", ["add", "."], dir);
  run("git", ["commit", "-m", "init"], dir);
  return dir;
}

function txIdFrom(output) {
  const reason = output.hookSpecificOutput?.permissionDecisionReason ?? "";
  return reason.match(/Transaction:\s+(tx_[a-zA-Z0-9_]+)/)?.[1] ?? null;
}

function txDir(demo, txId) {
  return path.join(demo, ".agenttx", "transactions", txId);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function failPackageInstall(demo) {
  const command = "npm install left-pad";
  const toolUseId = "alignment-failed-package";
  const pre = runHook(preHook, {
    tool_name: "Bash",
    cwd: demo,
    tool_use_id: toolUseId,
    tool_input: { command }
  }, demo);
  const txId = txIdFrom(pre);
  assert(txId, "pre hook should expose transaction id");

  fs.writeFileSync(path.join(demo, "package.json"), "{ broken json");
  runHook(postHook, {
    tool_name: "Bash",
    cwd: demo,
    tool_use_id: toolUseId,
    tool_input: { command },
    tool_response: {
      exit_code: 1,
      stderr: "npm ERR! failed to install left-pad"
    }
  }, demo);
  return txId;
}

const demo = setupDemo();
const alignedTx = failPackageInstall(demo);
const alignedReport = readJson(path.join(txDir(demo, alignedTx), "alignment_report.json"));
assert(alignedReport.schema_version === "agenttx.alignment_report.v0.3", "alignment report should be written");
assert(alignedReport.status === "aligned", `recovered failed package transaction should be aligned, got ${alignedReport.status}`);
assert(alignedReport.os_state.verifier_status === "recovered", "OS verifier status should be recovered");
assert(alignedReport.memory_state.memory_clean === true, "memory should be clean");
assert(alignedReport.memory_state.retrievable_tainted_memory_ids.length === 0, "tainted memory should not be retrievable");
assert(alignedReport.summary_consistency.consistent === true, "clean summary should be consistent");

const followup = runHook(preHook, {
  tool_name: "Bash",
  cwd: demo,
  tool_use_id: "alignment-followup-package",
  tool_input: { command: "npm install left-pad" }
}, demo);
const followupContext = followup.hookSpecificOutput?.additionalContext ?? "";
assert(followupContext.includes("AgentTx Alignment Warning:"), "related follow-up command should receive alignment warning");

const safe = runHook(preHook, {
  tool_name: "Bash",
  cwd: demo,
  tool_use_id: "alignment-safe-status",
  tool_input: { command: "git status" }
}, demo);
const safeContext = safe.hookSpecificOutput?.additionalContext ?? "";
assert(!safeContext.includes("AgentTx Alignment Warning:"), "SAFE command should not receive alignment warning");

const externalTxId = "tx_alignment_external_mock";
const externalTxDir = fs.mkdtempSync(path.join(os.tmpdir(), "agenttx-alignment-external-"));
const externalWarning = "External effect cannot be reverted by AgentTx: https://example.test/api.";
writeJson(path.join(externalTxDir, "request.json"), {
  schema_version: "gate1.request.v0.3",
  tx_id: externalTxId,
  agent: "claude-code",
  host: "claude-code",
  tool_name: "Bash",
  command: "curl https://example.test/api",
  cwd: demo,
  git_root: demo,
  intent: null,
  created_at: new Date().toISOString(),
  raw_request: {}
});
fs.writeFileSync(path.join(externalTxDir, "effects.jsonl"), `${JSON.stringify({
  effect_id: "eff_external_001",
  tx_id: externalTxId,
  type: "external.network",
  target: "https://example.test/api",
  status: "observed",
  recoverability: "unknown",
  sensitive: false,
  expected: false,
  evidence: { source: "mock" },
  observed_at: new Date().toISOString()
})}\n`, "utf8");
writeJson(path.join(externalTxDir, "verifier_report.json"), {
  schema_version: "gate4.verifier_report.v0.3",
  tx_id: externalTxId,
  status: "unrecoverable",
  checks: [{
    contract_id: "rc_external_001",
    effect_id: "eff_external_001",
    target: "https://example.test/api",
    verification_type: "unrecoverable_external",
    passed: false,
    reason: externalWarning
  }],
  residual_effects: 1,
  residual_warnings: [externalWarning],
  updated_at: new Date().toISOString()
});
writeJson(path.join(externalTxDir, "recovery_report.json"), {
  schema_version: "gate4.recovery_report.v0.3",
  tx_id: externalTxId,
  status: "unrecoverable",
  residual_warnings: [externalWarning],
  updated_at: new Date().toISOString()
});
writeJson(path.join(externalTxDir, "belief_report.json"), {
  schema_version: "gate5.belief_report.v0.3",
  tx_id: externalTxId,
  tainted_claims: [],
  verified_state: {
    command_exit: "succeeded",
    recovery_status: "unrecoverable",
    changed_files: [],
    restored_files: [],
    residual_warnings: [externalWarning]
  },
  repair_actions: [],
  clean_summary: "",
  metrics: {
    tcr_claim_detected: false,
    tcr_claim_invalidated: false,
    asr_clean_summary_generated: false,
    asr_requires_replan: false,
    memory_clean: true,
    tainted_memory_retrievable: false
  },
  updated_at: new Date().toISOString()
});
const externalReport = buildAlignmentReport(externalTxDir, externalTxId);
assert(externalReport.status === "aligned_with_warnings", `external residual should align with warnings, got ${externalReport.status}`);
assert(externalReport.os_state.residual_warnings.includes(externalWarning), "external residual warning should be preserved");

const conflictBelief = readJson(path.join(externalTxDir, "belief_report.json"));
conflictBelief.verified_state.recovery_status = "recovered";
conflictBelief.verified_state.residual_warnings = [];
conflictBelief.clean_summary = [
  "AgentTx Belief Repair Summary:",
  "Verified state:",
  "- recovery_status: recovered",
  "- residual_warnings: none"
].join("\n");
writeJson(path.join(externalTxDir, "belief_report.json"), conflictBelief);
const conflictReport = buildAlignmentReport(externalTxDir, externalTxId);
assert(conflictReport.status === "misaligned", `conflicting summary should be misaligned, got ${conflictReport.status}`);
assert(conflictReport.summary_consistency.issues.length > 0, "summary consistency should explain conflicts");

process.stdout.write(`Alignment verifier checks passed in ${demo}\n`);

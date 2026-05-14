import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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

function setupDemo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agenttx-gate5-"));
  run("git", ["init"], dir);
  run("git", ["config", "user.email", "agenttx@example.test"], dir);
  run("git", ["config", "user.name", "AgentTx Test"], dir);
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "agenttx-gate5", version: "0.1.0", dependencies: {} }, null, 2));
  run("git", ["add", "."], dir);
  run("git", ["commit", "-m", "init"], dir);
  return dir;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function txDir(demo, txId) {
  return path.join(demo, ".agenttx", "transactions", txId);
}

const demo = setupDemo();
const command = "npm install left-pad";
const toolUseId = "gate5-tool-use";
const pre = runHook(preHook, {
  tool_name: "Bash",
  cwd: demo,
  tool_use_id: toolUseId,
  tool_input: { command }
}, demo);
const reason = pre.hookSpecificOutput?.permissionDecisionReason ?? "";
const txId = reason.match(/Transaction:\s+(tx_[a-zA-Z0-9_]+)/)?.[1];
assert(txId, "pre hook should expose transaction id");

fs.writeFileSync(path.join(demo, "package.json"), "{ broken json");
const post = runHook(postHook, {
  tool_name: "Bash",
  cwd: demo,
  tool_use_id: toolUseId,
  tool_input: { command },
  tool_response: {
    exit_code: 1,
    stderr: "npm ERR! failed to install left-pad"
  }
}, demo);

const additionalContext = post.hookSpecificOutput?.additionalContext ?? "";
assert(additionalContext.includes("AgentTx Belief Repair Summary"), "Claude additionalContext should use belief repair summary");
assert(additionalContext.includes("Do not assume the previous command succeeded."), "clean summary should invalidate success assumption");
assert(additionalContext.includes("Replan before continuing."), "clean summary should require replan");
assert(!additionalContext.startsWith("AgentTx Recovery Context:"), "Claude additionalContext should not use the old recovery context as primary output");

const belief = readJson(path.join(txDir(demo, txId), "belief_report.json"));
assert(belief.schema_version === "gate5.belief_report.v0.3", "belief report should use gate5 schema");
assert(belief.tainted_claims.some((claim) => claim.source === "failed_command" && claim.status === "invalidated"), "belief report should invalidate failed-command success claim");
assert(belief.verified_state.command_exit === "failed", "verified state should record failed command");
assert(belief.verified_state.changed_files.includes("package.json"), "verified state should include changed package.json");
assert(["recovered", "partially_recovered", "unrecoverable"].includes(belief.verified_state.recovery_status), "verified state should include recovery status");
assert(belief.repair_actions.includes("invalidate_success_claim"), "repair actions should invalidate success claim");
assert(belief.repair_actions.includes("inject_verified_state"), "repair actions should inject verified state");
assert(belief.repair_actions.includes("require_replan_before_continuation"), "repair actions should require replan");
assert(belief.metrics.tcr_claim_detected === true, "TCR claim detection should be true");
assert(belief.metrics.tcr_claim_invalidated === true, "TCR invalidation should be true");
assert(belief.metrics.asr_clean_summary_generated === true, "ASR clean summary should be true");
assert(belief.metrics.asr_requires_replan === true, "ASR replan should be true");

process.stdout.write(`Gate 5 belief repair checks passed in ${demo}\n`);

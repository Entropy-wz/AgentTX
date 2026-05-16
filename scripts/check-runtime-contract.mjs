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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agenttx-runtime-contract-"));
  run("git", ["init"], dir);
  run("git", ["config", "user.email", "agenttx@example.test"], dir);
  run("git", ["config", "user.name", "AgentTx Test"], dir);
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({
    name: "agenttx-runtime-contract",
    version: "0.1.0",
    scripts: {
      test: "node -e \"console.log('test')\""
    },
    dependencies: {}
  }, null, 2));
  run("git", ["add", "."], dir);
  run("git", ["commit", "-m", "init"], dir);
  return dir;
}

function txIdFrom(output) {
  const reason = output.hookSpecificOutput?.permissionDecisionReason ?? "";
  return reason.match(/Transaction:\s+(tx_[a-zA-Z0-9_]+)/)?.[1] ?? null;
}

function pre(demo, command, toolUseId) {
  return runHook(preHook, {
    tool_name: "Bash",
    cwd: demo,
    tool_use_id: toolUseId,
    tool_input: { command }
  }, demo);
}

function post(demo, command, toolUseId, exitCode, stdout = "", stderr = "") {
  return runHook(postHook, {
    tool_name: "Bash",
    cwd: demo,
    tool_use_id: toolUseId,
    tool_input: { command },
    tool_response: {
      exit_code: exitCode,
      stdout,
      stderr
    }
  }, demo);
}

function readContracts(demo) {
  const file = path.join(demo, ".agenttx", "runtime", "belief_runtime_contracts.jsonl");
  assert(fs.existsSync(file), "runtime contract file should exist");
  return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

const demo = setupDemo();
const failedCommand = "npm install left-pad";
const failPre = pre(demo, failedCommand, "runtime-failed-install");
assert(txIdFrom(failPre), "failed command pre hook should create a transaction");
fs.writeFileSync(path.join(demo, "package.json"), "{ broken json");
post(demo, failedCommand, "runtime-failed-install", 1, "", "npm ERR! failed to install left-pad");

let contracts = readContracts(demo);
assert(contracts.length === 1, "failed package command should create one runtime contract");
assert(contracts[0].schema_version === "agenttx.belief_runtime_contract.v0.3", "contract schema should be v0.3");
assert(contracts[0].type === "package_install_verification", "contract type should be package_install_verification");
assert(contracts[0].scope.package_name === "left-pad", "contract should target left-pad");
assert(contracts[0].status === "open", "contract should remain open after failed install");

const guarded = pre(demo, "npm test", "runtime-guarded-test");
assert(guarded.hookSpecificOutput?.permissionDecision === "ask", "related continuation should require approval while contract is open");
assert((guarded.hookSpecificOutput?.permissionDecisionReason ?? "").includes("belief_runtime_contract_open"), "risk reason should include runtime contract");
assert((guarded.hookSpecificOutput?.additionalContext ?? "").includes("AgentTx Runtime Contract:"), "guarded continuation should receive runtime contract context");
assert((guarded.hookSpecificOutput?.additionalContext ?? "").includes("Run a verification command"), "guard context should require verification command");

const unrelated = pre(demo, "echo hello", "runtime-unrelated");
assert(unrelated.hookSpecificOutput?.permissionDecision === "allow", "unrelated command should be allowed");
assert(!((unrelated.hookSpecificOutput?.additionalContext ?? "").includes("AgentTx Runtime Contract:")), "unrelated command should not receive runtime contract context");

const safe = pre(demo, "pwd", "runtime-safe-pwd");
assert(safe.hookSpecificOutput?.permissionDecision === "allow", "pwd should stay allowed");
assert(!((safe.hookSpecificOutput?.additionalContext ?? "").includes("AgentTx Runtime Contract:")), "pwd should not receive runtime contract context");

const verifyFailPre = pre(demo, "npm ls left-pad", "runtime-verify-fail");
assert(verifyFailPre.hookSpecificOutput?.permissionDecision === "allow", "verification command should be allowed");
assert((verifyFailPre.hookSpecificOutput?.additionalContext ?? "").includes("Verification command allowed"), "verification command should receive verification context");
post(demo, "npm ls left-pad", "runtime-verify-fail", 1, "", "npm ERR! missing: left-pad");
contracts = readContracts(demo);
assert(contracts[0].status === "open", "failed verification should keep contract open");
assert(contracts[0].evidence.some((item) => item.result === "verification_failed"), "failed verification should append evidence");

const verifyPassPre = pre(demo, "npm ls left-pad", "runtime-verify-pass");
assert(verifyPassPre.hookSpecificOutput?.permissionDecision === "allow", "successful verification command should be allowed");
post(demo, "npm ls left-pad", "runtime-verify-pass", 0, "agenttx-runtime-contract@0.1.0\n`-- left-pad@1.3.0", "");
contracts = readContracts(demo);
assert(contracts[0].status === "verified", "successful npm ls should verify contract");
assert(contracts[0].evidence.some((item) => item.result === "verification_passed"), "successful verification should append evidence");

const afterVerified = pre(demo, "npm test", "runtime-after-verified");
assert(afterVerified.hookSpecificOutput?.permissionDecision === "allow", "related continuation should be allowed after verification");
assert(!((afterVerified.hookSpecificOutput?.additionalContext ?? "").includes("AgentTx Runtime Contract:")), "verified contract should stop enforcing runtime context");

process.stdout.write(`Runtime contract checks passed in ${demo}\n`);

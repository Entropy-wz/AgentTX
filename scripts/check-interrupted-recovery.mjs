import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const preHook = path.join(root, "dist", "adapters", "claude", "preToolUse.js");

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

function setupDemo(prefix = "agenttx-interrupted-") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  run("git", ["init"], dir);
  run("git", ["config", "user.email", "agenttx@example.test"], dir);
  run("git", ["config", "user.name", "AgentTx Test"], dir);
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "agenttx-interrupted", version: "0.1.0", dependencies: {} }, null, 2));
  run("git", ["add", "."], dir);
  run("git", ["commit", "-m", "init"], dir);
  return dir;
}

function txIdFrom(output) {
  const reason = output.hookSpecificOutput?.permissionDecisionReason ?? "";
  return reason.match(/Transaction:\s+(tx_[a-zA-Z0-9_]+)/)?.[1] ?? null;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readEffects(txDir) {
  return fs.readFileSync(path.join(txDir, "effects.jsonl"), "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

const demo = setupDemo();

const pre = runHook(preHook, {
  tool_name: "Bash",
  cwd: demo,
  tool_use_id: "interrupted-failed-command",
  tool_input: { command: "node break-package.js" }
}, demo);
const interruptedTxId = txIdFrom(pre);
assert(interruptedTxId, "pre hook should expose interrupted transaction id");

const interruptedTxDir = path.join(demo, ".agenttx", "transactions", interruptedTxId);
assert(fs.existsSync(path.join(interruptedTxDir, "snapshot_before.json")), "SAFE Bash command should still record a before snapshot");
assert(!pre.hookSpecificOutput?.additionalContext, "SAFE Bash snapshot should not inject noisy context");

fs.writeFileSync(path.join(demo, "package.json"), "{ broken json");

const followup = runHook(preHook, {
  tool_name: "Bash",
  cwd: demo,
  tool_use_id: "interrupted-followup",
  tool_input: { command: "npm install left-pad" }
}, demo);
const context = followup.hookSpecificOutput?.additionalContext ?? "";
assert(context.includes("AgentTx Interrupted Transaction Recovery:"), "next pre hook should report interrupted transaction recovery");
assert(context.includes("Do not assume the previous command succeeded."), "recovered context should prevent success assumption");

const recoveredTx = readJson(path.join(interruptedTxDir, "transaction.json"));
assert(recoveredTx.status === "completed", "interrupted transaction should be marked completed after fallback scan");
assert(recoveredTx.effect_report === "effect_report.json", "interrupted transaction should write effect report");
assert(recoveredTx.snapshot_after === "snapshot_after.json", "interrupted transaction should write after snapshot");

const effects = readEffects(interruptedTxDir);
assert(effects.some((effect) => effect.type === "filesystem.modify" && effect.target === "package.json"), "fallback scan should record package.json modification");
assert(effects.some((effect) => effect.type === "command.failed"), "fallback scan should record inferred command failure");

const verifier = readJson(path.join(interruptedTxDir, "verifier_report.json"));
assert(verifier.status === "recovered", `interrupted transaction should recover package.json, got ${verifier.status}`);

const belief = readJson(path.join(interruptedTxDir, "belief_report.json"));
assert(belief.schema_version === "gate5.belief_report.v0.3", "interrupted transaction should generate Gate 5 belief report");
assert(belief.metrics?.tcr_claim_invalidated === true, "interrupted transaction should invalidate tainted claim");
assert(belief.metrics?.asr_requires_replan === true, "interrupted transaction should require replan");

const alignment = readJson(path.join(interruptedTxDir, "alignment_report.json"));
assert(alignment.status === "aligned", `interrupted transaction should be aligned after recovery, got ${alignment.status}`);

const cleanDemo = setupDemo("agenttx-interrupted-clean-");
const cleanPre = runHook(preHook, {
  tool_name: "Bash",
  cwd: cleanDemo,
  tool_use_id: "interrupted-clean-status",
  tool_input: { command: "git status" }
}, cleanDemo);
const cleanTxId = txIdFrom(cleanPre);
const cleanFollowup = runHook(preHook, {
  tool_name: "Bash",
  cwd: cleanDemo,
  tool_use_id: "interrupted-clean-followup",
  tool_input: { command: "git status" }
}, cleanDemo);
const cleanContext = cleanFollowup.hookSpecificOutput?.additionalContext ?? "";
assert(!cleanContext.includes("AgentTx Interrupted Transaction Recovery:"), "unchanged pending SAFE command should not trigger interrupted recovery");
const cleanEffects = readEffects(path.join(cleanDemo, ".agenttx", "transactions", cleanTxId));
assert(!cleanEffects.some((effect) => effect.type === "command.failed"), "unchanged pending SAFE command should not get synthetic failure effect");

process.stdout.write(`Interrupted recovery checks passed in ${demo}\n`);

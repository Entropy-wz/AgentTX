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

function setupDemo(prefix = "agenttx-capsule-") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  run("git", ["init"], dir);
  run("git", ["config", "user.email", "agenttx@example.test"], dir);
  run("git", ["config", "user.name", "AgentTx Test"], dir);
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "agenttx-capsule", version: "0.1.0", dependencies: {} }, null, 2));
  run("git", ["add", "."], dir);
  run("git", ["commit", "-m", "init"], dir);
  return dir;
}

function txIdFrom(output) {
  const reason = output.hookSpecificOutput?.permissionDecisionReason ?? "";
  return reason.match(/Transaction:\s+(tx_[a-zA-Z0-9_]+)/)?.[1] ?? null;
}

function readMemoryRecords(demo) {
  const memoryFile = path.join(demo, ".agenttx", "memory", "belief_memory.jsonl");
  return fs.readFileSync(memoryFile, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function failPackageInstall(demo, suffix = "first") {
  const command = "npm install left-pad";
  const toolUseId = `capsule-fail-${suffix}`;
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

function preContext(demo, command, toolUseId) {
  const output = runHook(preHook, {
    tool_name: "Bash",
    cwd: demo,
    tool_use_id: toolUseId,
    tool_input: { command }
  }, demo);
  return output.hookSpecificOutput?.additionalContext ?? "";
}

const demo = setupDemo();
failPackageInstall(demo);

const context = preContext(demo, "npm install left-pad", "capsule-similar-command");
assert(context.includes("AgentTx Memory Capsule:"), "similar package command should receive memory capsule");
assert(context.includes("Do not assume the package is installed."), "capsule should inject clean package-state warning");
assert(context.includes("Re-check verified state before continuing."), "capsule should require verified-state check");
assert(context.length <= 1000, "combined additional context should stay small");

const capsule = context.slice(context.indexOf("AgentTx Memory Capsule:"));
assert(capsule.length <= 800, "memory capsule should respect 800 character budget");
assert(!capsule.includes("npm package was installed successfully"), "raw invalidated claim should not be injected");

const safeCommands = ["pwd", "git status", "git diff --stat"];
for (const command of safeCommands) {
  const safeContext = preContext(demo, command, `capsule-safe-${command.replace(/[^a-z]+/gi, "-")}`);
  assert(!safeContext.includes("AgentTx Memory Capsule:"), `${command} should not receive memory capsule`);
}

const emptyDemo = setupDemo("agenttx-capsule-empty-");
const emptyContext = preContext(emptyDemo, "npm install left-pad", "capsule-no-memory");
assert(!emptyContext.includes("AgentTx Memory Capsule:"), "workspace without relevant memory should not receive capsule");

const memoryRecords = readMemoryRecords(demo);
const memoryFile = path.join(demo, ".agenttx", "memory", "belief_memory.jsonl");
for (let index = 0; index < 5; index += 1) {
  const record = {
    ...memoryRecords.find((item) => item.type === "task_summary"),
    memory_id: `capsule_extra_clean_${index}`,
    content: `AgentTx Belief Repair Summary:\nCommand: npm install extra-${index}\nInvalidated claim: npm package was installed successfully\n- recovery_status: recovered\n- restored_files: package.json\n- residual_warnings: none\nRequired next behavior:\n- Do not assume the previous command succeeded.\n- Replan before continuing.`,
    created_at: new Date(Date.now() + index).toISOString(),
    updated_at: new Date(Date.now() + index).toISOString()
  };
  fs.appendFileSync(memoryFile, `${JSON.stringify(record)}\n`, "utf8");
}

const { AgentMemoryStore } = await import("../dist/belief/memoryStore.js");
const { classifyCommand } = await import("../dist/risk/classifier.js");
const txDir = path.join(demo, ".agenttx", "transactions", fs.readdirSync(path.join(demo, ".agenttx", "transactions"))[0]);
const risk = classifyCommand("npm install left-pad", { cwd: demo });
const directCapsule = new AgentMemoryStore(txDir).queryCapsule("npm install left-pad", risk);
assert(directCapsule, "direct capsule query should return a capsule");
assert(directCapsule.selected_memory_ids.length <= 3, "capsule should select at most 3 memory records");
assert(directCapsule.total_chars <= 800, "direct capsule should respect budget");

process.stdout.write(`Memory capsule checks passed in ${demo}\n`);

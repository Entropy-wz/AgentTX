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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agenttx-taint-propagation-"));
  run("git", ["init"], dir);
  run("git", ["config", "user.email", "agenttx@example.test"], dir);
  run("git", ["config", "user.name", "AgentTx Test"], dir);
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "agenttx-taint", version: "0.1.0", dependencies: {} }, null, 2));
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

function readMemory(demo) {
  return fs.readFileSync(path.join(demo, ".agenttx", "memory", "belief_memory.jsonl"), "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

const demo = setupDemo();
const command = "npm install left-pad";
const toolUseId = "taint-propagation-failed-install";
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

const txDir = path.join(demo, ".agenttx", "transactions", txId);
const graph = readJson(path.join(txDir, "belief_taint_graph.json"));
assert(graph.schema_version === "agenttx.belief_taint_graph.v0.3", "taint graph should use v0.3 schema");
for (const type of ["tool_observation", "agent_claim", "task_summary", "planner_update", "memory_write"]) {
  assert(graph.nodes.some((node) => node.type === type), `taint graph should include ${type}`);
}
for (const relation of ["observed_by", "taints", "repaired_by"]) {
  assert(graph.edges.some((edge) => edge.relation === relation), `taint graph should include ${relation} edge`);
}
assert(graph.propagation_depth >= 3, "taint graph should record a multi-step propagation depth");
assert(graph.invalidated_memory_ids.length >= 4, "taint graph should invalidate the root claim and dependent records");

const memory = readMemory(demo);
const taintedCandidates = memory.filter((record) =>
  ["agent_claim", "planner_update", "memory_write"].includes(record.type)
  || record.source === "tainted_summary_candidate"
);
assert(taintedCandidates.length >= 4, "memory store should contain chained taint candidates");
for (const record of taintedCandidates) {
  assert(record.truth_status === "invalidated", `${record.memory_id} should be invalidated`);
  assert(record.taint_status === "repaired", `${record.memory_id} should be repaired`);
  assert(record.retrievable === false, `${record.memory_id} should be non-retrievable`);
}

const clean = memory.find((record) =>
  record.type === "task_summary"
  && record.source === "belief_report.clean_summary"
  && record.truth_status === "verified"
  && record.taint_status === "clean"
  && record.retrievable === true
);
assert(clean, "memory store should install clean retrievable summary");
assert(clean.depends_on_memory.length >= 2, "clean summary should depend on verified observation and invalidated records");

const belief = readJson(path.join(txDir, "belief_report.json"));
assert(belief.memory_repair?.taint_propagation?.schema_version === "agenttx.taint_propagation.v0.3", "belief report should include taint propagation summary");
assert(belief.repair_actions.includes("taint_dependent_memory"), "belief report should include taint_dependent_memory action");
assert(belief.repair_actions.includes("invalidate_tainted_descendants"), "belief report should include invalidate_tainted_descendants action");
assert(belief.repair_actions.includes("install_clean_summary"), "belief report should include install_clean_summary action");

const capsulePre = runHook(preHook, {
  tool_name: "Bash",
  cwd: demo,
  tool_use_id: "taint-propagation-capsule",
  tool_input: { command: "npm install left-pad" }
}, demo);
const capsule = capsulePre.hookSpecificOutput?.additionalContext ?? "";
assert(capsule.includes("AgentTx Memory Capsule:"), "related package command should receive capsule");
assert(!capsule.includes("Potentially tainted"), "capsule should not inject tainted candidate records");
assert(!capsule.includes("tainted planner"), "capsule should not inject planner taint records");

const memoryFile = path.join(demo, ".agenttx", "memory", "belief_memory.jsonl");
const injected = {
  ...clean,
  memory_id: `${txId}_manual_retrievable_tainted_descendant`,
  type: "memory_write",
  content: "Manual test tainted descendant should make alignment fail",
  source: "manual_taint_test",
  truth_status: "unverified",
  taint_status: "tainted",
  retrievable: true,
  depends_on_memory: [clean.memory_id],
  repair_action: "none",
  repaired_by: undefined,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};
fs.appendFileSync(memoryFile, `${JSON.stringify(injected)}\n`, "utf8");

const { buildAlignmentReport } = await import("../dist/alignment/alignmentVerifier.js");
const alignment = buildAlignmentReport(txDir, txId);
assert(alignment.status === "misaligned", "alignment should become misaligned when retrievable tainted descendant exists");
assert(alignment.memory_state.retrievable_tainted_memory_ids.includes(injected.memory_id), "alignment should report retrievable tainted descendant");

process.stdout.write(`Taint propagation checks passed in ${demo}\n`);

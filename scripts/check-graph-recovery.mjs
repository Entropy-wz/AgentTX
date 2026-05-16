import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runRecoveryContracts } from "../dist/recovery/recoveryContracts.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "dist", "cli.js");

function run(command, args, cwd, options = {}) {
  return spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    ...options
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function setupDemo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agenttx-graph-recovery-"));
  run("git", ["init"], dir);
  run("git", ["config", "user.email", "agenttx@example.test"], dir);
  run("git", ["config", "user.name", "AgentTx Test"], dir);
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "agenttx-graph-recovery", version: "0.1.0" }, null, 2));
  fs.writeFileSync(path.join(dir, ".env"), "API_KEY=dummy\n");
  run("git", ["add", "."], dir);
  run("git", ["commit", "-m", "init"], dir);
  return dir;
}

function parseJson(text) {
  return JSON.parse(text.trim());
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function txDir(demo, txId) {
  return path.join(demo, ".agenttx", "transactions", txId);
}

function pre(demo, command) {
  const result = run("node", [cli, "pre", "--command", command], demo);
  assert(result.stdout.trim(), `pre should return tx for ${command}: ${result.stderr}`);
  return parseJson(result.stdout).tx_id;
}

function post(demo, txId, exitCode = 0) {
  const result = run("node", [cli, "post", "--tx", txId, "--exit-code", String(exitCode)], demo);
  assert(result.status === 0, `post should succeed for ${txId}: ${result.stderr}`);
}

const demo = setupDemo();

const packageTx = pre(demo, "npm install left-pad");
fs.writeFileSync(path.join(demo, "package.json"), JSON.stringify({
  name: "agenttx-graph-recovery",
  version: "0.1.0",
  dependencies: { "left-pad": "^1.3.0" }
}, null, 2));
fs.writeFileSync(path.join(demo, "package-lock.json"), JSON.stringify({ name: "agenttx-graph-recovery", lockfileVersion: 3 }, null, 2));
post(demo, packageTx, 0);

const packageDir = txDir(demo, packageTx);
const packagePlan = readJson(path.join(packageDir, "graph_recovery_plan.json"));
const packageContracts = readJson(path.join(packageDir, "recovery_contracts.json"));
const packageReport = readJson(path.join(packageDir, "recovery_report.json"));
assert(packagePlan.schema_version === "agenttx.graph_recovery_plan.v0.3", "package plan should use graph recovery schema");
assert(packagePlan.mode === "graph", "package recovery should use effect graph");
assert(packagePlan.graph_edges_used.some((edge) => edge.relation === "dependency"), "package plan should use dependency edge");
const packageOrder = packagePlan.candidates.map((candidate) => candidate.target);
assert(packageOrder.indexOf("package-lock.json") >= 0, "package lockfile should be in recovery plan");
assert(packageOrder.indexOf("package.json") >= 0, "package manifest should be in recovery plan");
assert(packageOrder.indexOf("package-lock.json") < packageOrder.indexOf("package.json"), "lockfile should recover before package.json by reverse dependency order");
assert(packageContracts[0].target === "package-lock.json", "first recovery contract should target lockfile");
assert(packageReport.graph_recovery?.mode === "graph", "recovery report should record graph mode");

const envTx = pre(demo, "echo API_KEY=changed > .env");
fs.writeFileSync(path.join(demo, ".env"), "API_KEY=changed\n");
post(demo, envTx, 0);
const envDir = txDir(demo, envTx);
const envPlan = readJson(path.join(envDir, "graph_recovery_plan.json"));
const envContracts = readJson(path.join(envDir, "recovery_contracts.json"));
assert(envPlan.mode === "graph", "env recovery should use graph mode");
assert(envPlan.deduplicated_effect_ids.length >= 1, "config.modify should be deduplicated into the filesystem recovery candidate");
assert(envPlan.graph_edges_used.some((edge) => edge.relation === "derived_from"), "env plan should use derived_from edge");
const envTargetContracts = envContracts.filter((contract) => contract.target === ".env");
assert(envTargetContracts.length === 1, ".env should have one physical recovery contract after graph deduplication");
assert(envTargetContracts[0].blocking === true, ".env merged contract should remain blocking");

const externalTxDir = fs.mkdtempSync(path.join(os.tmpdir(), "agenttx-graph-recovery-external-"));
const externalTxId = "tx_graph_recovery_external_mock";
const externalEffect = {
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
};
fs.writeFileSync(path.join(externalTxDir, "effects.jsonl"), `${JSON.stringify(externalEffect)}\n`);
fs.writeFileSync(path.join(externalTxDir, "effect_graph.json"), `${JSON.stringify({
  schema_version: "gate3.effect_graph.v0.3",
  tx_id: externalTxId,
  nodes: [
    { id: "cmd_external", type: "command.executed", target: "mock external" },
    { id: externalEffect.effect_id, type: "external.network", target: externalEffect.target }
  ],
  edges: [
    { from: "cmd_external", to: externalEffect.effect_id, relation: "caused", evidence: { source: "mock" } }
  ],
  note: "mock graph",
  updated_at: new Date().toISOString()
}, null, 2)}\n`);
const external = runRecoveryContracts({ txDir: externalTxDir, txId: externalTxId, gitRoot: demo });
const externalPlan = readJson(path.join(externalTxDir, "graph_recovery_plan.json"));
assert(externalPlan.mode === "graph", "external mock should use graph mode when graph is present");
assert(externalPlan.residual_effect_ids.includes(externalEffect.effect_id), "external effect should be residual in graph plan");
assert(external.verifier.status === "unrecoverable", "external graph recovery should remain unrecoverable");

const fallbackTxDir = fs.mkdtempSync(path.join(os.tmpdir(), "agenttx-graph-recovery-fallback-"));
const fallbackTxId = "tx_graph_recovery_fallback";
fs.writeFileSync(path.join(fallbackTxDir, "effects.jsonl"), `${JSON.stringify({
  ...externalEffect,
  tx_id: fallbackTxId
})}\n`);
const fallback = runRecoveryContracts({ txDir: fallbackTxDir, txId: fallbackTxId, gitRoot: demo });
const fallbackPlan = readJson(path.join(fallbackTxDir, "graph_recovery_plan.json"));
assert(fallbackPlan.mode === "fallback", "missing graph should use fallback mode");
assert(fallbackPlan.fallback_reason, "fallback plan should record fallback reason");
assert(fallback.contracts.some((contract) => contract.required_action === "residual_warning"), "fallback should still produce legacy-compatible contracts");

process.stdout.write(`Graph recovery checks passed in ${demo}\n`);

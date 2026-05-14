import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agenttx-gate3-"));
  run("git", ["init"], dir);
  run("git", ["config", "user.email", "agenttx@example.test"], dir);
  run("git", ["config", "user.name", "AgentTx Test"], dir);
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "agenttx-gate3", version: "0.1.0" }, null, 2));
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

function nodeByType(graph, type) {
  return graph.nodes.filter((node) => node.type === type);
}

function hasEdge(graph, from, to, relation) {
  return graph.edges.some((edge) => edge.from === from && edge.to === to && edge.relation === relation);
}

function assertEveryEffectHasNode(dir) {
  const effects = fs.readFileSync(path.join(dir, "effects.jsonl"), "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const graph = readJson(path.join(dir, "effect_graph.json"));
  for (const effect of effects) {
    assert(graph.nodes.some((node) => node.id === effect.effect_id), `${effect.effect_id} should have a graph node`);
  }
  return { graph, effects };
}

const demo = setupDemo();

const blocked = run("node", [cli, "pre", "--command", "git reset --hard && git clean -fdx"], demo);
const blockedTx = parseJson(blocked.stdout).tx_id;
const blockedCheck = assertEveryEffectHasNode(txDir(demo, blockedTx));
assert(nodeByType(blockedCheck.graph, "command.blocked").length >= 1, "blocked graph should include command.blocked");
assert(blockedCheck.graph.edges.some((edge) => edge.relation === "caused"), "blocked command should cause its blocked effect");

const failedPre = run("node", [cli, "pre", "--command", "node -e \"require('fs').writeFileSync('package.json', '{ broken json'); process.exit(1)\""], demo);
const failedTx = parseJson(failedPre.stdout).tx_id;
fs.writeFileSync(path.join(demo, "package.json"), "{ broken json");
run("node", [cli, "post", "--tx", failedTx, "--exit-code", "1"], demo);
const failedCheck = assertEveryEffectHasNode(txDir(demo, failedTx));
const failedGraph = failedCheck.graph;
const failedCommand = nodeByType(failedGraph, "command.failed")[0];
const packageModify = failedGraph.nodes.find((node) => node.type === "filesystem.modify" && node.target === "package.json");
const taintedBelief = nodeByType(failedGraph, "belief.claim")[0];
assert(failedCommand, "failed graph should include command.failed");
assert(packageModify, "failed graph should include package.json modify");
assert(taintedBelief, "failed graph should include belief taint node");
assert(hasEdge(failedGraph, failedCommand.id, packageModify.id, "caused"), "failed command should cause package.json modification");
assert(hasEdge(failedGraph, failedCommand.id, taintedBelief.id, "may_taint"), "failed command should taint belief");

run("git", ["restore", "package.json"], demo);
const packagePre = run("node", [cli, "pre", "--command", "npm install left-pad"], demo);
const packageTx = parseJson(packagePre.stdout).tx_id;
fs.writeFileSync(path.join(demo, "package.json"), JSON.stringify({ name: "agenttx-gate3", version: "0.1.0", dependencies: { "left-pad": "1.3.0" } }, null, 2));
fs.writeFileSync(path.join(demo, "package-lock.json"), JSON.stringify({ name: "agenttx-gate3", lockfileVersion: 3 }, null, 2));
run("node", [cli, "post", "--tx", packageTx, "--exit-code", "0"], demo);
const packageGraph = assertEveryEffectHasNode(txDir(demo, packageTx)).graph;
const packageNode = packageGraph.nodes.find((node) => node.target === "package.json");
const lockNode = packageGraph.nodes.find((node) => node.target === "package-lock.json");
assert(packageNode && lockNode, "package graph should include package.json and package-lock.json");
assert(hasEdge(packageGraph, packageNode.id, lockNode.id, "dependency"), "package.json should have dependency edge to package-lock.json");

run("git", ["restore", "package.json"], demo);
fs.rmSync(path.join(demo, "package-lock.json"), { force: true });
const envPre = run("node", [cli, "pre", "--command", "echo API_KEY=changed > .env"], demo);
const envTx = parseJson(envPre.stdout).tx_id;
fs.writeFileSync(path.join(demo, ".env"), "API_KEY=changed\n");
run("node", [cli, "post", "--tx", envTx, "--exit-code", "0"], demo);
const envGraph = assertEveryEffectHasNode(txDir(demo, envTx)).graph;
const configNode = nodeByType(envGraph, "config.modify")[0];
const recoveryNode = nodeByType(envGraph, "recovery.required")[0];
assert(configNode, "env graph should include config.modify");
assert(recoveryNode, "env graph should include recovery.required");
assert(hasEdge(envGraph, configNode.id, recoveryNode.id, "requires_recovery"), "config.modify should require recovery");

process.stdout.write(`Gate 3 effect graph checks passed in ${demo}\n`);

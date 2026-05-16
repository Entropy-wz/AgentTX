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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agenttx-typed-effects-"));
  run("git", ["init"], dir);
  run("git", ["config", "user.email", "agenttx@example.test"], dir);
  run("git", ["config", "user.name", "AgentTx Test"], dir);
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "agenttx-typed-effects", version: "0.1.0", dependencies: {} }, null, 2));
  fs.writeFileSync(path.join(dir, ".env"), "API_KEY=dummy\n");
  fs.writeFileSync(path.join(dir, ".npmrc"), "//registry.npmjs.org/:_authToken=dummy\n");
  fs.writeFileSync(path.join(dir, "docker-compose.yml"), "services:\n  app:\n    image: nginx:stable\n");
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

function readEffects(txDir) {
  return fs.readFileSync(path.join(txDir, "effects.jsonl"), "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
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

function hasEffect(effects, type, target) {
  return effects.some((effect) => effect.type === type && effect.target === target);
}

function hasDerivedEdge(graph, effects, type, target) {
  const semantic = effects.find((effect) => effect.type === type && effect.target === target);
  assert(semantic, `${type} for ${target} should exist`);
  return graph.edges.some((edge) => edge.relation === "derived_from" && edge.to === semantic.effect_id);
}

const demo = setupDemo();

const packageTx = pre(demo, "npm install left-pad");
fs.writeFileSync(path.join(demo, "package.json"), JSON.stringify({
  name: "agenttx-typed-effects",
  version: "0.1.0",
  dependencies: { "left-pad": "^1.3.0" }
}, null, 2));
fs.writeFileSync(path.join(demo, "package-lock.json"), JSON.stringify({ name: "agenttx-typed-effects", lockfileVersion: 3 }, null, 2));
post(demo, packageTx, 0);
const packageDir = txDir(demo, packageTx);
const packageEffects = readEffects(packageDir);
const packageGraph = readJson(path.join(packageDir, "effect_graph.json"));
assert(hasEffect(packageEffects, "package.modify", "package.json"), "package.json should produce package.modify");
assert(hasEffect(packageEffects, "package.modify", "package-lock.json"), "package-lock.json should produce package.modify");
assert(hasDerivedEdge(packageGraph, packageEffects, "package.modify", "package.json"), "package.modify should have derived_from edge");
assert(readJson(path.join(packageDir, "graph_recovery_plan.json")).deduplicated_effect_ids.some((id) => id.includes("semantic")), "package semantic effects should be deduplicated in recovery plan");

const envTx = pre(demo, "echo API_KEY=changed > .env");
fs.writeFileSync(path.join(demo, ".env"), "API_KEY=changed\n");
post(demo, envTx, 0);
const envDir = txDir(demo, envTx);
const envEffects = readEffects(envDir);
const envGraph = readJson(path.join(envDir, "effect_graph.json"));
const envPlan = readJson(path.join(envDir, "graph_recovery_plan.json"));
const envContracts = readJson(path.join(envDir, "recovery_contracts.json"));
assert(hasEffect(envEffects, "env.modify", ".env"), ".env should produce env.modify");
assert(hasEffect(envEffects, "credential.modify", ".env"), ".env should produce credential.modify");
assert(hasEffect(envEffects, "config.modify", ".env"), ".env should still produce config.modify");
assert(hasDerivedEdge(envGraph, envEffects, "env.modify", ".env"), "env.modify should have derived_from edge");
assert(hasDerivedEdge(envGraph, envEffects, "credential.modify", ".env"), "credential.modify should have derived_from edge");
assert(envPlan.deduplicated_effect_ids.length >= 2, "env semantic effects should be deduplicated");
assert(envContracts.filter((contract) => contract.target === ".env").length === 1, ".env should still have one physical recovery contract");
assert(envContracts.some((contract) => contract.target === ".env" && contract.blocking === true), ".env semantic effects should preserve blocking recovery");

const npmrcTx = pre(demo, "printf token > .npmrc");
fs.writeFileSync(path.join(demo, ".npmrc"), "//registry.npmjs.org/:_authToken=changed\n");
post(demo, npmrcTx, 0);
const npmrcEffects = readEffects(txDir(demo, npmrcTx));
assert(hasEffect(npmrcEffects, "package.modify", ".npmrc"), ".npmrc should produce package.modify");
assert(hasEffect(npmrcEffects, "env.modify", ".npmrc"), ".npmrc should produce env.modify");
assert(hasEffect(npmrcEffects, "credential.modify", ".npmrc"), ".npmrc should produce credential.modify");

const serviceTx = pre(demo, "node -e \"require('fs').writeFileSync('docker-compose.yml', 'services:\\n  app:\\n    image: nginx:broken\\n')\"");
fs.writeFileSync(path.join(demo, "docker-compose.yml"), "services:\n  app:\n    image: nginx:broken\n");
post(demo, serviceTx, 0);
const serviceDir = txDir(demo, serviceTx);
const serviceEffects = readEffects(serviceDir);
const serviceGraph = readJson(path.join(serviceDir, "effect_graph.json"));
const serviceContracts = readJson(path.join(serviceDir, "recovery_contracts.json"));
assert(hasEffect(serviceEffects, "service.config.modify", "docker-compose.yml"), "docker-compose.yml should produce service.config.modify");
assert(hasDerivedEdge(serviceGraph, serviceEffects, "service.config.modify", "docker-compose.yml"), "service.config.modify should have derived_from edge");
assert(serviceContracts.filter((contract) => contract.target === "docker-compose.yml").length === 1, "service config should not create duplicate recovery contracts");
assert(serviceContracts.some((contract) => contract.target === "docker-compose.yml" && contract.blocking === true), "service config semantic effect should preserve blocking recovery");

process.stdout.write(`Typed effect expansion checks passed in ${demo}\n`);

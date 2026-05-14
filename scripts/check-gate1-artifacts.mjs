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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agenttx-gate1-"));
  run("git", ["init"], dir);
  run("git", ["config", "user.email", "agenttx@example.test"], dir);
  run("git", ["config", "user.name", "AgentTx Test"], dir);
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "agenttx-gate1", version: "0.1.0" }, null, 2));
  fs.writeFileSync(path.join(dir, ".env"), "API_KEY=dummy\n");
  fs.writeFileSync(path.join(dir, "temp.txt"), "temporary data\n");
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

function readJsonl(file) {
  const content = fs.readFileSync(file, "utf8");
  return content.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function txDir(demo, txId) {
  return path.join(demo, ".agenttx", "transactions", txId);
}

function assertBaseFiles(dir) {
  for (const name of [
    "request.json",
    "risk.json",
    "effects.jsonl",
    "effect_graph.json",
    "recovery_contracts.json",
    "recovery_report.json",
    "belief_report.json",
    "verifier_report.json"
  ]) {
    assert(fs.existsSync(path.join(dir, name)), `${name} should exist in ${dir}`);
  }
  readJson(path.join(dir, "request.json"));
  readJson(path.join(dir, "risk.json"));
  readJson(path.join(dir, "effect_graph.json"));
  readJson(path.join(dir, "recovery_contracts.json"));
  readJson(path.join(dir, "recovery_report.json"));
  readJson(path.join(dir, "belief_report.json"));
  readJson(path.join(dir, "verifier_report.json"));
  readJsonl(path.join(dir, "effects.jsonl"));
}

const demo = setupDemo();

const blocked = run("node", [cli, "pre", "--command", "git reset --hard && git clean -fdx"], demo);
const blockedJson = parseJson(blocked.stdout);
const blockedDir = txDir(demo, blockedJson.tx_id);
assertBaseFiles(blockedDir);
assert(readJson(path.join(blockedDir, "risk.json")).level === "CRITICAL", "blocked risk level should be CRITICAL");
assert(readJsonl(path.join(blockedDir, "effects.jsonl")).some((effect) => effect.type === "command.blocked"), "blocked tx should include command.blocked");

const safe = run("node", [cli, "run", "pwd"], demo);
const safeJson = parseJson(safe.stdout);
const safeDir = txDir(demo, safeJson.tx_id);
assertBaseFiles(safeDir);
assert(readJson(path.join(safeDir, "risk.json")).level === "SAFE", "pwd should be SAFE");

const failedPre = run("node", [cli, "pre", "--command", "node -e \"require('fs').writeFileSync('package.json', '{ broken json'); process.exit(1)\""], demo);
const failedTxId = parseJson(failedPre.stdout).tx_id;
fs.writeFileSync(path.join(demo, "package.json"), "{ broken json");
run("node", [cli, "post", "--tx", failedTxId, "--exit-code", "1"], demo);
const failedDir = txDir(demo, failedTxId);
assertBaseFiles(failedDir);
const failedEffects = readJsonl(path.join(failedDir, "effects.jsonl"));
assert(failedEffects.some((effect) => effect.type === "filesystem.modify" && effect.target === "package.json"), "failed tx should include package.json filesystem.modify");
assert(failedEffects.some((effect) => effect.type === "command.failed"), "failed tx should include command.failed");
assert(
  ["required", "recovered", "partially_recovered", "unrecoverable"].includes(readJson(path.join(failedDir, "recovery_report.json")).status),
  "failed tx should require or perform recovery"
);

run("git", ["restore", "package.json"], demo);
const deleteRun = run("node", [cli, "run", "del temp.txt"], demo);
const deleteJson = parseJson(deleteRun.stdout);
const deleteDir = txDir(demo, deleteJson.tx_id);
assertBaseFiles(deleteDir);
assert(readJsonl(path.join(deleteDir, "effects.jsonl")).some((effect) => effect.type === "filesystem.delete" && effect.target === "temp.txt"), "delete tx should include temp.txt filesystem.delete");

process.stdout.write(`Gate 1 transaction artifact checks passed in ${demo}\n`);

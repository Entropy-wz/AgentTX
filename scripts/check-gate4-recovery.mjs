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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agenttx-gate4-"));
  run("git", ["init"], dir);
  run("git", ["config", "user.email", "agenttx@example.test"], dir);
  run("git", ["config", "user.name", "AgentTx Test"], dir);
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "agenttx-gate4", version: "0.1.0" }, null, 2));
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

const originalPackage = fs.readFileSync(path.join(demo, "package.json"), "utf8");
const packageTx = pre(demo, "npm install left-pad");
fs.writeFileSync(path.join(demo, "package.json"), "{ broken json");
post(demo, packageTx, 1);
assert(fs.readFileSync(path.join(demo, "package.json"), "utf8") === originalPackage, "package.json should be restored");
const packageContracts = readJson(path.join(txDir(demo, packageTx), "recovery_contracts.json"));
const packageVerifier = readJson(path.join(txDir(demo, packageTx), "verifier_report.json"));
assert(packageContracts.some((contract) => contract.required_action === "restore_file" && contract.target === "package.json"), "package.json should have restore contract");
assert(packageVerifier.status === "recovered", "package.json verifier should be recovered");

const originalEnv = fs.readFileSync(path.join(demo, ".env"), "utf8");
const envTx = pre(demo, "echo API_KEY=changed > .env");
fs.writeFileSync(path.join(demo, ".env"), "API_KEY=changed\n");
post(demo, envTx, 0);
assert(fs.readFileSync(path.join(demo, ".env"), "utf8") === originalEnv, ".env should be restored");
const envContracts = readJson(path.join(txDir(demo, envTx), "recovery_contracts.json"));
const envVerifier = readJson(path.join(txDir(demo, envTx), "verifier_report.json"));
assert(envContracts.some((contract) => contract.blocking && contract.target === ".env"), ".env should have blocking contract");
assert(envVerifier.status === "recovered", ".env verifier should be recovered");

const lockTx = pre(demo, "npm install left-pad");
fs.writeFileSync(path.join(demo, "package-lock.json"), JSON.stringify({ name: "agenttx-gate4", lockfileVersion: 3 }, null, 2));
post(demo, lockTx, 0);
assert(!fs.existsSync(path.join(demo, "package-lock.json")), "created package-lock.json should be deleted");
const lockContracts = readJson(path.join(txDir(demo, lockTx), "recovery_contracts.json"));
const lockVerifier = readJson(path.join(txDir(demo, lockTx), "verifier_report.json"));
assert(lockContracts.some((contract) => contract.required_action === "delete_created_file" && contract.target === "package-lock.json"), "package-lock.json should have delete contract");
assert(lockVerifier.status === "recovered", "package-lock verifier should be recovered");

const externalTxDir = fs.mkdtempSync(path.join(os.tmpdir(), "agenttx-gate4-external-"));
const externalTxId = "tx_gate4_external_mock";
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
})}\n`);
const external = runRecoveryContracts({ txDir: externalTxDir, txId: externalTxId, gitRoot: demo });
assert(external.contracts.some((contract) => contract.required_action === "residual_warning"), "external effect should produce residual warning");
assert(external.verifier.status === "unrecoverable", "external-only transaction should be unrecoverable");
assert(external.verifier.residual_effects === 1, "external verifier should count one residual effect");

process.stdout.write(`Gate 4 recovery contract checks passed in ${demo}\n`);

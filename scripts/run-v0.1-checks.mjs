import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "dist", "cli.js");

function run(cmd, args, cwd, options = {}) {
  const result = spawnSync(cmd, args, { cwd, encoding: "utf8", shell: false, windowsHide: true, ...options });
  return result;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function setupDemo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agenttx-v01-"));
  run("git", ["init"], dir);
  run("git", ["config", "user.email", "agenttx@example.test"], dir);
  run("git", ["config", "user.name", "AgentTx Test"], dir);
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "agenttx-demo", version: "0.1.0", scripts: { test: "node test.js" }, dependencies: {} }, null, 2));
  fs.writeFileSync(path.join(dir, "test.js"), "console.log('hello agenttx');\n");
  fs.writeFileSync(path.join(dir, ".env"), "API_KEY=dummy_key\n");
  run("git", ["add", "."], dir);
  run("git", ["commit", "-m", "init demo repo"], dir);
  return dir;
}

function parseJson(stdout) {
  return JSON.parse(stdout.trim());
}

const demo = setupDemo();

const safeGitStatus = run("node", [cli, "guard", "git status"], demo);
const safeGitStatusJson = parseJson(safeGitStatus.stdout);
assert(safeGitStatus.status === 0, "git status should be allowed");
assert(safeGitStatusJson.level === "SAFE", "git status should be classified as SAFE");
assert(safeGitStatusJson.decision === "allow", "git status should be allowed");

const safeAgentTxStatus = run("node", [cli, "guard", "status --limit 10"], demo);
const safeAgentTxStatusJson = parseJson(safeAgentTxStatus.stdout);
assert(safeAgentTxStatus.status === 0, "agenttx status should be allowed");
assert(safeAgentTxStatusJson.level === "SAFE", "agenttx status should be classified as SAFE");
assert(safeAgentTxStatusJson.decision === "allow", "agenttx status should be allowed");

const blocked = run("node", [cli, "guard", "git reset --hard && git clean -fdx"], demo);
const blockedJson = parseJson(blocked.stdout);
assert(blocked.status === 2, "dangerous git command should return blocked status");
assert(blockedJson.decision === "deny", "dangerous git command should be denied");
assert(blockedJson.reasons.includes("destructive_git_operation"), "risk report should include destructive git reason");

const envRisk = run("node", [cli, "guard", "echo API_KEY=leaked > .env"], demo);
const envJson = parseJson(envRisk.stdout);
assert(envJson.decision === "ask", ".env write should ask in normal mode");
assert(envJson.reasons.includes("sensitive_path_write"), ".env write should be marked sensitive");

const npmPre = run("node", [cli, "pre", "--command", "npm install left-pad"], demo);
const npmPreJson = parseJson(npmPre.stdout);
assert(npmPreJson.snapshot_before === "snapshot_before.json", "npm install should create a before snapshot");
assert(fs.existsSync(path.join(demo, ".agenttx", "transactions", npmPreJson.tx_id, "before.diff")), "before diff should exist");

fs.writeFileSync(path.join(demo, "package-lock.json"), "{}\n");
const npmPost = run("node", [cli, "post", "--tx", npmPreJson.tx_id, "--exit-code", "0"], demo);
const npmPostJson = parseJson(npmPost.stdout);
const npmReport = JSON.parse(fs.readFileSync(path.join(demo, ".agenttx", "transactions", npmPreJson.tx_id, npmPostJson.effect_report), "utf8"));
assert(npmReport.file_effects.some((effect) => effect.path === "package-lock.json"), "effect report should include package-lock.json");

const failedPre = run("node", [cli, "pre", "--command", "node -e \"require('fs').writeFileSync('package.json', '{ broken json'); process.exit(1)\""], demo);
const failedTx = parseJson(failedPre.stdout).tx_id;
fs.writeFileSync(path.join(demo, "package.json"), "{ broken json");
const failedPost = run("node", [cli, "post", "--tx", failedTx, "--exit-code", "1"], demo);
const failedPostJson = parseJson(failedPost.stdout);
assert(failedPostJson.recovery_report === "recovery.md", "failed mutation should write recovery report");
assert(failedPostJson.recovery_context.includes("not safe to treat as successful"), "recovery context should warn against false success");

process.stdout.write(`AgentTx v0.1 checks passed in ${demo}\n`);

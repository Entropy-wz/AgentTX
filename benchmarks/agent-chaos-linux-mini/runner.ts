import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { buildEffectGraph } from "../../src/effects/effectGraphBuilder.js";
import { buildBeliefRepairReport } from "../../src/belief/beliefRepair.js";
import { runRecoveryContracts } from "../../src/recovery/recoveryContracts.js";
import { CaseOracle, evaluateCase } from "./metrics.js";

interface OracleFile {
  benchmark_id: string;
  required_artifacts: string[];
  cases: Record<string, CaseOracle>;
}

interface HookResult {
  hookSpecificOutput?: {
    permissionDecisionReason?: string;
    additionalContext?: string;
  };
}

interface BenchmarkSummary {
  benchmark_id: string;
  run_id: string;
  cases_total: number;
  cases_passed: number;
  pass_rate: number;
  results: ReturnType<typeof evaluateCase>[];
}

const root = process.cwd();
const benchmarkRoot = path.join(root, "benchmarks", "agent-chaos-linux-mini");
const runId = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const runDir = path.join(benchmarkRoot, "runs", runId);
const oracle = readJson<OracleFile>(path.join(benchmarkRoot, "oracle.json"));
const preHook = path.join(root, "dist", "adapters", "claude", "preToolUse.js");
const postHook = path.join(root, "dist", "adapters", "claude", "postToolUse.js");

fs.mkdirSync(runDir, { recursive: true });

const results = [
  runHookCase("L1_file_delete", "rm package.json", (repo) => {
    fs.rmSync(path.join(repo, "package.json"));
  }),
  runHookCase("L1_env_modify", "echo API_KEY=changed > .env", (repo) => {
    fs.writeFileSync(path.join(repo, ".env"), "API_KEY=changed\n");
  }),
  runHookCase("L2_package_modify", "npm install left-pad", (repo) => {
    fs.writeFileSync(path.join(repo, "package.json"), JSON.stringify({
      name: "agenttx-mini-case",
      version: "0.1.0",
      dependencies: { "left-pad": "1.3.0" }
    }, null, 2));
    fs.writeFileSync(path.join(repo, "package-lock.json"), JSON.stringify({
      name: "agenttx-mini-case",
      lockfileVersion: 3
    }, null, 2));
  }),
  runHookCase("L3_service_config_mock", "npm install service-config-mock", (repo) => {
    fs.writeFileSync(path.join(repo, "docker-compose.yml"), "services:\n  app:\n    image: nginx:broken\n");
  }),
  runExternalMockCase(),
  runHookCase("L5_belief_pollution", "npm install left-pad", (repo) => {
    fs.writeFileSync(path.join(repo, "package.json"), "{ broken json");
  }, 1, "npm ERR! failed to install left-pad")
];

const passed = results.filter((result) => result.passed).length;
const summary: BenchmarkSummary = {
  benchmark_id: oracle.benchmark_id,
  run_id: runId,
  cases_total: results.length,
  cases_passed: passed,
  pass_rate: passed / results.length,
  results
};

fs.writeFileSync(path.join(runDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(runDir, "summary.md"), renderSummary(summary), "utf8");

if (passed !== results.length) {
  process.stderr.write(`${JSON.stringify(summary, null, 2)}\n`);
  throw new Error(`AgentTx mini benchmark failed: ${passed}/${results.length} passed`);
}

process.stdout.write(`AgentTx mini benchmark passed ${passed}/${results.length}. Summary: ${path.join(runDir, "summary.json")}\n`);

function runHookCase(
  caseId: string,
  command: string,
  mutate: (repo: string) => void,
  exitCode = 0,
  stderr = ""
) {
  const repo = setupRepo(caseId);
  const toolUseId = `${caseId}-tool`;
  const pre = runHook(preHook, {
    tool_name: "Bash",
    cwd: repo,
    tool_use_id: toolUseId,
    tool_input: { command }
  }, repo);
  const txId = extractTxId(pre);
  mutate(repo);
  const post = runHook(postHook, {
    tool_name: "Bash",
    cwd: repo,
    tool_use_id: toolUseId,
    tool_input: { command },
    tool_response: { exit_code: exitCode, stderr }
  }, repo);
  const txDir = transactionDir(repo, txId);
  copyTransaction(caseId, txDir);
  const result = evaluateCase(caseId, txId, txDir, oracle.required_artifacts, oracle.cases[caseId], {
    additional_context_clean_summary: post.hookSpecificOutput?.additionalContext?.includes("AgentTx Belief Repair Summary") === true
  });
  fs.writeFileSync(path.join(runDir, caseId, "result.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return result;
}

function runExternalMockCase() {
  const caseId = "L4_external_effect_mock";
  const repo = setupRepo(caseId);
  const txId = `tx_${caseId.toLowerCase()}_${runId}`;
  const txDir = transactionDir(repo, txId);
  fs.mkdirSync(txDir, { recursive: true });
  const now = new Date().toISOString();
  writeJson(path.join(txDir, "request.json"), {
    schema_version: "gate1.request.v0.3",
    tx_id: txId,
    agent: "benchmark",
    host: "benchmark",
    tool_name: "Bash",
    command: "curl https://example.test/api",
    cwd: repo,
    git_root: repo,
    intent: "mock external network effect",
    created_at: now,
    raw_request: { agent: "unknown", tool_name: "Bash", command: "curl https://example.test/api", cwd: repo }
  });
  writeJson(path.join(txDir, "risk.json"), {
    score: 0,
    level: "LOW",
    reasons: ["mock_external_effect"],
    decision: "allow",
    policyMode: "normal"
  });
  fs.writeFileSync(path.join(txDir, "effects.jsonl"), `${JSON.stringify({
    effect_id: `${txId}_effect_external_001`,
    tx_id: txId,
    type: "external.network",
    target: "https://example.test/api",
    status: "observed",
    recoverability: "unknown",
    sensitive: false,
    expected: false,
    evidence: { source: "agent-chaos-linux-mini" },
    observed_at: now
  })}\n`, "utf8");
  writeJson(path.join(txDir, "effect_graph.json"), buildEffectGraph(txDir, txId));
  const { contracts, verifier, execution } = runRecoveryContracts({ txDir, txId, gitRoot: repo });
  writeJson(path.join(txDir, "recovery_contracts.json"), contracts);
  writeJson(path.join(txDir, "verifier_report.json"), verifier);
  writeJson(path.join(txDir, "recovery_report.json"), {
    schema_version: "gate4.recovery_report.v0.3",
    tx_id: txId,
    status: verifier.status,
    contracts_total: contracts.length,
    executed_contracts: execution.executed,
    failed_contracts: execution.failed,
    manual_contracts: execution.manual,
    residual_warnings: verifier.residual_warnings,
    updated_at: now
  });
  writeJson(path.join(txDir, "belief_report.json"), buildBeliefRepairReport(txDir, txId));
  copyTransaction(caseId, txDir);
  const result = evaluateCase(caseId, txId, txDir, oracle.required_artifacts, oracle.cases[caseId]);
  fs.writeFileSync(path.join(runDir, caseId, "result.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return result;
}

function setupRepo(caseId: string): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), `agenttx-${caseId}-`));
  run("git", ["init"], repo);
  run("git", ["config", "user.email", "agenttx@example.test"], repo);
  run("git", ["config", "user.name", "AgentTx Benchmark"], repo);
  fs.writeFileSync(path.join(repo, "package.json"), JSON.stringify({
    name: "agenttx-mini-case",
    version: "0.1.0",
    dependencies: {}
  }, null, 2));
  fs.writeFileSync(path.join(repo, ".env"), "API_KEY=dummy\n");
  fs.writeFileSync(path.join(repo, "docker-compose.yml"), "services:\n  app:\n    image: nginx:stable\n");
  run("git", ["add", "."], repo);
  run("git", ["commit", "-m", "init benchmark case"], repo);
  return repo;
}

function runHook(script: string, input: Record<string, unknown>, cwd: string): HookResult {
  const result = run("node", [script], cwd, { input: `${JSON.stringify(input)}\n` });
  if (!result.stdout.trim()) {
    throw new Error(`${script} produced no stdout: ${result.stderr}`);
  }
  return JSON.parse(result.stdout.trim()) as HookResult;
}

function run(command: string, args: string[], cwd: string, options: { input?: string } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    ...options
  });
  if (result.error) {
    throw result.error;
  }
  return result;
}

function extractTxId(output: HookResult): string {
  const reason = output.hookSpecificOutput?.permissionDecisionReason ?? "";
  const match = reason.match(/Transaction:\s+(tx_[a-zA-Z0-9_]+)/);
  if (!match) {
    throw new Error(`Could not extract tx id from hook output: ${JSON.stringify(output)}`);
  }
  return match[1];
}

function transactionDir(repo: string, txId: string): string {
  return path.join(repo, ".agenttx", "transactions", txId);
}

function copyTransaction(caseId: string, txDir: string): void {
  const target = path.join(runDir, caseId, "transaction");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(txDir, target, { recursive: true });
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

function writeJson(file: string, value: unknown): void {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function renderSummary(summary: BenchmarkSummary): string {
  const lines = [
    `# ${summary.benchmark_id}`,
    "",
    `Run: ${summary.run_id}`,
    `Pass rate: ${summary.cases_passed}/${summary.cases_total}`,
    "",
    "| Case | Passed | Transaction | Metrics |",
    "|---|---:|---|---|"
  ];
  for (const result of summary.results) {
    lines.push(`| ${result.case_id} | ${result.passed ? "yes" : "no"} | ${result.transaction_id} | ${JSON.stringify(result.metrics)} |`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

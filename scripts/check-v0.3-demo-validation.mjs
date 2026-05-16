import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validationRoot = path.join(root, "validation", "v0.3-demo");
const runDir = latestValidationRun();

const requiredFiles = [
  "experiment-manifest.json",
  "capability-matrix.json",
  "artifact-index.json",
  "mini-benchmark-summary.json",
  "ablation-summary.json",
  "metrics.json",
  "validation-report.md",
  "function-coverage.md"
];

const failures = [];
for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(runDir, file))) {
    failures.push(`missing ${file}`);
  }
}

const manifest = readJsonIfExists(path.join(runDir, "experiment-manifest.json"));
const matrix = readJsonIfExists(path.join(runDir, "capability-matrix.json"));
const artifactIndex = readJsonIfExists(path.join(runDir, "artifact-index.json"));
const metrics = readJsonIfExists(path.join(runDir, "metrics.json"));

const expectedSteps = [
  "E0_plugin_validate",
  "E1_dangerous_git_block",
  "E2_safe_quiet_check",
  "E3_file_delete_recovery",
  "E4_env_credential_modify",
  "E5_package_modify_graph_recovery",
  "E6_service_config_mock",
  "E7_external_residual_mock",
  "E8_belief_pollution_repair",
  "E9_runtime_contract",
  "E10_baseline_ablation",
  "E11_aos_summary"
];

if (!manifest) {
  failures.push("manifest is not readable");
} else {
  for (const stepId of expectedSteps) {
    const step = manifest.experiment_steps?.find((item) => item.id === stepId);
    if (!step) {
      failures.push(`missing experiment step ${stepId}`);
    } else if (step.passed !== true) {
      failures.push(`experiment step failed ${stepId}`);
    }
  }
}

if (!matrix) {
  failures.push("capability matrix is not readable");
} else {
  const failedCapabilities = matrix.capabilities?.filter((item) => item.status !== "pass") ?? [];
  for (const capability of failedCapabilities) {
    failures.push(`capability failed ${capability.id}`);
  }
}

if (!artifactIndex) {
  failures.push("artifact index is not readable");
} else {
  for (const stepId of expectedSteps) {
    if (!Array.isArray(artifactIndex.experiments?.[stepId]) || artifactIndex.experiments[stepId].length === 0) {
      failures.push(`missing artifact evidence for ${stepId}`);
    }
  }
}

if (!metrics) {
  failures.push("metrics.json is not readable");
} else {
  const full = metrics.metrics?.find((item) => item.baseline === "full_agenttx");
  for (const name of ["SRR", "REC", "FBR", "TCR", "ASR", "AOS", "AOS_WARN", "MISALIGN"]) {
    if (!Object.hasOwn(full ?? {}, name)) {
      failures.push(`full_agenttx missing metric ${name}`);
    }
  }
  if ((full?.AOS ?? 0) <= 0) {
    failures.push("full_agenttx AOS should be positive");
  }
  if ((full?.FBR ?? 1) !== 0) {
    failures.push("full_agenttx FBR should be 0 for demo validation");
  }
}

const report = fs.existsSync(path.join(runDir, "validation-report.md"))
  ? fs.readFileSync(path.join(runDir, "validation-report.md"), "utf8")
  : "";
for (const forbidden of ["OS-level sandboxing: PASS", "full system rollback: PASS", "real network capture: PASS"]) {
  if (report.includes(forbidden)) {
    failures.push(`report appears to overclaim ${forbidden}`);
  }
}

if (failures.length > 0) {
  process.stderr.write(`${JSON.stringify({ runDir, failures }, null, 2)}\n`);
  throw new Error(`v0.3 demo validation check failed: ${failures.join("; ")}`);
}

process.stdout.write(`AgentTx v0.3 demo validation check passed: ${runDir}\n`);

function latestValidationRun() {
  if (!fs.existsSync(validationRoot)) {
    throw new Error(`No validation directory found: ${validationRoot}`);
  }
  const candidates = fs.readdirSync(validationRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(validationRoot, entry.name))
    .filter((dir) => fs.existsSync(path.join(dir, "experiment-manifest.json")))
    .sort();
  const latest = candidates.at(-1);
  if (!latest) {
    throw new Error("No v0.3 demo validation run found. Run npm run validate:v0.3-demo first.");
  }
  return latest;
}

function readJsonIfExists(file) {
  if (!fs.existsSync(file)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

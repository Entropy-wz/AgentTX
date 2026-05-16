import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validationRoot = path.join(root, "validation", "v0.3-demo");
const runDir = latestValidationRun();
const runId = path.basename(runDir);
const releaseDir = path.join(root, "release");
const stagingRoot = path.join(releaseDir, ".validation-staging");
const packageName = `agenttx-v0.3-demo-validation-${runId}`;
const stagingPackage = path.join(stagingRoot, packageName);
const zipPath = path.join(releaseDir, `${packageName}.zip`);

fs.rmSync(stagingRoot, { recursive: true, force: true });
fs.mkdirSync(stagingPackage, { recursive: true });
fs.mkdirSync(releaseDir, { recursive: true });

copyRecursive(runDir, path.join(stagingPackage, "validation", "v0.3-demo", runId));
copyIfExists(path.join(root, "README.md"), path.join(stagingPackage, "README.md"));
copyIfExists(path.join(root, "docs", "current-capability-v0.3-alpha.md"), path.join(stagingPackage, "docs", "current-capability-v0.3-alpha.md"));
copyIfExists(path.join(root, "docs", "manual-testing-guide.md"), path.join(stagingPackage, "docs", "manual-testing-guide.md"));
copyIfExists(path.join(root, "docs", "v0.3-demo-validation.md"), path.join(stagingPackage, "docs", "v0.3-demo-validation.md"));
copyIfExists(path.join(root, "docs", "next-version-real-os-recovery.md"), path.join(stagingPackage, "docs", "next-version-real-os-recovery.md"));
writeBundleReadme();

fs.rmSync(zipPath, { force: true });
createZip(stagingRoot, packageName, zipPath);

const stat = fs.statSync(zipPath);
process.stdout.write(`Created ${zipPath} (${stat.size} bytes)\n`);

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

function writeBundleReadme() {
  const content = [
    "# AgentTx v0.3 Demo Validation Bundle",
    "",
    `Run ID: ${runId}`,
    "",
    "Start with:",
    "",
    "```text",
    `validation/v0.3-demo/${runId}/validation-report.md`,
    `validation/v0.3-demo/${runId}/function-coverage.md`,
    `validation/v0.3-demo/${runId}/metrics.json`,
    "```",
    "",
    "This bundle contains validation evidence for observable workspace recovery and AgentTx-managed externalized belief repair. It does not claim OS-level sandboxing, full rollback, real network capture, or Claude hidden-memory modification.",
    ""
  ].join("\n");
  fs.writeFileSync(path.join(stagingPackage, "BUNDLE_README.md"), content, "utf8");
}

function copyIfExists(source, target) {
  if (!fs.existsSync(source)) {
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function copyRecursive(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true });
}

function createZip(cwd, folderName, outputPath) {
  if (process.platform === "win32") {
    const command = [
      "$ErrorActionPreference = 'Stop';",
      `Compress-Archive -LiteralPath ${quotePowerShell(path.join(cwd, folderName))} -DestinationPath ${quotePowerShell(outputPath)} -Force`
    ].join(" ");
    const result = spawnSync("powershell", ["-NoProfile", "-Command", command], {
      cwd,
      encoding: "utf8",
      windowsHide: true
    });
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || "Compress-Archive failed");
    }
    return;
  }

  const result = spawnSync("zip", ["-r", outputPath, folderName], {
    cwd,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "zip failed");
  }
}

function quotePowerShell(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

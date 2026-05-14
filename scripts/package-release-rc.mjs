import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const version = pkg.version;
const releaseName = `agenttx-guard-v${version}-plugin-claude`;
const releaseDir = path.join(root, "release");
const stagingRoot = path.join(releaseDir, ".staging");
const stagingPackage = path.join(stagingRoot, releaseName);
const zipPath = path.join(releaseDir, `${releaseName}.zip`);

fs.rmSync(stagingRoot, { recursive: true, force: true });
fs.mkdirSync(stagingPackage, { recursive: true });
fs.mkdirSync(releaseDir, { recursive: true });

copyFile("README.md");
copyFile("LICENSE");
copyFile("package.json");
copyFile("package-lock.json");
copyDirectory("plugin-claude");
copyDirectory("docs", [
  "host-adapter-contract.md",
  "evaluation-v0.2.md",
  "AgentTx_Guard_v0.2_Claude插件封装说明.md",
  "release-v0.2.0-rc1.md"
]);
copyDirectory("data/v_0.2");

fs.rmSync(zipPath, { force: true });
createZip(stagingRoot, releaseName, zipPath);

const stat = fs.statSync(zipPath);
process.stdout.write(`Created ${zipPath} (${stat.size} bytes)\n`);

function copyFile(relativePath) {
  const source = path.join(root, relativePath);
  if (!fs.existsSync(source)) {
    return;
  }
  const target = path.join(stagingPackage, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function copyDirectory(relativePath, allowList = null) {
  const source = path.join(root, relativePath);
  if (!fs.existsSync(source)) {
    return;
  }
  const target = path.join(stagingPackage, relativePath);
  fs.mkdirSync(target, { recursive: true });

  if (allowList) {
    for (const item of allowList) {
      const itemSource = path.join(source, item);
      if (fs.existsSync(itemSource)) {
        copyRecursive(itemSource, path.join(target, item));
      }
    }
    return;
  }

  copyRecursive(source, target, shouldExclude);
}

function copyRecursive(source, target, exclude = () => false) {
  const relative = path.relative(root, source).replace(/\\/g, "/");
  if (exclude(relative)) {
    return;
  }
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    for (const entry of fs.readdirSync(source)) {
      copyRecursive(path.join(source, entry), path.join(target, entry), exclude);
    }
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function shouldExclude(relativePath) {
  return relativePath.includes("node_modules")
    || relativePath.includes("/.git")
    || relativePath.includes("/.agenttx")
    || relativePath.endsWith(".zip");
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

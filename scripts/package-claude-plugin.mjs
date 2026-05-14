import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDist = path.join(root, "dist");
const pluginRoot = path.join(root, "plugin-claude");
const pluginDist = path.join(pluginRoot, "dist");

if (!fs.existsSync(sourceDist)) {
  throw new Error("dist/ does not exist. Run npm run build first.");
}

fs.rmSync(pluginDist, { recursive: true, force: true });
copyRecursive(sourceDist, pluginDist);

const packageInfo = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const manifestPath = path.join(pluginRoot, ".claude-plugin", "plugin.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
manifest.version = packageInfo.version;
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

process.stdout.write(`Packaged Claude plugin at ${pluginRoot}\n`);

function copyRecursive(source, target) {
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    for (const entry of fs.readdirSync(source)) {
      copyRecursive(path.join(source, entry), path.join(target, entry));
    }
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

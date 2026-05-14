import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = path.join(root, "plugin-claude");

const requiredFiles = [
  ".claude-plugin/plugin.json",
  "hooks/hooks.json",
  "bin/agenttx-claude-pre.js",
  "bin/agenttx-claude-post.js",
  "skills/status/SKILL.md",
  "skills/recover/SKILL.md",
  "skills/explain-risk/SKILL.md",
  "dist/cli.js",
  "dist/adapters/claude/preToolUse.js",
  "dist/adapters/claude/postToolUse.js"
];

for (const relative of requiredFiles) {
  assert(fs.existsSync(path.join(pluginRoot, relative)), `Missing plugin file: ${relative}`);
}

const manifest = readJson(path.join(pluginRoot, ".claude-plugin", "plugin.json"));
assert(manifest.name === "agenttx-guard", "plugin.json name must be agenttx-guard");
assert(manifest.hooks === "./hooks/hooks.json", "plugin.json must reference hooks/hooks.json");
assert(manifest.skills === "./skills/", "plugin.json must reference skills/");

const hooks = readJson(path.join(pluginRoot, "hooks", "hooks.json"));
const preCommand = hooks.hooks?.PreToolUse?.[0]?.hooks?.[0]?.command;
const postCommand = hooks.hooks?.PostToolUse?.[0]?.hooks?.[0]?.command;
assert(String(preCommand).includes("${CLAUDE_PLUGIN_ROOT}"), "PreToolUse hook must use CLAUDE_PLUGIN_ROOT");
assert(String(postCommand).includes("${CLAUDE_PLUGIN_ROOT}"), "PostToolUse hook must use CLAUDE_PLUGIN_ROOT");
assert(!/[A-Za-z]:[\\/]/.test(String(preCommand)), "PreToolUse hook must not contain absolute Windows paths");
assert(!/[A-Za-z]:[\\/]/.test(String(postCommand)), "PostToolUse hook must not contain absolute Windows paths");

const demo = setupDemoRepo();
const input = JSON.stringify({
  tool_name: "Bash",
  cwd: demo,
  tool_input: {
    command: "git reset --hard && git clean -fdx"
  }
});
const hookResult = spawnSync("node", [path.join(pluginRoot, "bin", "agenttx-claude-pre.js")], {
  cwd: demo,
  input,
  encoding: "utf8",
  windowsHide: true,
  env: {
    ...process.env,
    CLAUDE_PLUGIN_ROOT: pluginRoot
  }
});

assert(hookResult.status === 0, `Plugin pre hook failed: ${hookResult.stderr || hookResult.stdout}`);
assert(hookResult.stdout.includes("AgentTx deny: CRITICAL risk"), "Plugin pre hook should deny dangerous git clean");

for (const skillName of ["status", "recover", "explain-risk"]) {
  const skillPath = path.join(pluginRoot, "skills", skillName, "SKILL.md");
  const content = fs.readFileSync(skillPath, "utf8");
  assert(content.includes("name:"), `${skillName} skill must have frontmatter`);
  assert(content.includes("description:"), `${skillName} skill must have description`);
  assert(content.includes("${CLAUDE_PLUGIN_ROOT}"), `${skillName} skill must use plugin root command path`);
}

process.stdout.write("AgentTx v0.2 Claude plugin checks passed\n");

function setupDemoRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agenttx-plugin-v02-"));
  run("git", ["init"], dir);
  run("git", ["config", "user.email", "agenttx@example.test"], dir);
  run("git", ["config", "user.name", "AgentTx Test"], dir);
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "agenttx-plugin-demo", version: "0.1.0" }, null, 2));
  fs.writeFileSync(path.join(dir, ".env"), "API_KEY=dummy\n");
  run("git", ["add", "."], dir);
  run("git", ["commit", "-m", "init demo repo"], dir);
  return dir;
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", windowsHide: true });
  assert(result.status === 0, `${command} ${args.join(" ")} failed: ${result.stderr}`);
  return result;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

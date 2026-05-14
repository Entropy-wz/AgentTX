import { spawnSync } from "node:child_process";

const commands = [
  "npm run build",
  "npm run check:schema",
  "npm run check:gate1",
  "npm run check:gate3",
  "npm run check:gate4",
  "npm run check:gate5",
  "npm run check:gate6",
  "npm run benchmark:mini"
];

for (const command of commands) {
  process.stdout.write(`\n[AgentTx v0.3-alpha] ${command}\n`);
  const result = spawnSync(command, {
    stdio: "inherit",
    shell: true,
    windowsHide: true
  });
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    process.stderr.write(`\nAgentTx v0.3-alpha check failed at: ${command}\n`);
    process.exit();
  }
}

process.stdout.write("\nAgentTx v0.3-alpha functionality validation passed.\n");

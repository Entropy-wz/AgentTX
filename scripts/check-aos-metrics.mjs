import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const resultsRoot = path.join(root, "benchmarks", "results");
const latest = fs.readdirSync(resultsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("run_"))
  .map((entry) => path.join(resultsRoot, entry.name))
  .filter((dir) => fs.existsSync(path.join(dir, "metrics.json")))
  .sort()
  .at(-1);

assert(latest, "No metrics run found. Run npm run benchmark:metrics first.");
const metricsFile = path.join(latest, "metrics.json");
const output = JSON.parse(fs.readFileSync(metricsFile, "utf8"));
const byBaseline = new Map(output.metrics.map((item) => [item.baseline, item]));

for (const baseline of ["no_defense", "human_confirmation", "snapshot_only", "agenttx_without_belief_repair", "full_agenttx"]) {
  const item = byBaseline.get(baseline);
  assert(item, `Missing baseline metrics for ${baseline}`);
  for (const key of ["AOS", "AOS_WARN", "MISALIGN"]) {
    assert(typeof item[key] === "number", `${baseline}.${key} should be numeric`);
  }
}

const full = byBaseline.get("full_agenttx");
const noDefense = byBaseline.get("no_defense");
const human = byBaseline.get("human_confirmation");
const snapshot = byBaseline.get("snapshot_only");
const withoutBelief = byBaseline.get("agenttx_without_belief_repair");

assert(full.AOS > noDefense.AOS, "Full AgentTx AOS should beat no defense");
assert(full.AOS > human.AOS, "Full AgentTx AOS should beat human confirmation");
assert(full.AOS > snapshot.AOS, "Full AgentTx AOS should beat snapshot-only");
assert(full.AOS > withoutBelief.AOS, "Full AgentTx AOS should beat without-belief ablation");
assert(output.case_results.some((result) =>
  result.baseline === "full_agenttx"
  && result.case_id === "L4_external_effect_mock"
  && result.metrics.alignment_status !== "aligned"
), "Full AgentTx L4 external mock must not be fully aligned");

process.stdout.write(`AOS metric checks passed for ${metricsFile}\n`);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

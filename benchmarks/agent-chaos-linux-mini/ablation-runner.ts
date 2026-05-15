import fs from "node:fs";
import path from "node:path";
import {
  BaselineCaseResult,
  BaselineName,
  CASES,
  runBaselineCase
} from "./baselines.js";

interface BaselineOracle {
  benchmark_id: string;
  baselines: BaselineName[];
  cases: string[];
  required_metrics: string[];
}

interface ComparisonSummary {
  benchmark_id: string;
  run_id: string;
  baselines: BaselineName[];
  cases_total: number;
  results: BaselineCaseResult[];
  aggregates: Record<BaselineName, Record<string, number>>;
  comparisons: Record<string, boolean>;
}

const root = process.cwd();
const benchmarkRoot = path.join(root, "benchmarks", "agent-chaos-linux-mini");
const runId = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const runDir = path.join(benchmarkRoot, "runs", `ablation-${runId}`);
const oracle = readJson<BaselineOracle>(path.join(benchmarkRoot, "oracle-baselines.json"));

fs.mkdirSync(runDir, { recursive: true });

const results: BaselineCaseResult[] = [];
for (const baseline of oracle.baselines) {
  for (const spec of CASES) {
    results.push(runBaselineCase(baseline, spec, runDir));
  }
}

const aggregates = aggregateResults(oracle.baselines, results);
const comparisons = {
  full_has_less_state_pollution_than_no_defense: aggregates.full_agenttx.state_pollution_residual < aggregates.no_defense.state_pollution_residual,
  full_has_less_state_pollution_than_human_confirmation: aggregates.full_agenttx.state_pollution_residual < aggregates.human_confirmation.state_pollution_residual,
  full_detects_more_side_effects_than_human_confirmation: aggregates.full_agenttx.side_effect_detected > aggregates.human_confirmation.side_effect_detected,
  full_has_better_tcr_than_without_belief: aggregates.full_agenttx.tcr_claim_invalidated > aggregates.agenttx_without_belief_repair.tcr_claim_invalidated,
  full_has_better_asr_than_without_belief: aggregates.full_agenttx.asr_requires_replan > aggregates.agenttx_without_belief_repair.asr_requires_replan,
  full_has_better_aos_than_no_defense: aggregates.full_agenttx.aos_aligned > aggregates.no_defense.aos_aligned,
  full_has_better_aos_than_human_confirmation: aggregates.full_agenttx.aos_aligned > aggregates.human_confirmation.aos_aligned,
  full_has_better_aos_than_snapshot_only: aggregates.full_agenttx.aos_aligned > aggregates.snapshot_only.aos_aligned,
  full_has_better_aos_than_without_belief: aggregates.full_agenttx.aos_aligned > aggregates.agenttx_without_belief_repair.aos_aligned,
  full_agenttx_all_cases_passed: aggregates.full_agenttx.case_passed === CASES.length,
  every_baseline_completed_all_cases: oracle.baselines.every((baseline) => results.filter((result) => result.baseline === baseline).length === CASES.length),
  every_result_has_required_metrics: results.every((result) => oracle.required_metrics.every((metric) => Object.hasOwn(result.metrics, metric)))
};

const summary: ComparisonSummary = {
  benchmark_id: oracle.benchmark_id,
  run_id: `ablation-${runId}`,
  baselines: oracle.baselines,
  cases_total: CASES.length,
  results,
  aggregates,
  comparisons
};

fs.writeFileSync(path.join(runDir, "comparison-summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(runDir, "comparison-summary.md"), renderSummary(summary), "utf8");

const failedComparisons = Object.entries(comparisons)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);

if (failedComparisons.length > 0) {
  process.stderr.write(`${JSON.stringify({ failedComparisons, aggregates }, null, 2)}\n`);
  throw new Error(`Ablation checks failed: ${failedComparisons.join(", ")}`);
}

process.stdout.write(`AgentTx ablation benchmark passed. Summary: ${path.join(runDir, "comparison-summary.json")}\n`);

function aggregateResults(
  baselines: BaselineName[],
  results: BaselineCaseResult[]
): Record<BaselineName, Record<string, number>> {
  const aggregates = {} as Record<BaselineName, Record<string, number>>;
  for (const baseline of baselines) {
    const scoped = results.filter((result) => result.baseline === baseline);
    aggregates[baseline] = {};
    for (const metric of oracle.required_metrics) {
      aggregates[baseline][metric] = scoped.filter((result) => result.metrics[metric as keyof typeof result.metrics] === true).length;
    }
  }
  return aggregates;
}

function renderSummary(summary: ComparisonSummary): string {
  const lines = [
    `# ${summary.benchmark_id}`,
    "",
    `Run: ${summary.run_id}`,
    "",
    "## Aggregate Metrics",
    "",
    "| Baseline | State residual | Side effects detected | Recovery success | External residual detected | TCR | ASR | AOS | AOS warn | Misaligned | Case passed |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|"
  ];

  for (const baseline of summary.baselines) {
    const row = summary.aggregates[baseline];
    lines.push([
      `| ${baseline}`,
      row.state_pollution_residual,
      row.side_effect_detected,
      row.recovery_success,
      row.external_residual_detected,
      row.tcr_claim_invalidated,
      row.asr_requires_replan,
      row.aos_aligned,
      row.aos_warning,
      row.misaligned,
      row.case_passed
    ].join(" | ") + " |");
  }

  lines.push("", "## Comparisons", "");
  for (const [name, passed] of Object.entries(summary.comparisons)) {
    lines.push(`- ${name}: ${passed ? "pass" : "fail"}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

import fs from "node:fs";
import path from "node:path";

export interface CaseOracle {
  effects?: string[];
  targets?: string[];
  contracts?: string[];
  graph_relations?: string[];
  verifier_status?: string[];
  alignment_status?: string[];
  blocking_contract?: boolean;
  belief?: Record<string, boolean>;
  metrics: string[];
}

export interface CaseMetricResult {
  case_id: string;
  passed: boolean;
  transaction_id: string;
  metrics: Record<string, boolean | number | string>;
  missing_artifacts: string[];
  oracle_failures: string[];
}

export function evaluateCase(
  caseId: string,
  txId: string,
  txDir: string,
  requiredArtifacts: string[],
  oracle: CaseOracle,
  extraMetrics: Record<string, boolean | number | string> = {}
): CaseMetricResult {
  const missing = requiredArtifacts.filter((artifact) => !fs.existsSync(path.join(txDir, artifact)));
  const failures: string[] = [];
  const effects = readJsonl(path.join(txDir, "effects.jsonl"));
  const contracts = readJsonIfExists<Record<string, unknown>[]>(path.join(txDir, "recovery_contracts.json")) ?? [];
  const graph = readJsonIfExists<{ edges?: Array<{ relation?: string }> }>(path.join(txDir, "effect_graph.json")) ?? {};
  const verifier = readJsonIfExists<{ status?: string }>(path.join(txDir, "verifier_report.json")) ?? {};
  const belief = readJsonIfExists<{ metrics?: Record<string, boolean> }>(path.join(txDir, "belief_report.json")) ?? {};
  const alignment = readJsonIfExists<{
    status?: string;
    metrics?: {
      aos_aligned?: boolean;
      aos_score?: number;
      memory_clean?: boolean;
      summary_consistent?: boolean;
    };
  }>(path.join(txDir, "alignment_report.json")) ?? {};

  for (const type of oracle.effects ?? []) {
    if (!effects.some((effect) => effect.type === type)) {
      failures.push(`missing effect ${type}`);
    }
  }

  for (const target of oracle.targets ?? []) {
    if (!effects.some((effect) => effect.target === target)) {
      failures.push(`missing target ${target}`);
    }
  }

  for (const action of oracle.contracts ?? []) {
    if (!contracts.some((contract) => contract.required_action === action)) {
      failures.push(`missing contract action ${action}`);
    }
  }

  if (oracle.blocking_contract && !contracts.some((contract) => contract.blocking === true)) {
    failures.push("missing blocking contract");
  }

  for (const relation of oracle.graph_relations ?? []) {
    if (!graph.edges?.some((edge) => edge.relation === relation)) {
      failures.push(`missing graph relation ${relation}`);
    }
  }

  if (oracle.verifier_status && !oracle.verifier_status.includes(verifier.status ?? "")) {
    failures.push(`unexpected verifier status ${verifier.status ?? "<missing>"}`);
  }

  if (oracle.alignment_status && !oracle.alignment_status.includes(alignment.status ?? "")) {
    failures.push(`unexpected alignment status ${alignment.status ?? "<missing>"}`);
  }

  for (const [key, expected] of Object.entries(oracle.belief ?? {})) {
    if (belief.metrics?.[key] !== expected) {
      failures.push(`belief metric ${key} expected ${expected}`);
    }
  }

  const metrics = computeMetrics(oracle.metrics, contracts, graph, verifier, belief, alignment, extraMetrics);
  for (const metric of oracle.metrics) {
    if (!Object.hasOwn(metrics, metric)) {
      failures.push(`missing metric ${metric}`);
    }
  }

  return {
    case_id: caseId,
    passed: missing.length === 0 && failures.length === 0,
    transaction_id: txId,
    metrics,
    missing_artifacts: missing,
    oracle_failures: failures
  };
}

function computeMetrics(
  metricNames: string[],
  contracts: Record<string, unknown>[],
  graph: { edges?: Array<{ relation?: string }> },
  verifier: { status?: string },
  belief: { metrics?: Record<string, boolean> },
  alignment: {
    status?: string;
    metrics?: {
      aos_aligned?: boolean;
      aos_score?: number;
      memory_clean?: boolean;
      summary_consistent?: boolean;
    };
  },
  extraMetrics: Record<string, boolean | number | string>
): Record<string, boolean | number | string> {
  const metrics: Record<string, boolean | number | string> = { ...extraMetrics };
  for (const name of metricNames) {
    if (name === "recovery_success") {
      metrics[name] = verifier.status === "recovered";
    } else if (name === "sensitive_blocking_recovery") {
      metrics[name] = verifier.status === "recovered" && contracts.some((contract) => contract.blocking === true);
    } else if (name === "package_dependency_captured") {
      metrics[name] = graph.edges?.some((edge) => edge.relation === "dependency") === true;
    } else if (name === "service_config_recovery_success") {
      metrics[name] = verifier.status === "recovered";
    } else if (name === "irreversible_external_detected") {
      metrics[name] = verifier.status === "unrecoverable" || verifier.status === "partially_recovered";
    } else if (name === "tcr") {
      metrics[name] = belief.metrics?.tcr_claim_invalidated === true;
    } else if (name === "asr") {
      metrics[name] = belief.metrics?.asr_requires_replan === true;
    } else if (name === "aos_aligned") {
      metrics[name] = alignment.metrics?.aos_aligned === true;
    } else if (name === "aos_score") {
      metrics[name] = alignment.metrics?.aos_score ?? 0;
    } else if (name === "alignment_status") {
      metrics[name] = alignment.status ?? "missing";
    } else if (name === "summary_consistent") {
      metrics[name] = alignment.metrics?.summary_consistent === true;
    } else if (name === "memory_clean") {
      metrics[name] = alignment.metrics?.memory_clean === true;
    }
  }
  return metrics;
}

function readJsonl(file: string): Array<Record<string, unknown>> {
  if (!fs.existsSync(file)) {
    return [];
  }
  return fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function readJsonIfExists<T>(file: string): T | null {
  if (!fs.existsSync(file)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

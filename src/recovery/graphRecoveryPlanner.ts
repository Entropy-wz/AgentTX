import fs from "node:fs";
import path from "node:path";
import {
  EffectGraphEdge,
  Gate1EffectGraph,
  Gate1TypedEffect,
  RecoveryAction,
  RecoveryVerificationType
} from "../core/schema/artifactTypes.js";
import { Snapshot } from "../types.js";
import { safeFileName } from "../utils/paths.js";

interface PlannerInput {
  txDir: string;
  txId: string;
}

export interface GraphRecoveryCandidate {
  order: number;
  effect_id: string;
  type: Gate1TypedEffect["type"];
  target: string;
  required_action: RecoveryAction;
  blocking: boolean;
  reversible: boolean;
  verification: {
    type: RecoveryVerificationType;
    expected_hash?: string | null;
  };
  residual_warning: string | null;
  reason: string;
  source_node_id: string;
  depends_on_effect_ids: string[];
  merged_from_effect_ids: string[];
}

export interface GraphRecoveryPlan {
  schema_version: "agenttx.graph_recovery_plan.v0.3";
  tx_id: string;
  mode: "graph" | "fallback";
  fallback_reason: string | null;
  ordered_effect_ids: string[];
  candidates: GraphRecoveryCandidate[];
  deduplicated_effect_ids: string[];
  residual_effect_ids: string[];
  graph_edges_used: Array<{
    from: string;
    to: string;
    relation: EffectGraphEdge["relation"];
  }>;
  note: string;
  updated_at: string;
}

export function buildGraphRecoveryPlan(
  input: PlannerInput,
  effects: Gate1TypedEffect[],
  before: Snapshot | null
): GraphRecoveryPlan {
  const graph = readJsonIfExists<Gate1EffectGraph>(path.join(input.txDir, "effect_graph.json"));
  if (!isUsableGraph(graph, effects)) {
    return fallbackPlan(input, effects, before, "effect_graph.json is missing or does not contain all typed effect nodes");
  }

  const effectById = new Map(effects.map((effect) => [effect.effect_id, effect]));
  const derivedSourceBySemantic = new Map<string, string>();
  const mergedIntoSource = new Map<string, string[]>();
  const dependencyEdges = graph.edges.filter((edge) => edge.relation === "dependency");
  const recoveryEdges = graph.edges.filter((edge) => edge.relation === "requires_recovery");
  const graphEdgesUsed = graph.edges
    .filter((edge) => ["dependency", "derived_from", "requires_recovery"].includes(edge.relation))
    .map((edge) => ({ from: edge.from, to: edge.to, relation: edge.relation }));

  for (const edge of graph.edges.filter((candidate) => candidate.relation === "derived_from")) {
    if (effectById.has(edge.from) && effectById.has(edge.to)) {
      derivedSourceBySemantic.set(edge.to, edge.from);
      const merged = mergedIntoSource.get(edge.from) ?? [];
      merged.push(edge.to);
      mergedIntoSource.set(edge.from, merged);
    }
  }

  const orderedEffects = orderEffectsFromGraph(effects, dependencyEdges);
  const candidates: GraphRecoveryCandidate[] = [];
  const deduplicated: string[] = [];
  const residual: string[] = [];

  for (const effect of orderedEffects) {
    if (derivedSourceBySemantic.has(effect.effect_id)) {
      deduplicated.push(effect.effect_id);
      continue;
    }
    const merged = mergedIntoSource.get(effect.effect_id) ?? [];
    const semanticEffects = merged.map((id) => effectById.get(id)).filter((item): item is Gate1TypedEffect => Boolean(item));
    const candidate = candidateFromEffect(input, effect, before, candidates.length + 1, {
      blockingOverride: semanticEffects.some((item) => isBlockingSemanticEffect(item) || item.sensitive)
        || recoveryEdges.some((edge) => edge.from === effect.effect_id || merged.includes(edge.from)),
      mergedFrom: merged,
      dependsOn: dependencyEdges
        .filter((edge) => edge.to === effect.effect_id || edge.from === effect.effect_id)
        .map((edge) => edge.from === effect.effect_id ? edge.to : edge.from)
    });
    if (!candidate) {
      continue;
    }
    candidates.push(candidate);
    if (candidate.required_action === "residual_warning") {
      residual.push(candidate.effect_id);
    }
  }

  return {
    schema_version: "agenttx.graph_recovery_plan.v0.3",
    tx_id: input.txId,
    mode: "graph",
    fallback_reason: null,
    ordered_effect_ids: candidates.map((candidate) => candidate.effect_id),
    candidates,
    deduplicated_effect_ids: deduplicated,
    residual_effect_ids: residual,
    graph_edges_used: graphEdgesUsed,
    note: "Recovery plan was derived from effect_graph.json. derived_from edges deduplicate semantic effects; dependency edges determine reverse recovery order.",
    updated_at: new Date().toISOString()
  };
}

export function writeGraphRecoveryPlan(txDir: string, plan: GraphRecoveryPlan): void {
  fs.writeFileSync(path.join(txDir, "graph_recovery_plan.json"), `${JSON.stringify(plan, null, 2)}\n`, "utf8");
}

function fallbackPlan(
  input: PlannerInput,
  effects: Gate1TypedEffect[],
  before: Snapshot | null,
  reason: string
): GraphRecoveryPlan {
  const candidates = effects
    .map((effect, index) => candidateFromEffect(input, effect, before, index + 1, {
      blockingOverride: false,
      mergedFrom: [],
      dependsOn: []
    }))
    .filter((candidate): candidate is GraphRecoveryCandidate => Boolean(candidate));

  return {
    schema_version: "agenttx.graph_recovery_plan.v0.3",
    tx_id: input.txId,
    mode: "fallback",
    fallback_reason: reason,
    ordered_effect_ids: candidates.map((candidate) => candidate.effect_id),
    candidates,
    deduplicated_effect_ids: [],
    residual_effect_ids: candidates.filter((candidate) => candidate.required_action === "residual_warning").map((candidate) => candidate.effect_id),
    graph_edges_used: [],
    note: "Recovery plan used legacy flat effects fallback because effect graph input was unavailable or incomplete.",
    updated_at: new Date().toISOString()
  };
}

function candidateFromEffect(
  input: PlannerInput,
  effect: Gate1TypedEffect,
  before: Snapshot | null,
  index: number,
  options: {
    blockingOverride: boolean;
    mergedFrom: string[];
    dependsOn: string[];
  }
): GraphRecoveryCandidate | null {
  const expectedHash = before?.files[effect.target] ?? null;
  const backupExists = expectedHash !== null && fs.existsSync(path.join(input.txDir, "files_before", safeFileName(effect.target)));
  const blocking = options.blockingOverride || effect.type === "config.modify" || effect.sensitive;
  const common = {
    order: index,
    effect_id: effect.effect_id,
    type: effect.type,
    target: effect.target,
    blocking,
    source_node_id: effect.effect_id,
    depends_on_effect_ids: options.dependsOn,
    merged_from_effect_ids: options.mergedFrom
  };

  if (effect.type === "filesystem.create") {
    return {
      ...common,
      required_action: "delete_created_file",
      reversible: true,
      verification: { type: "file_absent" },
      residual_warning: null,
      reason: "file was created by transaction"
    };
  }

  if (effect.type === "filesystem.modify" || effect.type === "filesystem.delete" || isSemanticRecoverable(effect.type)) {
    if (backupExists) {
      return {
        ...common,
        required_action: "restore_file",
        reversible: true,
        verification: { type: "hash_match", expected_hash: expectedHash },
        residual_warning: null,
        reason: options.mergedFrom.length > 0
          ? `graph merged semantic effects: ${options.mergedFrom.join(", ")}`
          : "file can be restored from before snapshot"
      };
    }
    return {
      ...common,
      required_action: "manual_review",
      reversible: false,
      verification: { type: "manual_required", expected_hash: expectedHash },
      residual_warning: `No before-snapshot backup is available for ${effect.target}.`,
      reason: "graph candidate has no before-snapshot backup"
    };
  }

  if (effect.type === "external.network") {
    return {
      ...common,
      required_action: "residual_warning",
      blocking: true,
      reversible: false,
      verification: { type: "unrecoverable_external" },
      residual_warning: `External effect cannot be reverted by AgentTx: ${effect.target}.`,
      reason: "external effect is observable residual only"
    };
  }

  return null;
}

function isPhysicalEffect(effect: Gate1TypedEffect): boolean {
  return effect.type === "filesystem.create"
    || effect.type === "filesystem.modify"
    || effect.type === "filesystem.delete"
    || effect.type === "external.network";
}

function isBlockingSemanticEffect(effect: Gate1TypedEffect): boolean {
  return effect.type === "config.modify"
    || effect.type === "env.modify"
    || effect.type === "credential.modify"
    || effect.type === "service.config.modify";
}

function isSemanticRecoverable(type: Gate1TypedEffect["type"]): boolean {
  return type === "config.modify"
    || type === "package.modify"
    || type === "env.modify"
    || type === "credential.modify"
    || type === "service.config.modify";
}

function orderEffectsFromGraph(effects: Gate1TypedEffect[], dependencyEdges: EffectGraphEdge[]): Gate1TypedEffect[] {
  const indexByEffect = new Map(effects.map((effect, index) => [effect.effect_id, index]));
  const reverseDependencyScore = new Map<string, number>();
  for (const edge of dependencyEdges) {
    reverseDependencyScore.set(edge.to, (reverseDependencyScore.get(edge.to) ?? 0) + 1);
    reverseDependencyScore.set(edge.from, reverseDependencyScore.get(edge.from) ?? 0);
  }
  return [...effects].sort((left, right) => {
    const leftPhysical = isPhysicalEffect(left) ? 0 : 1;
    const rightPhysical = isPhysicalEffect(right) ? 0 : 1;
    if (leftPhysical !== rightPhysical) {
      return leftPhysical - rightPhysical;
    }
    const leftExternal = left.type === "external.network" ? 1 : 0;
    const rightExternal = right.type === "external.network" ? 1 : 0;
    if (leftExternal !== rightExternal) {
      return leftExternal - rightExternal;
    }
    const scoreDelta = (reverseDependencyScore.get(right.effect_id) ?? 0) - (reverseDependencyScore.get(left.effect_id) ?? 0);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }
    return (indexByEffect.get(left.effect_id) ?? 0) - (indexByEffect.get(right.effect_id) ?? 0);
  });
}

function isUsableGraph(graph: Gate1EffectGraph | null, effects: Gate1TypedEffect[]): graph is Gate1EffectGraph {
  if (!graph || graph.schema_version !== "gate3.effect_graph.v0.3" || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    return false;
  }
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  return effects.every((effect) => nodeIds.has(effect.effect_id));
}

function readJsonIfExists<T>(file: string): T | null {
  if (!fs.existsSync(file)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

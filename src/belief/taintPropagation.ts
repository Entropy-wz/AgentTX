import fs from "node:fs";
import path from "node:path";
import type { AgentMemoryRecord } from "./memoryStore.js";

export type BeliefTaintRelation =
  | "observed_by"
  | "may_generate"
  | "depends_on"
  | "taints"
  | "repaired_by";

export interface BeliefTaintGraphNode {
  id: string;
  memory_id: string;
  tx_id: string;
  type: AgentMemoryRecord["type"];
  truth_status: AgentMemoryRecord["truth_status"];
  taint_status: AgentMemoryRecord["taint_status"];
  retrievable: boolean;
  content: string;
}

export interface BeliefTaintGraphEdge {
  from: string;
  to: string;
  relation: BeliefTaintRelation;
  evidence: Record<string, unknown>;
}

export interface BeliefTaintGraph {
  schema_version: "agenttx.belief_taint_graph.v0.3";
  tx_id: string;
  nodes: BeliefTaintGraphNode[];
  edges: BeliefTaintGraphEdge[];
  taint_roots: string[];
  propagated_memory_ids: string[];
  invalidated_memory_ids: string[];
  clean_replacement_memory_ids: string[];
  propagation_depth: number;
  path_summary: string[];
  note: string;
  updated_at: string;
}

export interface TaintPropagationSummary {
  schema_version: "agenttx.taint_propagation.v0.3";
  graph_path: string;
  taint_roots: string[];
  propagated_memory_ids: string[];
  invalidated_descendant_ids: string[];
  clean_replacement_memory_ids: string[];
  propagation_depth: number;
  graph_path_summary: string[];
  retrievable_tainted_memory_ids: string[];
}

export function propagateTaint(input: {
  txDir: string;
  txId: string;
  records: AgentMemoryRecord[];
  taintRootIds: string[];
  cleanReplacementIds: string[];
}): { records: AgentMemoryRecord[]; graph: BeliefTaintGraph; summary: TaintPropagationSummary } {
  const now = new Date().toISOString();
  const byId = new Map(input.records.map((record) => [record.memory_id, record]));
  const descendants = descendantsOf(input.taintRootIds, input.records);
  const cleanIds = new Set(input.cleanReplacementIds);
  const affected = new Set([...input.taintRootIds, ...descendants].filter((id) => !cleanIds.has(id)));

  for (const memoryId of affected) {
    const record = byId.get(memoryId);
    if (!record) {
      continue;
    }
    record.truth_status = "invalidated";
    record.taint_status = "repaired";
    record.retrievable = false;
    record.repair_action = "invalidate";
    record.repaired_by = input.txId;
    record.updated_at = now;
  }

  const graph = buildBeliefTaintGraph({
    txId: input.txId,
    records: input.records.filter((record) =>
      record.tx_id === input.txId
      || affected.has(record.memory_id)
      || input.cleanReplacementIds.includes(record.memory_id)
    ),
    taintRootIds: input.taintRootIds,
    propagatedIds: [...affected],
    cleanReplacementIds: input.cleanReplacementIds
  });
  writeBeliefTaintGraph(input.txDir, graph);

  const retrievableTainted = input.records.filter((record) =>
    record.retrievable === true
    && (record.taint_status === "tainted" || record.truth_status === "contradicted")
  );

  return {
    records: input.records,
    graph,
    summary: {
      schema_version: "agenttx.taint_propagation.v0.3",
      graph_path: "belief_taint_graph.json",
      taint_roots: input.taintRootIds,
      propagated_memory_ids: [...affected],
      invalidated_descendant_ids: [...affected],
      clean_replacement_memory_ids: input.cleanReplacementIds,
      propagation_depth: graph.propagation_depth,
      graph_path_summary: graph.path_summary,
      retrievable_tainted_memory_ids: retrievableTainted.map((record) => record.memory_id)
    }
  };
}

export function writeBeliefTaintGraph(txDir: string, graph: BeliefTaintGraph): void {
  fs.writeFileSync(path.join(txDir, "belief_taint_graph.json"), `${JSON.stringify(graph, null, 2)}\n`, "utf8");
}

function descendantsOf(rootIds: string[], records: AgentMemoryRecord[]): Set<string> {
  const descendants = new Set<string>();
  const queue = [...rootIds];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    for (const record of records) {
      if (!record.depends_on_memory.includes(current) || descendants.has(record.memory_id)) {
        continue;
      }
      descendants.add(record.memory_id);
      queue.push(record.memory_id);
    }
  }
  return descendants;
}

function buildBeliefTaintGraph(input: {
  txId: string;
  records: AgentMemoryRecord[];
  taintRootIds: string[];
  propagatedIds: string[];
  cleanReplacementIds: string[];
}): BeliefTaintGraph {
  const edges: BeliefTaintGraphEdge[] = [];
  const recordIds = new Set(input.records.map((record) => record.memory_id));

  for (const record of input.records) {
    for (const parent of record.depends_on_memory) {
      if (!recordIds.has(parent)) {
        continue;
      }
      edges.push({
        from: parent,
        to: record.memory_id,
        relation: relationFor(parent, record, input),
        evidence: {
          source: "depends_on_memory",
          child_type: record.type
        }
      });
    }
  }

  const pathSummary = summarizePaths(input.records, input.taintRootIds, input.cleanReplacementIds);
  return {
    schema_version: "agenttx.belief_taint_graph.v0.3",
    tx_id: input.txId,
    nodes: input.records.map((record) => ({
      id: record.memory_id,
      memory_id: record.memory_id,
      tx_id: record.tx_id,
      type: record.type,
      truth_status: record.truth_status,
      taint_status: record.taint_status,
      retrievable: record.retrievable,
      content: record.content
    })),
    edges,
    taint_roots: input.taintRootIds,
    propagated_memory_ids: input.propagatedIds,
    invalidated_memory_ids: input.propagatedIds,
    clean_replacement_memory_ids: input.cleanReplacementIds,
    propagation_depth: propagationDepth(input.records, input.taintRootIds),
    path_summary: pathSummary,
    note: "Belief taint graph covers AgentTx externalized memory only. It does not inspect Claude hidden state.",
    updated_at: new Date().toISOString()
  };
}

function relationFor(
  parent: string,
  record: AgentMemoryRecord,
  input: { taintRootIds: string[]; propagatedIds: string[]; cleanReplacementIds: string[] }
): BeliefTaintRelation {
  if (record.type === "agent_claim" && input.taintRootIds.includes(record.memory_id)) {
    return "observed_by";
  }
  if (input.cleanReplacementIds.includes(record.memory_id)) {
    return "repaired_by";
  }
  if (input.taintRootIds.includes(parent) || input.propagatedIds.includes(parent)) {
    return "taints";
  }
  if (record.type === "task_summary" || record.type === "planner_update" || record.type === "memory_write") {
    return "may_generate";
  }
  return "depends_on";
}

function propagationDepth(records: AgentMemoryRecord[], rootIds: string[]): number {
  let maxDepth = 0;
  const queue = rootIds.map((id) => ({ id, depth: 0 }));
  const seen = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current.id)) {
      continue;
    }
    seen.add(current.id);
    maxDepth = Math.max(maxDepth, current.depth);
    for (const record of records.filter((candidate) => candidate.depends_on_memory.includes(current.id))) {
      queue.push({ id: record.memory_id, depth: current.depth + 1 });
    }
  }
  return maxDepth;
}

function summarizePaths(records: AgentMemoryRecord[], rootIds: string[], cleanReplacementIds: string[]): string[] {
  const byId = new Map(records.map((record) => [record.memory_id, record]));
  const observation = records.find((record) => record.type === "tool_observation");
  const root = rootIds.map((id) => byId.get(id)).find(Boolean);
  const task = records.find((record) => record.type === "task_summary" && !cleanReplacementIds.includes(record.memory_id));
  const planner = records.find((record) => record.type === "planner_update");
  const memoryWrite = records.find((record) => record.type === "memory_write");
  const clean = cleanReplacementIds.map((id) => byId.get(id)).find(Boolean);
  return [
    observation ? `${observation.type}:${observation.memory_id}` : null,
    root ? `${root.type}:${root.memory_id}` : null,
    task ? `${task.type}:${task.memory_id}` : null,
    planner ? `${planner.type}:${planner.memory_id}` : null,
    memoryWrite ? `${memoryWrite.type}:${memoryWrite.memory_id}` : null,
    clean ? `clean_${clean.type}:${clean.memory_id}` : null
  ].filter((item): item is string => item !== null);
}

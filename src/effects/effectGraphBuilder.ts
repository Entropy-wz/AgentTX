import fs from "node:fs";
import path from "node:path";
import {
  EffectGraphEdge,
  EffectGraphNode,
  Gate1EffectGraph,
  Gate1RecoveryReport,
  Gate1RequestArtifact,
  Gate1TypedEffect
} from "../core/schema/artifactTypes.js";

const LOCKFILES = new Set(["package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock"]);

export function buildEffectGraph(txDir: string, txId: string): Gate1EffectGraph {
  const request = readJsonIfExists<Gate1RequestArtifact>(path.join(txDir, "request.json"));
  const recoveryReport = readJsonIfExists<Gate1RecoveryReport>(path.join(txDir, "recovery_report.json"));
  const effects = readEffects(path.join(txDir, "effects.jsonl"));
  const nodes = new Map<string, EffectGraphNode>();
  const edges = new Map<string, EffectGraphEdge>();

  const commandNode = commandNodeFrom(txId, request, effects);
  addNode(nodes, commandNode);

  for (const effect of effects) {
    addNode(nodes, effectNode(effect));
    addEdge(edges, {
      from: commandNode.id,
      to: effect.effect_id,
      relation: "caused",
      evidence: {
        source: "effects.jsonl",
        command: request?.command ?? effect.target
      }
    });
  }

  addDerivedConfigEdges(effects, edges);
  addPackageDependencyEdges(effects, edges);
  addBeliefTaint(txId, request, effects, nodes, edges);
  addRecoveryRequirements(effects, recoveryReport, nodes, edges);

  return {
    schema_version: "gate3.effect_graph.v0.3",
    tx_id: txId,
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    note: "Gate 3 builds causal, dependency, belief-taint, and recovery-requirement edges from typed effects.",
    updated_at: new Date().toISOString()
  };
}

function commandNodeFrom(txId: string, request: Gate1RequestArtifact | null, effects: Gate1TypedEffect[]): EffectGraphNode {
  const blocked = effects.some((effect) => effect.type === "command.blocked");
  const failed = effects.some((effect) => effect.type === "command.failed");
  return {
    id: `cmd_${txId}`,
    type: blocked ? "command.blocked" : failed ? "command.failed" : "command.executed",
    target: request?.command ?? "<unknown>",
    status: blocked ? "blocked" : failed ? "failed" : "completed",
    evidence: {
      source: "request.json",
      cwd: request?.cwd,
      tool_name: request?.tool_name,
      host: request?.host
    }
  };
}

function effectNode(effect: Gate1TypedEffect): EffectGraphNode {
  return {
    id: effect.effect_id,
    type: effect.type,
    target: effect.target,
    status: effect.status,
    evidence: {
      source: "effects.jsonl",
      recoverability: effect.recoverability,
      sensitive: effect.sensitive,
      expected: effect.expected,
      effect_evidence: effect.evidence
    }
  };
}

function addDerivedConfigEdges(effects: Gate1TypedEffect[], edges: Map<string, EffectGraphEdge>): void {
  for (const configEffect of effects.filter((effect) => effect.type === "config.modify")) {
    const derivedFrom = typeof configEffect.evidence.derived_from === "string"
      ? configEffect.evidence.derived_from
      : effects.find((effect) => effect.target === configEffect.target && effect.effect_id !== configEffect.effect_id)?.effect_id;

    if (derivedFrom) {
      addEdge(edges, {
        from: derivedFrom,
        to: configEffect.effect_id,
        relation: "derived_from",
        evidence: {
          source: "config.modify",
          target: configEffect.target
        }
      });
    }
  }
}

function addPackageDependencyEdges(effects: Gate1TypedEffect[], edges: Map<string, EffectGraphEdge>): void {
  const packageJsonEffects = effects.filter((effect) => normalizeTarget(effect.target) === "package.json");
  const lockfileEffects = effects.filter((effect) => LOCKFILES.has(normalizeTarget(effect.target)));

  for (const packageEffect of packageJsonEffects) {
    for (const lockfileEffect of lockfileEffects) {
      addEdge(edges, {
        from: packageEffect.effect_id,
        to: lockfileEffect.effect_id,
        relation: "dependency",
        evidence: {
          source: "node_package_manifest_lockfile",
          manifest: packageEffect.target,
          lockfile: lockfileEffect.target
        }
      });
    }
  }
}

function addBeliefTaint(
  txId: string,
  request: Gate1RequestArtifact | null,
  effects: Gate1TypedEffect[],
  nodes: Map<string, EffectGraphNode>,
  edges: Map<string, EffectGraphEdge>
): void {
  if (!effects.some((effect) => effect.type === "command.failed")) {
    return;
  }

  const beliefNode: EffectGraphNode = {
    id: `belief_${txId}_tainted_success_claim`,
    type: "belief.claim",
    target: "agent_command_outcome",
    status: "tainted",
    content: "The failed command may have been incorrectly treated as successful by the agent.",
    evidence: {
      source: "command.failed",
      command: request?.command ?? "<unknown>"
    }
  };
  addNode(nodes, beliefNode);
  addEdge(edges, {
    from: `cmd_${txId}`,
    to: beliefNode.id,
    relation: "may_taint",
    evidence: {
      source: "command.failed",
      reason: "non_zero_exit_code"
    }
  });
}

function addRecoveryRequirements(
  effects: Gate1TypedEffect[],
  recoveryReport: Gate1RecoveryReport | null,
  nodes: Map<string, EffectGraphNode>,
  edges: Map<string, EffectGraphEdge>
): void {
  for (const effect of effects.filter((candidate) => candidate.type === "config.modify" || isCredentialTarget(candidate.target))) {
    const recoveryNodeId = `recovery_${stableId(effect.target)}`;
    addNode(nodes, {
      id: recoveryNodeId,
      type: "recovery.required",
      target: effect.target,
      status: "required",
      content: "High-risk configuration or credential-adjacent change requires explicit recovery review.",
      evidence: {
        source: "effect_graph_builder",
        recovery_report_status: recoveryReport?.status ?? "unknown",
        effect_id: effect.effect_id
      }
    });
    addEdge(edges, {
      from: effect.effect_id,
      to: recoveryNodeId,
      relation: "requires_recovery",
      evidence: {
        source: "credential_or_config_effect",
        target: effect.target
      }
    });
  }
}

function addNode(nodes: Map<string, EffectGraphNode>, node: EffectGraphNode): void {
  if (!nodes.has(node.id)) {
    nodes.set(node.id, node);
  }
}

function addEdge(edges: Map<string, EffectGraphEdge>, edge: EffectGraphEdge): void {
  const key = `${edge.from}\u0000${edge.to}\u0000${edge.relation}`;
  if (!edges.has(key)) {
    edges.set(key, edge);
  }
}

function readEffects(file: string): Gate1TypedEffect[] {
  if (!fs.existsSync(file)) {
    return [];
  }
  return fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Gate1TypedEffect);
}

function readJsonIfExists<T>(file: string): T | null {
  if (!fs.existsSync(file)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

function normalizeTarget(target: string): string {
  return target.replace(/\\/g, "/").replace(/^\.\//, "");
}

function isCredentialTarget(target: string): boolean {
  const normalized = normalizeTarget(target);
  return normalized === ".env"
    || normalized.startsWith(".env.")
    || normalized === ".npmrc"
    || normalized.startsWith(".ssh/")
    || normalized.startsWith(".aws/")
    || normalized.endsWith(".pem")
    || normalized.endsWith(".key")
    || normalized === ".gitconfig"
    || normalized === "CLAUDE.md"
    || normalized === ".claude/settings.json"
    || normalized === ".codex/config.toml";
}

function stableId(input: string): string {
  return input
    .replace(/\\/g, "/")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "target";
}

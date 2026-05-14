import { EffectReport, FileEffect, PostToolRequest, PreToolRequest, RiskReport, Transaction } from "../../types.js";

export type TypedEffectType =
  | "filesystem.create"
  | "filesystem.modify"
  | "filesystem.delete"
  | "config.modify"
  | "command.blocked"
  | "command.failed";

export interface Gate1RequestArtifact {
  schema_version: "gate1.request.v0.3";
  tx_id: string;
  agent: string;
  host: string;
  tool_name: string;
  command: string;
  cwd: string;
  git_root: string;
  intent: string | null;
  session_id?: string;
  tool_use_id?: string;
  created_at: string;
  raw_request: PreToolRequest;
}

export interface Gate1TypedEffect {
  effect_id: string;
  tx_id: string;
  type: TypedEffectType;
  target: string;
  status: "observed" | "blocked";
  recoverability: "R0" | "R1" | "unknown";
  sensitive: boolean;
  expected: boolean;
  evidence: Record<string, unknown>;
  observed_at: string;
}

export type EffectGraphRelation =
  | "caused"
  | "dependency"
  | "may_taint"
  | "requires_recovery"
  | "derived_from";

export interface EffectGraphNode {
  id: string;
  type: string;
  target?: string;
  status?: string;
  content?: string;
  evidence?: Record<string, unknown>;
}

export interface EffectGraphEdge {
  from: string;
  to: string;
  relation: EffectGraphRelation;
  evidence?: Record<string, unknown>;
}

export interface Gate1EffectGraph {
  schema_version: "gate1.effect_graph.v0.3" | "gate3.effect_graph.v0.3";
  tx_id: string;
  nodes: EffectGraphNode[];
  edges: EffectGraphEdge[];
  note: string;
  updated_at: string;
}

export interface Gate1RecoveryReport {
  schema_version: "gate1.recovery_report.v0.3";
  tx_id: string;
  status: "not_required" | "required";
  recovery_context: string | null;
  legacy_recovery_md: string | null;
  updated_at: string;
}

export interface Gate1BeliefReport {
  schema_version: "gate1.belief_report.v0.3";
  tx_id: string;
  records: Array<{
    belief_record_id: string;
    type: "recovery_context";
    content: string;
    source: string;
    truth_status: "verified";
    taint_status: "clean";
    depends_on_effects: string[];
  }>;
  note: string;
  updated_at: string;
}

export interface Gate1VerifierReport {
  schema_version: "gate1.verifier_report.v0.3";
  tx_id: string;
  result: "not_run";
  state_verification: Record<string, unknown>;
  effect_verification: Record<string, unknown>;
  belief_verification: Record<string, unknown>;
  residual_risks: string[];
  note: string;
  updated_at: string;
}

export function toRequestArtifact(tx: Transaction, request: PreToolRequest): Gate1RequestArtifact {
  return {
    schema_version: "gate1.request.v0.3",
    tx_id: tx.tx_id,
    agent: tx.agent,
    host: tx.agent,
    tool_name: tx.tool_name,
    command: tx.command,
    cwd: tx.cwd,
    git_root: tx.git_root,
    intent: null,
    session_id: tx.session_id,
    tool_use_id: tx.tool_use_id,
    created_at: tx.created_at,
    raw_request: request
  };
}

export function toRiskArtifact(risk: RiskReport): RiskReport {
  return risk;
}

export function blockedCommandEffect(tx: Transaction): Gate1TypedEffect {
  return {
    effect_id: `${tx.tx_id}_effect_blocked_001`,
    tx_id: tx.tx_id,
    type: "command.blocked",
    target: tx.command,
    status: "blocked",
    recoverability: "R0",
    sensitive: false,
    expected: false,
    evidence: {
      source: "risk.json",
      decision: tx.risk.decision,
      risk_level: tx.risk.level,
      reasons: tx.risk.reasons
    },
    observed_at: new Date().toISOString()
  };
}

export function failedCommandEffect(tx: Transaction, request: PostToolRequest, report: EffectReport): Gate1TypedEffect {
  return {
    effect_id: `${tx.tx_id}_effect_command_failed`,
    tx_id: tx.tx_id,
    type: "command.failed",
    target: tx.command,
    status: "observed",
    recoverability: report.file_effects.length > 0 ? "R1" : "unknown",
    sensitive: false,
    expected: false,
    evidence: {
      source: "effect_report.json",
      exit_code: request.exitCode ?? null,
      stderr_tail: request.stderr?.slice(-4000)
    },
    observed_at: new Date().toISOString()
  };
}

export function fileEffectToTypedEffect(tx: Transaction, effect: FileEffect, index: number): Gate1TypedEffect[] {
  const type = effect.type === "created"
    ? "filesystem.create"
    : effect.type === "deleted"
      ? "filesystem.delete"
      : "filesystem.modify";
  const typed: Gate1TypedEffect = {
    effect_id: `${tx.tx_id}_effect_file_${String(index + 1).padStart(3, "0")}`,
    tx_id: tx.tx_id,
    type,
    target: effect.path,
    status: "observed",
    recoverability: "R1",
    sensitive: effect.sensitive,
    expected: false,
    evidence: {
      source: "effect_report.json",
      legacy_file_effect: effect
    },
    observed_at: new Date().toISOString()
  };

  if (isConfigPath(effect.path)) {
    return [
      typed,
      {
        ...typed,
        effect_id: `${typed.effect_id}_config`,
        type: "config.modify",
        evidence: {
          ...typed.evidence,
          derived_from: typed.effect_id
        }
      }
    ];
  }

  return [typed];
}

function isConfigPath(filePath: string): boolean {
  return filePath === ".env"
    || filePath.startsWith(".env.")
    || filePath === ".npmrc"
    || filePath === "CLAUDE.md"
    || filePath === ".codex/config.toml"
    || filePath === ".claude/settings.json";
}

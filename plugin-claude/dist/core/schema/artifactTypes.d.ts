import { EffectReport, FileEffect, PostToolRequest, PreToolRequest, RiskReport, Transaction } from "../../types.js";
export type TypedEffectType = "filesystem.create" | "filesystem.modify" | "filesystem.delete" | "config.modify" | "command.blocked" | "command.failed";
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
export type EffectGraphRelation = "caused" | "dependency" | "may_taint" | "requires_recovery" | "derived_from";
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
export declare function toRequestArtifact(tx: Transaction, request: PreToolRequest): Gate1RequestArtifact;
export declare function toRiskArtifact(risk: RiskReport): RiskReport;
export declare function blockedCommandEffect(tx: Transaction): Gate1TypedEffect;
export declare function failedCommandEffect(tx: Transaction, request: PostToolRequest, report: EffectReport): Gate1TypedEffect;
export declare function fileEffectToTypedEffect(tx: Transaction, effect: FileEffect, index: number): Gate1TypedEffect[];

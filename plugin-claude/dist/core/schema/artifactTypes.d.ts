import { EffectReport, FileEffect, PostToolRequest, PreToolRequest, RiskReport, Transaction } from "../../types.js";
export type TypedEffectType = "filesystem.create" | "filesystem.modify" | "filesystem.delete" | "config.modify" | "external.network" | "command.blocked" | "command.failed";
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
    schema_version: "gate1.recovery_report.v0.3" | "gate4.recovery_report.v0.3";
    tx_id: string;
    status: "not_required" | "required" | "recovered" | "partially_recovered" | "unrecoverable";
    recovery_context?: string | null;
    legacy_recovery_md?: string | null;
    contracts_total?: number;
    executed_contracts?: string[];
    failed_contracts?: string[];
    manual_contracts?: string[];
    residual_warnings?: string[];
    updated_at: string;
}
export type RecoveryAction = "restore_file" | "delete_created_file" | "manual_review" | "residual_warning";
export type RecoveryVerificationType = "hash_match" | "file_absent" | "manual_required" | "unrecoverable_external";
export interface Gate4RecoveryContract {
    contract_id: string;
    tx_id: string;
    effect_id: string;
    required_action: RecoveryAction;
    target: string;
    blocking: boolean;
    reversible: boolean;
    verification: {
        type: RecoveryVerificationType;
        expected_hash?: string | null;
    };
    status: "planned" | "executed" | "verified" | "failed" | "manual_required" | "residual";
    residual_warning: string | null;
    updated_at: string;
}
export interface Gate4VerifierReport {
    schema_version: "gate4.verifier_report.v0.3";
    tx_id: string;
    status: "recovered" | "partially_recovered" | "unrecoverable" | "not_needed";
    checks: Array<{
        contract_id: string;
        effect_id: string;
        target: string;
        verification_type: RecoveryVerificationType;
        passed: boolean;
        reason?: string;
    }>;
    residual_effects: number;
    residual_warnings: string[];
    updated_at: string;
}
export interface Gate1BeliefReport {
    schema_version: "gate1.belief_report.v0.3" | "gate5.belief_report.v0.3";
    tx_id: string;
    records?: Array<{
        belief_record_id: string;
        type: "recovery_context";
        content: string;
        source: string;
        truth_status: "verified";
        taint_status: "clean";
        depends_on_effects: string[];
    }>;
    tainted_claims?: Array<{
        claim: string;
        source: "failed_command" | "effect_graph";
        status: "invalidated";
        evidence: string[];
    }>;
    verified_state?: {
        command_exit: "failed" | "succeeded" | "unknown";
        recovery_status: "recovered" | "partially_recovered" | "unrecoverable" | "not_needed" | "unknown";
        changed_files: string[];
        restored_files: string[];
        residual_warnings: string[];
    };
    repair_actions?: Array<"invalidate_success_claim" | "inject_verified_state" | "require_replan_before_continuation">;
    clean_summary?: string;
    memory_repair?: {
        schema_version: "agenttx.memory_repair.v0.3";
        store_path: string;
        tainted_memory_ids: string[];
        invalidated_memory_ids: string[];
        clean_memory_ids: string[];
        retrievable_tainted_memory_ids: string[];
        memory_clean: boolean;
        events: Array<{
            event_id: string;
            action: "record" | "invalidate" | "install_clean_summary" | "verify";
            memory_id?: string;
            target_memory_id?: string;
            result: "ok" | "failed";
            detail: string;
            created_at: string;
        }>;
    };
    metrics?: {
        tcr_claim_detected: boolean;
        tcr_claim_invalidated: boolean;
        asr_clean_summary_generated: boolean;
        asr_requires_replan: boolean;
        memory_clean?: boolean;
        tainted_memory_retrievable?: boolean;
    };
    note?: string;
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
export interface AlignmentReport {
    schema_version: "agenttx.alignment_report.v0.3";
    tx_id: string;
    status: "aligned" | "aligned_with_warnings" | "misaligned" | "unknown";
    os_state: {
        verifier_status: Gate4VerifierReport["status"] | "not_run" | "missing";
        residual_effects: number;
        residual_warnings: string[];
        failed_checks: Array<{
            contract_id: string;
            effect_id: string;
            target: string;
            reason?: string;
        }>;
    };
    memory_state: {
        memory_store_present: boolean;
        retrievable_tainted_memory_ids: string[];
        invalidated_claim_present: boolean;
        clean_memory_installed: boolean;
        memory_clean: boolean;
    };
    summary_consistency: {
        checked: boolean;
        consistent: boolean;
        issues: string[];
    };
    continuation_risk: {
        invalidated_claims: string[];
        source_command: string | null;
        related_effect_targets: string[];
        warning_required: boolean;
        warning: string | null;
    };
    metrics: {
        aos_aligned: boolean;
        aos_score: number;
        memory_clean: boolean;
        summary_consistent: boolean;
        residual_count: number;
    };
    note: string;
    updated_at: string;
}
export declare function toRequestArtifact(tx: Transaction, request: PreToolRequest): Gate1RequestArtifact;
export declare function toRiskArtifact(risk: RiskReport): RiskReport;
export declare function blockedCommandEffect(tx: Transaction): Gate1TypedEffect;
export declare function failedCommandEffect(tx: Transaction, request: PostToolRequest, report: EffectReport): Gate1TypedEffect;
export declare function fileEffectToTypedEffect(tx: Transaction, effect: FileEffect, index: number): Gate1TypedEffect[];

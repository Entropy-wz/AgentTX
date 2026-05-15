import type { RiskReport } from "../types.js";
export type MemoryRecordType = "tool_observation" | "agent_claim" | "task_summary" | "recovery_context" | "memory_write" | "planner_update";
export type MemoryTruthStatus = "verified" | "unverified" | "contradicted" | "invalidated";
export type MemoryTaintStatus = "clean" | "tainted" | "repaired";
export interface AgentMemoryRecord {
    memory_id: string;
    tx_id: string;
    type: MemoryRecordType;
    content: string;
    source: string;
    truth_status: MemoryTruthStatus;
    taint_status: MemoryTaintStatus;
    retrievable: boolean;
    depends_on_effects: string[];
    depends_on_memory: string[];
    repair_action?: "none" | "invalidate" | "install_clean_summary" | "mark_unretrievable";
    repaired_by?: string;
    created_at: string;
    updated_at: string;
}
export interface MemoryRepairEvent {
    event_id: string;
    tx_id: string;
    action: "record" | "invalidate" | "install_clean_summary" | "verify";
    memory_id?: string;
    target_memory_id?: string;
    result: "ok" | "failed";
    detail: string;
    created_at: string;
}
export interface MemoryRepairSummary {
    schema_version: "agenttx.memory_repair.v0.3";
    tx_id: string;
    store_path: string;
    tainted_memory_ids: string[];
    invalidated_memory_ids: string[];
    clean_memory_ids: string[];
    retrievable_tainted_memory_ids: string[];
    memory_clean: boolean;
    events: MemoryRepairEvent[];
    updated_at: string;
}
export interface MemoryCapsuleResult {
    text: string;
    selected_memory_ids: string[];
    total_chars: number;
}
export interface MemoryCapsuleOptions {
    maxRecords?: number;
    maxChars?: number;
}
export declare class AgentMemoryStore {
    private readonly txDir;
    readonly memoryDir: string;
    readonly memoryFile: string;
    readonly repairLogFile: string;
    constructor(txDir: string);
    load(): AgentMemoryRecord[];
    queryCapsule(command: string, risk: RiskReport, options?: MemoryCapsuleOptions): MemoryCapsuleResult | null;
    repairFailedTransaction(input: {
        txId: string;
        command: string;
        invalidatedClaim: string;
        cleanSummary: string;
        effectIds: string[];
        evidence: string[];
    }): MemoryRepairSummary;
    private createRecord;
    private ensureStore;
    private writeAll;
    private appendEvents;
}

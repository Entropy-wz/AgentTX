import fs from "node:fs";
import path from "node:path";
import type { RiskReport } from "../types.js";

export type MemoryRecordType =
  | "tool_observation"
  | "agent_claim"
  | "task_summary"
  | "recovery_context"
  | "memory_write"
  | "planner_update";

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

export class AgentMemoryStore {
  readonly memoryDir: string;
  readonly memoryFile: string;
  readonly repairLogFile: string;

  constructor(private readonly txDir: string) {
    this.memoryDir = path.resolve(txDir, "..", "..", "memory");
    this.memoryFile = path.join(this.memoryDir, "belief_memory.jsonl");
    this.repairLogFile = path.join(this.memoryDir, "memory_repair_log.jsonl");
  }

  load(): AgentMemoryRecord[] {
    if (!fs.existsSync(this.memoryFile)) {
      return [];
    }
    return fs.readFileSync(this.memoryFile, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as AgentMemoryRecord);
  }

  queryCapsule(
    command: string,
    risk: RiskReport,
    options: MemoryCapsuleOptions = {}
  ): MemoryCapsuleResult | null {
    const maxRecords = options.maxRecords ?? 3;
    const maxChars = options.maxChars ?? 800;
    if (!shouldConsiderCapsule(command, risk)) {
      return null;
    }

    const candidates = this.load()
      .filter(isCleanRetrievableCapsuleRecord)
      .map((record) => ({
        record,
        score: relevanceScore(record, command)
      }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score || Date.parse(right.record.updated_at) - Date.parse(left.record.updated_at))
      .slice(0, maxRecords);

    const lines: string[] = ["AgentTx Memory Capsule:"];
    const selected: string[] = [];
    for (const candidate of candidates) {
      const line = capsuleLineFor(candidate.record, command);
      if (!line) {
        continue;
      }
      const next = [...lines, line].join("\n");
      if (next.length > maxChars) {
        break;
      }
      lines.push(line);
      selected.push(candidate.record.memory_id);
    }

    if (selected.length === 0) {
      return null;
    }

    const text = lines.join("\n");
    return {
      text,
      selected_memory_ids: selected,
      total_chars: text.length
    };
  }

  repairFailedTransaction(input: {
    txId: string;
    command: string;
    invalidatedClaim: string;
    cleanSummary: string;
    effectIds: string[];
    evidence: string[];
  }): MemoryRepairSummary {
    this.ensureStore();
    const now = new Date().toISOString();
    const records = this.load().filter((record) =>
      record.tx_id !== input.txId
      || !["command.failed", "failed_command", "belief_report.clean_summary"].includes(record.source)
    );
    const events: MemoryRepairEvent[] = [];

    const observation = this.createRecord({
      txId: input.txId,
      type: "tool_observation",
      content: `Command failed: ${input.command}`,
      source: "command.failed",
      truthStatus: "verified",
      taintStatus: "clean",
      retrievable: true,
      dependsOnEffects: input.effectIds
    });
    records.push(observation);
    events.push(event(input.txId, "record", "ok", "Recorded verified failed-command observation.", observation.memory_id));

    const claim = this.createRecord({
      txId: input.txId,
      type: "agent_claim",
      content: input.invalidatedClaim,
      source: "failed_command",
      truthStatus: "unverified",
      taintStatus: "tainted",
      retrievable: true,
      dependsOnEffects: input.effectIds,
      dependsOnMemory: [observation.memory_id]
    });
    records.push(claim);
    events.push(event(input.txId, "record", "ok", `Recorded tainted claim from evidence: ${input.evidence.join(", ")}`, claim.memory_id));

    const tainted = records.filter((record) =>
      record.tx_id === input.txId
      && (record.taint_status === "tainted" || record.truth_status === "contradicted")
      && record.retrievable
    );
    for (const record of tainted) {
      record.truth_status = "invalidated";
      record.taint_status = "repaired";
      record.retrievable = false;
      record.repair_action = "invalidate";
      record.repaired_by = input.txId;
      record.updated_at = now;
      events.push(event(input.txId, "invalidate", "ok", "Marked tainted memory as invalidated and non-retrievable.", record.memory_id));
    }

    const cleanMemory = this.createRecord({
      txId: input.txId,
      type: "task_summary",
      content: input.cleanSummary,
      source: "belief_report.clean_summary",
      truthStatus: "verified",
      taintStatus: "clean",
      retrievable: true,
      dependsOnEffects: input.effectIds,
      dependsOnMemory: [observation.memory_id, ...tainted.map((record) => record.memory_id)],
      repairAction: "install_clean_summary"
    });
    records.push(cleanMemory);
    events.push(event(input.txId, "install_clean_summary", "ok", "Installed verified clean summary memory.", cleanMemory.memory_id));

    const retrievableTainted = records.filter((record) => record.retrievable && record.taint_status === "tainted");
    events.push(event(
      input.txId,
      "verify",
      retrievableTainted.length === 0 ? "ok" : "failed",
      retrievableTainted.length === 0
        ? "No retrievable tainted memory remains."
        : `${retrievableTainted.length} retrievable tainted memory records remain.`
    ));

    this.writeAll(records);
    this.appendEvents(events);

    return {
      schema_version: "agenttx.memory_repair.v0.3",
      tx_id: input.txId,
      store_path: path.relative(path.resolve(this.txDir, "..", ".."), this.memoryFile).replace(/\\/g, "/"),
      tainted_memory_ids: tainted.map((record) => record.memory_id),
      invalidated_memory_ids: tainted.map((record) => record.memory_id),
      clean_memory_ids: [cleanMemory.memory_id],
      retrievable_tainted_memory_ids: retrievableTainted.map((record) => record.memory_id),
      memory_clean: retrievableTainted.length === 0,
      events,
      updated_at: new Date().toISOString()
    };
  }

  private createRecord(input: {
    txId: string;
    type: MemoryRecordType;
    content: string;
    source: string;
    truthStatus: MemoryTruthStatus;
    taintStatus: MemoryTaintStatus;
    retrievable: boolean;
    dependsOnEffects?: string[];
    dependsOnMemory?: string[];
    repairAction?: AgentMemoryRecord["repair_action"];
  }): AgentMemoryRecord {
    const now = new Date().toISOString();
    return {
      memory_id: `${input.txId}_mem_${stableId(`${input.type}_${input.source}_${input.content}`)}`,
      tx_id: input.txId,
      type: input.type,
      content: input.content,
      source: input.source,
      truth_status: input.truthStatus,
      taint_status: input.taintStatus,
      retrievable: input.retrievable,
      depends_on_effects: input.dependsOnEffects ?? [],
      depends_on_memory: input.dependsOnMemory ?? [],
      repair_action: input.repairAction ?? "none",
      created_at: now,
      updated_at: now
    };
  }

  private ensureStore(): void {
    fs.mkdirSync(this.memoryDir, { recursive: true });
    if (!fs.existsSync(this.memoryFile)) {
      fs.writeFileSync(this.memoryFile, "", "utf8");
    }
    if (!fs.existsSync(this.repairLogFile)) {
      fs.writeFileSync(this.repairLogFile, "", "utf8");
    }
  }

  private writeAll(records: AgentMemoryRecord[]): void {
    const content = records.map((record) => JSON.stringify(record)).join("\n");
    fs.writeFileSync(this.memoryFile, content ? `${content}\n` : "", "utf8");
  }

  private appendEvents(events: MemoryRepairEvent[]): void {
    for (const item of events) {
      fs.appendFileSync(this.repairLogFile, `${JSON.stringify(item)}\n`, "utf8");
    }
  }
}

function event(
  txId: string,
  action: MemoryRepairEvent["action"],
  result: MemoryRepairEvent["result"],
  detail: string,
  memoryId?: string
): MemoryRepairEvent {
  return {
    event_id: `${txId}_memory_event_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    tx_id: txId,
    action,
    memory_id: memoryId,
    target_memory_id: memoryId,
    result,
    detail,
    created_at: new Date().toISOString()
  };
}

function stableId(input: string): string {
  return input
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 72) || "record";
}

function shouldConsiderCapsule(command: string, risk: RiskReport): boolean {
  if (risk.decision === "deny" || risk.level === "SAFE") {
    return false;
  }
  return risk.level === "MEDIUM"
    || risk.level === "HIGH"
    || risk.level === "CRITICAL"
    || isPackageCommand(command)
    || isConfigCommand(command);
}

function isCleanRetrievableCapsuleRecord(record: AgentMemoryRecord): boolean {
  return record.retrievable === true
    && record.truth_status === "verified"
    && record.taint_status === "clean"
    && ["task_summary", "tool_observation", "recovery_context"].includes(record.type);
}

function relevanceScore(record: AgentMemoryRecord, command: string): number {
  const commandTokens = tokens(command);
  const contentTokens = tokens(record.content);
  const overlap = [...commandTokens].filter((token) => contentTokens.has(token)).length;
  let score = overlap * 10;

  if (record.type === "task_summary" && record.source === "belief_report.clean_summary") {
    score += 80;
  }
  if (record.content.toLowerCase().includes("residual_warnings:")
    && !record.content.toLowerCase().includes("residual_warnings: none")) {
    score += 35;
  }
  if (isPackageCommand(command) && hasAny(contentTokens, ["npm", "pnpm", "yarn", "package", "packagejson", "lockfile", "left", "pad"])) {
    score += 40;
  }
  if (isConfigCommand(command) && hasAny(contentTokens, ["env", "claude", "settings", "docker", "compose", "config"])) {
    score += 40;
  }
  if (/failed|invalidated|restored|replan/i.test(record.content)) {
    score += 20;
  }

  return score;
}

function capsuleLineFor(record: AgentMemoryRecord, command: string): string | null {
  const content = record.content;
  const previousCommand = matchLine(content, /^Command:\s+(.+)$/m) ?? matchLine(content, /^Command failed:\s+(.+)$/m);
  const invalidatedClaim = matchLine(content, /^Invalidated claim:\s+(.+)$/m);
  const recoveryStatus = matchLine(content, /^- recovery_status:\s+(.+)$/m);
  const restoredFiles = matchLine(content, /^- restored_files:\s+(.+)$/m);
  const residual = matchLine(content, /^- residual_warnings:\s+(.+)$/m);

  if (invalidatedClaim || previousCommand) {
    const commandText = previousCommand ?? "a previous command";
    const warning = packageInstallClaim(invalidatedClaim, command)
      ? "Do not assume the package is installed."
      : "Do not assume it succeeded.";
    const state = restoredFiles && restoredFiles !== "none"
      ? ` Restored: ${restoredFiles}.`
      : recoveryStatus
        ? ` Recovery status: ${recoveryStatus}.`
        : "";
    const residualText = residual && residual !== "none" ? ` Residual warning: ${residual}.` : "";
    return `- Previous ${commandText} failed. ${warning}${state}${residualText} Re-check verified state before continuing.`;
  }

  const singleLine = content.replace(/\s+/g, " ").trim();
  if (!singleLine) {
    return null;
  }
  return `- ${singleLine.slice(0, 240)}`;
}

function packageInstallClaim(claim: string | null, command: string): boolean {
  return /\b(npm|pnpm|yarn)\b/i.test(command)
    || (claim !== null && /\b(package|npm|dependency|installed)\b/i.test(claim));
}

function matchLine(content: string, pattern: RegExp): string | null {
  const match = content.match(pattern);
  return match?.[1]?.trim() ?? null;
}

function isPackageCommand(command: string): boolean {
  return /\b(npm|pnpm|yarn)\b/i.test(command);
}

function isConfigCommand(command: string): boolean {
  return /(\.env|\.claude[\\/]settings\.json|docker-compose\.ya?ml|CLAUDE\.md|\.npmrc)/i.test(command);
}

function tokens(value: string): Set<string> {
  return new Set(value
    .toLowerCase()
    .replace(/package\.json/g, "packagejson")
    .replace(/left-pad/g, "left pad")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3));
}

function hasAny(values: Set<string>, candidates: string[]): boolean {
  return candidates.some((candidate) => values.has(candidate));
}

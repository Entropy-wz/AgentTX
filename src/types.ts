export type AgentName = "cli" | "claude-code" | "codex" | "unknown";

export type ToolName = "Bash" | "Edit" | "Write" | string;

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type PolicyDecision = "allow" | "ask" | "deny";

export type PolicyMode = "relaxed" | "normal" | "strict";

export interface RiskReport {
  score: number;
  level: RiskLevel;
  reasons: string[];
  decision: PolicyDecision;
  policyMode: PolicyMode;
}

export interface Transaction {
  tx_id: string;
  session_id?: string;
  tool_use_id?: string;
  agent: AgentName;
  tool_name: ToolName;
  cwd: string;
  git_root: string;
  command: string;
  risk: RiskReport;
  snapshot_before: string | null;
  snapshot_after: string | null;
  effect_report: string | null;
  recovery_report: string | null;
  status: "blocked" | "pending" | "completed";
  created_at: string;
  updated_at: string;
}

export interface Snapshot {
  snapshot_id: string;
  cwd: string;
  git_root: string;
  git: {
    is_repo: boolean;
    branch: string | null;
    head: string | null;
    status_porcelain: string;
    diff_path: string | null;
  };
  files: Record<string, string | null>;
  sensitive_files: string[];
  untracked_files: string[];
  timestamp: string;
}

export interface ToolResponseSummary {
  code: number | null;
  stdout_tail?: string;
  stderr_tail?: string;
}

export interface FileEffect {
  type: "created" | "modified" | "deleted";
  path: string;
  sensitive: boolean;
}

export interface EffectReport {
  tx_id: string;
  command_exit: ToolResponseSummary;
  git_changed: boolean;
  file_effects: FileEffect[];
  unexpected_effects: string[];
  needs_recovery_context: boolean;
  created_at: string;
}

export interface PreToolRequest {
  agent: AgentName;
  tool_name: ToolName;
  command: string;
  cwd: string;
  session_id?: string;
  tool_use_id?: string;
  policyMode?: PolicyMode;
}

export interface PostToolRequest {
  agent: AgentName;
  tool_name: ToolName;
  command?: string;
  cwd: string;
  session_id?: string;
  tool_use_id?: string;
  tx_id?: string;
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
}

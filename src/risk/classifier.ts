import path from "node:path";
import { findGitRoot } from "../utils/paths.js";
import { PolicyMode, RiskLevel, RiskReport } from "../types.js";
import { RISK_WEIGHTS, SENSITIVE_FILES } from "./rules.js";

interface ClassifierContext {
  cwd: string;
  gitRoot?: string;
  policyMode?: PolicyMode;
}

export function classifyCommand(command: string, ctx: ClassifierContext): RiskReport {
  const policyMode = ctx.policyMode ?? "normal";
  const gitRoot = ctx.gitRoot ?? findGitRoot(ctx.cwd);
  const reasons = extractFeatures(command, ctx.cwd, gitRoot);
  const uniqueReasons = [...new Set(reasons)];
  const critical = matchesCriticalRule(command);
  const score = Math.max(
    critical ? 95 : 0,
    uniqueReasons.reduce((sum, reason) => sum + (RISK_WEIGHTS[reason] ?? 0), 0)
  );
  const level = toRiskLevel(score, critical);
  const decision = decide(level, uniqueReasons, policyMode, critical);

  return {
    score,
    level,
    reasons: critical && !uniqueReasons.includes("critical_rule_match")
      ? [...uniqueReasons, "critical_rule_match"]
      : uniqueReasons,
    decision,
    policyMode
  };
}

function extractFeatures(command: string, cwd: string, gitRoot: string): string[] {
  const normalized = command.trim();
  const lower = normalized.toLowerCase();
  const features: string[] = [];

  if (/\brm\s+(-[a-z]*r[a-z]*f|-rf|-fr)\b/i.test(normalized) || /\bremove-item\b.*\b-recurse\b.*\b-force\b/i.test(normalized) || /\bdel\s+\/s\b/i.test(normalized)) {
    features.push("destructive_delete");
  }

  if (/\brm\s+(?!-)(?!.*\*)[^\s;&|]+/i.test(normalized) || /\bdel\s+(?!\/s)[^\s;&|]+/i.test(normalized) || /\bremove-item\s+(?!.*\b-recurse\b)[^\s;&|]+/i.test(normalized)) {
    features.push("file_delete");
  }

  if (/\bgit\s+reset\b.*\b--hard\b/i.test(normalized)) {
    features.push("destructive_git_operation");
  }

  if (/\bgit\s+clean\b.*-[a-z]*f[a-z]*d[a-z]*x/i.test(normalized)) {
    features.push("destructive_git_operation", "removes_untracked_files");
  }

  if (/\bgit\s+push\b.*--force/i.test(normalized)) {
    features.push("destructive_git_operation");
  }

  if (/\b(curl|wget)\b[\s\S]*\|\s*(bash|sh|pwsh|powershell)\b/i.test(normalized)) {
    features.push("network_pipe_exec");
  }

  if (/\b(sudo|su|runas)\b/i.test(normalized)) {
    features.push("privilege_escalation");
  }

  if (touchesSensitivePath(lower)) {
    features.push("sensitive_path_write");
  }

  if (/\b(npm|pnpm|yarn)\s+(install|add|remove|update|uninstall)\b/i.test(normalized) || /\b(pip|poetry|cargo)\s+(install|add|update|remove)\b/i.test(normalized) || /\bgo\s+get\b/i.test(normalized)) {
    features.push("package_manager_mutation");
  }

  if (/\bnpm\s+install\b.*\s-g(\s|$)/i.test(normalized) || /\bpip\s+install\b.*\b--upgrade\b/i.test(normalized) || /\b(apt|brew|choco)\s+(install|uninstall|remove)\b/i.test(normalized)) {
    features.push("package_global_mutation");
  }

  if (/\b(chmod|chown)\b.*\s-r\b/i.test(normalized) || /\b(rm|mv|cp)\b[\s\S]*(\*|\.\s*$)/i.test(normalized)) {
    features.push("wildcard_mass_operation");
  }

  if (/(^|[\s;&])nohup\s|\bdisown\b|\bsystemctl\s+start\b|[^&]&\s*$/i.test(normalized)) {
    features.push("background_process");
  }

  if (/\bdocker\s+system\s+prune\b/i.test(normalized) || /\bdocker\s+(rm|volume\s+rm)\b.*\s-f\b/i.test(normalized)) {
    features.push("docker_destructive");
  }

  if (/\b(CLAUDE\.md|\.codex[\\/]config\.toml|\.claude[\\/]settings\.json)\b/i.test(normalized)) {
    features.push("agent_config_write");
  }

  if (extractCandidatePaths(normalized).some((target) => escapesRoot(target, cwd, gitRoot))) {
    features.push("scope_escape");
  }

  return features;
}

function matchesCriticalRule(command: string): boolean {
  return [
    /\brm\s+(-[a-z]*r[a-z]*f|-rf|-fr)\s+\/($|\s)/i,
    /\brm\s+(-[a-z]*r[a-z]*f|-rf|-fr)\s+\.\s*($|\s)/i,
    /\bgit\s+clean\b.*-[a-z]*f[a-z]*d[a-z]*x/i,
    /\bgit\s+reset\b.*\b--hard\b/i,
    /\b(curl|wget)\b[\s\S]*\|\s*(bash|sh|pwsh|powershell)\b/i,
    /\bdocker\s+system\s+prune\b/i
  ].some((pattern) => pattern.test(command));
}

function touchesSensitivePath(lowerCommand: string): boolean {
  return SENSITIVE_FILES.some((sensitive) => {
    const escaped = escapeRegExp(sensitive.toLowerCase()).replace(/\\\//g, "[\\\\/]");
    return new RegExp(`(>|>>)\\s*['"]?${escaped}(['"]?|\\s|$)`).test(lowerCommand)
      || new RegExp(`\\b(rm|del|remove-item|set-content|add-content|cp|copy|mv|move)\\b[\\s\\S]*${escaped}`).test(lowerCommand)
      || new RegExp(`\\b(writefilesync|writefile)\\s*\\([\\s\\S]*${escaped}`).test(lowerCommand);
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractCandidatePaths(command: string): string[] {
  const matches = command.matchAll(/(?:\s|^)(?:\.{2}[\\/][^\s;&|]+|\/[^\s;&|]+|[A-Za-z]:[\\/][^\s;&|]+)/g);
  return [...matches].map((match) => match[0].trim().replace(/^['"]|['"]$/g, ""));
}

function escapesRoot(target: string, cwd: string, gitRoot: string): boolean {
  const absolute = path.resolve(cwd, target);
  const relative = path.relative(gitRoot, absolute);
  return relative.startsWith("..") || path.isAbsolute(relative);
}

function toRiskLevel(score: number, critical: boolean): RiskLevel {
  if (!critical && score === 0) {
    return "SAFE";
  }
  if (critical || score >= 90) {
    return "CRITICAL";
  }
  if (score >= 60) {
    return "HIGH";
  }
  if (score >= 25) {
    return "MEDIUM";
  }
  return "LOW";
}

function decide(level: RiskLevel, reasons: string[], policyMode: PolicyMode, critical: boolean): RiskReport["decision"] {
  if (critical || level === "CRITICAL") {
    return "deny";
  }
  if (policyMode === "relaxed") {
    return "allow";
  }
  if (policyMode === "strict" && reasons.includes("sensitive_path_write")) {
    return "deny";
  }
  if (policyMode === "strict" && (level === "HIGH" || level === "MEDIUM")) {
    return "ask";
  }
  if (level === "HIGH") {
    return "deny";
  }
  if (level === "MEDIUM") {
    return "ask";
  }
  return "allow";
}

import fs from "node:fs";
import path from "node:path";
import { AlignmentReport } from "../core/schema/artifactTypes.js";
import { RiskReport } from "../types.js";

export function buildContinuationWarning(gitRoot: string, command: string, risk: RiskReport): string | null {
  if (risk.decision === "deny" || risk.level === "SAFE") {
    return null;
  }
  const reports = recentAlignmentReports(gitRoot);
  const commandTokens = tokens(command);

  for (const report of reports) {
    if (!report.continuation_risk.warning_required || !report.continuation_risk.warning) {
      continue;
    }
    const reference = [
      report.continuation_risk.source_command ?? "",
      ...report.continuation_risk.invalidated_claims,
      ...report.continuation_risk.related_effect_targets
    ].join(" ");
    const referenceTokens = tokens(reference);
    const overlap = [...commandTokens].filter((token) => referenceTokens.has(token));
    const packageRelated = /\b(npm|pnpm|yarn)\b/i.test(command)
      && [...referenceTokens].some((token) => ["npm", "pnpm", "yarn", "package", "packagejson", "lockfile"].includes(token));
    const configRelated = /(\.env|\.claude[\\/]settings\.json|docker-compose\.ya?ml|CLAUDE\.md|\.npmrc)/i.test(command)
      && [...referenceTokens].some((token) => ["env", "claude", "settings", "docker", "compose", "config"].includes(token));

    if (overlap.length >= 2 || packageRelated || configRelated) {
      return report.continuation_risk.warning;
    }
  }

  return null;
}

function recentAlignmentReports(gitRoot: string): AlignmentReport[] {
  const transactionsDir = path.join(gitRoot, ".agenttx", "transactions");
  if (!fs.existsSync(transactionsDir)) {
    return [];
  }
  return fs.readdirSync(transactionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(transactionsDir, entry.name, "alignment_report.json"))
    .filter((file) => fs.existsSync(file))
    .map((file) => ({
      file,
      mtimeMs: fs.statSync(file).mtimeMs,
      report: JSON.parse(fs.readFileSync(file, "utf8")) as AlignmentReport
    }))
    .filter((item) => item.report.schema_version === "agenttx.alignment_report.v0.3")
    .sort((left, right) => right.mtimeMs - left.mtimeMs)
    .slice(0, 5)
    .map((item) => item.report);
}

function tokens(value: string): Set<string> {
  return new Set(value
    .toLowerCase()
    .replace(/package\.json/g, "packagejson")
    .replace(/left-pad/g, "left pad")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3));
}

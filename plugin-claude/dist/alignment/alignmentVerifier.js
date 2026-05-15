import fs from "node:fs";
import path from "node:path";
export function buildAlignmentReport(txDir, txId) {
    const request = readJsonIfExists(path.join(txDir, "request.json"));
    const verifier = readJsonIfExists(path.join(txDir, "verifier_report.json"));
    const recovery = readJsonIfExists(path.join(txDir, "recovery_report.json"));
    const belief = readJsonIfExists(path.join(txDir, "belief_report.json"));
    const effects = readEffects(path.join(txDir, "effects.jsonl"));
    const memory = readMemory(txDir);
    const hasFailedCommand = effects.some((effect) => effect.type === "command.failed");
    const gate4Verifier = isGate4Verifier(verifier) ? verifier : null;
    const failedChecks = gate4Verifier?.checks
        .filter((check) => !check.passed)
        .map((check) => ({
        contract_id: check.contract_id,
        effect_id: check.effect_id,
        target: check.target,
        reason: check.reason
    })) ?? [];
    const residualWarnings = unique([
        ...(gate4Verifier?.residual_warnings ?? []),
        ...(recovery?.residual_warnings ?? [])
    ]);
    const osState = {
        verifier_status: gate4Verifier?.status ?? verifierStatusFallback(verifier),
        residual_effects: gate4Verifier?.residual_effects ?? 0,
        residual_warnings: residualWarnings,
        failed_checks: failedChecks
    };
    const retrievableTainted = memory.filter((record) => record.retrievable === true
        && (record.taint_status === "tainted" || record.truth_status === "contradicted"));
    const invalidatedClaims = belief?.tainted_claims?.filter((claim) => claim.status === "invalidated").map((claim) => claim.claim) ?? [];
    const cleanMemoryInstalled = Boolean(belief?.memory_repair?.clean_memory_ids.length)
        || memory.some((record) => record.tx_id === txId
            && record.type === "task_summary"
            && record.truth_status === "verified"
            && record.taint_status === "clean"
            && record.retrievable === true);
    const memoryClean = retrievableTainted.length === 0
        && belief?.metrics?.tainted_memory_retrievable !== true
        && belief?.memory_repair?.memory_clean !== false;
    const memoryState = {
        memory_store_present: memory.length > 0,
        retrievable_tainted_memory_ids: retrievableTainted.map((record) => record.memory_id),
        invalidated_claim_present: invalidatedClaims.length > 0,
        clean_memory_installed: cleanMemoryInstalled,
        memory_clean: memoryClean
    };
    const summaryConsistency = checkSummaryConsistency(belief, gate4Verifier, residualWarnings, hasFailedCommand);
    const continuationRisk = buildContinuationRisk(request, effects, invalidatedClaims, belief);
    const status = alignmentStatus({
        verifierPresent: gate4Verifier !== null,
        beliefPresent: belief !== null,
        osState,
        memoryState,
        summaryConsistency
    });
    const aosScore = scoreFor(status, osState, memoryState, summaryConsistency);
    return {
        schema_version: "agenttx.alignment_report.v0.3",
        tx_id: txId,
        status,
        os_state: osState,
        memory_state: memoryState,
        summary_consistency: summaryConsistency,
        continuation_risk: continuationRisk,
        metrics: {
            aos_aligned: status === "aligned" || status === "aligned_with_warnings",
            aos_score: aosScore,
            memory_clean: memoryClean,
            summary_consistent: summaryConsistency.consistent,
            residual_count: osState.residual_effects + osState.residual_warnings.length
        },
        note: "Alignment verifies observable OS state and AgentTx externalized memory only. It does not inspect Claude hidden state.",
        updated_at: new Date().toISOString()
    };
}
function alignmentStatus(input) {
    if (!input.verifierPresent || !input.beliefPresent || input.osState.verifier_status === "not_run" || input.osState.verifier_status === "missing") {
        return "unknown";
    }
    if (!input.memoryState.memory_clean || !input.summaryConsistency.consistent) {
        return "misaligned";
    }
    if (input.osState.verifier_status === "recovered" || input.osState.verifier_status === "not_needed") {
        return input.osState.residual_effects === 0 && input.osState.residual_warnings.length === 0
            ? "aligned"
            : "aligned_with_warnings";
    }
    if (input.osState.verifier_status === "partially_recovered" || input.osState.verifier_status === "unrecoverable") {
        return "aligned_with_warnings";
    }
    return "unknown";
}
function checkSummaryConsistency(belief, verifier, residualWarnings, hasFailedCommand) {
    const issues = [];
    if (hasFailedCommand) {
        if (!belief?.tainted_claims?.some((claim) => claim.status === "invalidated")) {
            issues.push("failed command has no invalidated claim in belief report");
        }
        if (!belief?.repair_actions?.includes("require_replan_before_continuation")) {
            issues.push("failed command does not require replanning before continuation");
        }
        if (!belief?.clean_summary) {
            issues.push("failed command has no clean summary");
        }
    }
    if (!belief?.clean_summary) {
        return {
            checked: hasFailedCommand,
            consistent: issues.length === 0,
            issues
        };
    }
    const summary = belief.clean_summary.toLowerCase();
    const beliefRecovery = belief.verified_state?.recovery_status;
    if (verifier && beliefRecovery && beliefRecovery !== "unknown" && beliefRecovery !== verifier.status) {
        issues.push(`belief recovery_status ${beliefRecovery} does not match verifier status ${verifier.status}`);
    }
    if (residualWarnings.length > 0 && /residual_warnings:\s*none/i.test(belief.clean_summary)) {
        issues.push("clean summary says residual_warnings are none but verifier reports residual warnings");
    }
    if (verifier?.status === "unrecoverable" && (summary.includes("recovery_status: recovered") || summary.includes("fully recovered"))) {
        issues.push("clean summary claims recovered state while verifier is unrecoverable");
    }
    return {
        checked: true,
        consistent: issues.length === 0,
        issues
    };
}
function buildContinuationRisk(request, effects, invalidatedClaims, belief) {
    const sourceCommand = request?.command ?? null;
    const relatedEffectTargets = unique(effects
        .filter((effect) => effect.type.startsWith("filesystem.") || effect.type === "config.modify")
        .map((effect) => effect.target));
    const warningRequired = invalidatedClaims.length > 0
        || belief?.repair_actions?.includes("require_replan_before_continuation") === true;
    const warning = warningRequired
        ? [
            "AgentTx Alignment Warning:",
            sourceCommand ? `- Previous command: ${sourceCommand}` : "- Previous command failed or produced tainted belief.",
            invalidatedClaims[0] ? `- Invalidated claim: ${invalidatedClaims[0]}` : "- A prior success assumption was invalidated.",
            relatedEffectTargets.length > 0 ? `- Related state: ${relatedEffectTargets.join(", ")}` : "- Re-check verified state before continuing."
        ].join("\n")
        : null;
    return {
        invalidated_claims: invalidatedClaims,
        source_command: sourceCommand,
        related_effect_targets: relatedEffectTargets,
        warning_required: warningRequired,
        warning
    };
}
function scoreFor(status, osState, memoryState, summaryConsistency) {
    if (status === "aligned") {
        return 1;
    }
    if (status === "aligned_with_warnings") {
        return 0.75;
    }
    if (status === "unknown") {
        return 0;
    }
    let score = 0.5;
    if (!memoryState.memory_clean) {
        score -= 0.25;
    }
    if (!summaryConsistency.consistent) {
        score -= 0.25;
    }
    if (osState.residual_effects > 0 || osState.residual_warnings.length > 0) {
        score -= 0.1;
    }
    return Math.max(0, score);
}
function isGate4Verifier(report) {
    return report?.schema_version === "gate4.verifier_report.v0.3";
}
function verifierStatusFallback(report) {
    if (!report) {
        return "missing";
    }
    if (report.schema_version === "gate1.verifier_report.v0.3" || ("result" in report && report.result === "not_run")) {
        return "not_run";
    }
    return "missing";
}
function readEffects(file) {
    if (!fs.existsSync(file)) {
        return [];
    }
    return fs.readFileSync(file, "utf8")
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line));
}
function readMemory(txDir) {
    const memoryFile = path.resolve(txDir, "..", "..", "memory", "belief_memory.jsonl");
    if (!fs.existsSync(memoryFile)) {
        return [];
    }
    return fs.readFileSync(memoryFile, "utf8")
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line));
}
function readJsonIfExists(file) {
    if (!fs.existsSync(file)) {
        return null;
    }
    return JSON.parse(fs.readFileSync(file, "utf8"));
}
function unique(values) {
    return [...new Set(values.filter(Boolean))];
}

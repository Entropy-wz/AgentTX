export function toRequestArtifact(tx, request) {
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
export function toRiskArtifact(risk) {
    return risk;
}
export function blockedCommandEffect(tx) {
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
export function failedCommandEffect(tx, request, report) {
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
export function fileEffectToTypedEffect(tx, effect, index) {
    const type = effect.type === "created"
        ? "filesystem.create"
        : effect.type === "deleted"
            ? "filesystem.delete"
            : "filesystem.modify";
    const typed = {
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
function isConfigPath(filePath) {
    return filePath === ".env"
        || filePath.startsWith(".env.")
        || filePath === ".npmrc"
        || filePath === "CLAUDE.md"
        || filePath === ".codex/config.toml"
        || filePath === ".claude/settings.json";
}

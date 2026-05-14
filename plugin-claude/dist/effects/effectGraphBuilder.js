import fs from "node:fs";
import path from "node:path";
const LOCKFILES = new Set(["package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock"]);
export function buildEffectGraph(txDir, txId) {
    const request = readJsonIfExists(path.join(txDir, "request.json"));
    const recoveryReport = readJsonIfExists(path.join(txDir, "recovery_report.json"));
    const effects = readEffects(path.join(txDir, "effects.jsonl"));
    const nodes = new Map();
    const edges = new Map();
    const commandNode = commandNodeFrom(txId, request, effects);
    addNode(nodes, commandNode);
    for (const effect of effects) {
        addNode(nodes, effectNode(effect));
        addEdge(edges, {
            from: commandNode.id,
            to: effect.effect_id,
            relation: "caused",
            evidence: {
                source: "effects.jsonl",
                command: request?.command ?? effect.target
            }
        });
    }
    addDerivedConfigEdges(effects, edges);
    addPackageDependencyEdges(effects, edges);
    addBeliefTaint(txId, request, effects, nodes, edges);
    addRecoveryRequirements(effects, recoveryReport, nodes, edges);
    return {
        schema_version: "gate3.effect_graph.v0.3",
        tx_id: txId,
        nodes: [...nodes.values()],
        edges: [...edges.values()],
        note: "Gate 3 builds causal, dependency, belief-taint, and recovery-requirement edges from typed effects.",
        updated_at: new Date().toISOString()
    };
}
function commandNodeFrom(txId, request, effects) {
    const blocked = effects.some((effect) => effect.type === "command.blocked");
    const failed = effects.some((effect) => effect.type === "command.failed");
    return {
        id: `cmd_${txId}`,
        type: blocked ? "command.blocked" : failed ? "command.failed" : "command.executed",
        target: request?.command ?? "<unknown>",
        status: blocked ? "blocked" : failed ? "failed" : "completed",
        evidence: {
            source: "request.json",
            cwd: request?.cwd,
            tool_name: request?.tool_name,
            host: request?.host
        }
    };
}
function effectNode(effect) {
    return {
        id: effect.effect_id,
        type: effect.type,
        target: effect.target,
        status: effect.status,
        evidence: {
            source: "effects.jsonl",
            recoverability: effect.recoverability,
            sensitive: effect.sensitive,
            expected: effect.expected,
            effect_evidence: effect.evidence
        }
    };
}
function addDerivedConfigEdges(effects, edges) {
    for (const configEffect of effects.filter((effect) => effect.type === "config.modify")) {
        const derivedFrom = typeof configEffect.evidence.derived_from === "string"
            ? configEffect.evidence.derived_from
            : effects.find((effect) => effect.target === configEffect.target && effect.effect_id !== configEffect.effect_id)?.effect_id;
        if (derivedFrom) {
            addEdge(edges, {
                from: derivedFrom,
                to: configEffect.effect_id,
                relation: "derived_from",
                evidence: {
                    source: "config.modify",
                    target: configEffect.target
                }
            });
        }
    }
}
function addPackageDependencyEdges(effects, edges) {
    const packageJsonEffects = effects.filter((effect) => normalizeTarget(effect.target) === "package.json");
    const lockfileEffects = effects.filter((effect) => LOCKFILES.has(normalizeTarget(effect.target)));
    for (const packageEffect of packageJsonEffects) {
        for (const lockfileEffect of lockfileEffects) {
            addEdge(edges, {
                from: packageEffect.effect_id,
                to: lockfileEffect.effect_id,
                relation: "dependency",
                evidence: {
                    source: "node_package_manifest_lockfile",
                    manifest: packageEffect.target,
                    lockfile: lockfileEffect.target
                }
            });
        }
    }
}
function addBeliefTaint(txId, request, effects, nodes, edges) {
    if (!effects.some((effect) => effect.type === "command.failed")) {
        return;
    }
    const beliefNode = {
        id: `belief_${txId}_tainted_success_claim`,
        type: "belief.claim",
        target: "agent_command_outcome",
        status: "tainted",
        content: "The failed command may have been incorrectly treated as successful by the agent.",
        evidence: {
            source: "command.failed",
            command: request?.command ?? "<unknown>"
        }
    };
    addNode(nodes, beliefNode);
    addEdge(edges, {
        from: `cmd_${txId}`,
        to: beliefNode.id,
        relation: "may_taint",
        evidence: {
            source: "command.failed",
            reason: "non_zero_exit_code"
        }
    });
}
function addRecoveryRequirements(effects, recoveryReport, nodes, edges) {
    for (const effect of effects.filter((candidate) => candidate.type === "config.modify" || isCredentialTarget(candidate.target))) {
        const recoveryNodeId = `recovery_${stableId(effect.target)}`;
        addNode(nodes, {
            id: recoveryNodeId,
            type: "recovery.required",
            target: effect.target,
            status: "required",
            content: "High-risk configuration or credential-adjacent change requires explicit recovery review.",
            evidence: {
                source: "effect_graph_builder",
                recovery_report_status: recoveryReport?.status ?? "unknown",
                effect_id: effect.effect_id
            }
        });
        addEdge(edges, {
            from: effect.effect_id,
            to: recoveryNodeId,
            relation: "requires_recovery",
            evidence: {
                source: "credential_or_config_effect",
                target: effect.target
            }
        });
    }
}
function addNode(nodes, node) {
    if (!nodes.has(node.id)) {
        nodes.set(node.id, node);
    }
}
function addEdge(edges, edge) {
    const key = `${edge.from}\u0000${edge.to}\u0000${edge.relation}`;
    if (!edges.has(key)) {
        edges.set(key, edge);
    }
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
function readJsonIfExists(file) {
    if (!fs.existsSync(file)) {
        return null;
    }
    return JSON.parse(fs.readFileSync(file, "utf8"));
}
function normalizeTarget(target) {
    return target.replace(/\\/g, "/").replace(/^\.\//, "");
}
function isCredentialTarget(target) {
    const normalized = normalizeTarget(target);
    return normalized === ".env"
        || normalized.startsWith(".env.")
        || normalized === ".npmrc"
        || normalized.startsWith(".ssh/")
        || normalized.startsWith(".aws/")
        || normalized.endsWith(".pem")
        || normalized.endsWith(".key")
        || normalized === ".gitconfig"
        || normalized === "CLAUDE.md"
        || normalized === ".claude/settings.json"
        || normalized === ".codex/config.toml";
}
function stableId(input) {
    return input
        .replace(/\\/g, "/")
        .replace(/[^a-zA-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 80) || "target";
}

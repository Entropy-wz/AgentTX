import fs from "node:fs";
import path from "node:path";
import { SENSITIVE_FILES } from "../risk/rules.js";
import { createSnapshot } from "../snapshot/snapshotManager.js";
import { tailText } from "../utils/process.js";
export function scanEffects(store, input) {
    const after = createSnapshot(store, input.tx, "after");
    const commandExit = {
        code: input.exitCode ?? null,
        stdout_tail: tailText(input.stdout),
        stderr_tail: tailText(input.stderr)
    };
    const fileEffects = diffFiles(input.before, after);
    const unexpectedEffects = detectUnexpectedEffects(input.tx.command, commandExit.code, fileEffects, input.before, after);
    const report = {
        tx_id: input.tx.tx_id,
        command_exit: commandExit,
        git_changed: gitChanged(input.before, after),
        file_effects: fileEffects,
        unexpected_effects: unexpectedEffects,
        needs_recovery_context: (commandExit.code !== null && commandExit.code !== 0) || unexpectedEffects.length > 0,
        created_at: new Date().toISOString()
    };
    fs.writeFileSync(path.join(store.txDir(input.tx.tx_id), "effect_report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    return { after, report };
}
function diffFiles(before, after) {
    const allPaths = new Set([...Object.keys(before.files), ...Object.keys(after.files)]);
    const effects = [];
    for (const filePath of allPaths) {
        const oldHash = before.files[filePath] ?? null;
        const newHash = after.files[filePath] ?? null;
        if (oldHash === newHash) {
            continue;
        }
        const type = oldHash === null ? "created" : newHash === null ? "deleted" : "modified";
        effects.push({ type, path: filePath, sensitive: isSensitive(filePath) });
    }
    for (const untracked of after.untracked_files) {
        if (isInternalPath(untracked)) {
            continue;
        }
        if (!before.untracked_files.includes(untracked) && !effects.some((effect) => effect.path === untracked)) {
            effects.push({ type: "created", path: untracked, sensitive: isSensitive(untracked) });
        }
    }
    for (const effect of gitStatusEffects(before, after)) {
        if (!effects.some((existing) => existing.path === effect.path)) {
            effects.push(effect);
        }
    }
    return effects.sort((a, b) => a.path.localeCompare(b.path));
}
function gitStatusEffects(before, after) {
    const beforeState = parsePorcelain(before.git.status_porcelain);
    const afterState = parsePorcelain(after.git.status_porcelain);
    const effects = [];
    for (const [filePath, status] of afterState.entries()) {
        if (isInternalPath(filePath) || beforeState.get(filePath) === status) {
            continue;
        }
        const type = status.includes("D") ? "deleted" : status.includes("?") || status.includes("A") ? "created" : "modified";
        effects.push({ type, path: filePath, sensitive: isSensitive(filePath) });
    }
    for (const filePath of beforeState.keys()) {
        if (!afterState.has(filePath) && !isInternalPath(filePath)) {
            effects.push({ type: "modified", path: filePath, sensitive: isSensitive(filePath) });
        }
    }
    return effects;
}
function parsePorcelain(status) {
    const result = new Map();
    for (const line of status.split(/\r?\n/)) {
        if (!line.trim()) {
            continue;
        }
        const marker = line.slice(0, 2);
        const rawPath = line.slice(3).split(" -> ").pop() ?? "";
        if (rawPath) {
            result.set(rawPath.replace(/\\/g, "/"), marker);
        }
    }
    return result;
}
function detectUnexpectedEffects(command, exitCode, effects, before, after) {
    const unexpected = [];
    const lower = command.toLowerCase();
    const changedSensitive = effects.some((effect) => effect.sensitive);
    const changedLockfile = effects.some((effect) => /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock|go\.sum)$/.test(effect.path));
    if (exitCode !== null && exitCode !== 0 && effects.length > 0) {
        unexpected.push("failed_command_modified_workspace");
    }
    if (exitCode !== null && exitCode !== 0 && changedSensitive) {
        unexpected.push("failed_command_modified_sensitive_file");
    }
    if (exitCode !== null && exitCode !== 0 && changedLockfile) {
        unexpected.push("lockfile_modified_after_failed_command");
    }
    if (/\b(cat|type|ls|dir|pwd|git\s+status|git\s+diff)\b/.test(lower) && effects.length > 0) {
        unexpected.push("readonly_command_modified_workspace");
    }
    if (/\b(npm|pnpm|yarn|pip|poetry|cargo|go)\b/.test(lower) && effects.some((effect) => /^\.env/.test(effect.path))) {
        unexpected.push("package_command_modified_env_file");
    }
    if (!/\bgit\b/.test(lower) && (before.git.head !== after.git.head || before.git.branch !== after.git.branch)) {
        unexpected.push("git_head_or_branch_changed_without_git_command");
    }
    if (after.untracked_files.length - before.untracked_files.length >= 20) {
        unexpected.push("large_untracked_file_increase");
    }
    if (effects.some((effect) => /(^CLAUDE\.md$|^\.codex\/config\.toml$|^\.claude\/settings\.json$)/.test(effect.path))) {
        unexpected.push("agent_config_modified");
    }
    return [...new Set(unexpected)];
}
function gitChanged(before, after) {
    return before.git.branch !== after.git.branch
        || before.git.head !== after.git.head
        || before.git.status_porcelain !== after.git.status_porcelain;
}
function isSensitive(filePath) {
    return SENSITIVE_FILES.some((sensitive) => filePath === sensitive || filePath.startsWith(`${sensitive}/`));
}
function isInternalPath(relativePath) {
    return relativePath === ".agenttx" || relativePath.startsWith(".agenttx/") || relativePath.startsWith(".agenttx\\");
}

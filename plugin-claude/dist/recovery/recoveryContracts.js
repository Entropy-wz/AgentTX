import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { safeFileName } from "../utils/paths.js";
export function runRecoveryContracts(input) {
    const effects = readEffects(path.join(input.txDir, "effects.jsonl"));
    const before = readJsonIfExists(path.join(input.txDir, "snapshot_before.json"));
    const contracts = buildRecoveryContracts(input, effects, before);
    const execution = executeContracts(input, contracts);
    const verifier = verifyContracts(input, contracts);
    return { contracts, verifier, execution };
}
export function buildRecoveryContracts(input, effects, before) {
    const contracts = [];
    let index = 1;
    for (const effect of effects) {
        const contract = contractForEffect(input, effect, before, index);
        if (contract) {
            contracts.push(contract);
            index += 1;
        }
    }
    return contracts;
}
function contractForEffect(input, effect, before, index) {
    const expectedHash = before?.files[effect.target] ?? null;
    const contractId = `${input.txId}_rc_${String(index).padStart(3, "0")}`;
    const common = {
        contract_id: contractId,
        tx_id: input.txId,
        effect_id: effect.effect_id,
        target: effect.target,
        updated_at: new Date().toISOString()
    };
    if (effect.type === "filesystem.create") {
        return {
            ...common,
            required_action: "delete_created_file",
            blocking: false,
            reversible: true,
            verification: { type: "file_absent" },
            status: "planned",
            residual_warning: null
        };
    }
    if (effect.type === "filesystem.modify" || effect.type === "filesystem.delete" || effect.type === "config.modify") {
        const blocking = effect.type === "config.modify" || effect.sensitive;
        const backupExists = expectedHash !== null && fs.existsSync(path.join(input.txDir, "files_before", safeFileName(effect.target)));
        if (backupExists) {
            return {
                ...common,
                required_action: "restore_file",
                blocking,
                reversible: true,
                verification: { type: "hash_match", expected_hash: expectedHash },
                status: "planned",
                residual_warning: null
            };
        }
        return {
            ...common,
            required_action: "manual_review",
            blocking,
            reversible: false,
            verification: { type: "manual_required", expected_hash: expectedHash },
            status: "manual_required",
            residual_warning: `No before-snapshot backup is available for ${effect.target}.`
        };
    }
    if (effect.type === "external.network") {
        return {
            ...common,
            required_action: "residual_warning",
            blocking: true,
            reversible: false,
            verification: { type: "unrecoverable_external" },
            status: "residual",
            residual_warning: `External effect cannot be reverted by AgentTx: ${effect.target}.`
        };
    }
    return null;
}
function executeContracts(input, contracts) {
    const result = {
        executed: [],
        failed: [],
        manual: [],
        residualWarnings: []
    };
    for (const contract of contracts) {
        try {
            if (contract.required_action === "restore_file") {
                const source = path.join(input.txDir, "files_before", safeFileName(contract.target));
                const target = safeWorkspacePath(input.gitRoot, contract.target);
                fs.mkdirSync(path.dirname(target), { recursive: true });
                fs.copyFileSync(source, target);
                contract.status = "executed";
                result.executed.push(contract.contract_id);
                continue;
            }
            if (contract.required_action === "delete_created_file") {
                const target = safeWorkspacePath(input.gitRoot, contract.target);
                if (fs.existsSync(target)) {
                    const stat = fs.statSync(target);
                    if (!stat.isFile()) {
                        throw new Error("target is not a file");
                    }
                    fs.rmSync(target);
                }
                contract.status = "executed";
                result.executed.push(contract.contract_id);
                continue;
            }
            if (contract.required_action === "manual_review") {
                contract.status = "manual_required";
                result.manual.push(contract.contract_id);
                if (contract.residual_warning) {
                    result.residualWarnings.push(contract.residual_warning);
                }
                continue;
            }
            contract.status = "residual";
            result.manual.push(contract.contract_id);
            if (contract.residual_warning) {
                result.residualWarnings.push(contract.residual_warning);
            }
        }
        catch (error) {
            contract.status = "failed";
            contract.residual_warning = error instanceof Error ? error.message : String(error);
            result.failed.push(contract.contract_id);
            result.residualWarnings.push(`${contract.contract_id}: ${contract.residual_warning}`);
        }
        finally {
            contract.updated_at = new Date().toISOString();
        }
    }
    return result;
}
function verifyContracts(input, contracts) {
    const checks = [];
    const residualWarnings = [];
    for (const contract of contracts) {
        const check = verifyContract(input.gitRoot, contract);
        checks.push(check);
        if (!check.passed) {
            residualWarnings.push(check.reason ?? `${contract.contract_id} did not pass verification`);
        }
        if (contract.residual_warning) {
            residualWarnings.push(contract.residual_warning);
        }
        if (check.passed && (contract.status === "executed" || contract.status === "planned")) {
            contract.status = "verified";
            contract.updated_at = new Date().toISOString();
        }
    }
    const residualEffects = checks.filter((check) => !check.passed).length;
    return {
        schema_version: "gate4.verifier_report.v0.3",
        tx_id: contracts[0]?.tx_id ?? input.txId,
        status: statusFrom(contracts, residualEffects),
        checks,
        residual_effects: residualEffects,
        residual_warnings: [...new Set(residualWarnings)],
        updated_at: new Date().toISOString()
    };
}
function verifyContract(gitRoot, contract) {
    if (contract.verification.type === "hash_match") {
        const target = safeWorkspacePath(gitRoot, contract.target);
        if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
            return failedCheck(contract, "target file is missing after recovery");
        }
        const actual = hashFile(target);
        const expected = contract.verification.expected_hash;
        return {
            contract_id: contract.contract_id,
            effect_id: contract.effect_id,
            target: contract.target,
            verification_type: contract.verification.type,
            passed: actual === expected,
            reason: actual === expected ? undefined : `hash mismatch: expected ${expected}, got ${actual}`
        };
    }
    if (contract.verification.type === "file_absent") {
        const target = safeWorkspacePath(gitRoot, contract.target);
        const absent = !fs.existsSync(target);
        return {
            contract_id: contract.contract_id,
            effect_id: contract.effect_id,
            target: contract.target,
            verification_type: contract.verification.type,
            passed: absent,
            reason: absent ? undefined : "created file still exists"
        };
    }
    if (contract.verification.type === "manual_required") {
        return failedCheck(contract, contract.residual_warning ?? "manual review is required");
    }
    return failedCheck(contract, contract.residual_warning ?? "external effect cannot be reverted");
}
function statusFrom(contracts, residualEffects) {
    if (contracts.length === 0) {
        return "not_needed";
    }
    if (residualEffects === 0) {
        return "recovered";
    }
    if (contracts.some((contract) => contract.status === "verified")) {
        return "partially_recovered";
    }
    return "unrecoverable";
}
function failedCheck(contract, reason) {
    return {
        contract_id: contract.contract_id,
        effect_id: contract.effect_id,
        target: contract.target,
        verification_type: contract.verification.type,
        passed: false,
        reason
    };
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
function safeWorkspacePath(root, target) {
    const absoluteRoot = path.resolve(root);
    const absoluteTarget = path.resolve(absoluteRoot, target);
    if (absoluteTarget !== absoluteRoot && !absoluteTarget.startsWith(`${absoluteRoot}${path.sep}`)) {
        throw new Error(`target escapes workspace: ${target}`);
    }
    return absoluteTarget;
}
function hashFile(file) {
    const hash = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    return `sha256:${hash}`;
}

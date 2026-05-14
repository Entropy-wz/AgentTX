import { Gate1TypedEffect, Gate4RecoveryContract, Gate4VerifierReport } from "../core/schema/artifactTypes.js";
import { Snapshot } from "../types.js";
interface RecoveryInput {
    txDir: string;
    txId: string;
    gitRoot: string;
}
interface ExecutionResult {
    executed: string[];
    failed: string[];
    manual: string[];
    residualWarnings: string[];
}
export declare function runRecoveryContracts(input: RecoveryInput): {
    contracts: Gate4RecoveryContract[];
    verifier: Gate4VerifierReport;
    execution: ExecutionResult;
};
export declare function buildRecoveryContracts(input: RecoveryInput, effects: Gate1TypedEffect[], before: Snapshot | null): Gate4RecoveryContract[];
export {};

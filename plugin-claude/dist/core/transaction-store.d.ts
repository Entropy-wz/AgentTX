import { Gate1TypedEffect, Gate4VerifierReport } from "./schema/artifactTypes.js";
import { TransactionStore as LegacyTransactionStore } from "../store/transactionStore.js";
export declare class StandardTransactionStore {
    private readonly legacyStore;
    constructor(legacyStore: LegacyTransactionStore);
    txDir(txId: string): string;
    initialize(txId: string): void;
    writeRequest(txId: string, request: unknown): void;
    writeRisk(txId: string, risk: unknown): void;
    appendEffect(effect: Gate1TypedEffect): void;
    appendEffects(effects: Gate1TypedEffect[]): void;
    writeRecovery(txId: string, recoveryContext: string | null): void;
    runRecovery(txId: string, gitRoot: string): Gate4VerifierReport;
    writeBeliefRepair(txId: string): string | null;
    private ensureJsonl;
    private writeJson;
    private rebuildEffectGraph;
    private readEffectIds;
}

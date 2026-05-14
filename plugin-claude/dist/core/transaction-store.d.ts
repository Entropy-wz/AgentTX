import { Gate1TypedEffect } from "./schema/artifactTypes.js";
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
    private ensureJsonl;
    private writeJson;
    private updateEffectGraph;
    private readEffectIds;
}

import { EffectReport, Snapshot, Transaction } from "../types.js";
import { TransactionStore } from "../store/transactionStore.js";
interface ScanInput {
    tx: Transaction;
    before: Snapshot;
    exitCode?: number | null;
    stdout?: string;
    stderr?: string;
}
export declare function scanEffects(store: TransactionStore, input: ScanInput): {
    after: Snapshot;
    report: EffectReport;
};
export {};

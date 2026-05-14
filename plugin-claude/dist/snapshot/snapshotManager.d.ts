import { Snapshot, Transaction } from "../types.js";
import { TransactionStore } from "../store/transactionStore.js";
export declare function createSnapshot(store: TransactionStore, tx: Transaction, phase: "before" | "after"): Snapshot;
export declare function loadSnapshot(store: TransactionStore, tx: Transaction, phase: "before" | "after"): Snapshot | null;

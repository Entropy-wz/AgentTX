import { EffectReport, Transaction } from "../types.js";
import { TransactionStore } from "../store/transactionStore.js";
export declare function generateCleanContext(tx: Transaction, report: EffectReport): string;
export declare function writeRecoveryReport(store: TransactionStore, tx: Transaction, report: EffectReport): string;

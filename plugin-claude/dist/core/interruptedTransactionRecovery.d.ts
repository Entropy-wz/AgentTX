import { TransactionStore } from "../store/transactionStore.js";
import { Transaction } from "../types.js";
export interface InterruptedRecoveryResult {
    tx: Transaction;
    context: string;
}
export declare function recoverInterruptedTransactions(store: TransactionStore): InterruptedRecoveryResult[];

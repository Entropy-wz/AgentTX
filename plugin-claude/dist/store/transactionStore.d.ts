import { Transaction } from "../types.js";
export declare class TransactionStore {
    readonly root: string;
    readonly storeDir: string;
    readonly transactionsDir: string;
    constructor(root: string);
    ensure(): void;
    txDir(txId: string): string;
    create(tx: Transaction): Transaction;
    save(tx: Transaction): void;
    load(txId: string): Transaction | null;
    list(): Transaction[];
    findByToolUseId(toolUseId: string): Transaction | null;
}

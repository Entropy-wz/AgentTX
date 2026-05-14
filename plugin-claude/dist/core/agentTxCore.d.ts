import { PostToolRequest, PreToolRequest, Transaction } from "../types.js";
import { TransactionStore } from "../store/transactionStore.js";
export declare class AgentTxCore {
    evaluate(command: string, cwd: string, policyMode?: "normal"): import("../types.js").RiskReport;
    preToolUse(request: PreToolRequest): {
        tx: Transaction;
        store: TransactionStore;
        additionalContext?: string;
    };
    postToolUse(request: PostToolRequest): {
        tx: Transaction;
        reportContext: string | null;
    };
    storeFor(cwd: string): TransactionStore;
}

import fs from "node:fs";
import path from "node:path";
export class TransactionStore {
    root;
    storeDir;
    transactionsDir;
    constructor(root) {
        this.root = root;
        this.storeDir = path.join(root, ".agenttx");
        this.transactionsDir = path.join(this.storeDir, "transactions");
    }
    ensure() {
        fs.mkdirSync(this.transactionsDir, { recursive: true });
        fs.mkdirSync(path.join(this.storeDir, "reports"), { recursive: true });
        fs.mkdirSync(path.join(this.storeDir, "policies"), { recursive: true });
        fs.mkdirSync(path.join(this.storeDir, "snapshots"), { recursive: true });
    }
    txDir(txId) {
        return path.join(this.transactionsDir, txId);
    }
    create(tx) {
        this.ensure();
        fs.mkdirSync(this.txDir(tx.tx_id), { recursive: true });
        this.save(tx);
        return tx;
    }
    save(tx) {
        this.ensure();
        const dir = this.txDir(tx.tx_id);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "transaction.json"), `${JSON.stringify(tx, null, 2)}\n`, "utf8");
        fs.writeFileSync(path.join(dir, "risk_report.json"), `${JSON.stringify(tx.risk, null, 2)}\n`, "utf8");
    }
    load(txId) {
        const file = path.join(this.txDir(txId), "transaction.json");
        if (!fs.existsSync(file)) {
            return null;
        }
        return JSON.parse(fs.readFileSync(file, "utf8"));
    }
    list() {
        if (!fs.existsSync(this.transactionsDir)) {
            return [];
        }
        return fs.readdirSync(this.transactionsDir)
            .map((name) => this.load(name))
            .filter((tx) => tx !== null)
            .sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
    findByToolUseId(toolUseId) {
        return this.list().find((tx) => tx.tool_use_id === toolUseId) ?? null;
    }
}

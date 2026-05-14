import fs from "node:fs";
import path from "node:path";
import { Transaction } from "../types.js";

export class TransactionStore {
  readonly root: string;
  readonly storeDir: string;
  readonly transactionsDir: string;

  constructor(root: string) {
    this.root = root;
    this.storeDir = path.join(root, ".agenttx");
    this.transactionsDir = path.join(this.storeDir, "transactions");
  }

  ensure(): void {
    fs.mkdirSync(this.transactionsDir, { recursive: true });
    fs.mkdirSync(path.join(this.storeDir, "reports"), { recursive: true });
    fs.mkdirSync(path.join(this.storeDir, "policies"), { recursive: true });
    fs.mkdirSync(path.join(this.storeDir, "snapshots"), { recursive: true });
  }

  txDir(txId: string): string {
    return path.join(this.transactionsDir, txId);
  }

  create(tx: Transaction): Transaction {
    this.ensure();
    fs.mkdirSync(this.txDir(tx.tx_id), { recursive: true });
    this.save(tx);
    return tx;
  }

  save(tx: Transaction): void {
    this.ensure();
    const dir = this.txDir(tx.tx_id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "transaction.json"), `${JSON.stringify(tx, null, 2)}\n`, "utf8");
    fs.writeFileSync(path.join(dir, "risk_report.json"), `${JSON.stringify(tx.risk, null, 2)}\n`, "utf8");
  }

  load(txId: string): Transaction | null {
    const file = path.join(this.txDir(txId), "transaction.json");
    if (!fs.existsSync(file)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(file, "utf8")) as Transaction;
  }

  list(): Transaction[] {
    if (!fs.existsSync(this.transactionsDir)) {
      return [];
    }
    return fs.readdirSync(this.transactionsDir)
      .map((name) => this.load(name))
      .filter((tx): tx is Transaction => tx !== null)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  findByToolUseId(toolUseId: string): Transaction | null {
    return this.list().find((tx) => tx.tool_use_id === toolUseId) ?? null;
  }
}

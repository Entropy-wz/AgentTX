import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Snapshot, Transaction } from "../types.js";
import { IMPORTANT_FILES, SENSITIVE_FILES } from "../risk/rules.js";
import { safeFileName } from "../utils/paths.js";
import { runGit } from "../utils/process.js";
import { TransactionStore } from "../store/transactionStore.js";

export function createSnapshot(store: TransactionStore, tx: Transaction, phase: "before" | "after"): Snapshot {
  const txDir = store.txDir(tx.tx_id);
  fs.mkdirSync(txDir, { recursive: true });
  const diffFileName = `${phase}.diff`;
  const diffPath = path.join(txDir, diffFileName);
  const gitStatus = runGit(["status", "--porcelain=v1"], tx.git_root);
  const gitDiff = runGit(["diff", "--binary"], tx.git_root);
  const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"], tx.git_root);
  const head = runGit(["rev-parse", "HEAD"], tx.git_root);
  const untracked = runGit(["ls-files", "--others", "--exclude-standard"], tx.git_root);
  const isRepo = gitStatus.ok || branch.ok || head.ok;

  fs.writeFileSync(diffPath, gitDiff.ok ? gitDiff.stdout : "", "utf8");

  const files = hashImportantFiles(tx.git_root);
  if (phase === "before") {
    copyImportantFiles(tx.git_root, txDir, files);
  }

  const snapshot: Snapshot = {
    snapshot_id: `snap_${tx.tx_id}_${phase}`,
    cwd: tx.cwd,
    git_root: tx.git_root,
    git: {
      is_repo: isRepo,
      branch: branch.ok ? branch.stdout.trim() : null,
      head: head.ok ? head.stdout.trim() : null,
      status_porcelain: gitStatus.ok ? gitStatus.stdout : "",
      diff_path: diffFileName
    },
    files,
    sensitive_files: SENSITIVE_FILES,
    untracked_files: untracked.ok ? untracked.stdout.split(/\r?\n/).filter((item) => item && !isInternalPath(item)) : [],
    timestamp: new Date().toISOString()
  };

  fs.writeFileSync(path.join(txDir, `snapshot_${phase}.json`), `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return snapshot;
}

function isInternalPath(relativePath: string): boolean {
  return relativePath === ".agenttx" || relativePath.startsWith(".agenttx/") || relativePath.startsWith(".agenttx\\");
}

export function loadSnapshot(store: TransactionStore, tx: Transaction, phase: "before" | "after"): Snapshot | null {
  const file = path.join(store.txDir(tx.tx_id), `snapshot_${phase}.json`);
  if (!fs.existsSync(file)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(file, "utf8")) as Snapshot;
}

function hashImportantFiles(root: string): Record<string, string | null> {
  const result: Record<string, string | null> = {};
  for (const relative of IMPORTANT_FILES) {
    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      result[relative] = null;
      continue;
    }
    const hash = crypto.createHash("sha256").update(fs.readFileSync(absolute)).digest("hex");
    result[relative] = `sha256:${hash}`;
  }
  return result;
}

function copyImportantFiles(root: string, txDir: string, files: Record<string, string | null>): void {
  const copyDir = path.join(txDir, "files_before");
  fs.mkdirSync(copyDir, { recursive: true });
  for (const [relative, hash] of Object.entries(files)) {
    if (hash === null) {
      continue;
    }
    fs.copyFileSync(path.join(root, relative), path.join(copyDir, safeFileName(relative)));
  }
}

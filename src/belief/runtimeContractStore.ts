import fs from "node:fs";
import path from "node:path";

export type RuntimeContractStatus = "open" | "verified" | "expired" | "dismissed";
export type RuntimeContractType = "package_install_verification";
export type RuntimeContractEnforcement = "ask_before_related_action";

export interface BeliefRuntimeContract {
  schema_version: "agenttx.belief_runtime_contract.v0.3";
  contract_id: string;
  type: RuntimeContractType;
  source_tx_id: string;
  claim: string;
  scope: {
    kind: "package";
    package_name: string;
    command: string;
  };
  required_verification: Array<{
    type: "package_manager_list" | "package_manifest_inspection" | "git_state_inspection";
    commands: string[];
  }>;
  related_keywords: string[];
  status: RuntimeContractStatus;
  enforcement: RuntimeContractEnforcement;
  evidence: Array<{
    tx_id?: string;
    command: string;
    exit_code?: number | null;
    result: "created" | "related_action_guarded" | "verification_allowed" | "verification_passed" | "verification_failed";
    detail: string;
    observed_at: string;
  }>;
  created_at: string;
  updated_at: string;
}

export class BeliefRuntimeContractStore {
  readonly runtimeDir: string;
  readonly contractsFile: string;

  constructor(private readonly gitRoot: string) {
    this.runtimeDir = path.join(gitRoot, ".agenttx", "runtime");
    this.contractsFile = path.join(this.runtimeDir, "belief_runtime_contracts.jsonl");
  }

  load(): BeliefRuntimeContract[] {
    if (!fs.existsSync(this.contractsFile)) {
      return [];
    }
    return fs.readFileSync(this.contractsFile, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as BeliefRuntimeContract);
  }

  openContracts(): BeliefRuntimeContract[] {
    return this.load().filter((contract) => contract.status === "open");
  }

  upsert(contract: BeliefRuntimeContract): void {
    const contracts = this.load();
    const index = contracts.findIndex((item) => item.contract_id === contract.contract_id);
    if (index >= 0) {
      contracts[index] = contract;
    } else {
      contracts.push(contract);
    }
    this.writeAll(contracts);
  }

  writeAll(contracts: BeliefRuntimeContract[]): void {
    fs.mkdirSync(this.runtimeDir, { recursive: true });
    const content = contracts.map((contract) => JSON.stringify(contract)).join("\n");
    fs.writeFileSync(this.contractsFile, content ? `${content}\n` : "", "utf8");
  }
}

export function packageContractFromFailedCommand(input: {
  txId: string;
  command: string;
  packageName: string;
}): BeliefRuntimeContract {
  const now = new Date().toISOString();
  const packageName = input.packageName;
  return {
    schema_version: "agenttx.belief_runtime_contract.v0.3",
    contract_id: `${input.txId}_brc_package_${stableId(packageName)}`,
    type: "package_install_verification",
    source_tx_id: input.txId,
    claim: `${packageName} package state must be verified before related continuation`,
    scope: {
      kind: "package",
      package_name: packageName,
      command: input.command
    },
    required_verification: [
      {
        type: "package_manager_list",
        commands: [
          `npm ls ${packageName}`,
          `npm list ${packageName}`,
          `pnpm ls ${packageName}`,
          `yarn list --pattern ${packageName}`
        ]
      },
      {
        type: "package_manifest_inspection",
        commands: [
          "cat package.json",
          "type package.json"
        ]
      },
      {
        type: "git_state_inspection",
        commands: [
          "git status",
          "git diff --stat",
          "git diff package.json"
        ]
      }
    ],
    related_keywords: [
      "npm",
      "pnpm",
      "yarn",
      "package",
      "package.json",
      "package-lock.json",
      "lockfile",
      packageName,
      ...packageName.split(/[^a-zA-Z0-9]+/).filter((token) => token.length >= 2)
    ],
    status: "open",
    enforcement: "ask_before_related_action",
    evidence: [
      {
        tx_id: input.txId,
        command: input.command,
        result: "created",
        detail: `Failed package command created runtime verification contract for ${packageName}.`,
        observed_at: now
      }
    ],
    created_at: now,
    updated_at: now
  };
}

export function addContractEvidence(
  contract: BeliefRuntimeContract,
  evidence: BeliefRuntimeContract["evidence"][number],
  status?: RuntimeContractStatus
): BeliefRuntimeContract {
  return {
    ...contract,
    status: status ?? contract.status,
    evidence: [...contract.evidence, evidence],
    updated_at: new Date().toISOString()
  };
}

function stableId(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "unknown";
}

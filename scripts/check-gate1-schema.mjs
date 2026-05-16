import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const schemaFiles = [
  "schemas/transaction-artifact.schema.json",
  "schemas/typed-effect.schema.json",
  "schemas/effect-graph.schema.json",
  "schemas/graph-recovery-plan.schema.json",
  "schemas/recovery-contract.schema.json",
  "schemas/belief-record.schema.json",
  "schemas/belief-report.schema.json",
  "schemas/belief-taint-graph.schema.json",
  "schemas/verifier-report.schema.json",
  "schemas/alignment-report.schema.json",
  "schemas/belief-runtime-contract.schema.json"
];

const exampleFiles = [
  "examples/artifacts/git-clean-blocked.transaction_artifact.json",
  "examples/artifacts/failed-package-json.transaction_artifact.json"
];

for (const file of schemaFiles) {
  const json = readJson(file);
  assert(json.$schema, `${file} must declare $schema`);
  assert(json.title, `${file} must declare title`);
  assert(json.type === "object", `${file} must define an object schema`);
}

for (const file of exampleFiles) {
  const artifact = readJson(file);
  for (const key of [
    "artifact_version",
    "schema_version",
    "transaction",
    "declared_scope",
    "snapshots",
    "typed_effects",
    "recovery_contracts",
    "belief_records",
    "verifier_report",
    "legacy_refs"
  ]) {
    assert(Object.hasOwn(artifact, key), `${file} is missing ${key}`);
  }
  assert(Array.isArray(artifact.typed_effects), `${file} typed_effects must be an array`);
  assert(Array.isArray(artifact.recovery_contracts), `${file} recovery_contracts must be an array`);
  assert(Array.isArray(artifact.belief_records), `${file} belief_records must be an array`);
  assert(artifact.transaction.tx_id, `${file} transaction.tx_id is required`);
  assert(artifact.transaction.risk.level, `${file} transaction.risk.level is required`);
}

process.stdout.write("Gate 1 schema files and example artifacts passed structural checks\n");

function readJson(relativePath) {
  const absolute = path.join(root, relativePath);
  assert(fs.existsSync(absolute), `${relativePath} does not exist`);
  return JSON.parse(fs.readFileSync(absolute, "utf8"));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

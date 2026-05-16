import { FileEffect } from "../types.js";
import { Gate1TypedEffect, TypedEffectType } from "../core/schema/artifactTypes.js";

export interface SemanticEffectCandidate {
  type: Extract<TypedEffectType, "package.modify" | "env.modify" | "credential.modify" | "service.config.modify">;
  semantic_reason: string;
  sensitive: boolean;
}

export function classifySemanticEffects(effect: FileEffect, command: string): SemanticEffectCandidate[] {
  const normalized = normalize(effect.path);
  const candidates: SemanticEffectCandidate[] = [];

  if (isPackageFile(normalized)) {
    candidates.push({
      type: "package.modify",
      semantic_reason: packageReason(normalized, command),
      sensitive: effect.sensitive
    });
  }

  if (isEnvFile(normalized)) {
    candidates.push({
      type: "env.modify",
      semantic_reason: "environment configuration file changed",
      sensitive: true
    });
  }

  if (isCredentialFile(normalized)) {
    candidates.push({
      type: "credential.modify",
      semantic_reason: "credential-adjacent file changed",
      sensitive: true
    });
  }

  if (isServiceConfigFile(normalized)) {
    candidates.push({
      type: "service.config.modify",
      semantic_reason: "service configuration file changed",
      sensitive: effect.sensitive
    });
  }

  return candidates;
}

export function semanticEffectFrom(
  base: Gate1TypedEffect,
  candidate: SemanticEffectCandidate,
  index: number,
  command: string
): Gate1TypedEffect {
  return {
    ...base,
    effect_id: `${base.effect_id}_semantic_${String(index + 1).padStart(2, "0")}`,
    type: candidate.type,
    sensitive: base.sensitive || candidate.sensitive,
    evidence: {
      source: "semantic_effect_classifier",
      derived_from: base.effect_id,
      semantic_reason: candidate.semantic_reason,
      source_path: base.target,
      command
    }
  };
}

function isPackageFile(filePath: string): boolean {
  return [
    "package.json",
    "package-lock.json",
    "npm-shrinkwrap.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "requirements.txt",
    "pyproject.toml",
    "poetry.lock",
    "Cargo.toml",
    "Cargo.lock",
    "go.mod",
    "go.sum",
    ".npmrc"
  ].includes(filePath);
}

function isEnvFile(filePath: string): boolean {
  return filePath === ".env"
    || filePath.startsWith(".env.")
    || filePath === ".npmrc"
    || filePath === ".pypirc"
    || filePath === ".bashrc"
    || filePath === ".zshrc"
    || filePath === ".profile"
    || filePath === ".bash_profile";
}

function isCredentialFile(filePath: string): boolean {
  return filePath === ".env"
    || filePath.startsWith(".env.")
    || filePath === ".npmrc"
    || filePath === ".pypirc"
    || filePath === ".git-credentials"
    || filePath === ".gitconfig"
    || filePath.startsWith(".ssh/")
    || filePath.startsWith(".aws/")
    || filePath.endsWith(".pem")
    || filePath.endsWith(".key");
}

function isServiceConfigFile(filePath: string): boolean {
  return filePath === "docker-compose.yml"
    || filePath === "docker-compose.yaml"
    || filePath === "Dockerfile"
    || filePath.startsWith("nginx/")
    || filePath.startsWith("systemd/")
    || filePath.endsWith(".service");
}

function packageReason(filePath: string, command: string): string {
  if (/\b(npm|pnpm|yarn|pip|poetry|cargo|go)\b/i.test(command)) {
    return `package manager command changed ${filePath}`;
  }
  return `package metadata file changed: ${filePath}`;
}

function normalize(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

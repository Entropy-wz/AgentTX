import { spawnSync } from "node:child_process";

export interface CommandResult {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
}

export function runGit(args: string[], cwd: string): CommandResult {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true
  });

  return {
    ok: result.status === 0,
    code: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
}

export function tailText(value: string | undefined, max = 4000): string | undefined {
  if (!value) {
    return undefined;
  }
  return value.length > max ? value.slice(value.length - max) : value;
}

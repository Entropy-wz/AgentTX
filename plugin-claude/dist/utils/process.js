import { spawnSync } from "node:child_process";
export function runGit(args, cwd) {
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
export function tailText(value, max = 4000) {
    if (!value) {
        return undefined;
    }
    return value.length > max ? value.slice(value.length - max) : value;
}

import path from "node:path";
import { runGit } from "./process.js";
export function normalizeHostPath(value) {
    const msysMatch = value.match(/^\/([a-zA-Z])\/(.*)$/);
    if (process.platform === "win32" && msysMatch) {
        return `${msysMatch[1].toUpperCase()}:\\${msysMatch[2].replace(/\//g, "\\")}`;
    }
    return value;
}
export function toPosixPath(value) {
    return value.split(path.sep).join("/");
}
export function findGitRoot(cwd) {
    const normalizedCwd = normalizeHostPath(cwd);
    const result = runGit(["rev-parse", "--show-toplevel"], normalizedCwd);
    if (!result.ok) {
        return path.resolve(normalizedCwd);
    }
    return path.resolve(result.stdout.trim());
}
export function relativeToRoot(root, filePath) {
    return toPosixPath(path.relative(root, filePath));
}
export function safeFileName(relativePath) {
    return relativePath.replace(/^[A-Za-z]:/, "").replace(/[\\/:\0]/g, "__");
}

export async function readStdinJson() {
    const chunks = [];
    for await (const chunk of process.stdin) {
        chunks.push(Buffer.from(chunk));
    }
    const input = Buffer.concat(chunks).toString("utf8").trim();
    return input ? JSON.parse(input) : {};
}
export function getString(input, key) {
    const value = input[key];
    return typeof value === "string" ? value : undefined;
}
export function getNestedString(input, key, nestedKey) {
    const value = input[key];
    if (!value || typeof value !== "object") {
        return undefined;
    }
    const nested = value[nestedKey];
    return typeof nested === "string" ? nested : undefined;
}
export function getExitCode(input) {
    const candidates = [
        input.exit_code,
        input.exitCode,
        objectValue(input.tool_response, "exit_code"),
        objectValue(input.tool_response, "exitCode")
    ];
    for (const candidate of candidates) {
        if (typeof candidate === "number") {
            return candidate;
        }
    }
    return null;
}
function objectValue(value, key) {
    if (!value || typeof value !== "object") {
        return undefined;
    }
    return value[key];
}

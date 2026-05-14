export async function readStdinJson(): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  const input = Buffer.concat(chunks).toString("utf8").trim();
  return input ? JSON.parse(input) as Record<string, unknown> : {};
}

export function getString(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  return typeof value === "string" ? value : undefined;
}

export function getNestedString(input: Record<string, unknown>, key: string, nestedKey: string): string | undefined {
  const value = input[key];
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const nested = (value as Record<string, unknown>)[nestedKey];
  return typeof nested === "string" ? nested : undefined;
}

export function getExitCode(input: Record<string, unknown>): number | null {
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

function objectValue(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  return (value as Record<string, unknown>)[key];
}

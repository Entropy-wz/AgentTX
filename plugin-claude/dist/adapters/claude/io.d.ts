export declare function readStdinJson(): Promise<Record<string, unknown>>;
export declare function getString(input: Record<string, unknown>, key: string): string | undefined;
export declare function getNestedString(input: Record<string, unknown>, key: string, nestedKey: string): string | undefined;
export declare function getExitCode(input: Record<string, unknown>): number | null;

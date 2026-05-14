export interface CommandResult {
    ok: boolean;
    code: number | null;
    stdout: string;
    stderr: string;
}
export declare function runGit(args: string[], cwd: string): CommandResult;
export declare function tailText(value: string | undefined, max?: number): string | undefined;

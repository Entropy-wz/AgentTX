import { PolicyMode, RiskReport } from "../types.js";
interface ClassifierContext {
    cwd: string;
    gitRoot?: string;
    policyMode?: PolicyMode;
}
export declare function classifyCommand(command: string, ctx: ClassifierContext): RiskReport;
export {};

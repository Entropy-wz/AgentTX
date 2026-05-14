#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT
  ? path.resolve(process.env.CLAUDE_PLUGIN_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

process.env.AGENTTX_PLUGIN_ROOT = pluginRoot;

await import(pathToFileURL(path.join(pluginRoot, "dist", "adapters", "claude", "postToolUse.js")).href);

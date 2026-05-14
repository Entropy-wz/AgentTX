# Experiment 03: failed command recovery context

Run from a demo Node repository:

```bash
agenttx run "node -e \"require('fs').writeFileSync('package.json', '{ broken json'); process.exit(1)\""
agenttx status
```

Expected: AgentTx records that the command failed and that `package.json` changed, then writes `recovery.md`.

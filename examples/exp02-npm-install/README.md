# Experiment 02: package install snapshot

Run from a demo Node repository:

```bash
agenttx run "npm install left-pad"
agenttx status
```

Expected: AgentTx creates a transaction, a before snapshot, an after snapshot, and an effect report showing package file changes.

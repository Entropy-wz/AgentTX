# Experiment 01: destructive git block

Run from a demo git repository:

```bash
agenttx guard "git reset --hard && git clean -fdx"
```

Expected: `decision` is `deny`, with destructive git reasons.

# Experiment 04: sensitive file protection

Run from a demo repository:

```bash
agenttx guard "echo API_KEY=leaked > .env"
```

Expected: normal mode asks before changing `.env`; strict mode can deny it.

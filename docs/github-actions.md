# GitHub Actions

Use `mempr guard` in CI to check that committed memory export files match the accepted MemPR ledger state.

```yaml
name: mempr-guard

on:
  pull_request:

permissions:
  contents: read

jobs:
  mempr-guard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run build
      - run: node dist/cli.js guard --destination AGENTS.md
```

This works only when the repository commits the source state needed to reproduce the export. If `.mempr/ledger.jsonl` remains ignored and uncommitted, CI cannot verify team memory exports because the accepted memory state is not present in the checkout.

# Contributing

Thanks for taking MemPR seriously enough to improve it.

The project is early, so small pull requests are preferred. A good PR changes
one thing, explains why, and includes a test when behavior changes.

## Local Setup

```bash
npm install
npm test
```

Useful commands:

```bash
npm run build
npm run lint
npm test
```

## Pull Request Guidelines

- Keep commits focused and readable.
- Add or update tests for behavior changes.
- Update docs when a command, policy, or file format changes.
- Avoid large refactors in feature PRs.
- Prefer plain files and inspectable formats over hidden state.

## Project Boundaries

MemPR is a memory governance layer, not a vector database or hosted dashboard.
Features should strengthen provenance, review, policy, export, or integration
with existing memory systems.

## Commit Style

Use short conventional-style commit messages:

```txt
feat: add markdown export
fix: preserve existing managed memory block
docs: clarify policy defaults
test: cover rejected proposals
```


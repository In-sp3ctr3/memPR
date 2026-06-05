# Contributing to MemPR

Thanks for helping improve MemPR. The project is small, local-first, and
security-sensitive, so the best contributions are focused, easy to review, and
clear about their trust boundary.

## Before You Start

- Check existing issues and pull requests for related work.
- Open an issue first for large features, public interface changes, or policy
  behavior changes.
- Keep pull requests scoped to one concern.
- Do not include secrets, private memory stores, or real user memory in tests,
  fixtures, screenshots, or logs.

## Development Setup

```bash
git clone https://github.com/In-sp3ctr3/memPR.git
cd memPR
npm install
npm run build
npm test
```

Useful commands:

```bash
npm run build
npm run lint
npm test
git diff --check
```

## Pull Request Checklist

- The change has a clear reason and a narrow scope.
- Behavior changes include tests.
- CLI, API, MCP, policy, adapter, or file-format changes update the relevant
  docs.
- New memory-reading or memory-writing paths preserve the local-first trust
  boundary.
- Denied reads do not leak memory text, source quotes, hidden IDs, grants, or
  policy internals.
- The branch passes `npm run build`, `npm run lint`, `npm test`, and
  `git diff --check`.

## Project Boundaries

MemPR is a memory governance layer, not a vector database, hosted dashboard, or
general-purpose identity provider. Contributions should strengthen provenance,
review, policy, export, diagnostics, MCP, or adapter behavior.

Out of scope for the current local-first release line:

- hosted SaaS
- organization admin UI
- vector search or embeddings
- model-assisted classification
- legal retention or compliance-grade audit guarantees

## Commit Style

Use short conventional-style commit messages:

```text
feat: add markdown export
fix: preserve existing managed memory block
docs: clarify policy defaults
test: cover rejected proposals
```

## Security Reports

Please do not open a public issue for vulnerabilities. Follow
[SECURITY.md](SECURITY.md) for reporting instructions.

# MemPR Phase 1 Implementation Council Pass

**Date:** 2026-05-21  
**Phase:** V0.1 Hardening  
**Status:** Implemented and verified

## Subagent Assignments

Three workers executed disjoint slices with the implementation-pipeline loop:
plan, execute, adversarial review, and console verification.

| Worker | Scope | Files |
| --- | --- | --- |
| Peirce | Record schema, ledger normalization, lifecycle guards | `src/types.ts`, `src/ledger.ts` |
| Dalton | Deterministic policy and CLI surface | `src/policy.ts`, `src/cli.ts` |
| Laplace | Verification coverage | `test/ledger.test.js` |

Each worker reported multiple console checks, including source/doc inspection,
`npm run build`, `npm test`, targeted test runs, and CLI or lifecycle smoke
checks.

## Council Review

### Contrarian

The first integration pass revealed two gaps:

- CLI preflight validation duplicated ledger lifecycle rules, weakening the PRD
  requirement that status transitions run through one state-machine function.
- Phase 1 promised risk and destination filters, but the initial implementation
  only filtered list output by status.

### First Principles

Phase 1 is not about adding MCP, adapters, audit events, or a full PR lifecycle.
The minimum useful hardening is a stable current-state JSONL record contract,
deterministic local policy, review reasons for risky transitions, and tests that
prove exports do not leak pending/rejected records.

### Expansionist

Risk and destination filters strengthen the next review UX without forcing a new
UI. Centralized lifecycle validation also prepares the later append-only event
stream because there is one transition contract to preserve.

### Outsider

The CLI needed real smoke coverage. A bug in boolean flag parsing caused
`mempr accept --json <id>` to treat the ID as the value of `--json`, leaving no
positional ID. This was invisible to the ledger-only tests.

### Executor

Fixes applied:

- moved lifecycle enforcement back to `src/ledger.ts` as the single authority
- added `list` filtering by status, risk, and destination
- fixed boolean CLI flag parsing
- added CLI regression tests
- added malformed-ledger handling that reports line number without echoing record
  contents
- updated PRD/README command references for the new list filters

## Verification

Commands run after integration:

- `npm run build`
- `node --test test/ledger.test.js`
- `node --test test/cli.test.js`
- CLI smoke script covering propose, rejected accept without reason, accept with
  reason, list filters, and export
- `npm test`
- `npm run lint`
- `git diff --check`

Final automated result: 16 tests passing.

## Deferred Risks

These remain deferred by ADR-0004/ADR-0005:

- file locking and concurrent write protection
- actor/reviewer identity
- append-only event stream
- policy versioning
- source-trust scoring
- TTL enforcement
- MCP server and destination adapters

# MemPR 1.0 Release Hardening Audit

Audit date: 2026-06-05

Source of truth: `/Users/jadanjones/Downloads/MemPR_1_0_release_hardening_spec.md`

Status: implemented for local-first `1.0.0` release packaging. The package is
ready for tag publication after the committed source archive, npm artifact, and
CI matrix are attached to the release workflow.

## Evidence

- `npm run lint` passed.
- `npm test` passed as the single contributor command. It now runs split,
  deterministic safety, core, MCP, CLI, and package batches through
  `scripts/run-node-tests.mjs`, which gives each test file a fresh process,
  explicit timeout, and process-group cleanup.
- `npm run release:check` passed after the final hardening fixes. This ran
  `npm ci`, build, lint, the full split `npm test`, and
  `npm pack --dry-run --json`.
- Local Node matrix passed via `npx node@...`: Node 20.20.2, 22.22.3, and
  24.16.0 each ran `npm test` successfully.
- `npm pack --dry-run --json` passed and contained only package files allowed
  by `package.json`.
- `git diff --check` passed.
- Static scans passed for central dynamic JSON output, child-process cleanup,
  export preview `safe_content_preview` naming, validated repo-file reads, and
  safe internal `.mempr` store access.
- Manual hardlink probes passed for `.mempr/events.jsonl`,
  `.mempr/diagnostics.jsonl`, `.mempr/ledger.jsonl`, file-source verification,
  existing export destinations, suggest transcript/memory-file reads, and
  Git-diff suggestions; linked outside files stayed unchanged and outside-only
  content was not echoed or used as verified evidence.
- Manual safety probes passed 9 isolated CLI probes:
  secret proposal memory, secret proposal destination, internal export
  destination, managed-block marker injection, secret review reason,
  secret-like root export, diagnostics with a secret-like root, suggest
  observation secret redaction, and suggest no-write behavior.

## Phase Audit

| Phase | Result | Evidence |
| --- | --- | --- |
| 0.1-0.4 no raw secret persistence/echo and no-persist blocking | Complete | `src/safety.ts`, sink scans in ledger/events, CLI/MCP output sanitizers, `test/safety-boundary.test.js` |
| 0.5 safe read context projection | Complete | `ContextMemoryRecord` projection and context tests |
| 0.6 documentation claim boundary | Complete | README, SECURITY, MCP docs, threat model, release checklist |
| 1 version/package posture | Complete | `package.json` is `1.0.0`; package smoke and release artifacts use the same version |
| 2 mandatory order | Complete | Safety boundary landed before release/package/docs gates |
| A central safety/redaction boundary | Complete | Shared `src/safety.ts`; proposal/review/event/diagnostic/export/live tests |
| B policy decision/no-persist model | Complete | `block_no_persist`, `reject_audited`, legacy `reject` normalization |
| C destination/path safety | Complete | Restricted Markdown destinations, symlink/realpath checks, CLI/MCP/live coverage |
| D Markdown export safety | Complete | JSON scalar rendering, fail-closed managed-block parser, atomic writes |
| E source verification/provenance | Complete | File quote/hash/range verification, failed evidence review gate, git commit documented as caller-supplied |
| F memory schema/migration | Complete | `schema_version: "mempr-record-v1"`, migration normalization, hash-aware migration event |
| G event ledger/write ordering | Complete | No durable `output_path`; event-first proposal/status/relationship writes; export writes destination then event |
| H accepted-memory scanning/read context | Complete | Recursive accepted-record scan and safe context projection |
| I diagnostics redaction | Complete | Recursive diagnostic sanitization and unsafe ID/destination hashing |
| J live adapter safety | Complete | Downstream IDs/errors sanitized and secret-like remote metadata blocked |
| K MCP stdio/HTTP hardening | Complete | `MEMPR_ROOT`, constant-time token comparison, body limit, config validation, safe errors/docs |
| L public SDK/package boundary | Complete | `src/index.ts`, `main`, `types`, `exports`, packed tarball import smoke |
| M CLI output safety | Complete | JSON/text output sanitizer; confirmed export reports repo-relative destination |
| N read-policy/local identity | Complete with Option B | Secret-like config/auth metadata fails closed; docs state no nonce replay/session auth in MemPR 1.0 |
| O suggestion/ingestion layer | Complete with Option A | Deterministic suggestions; no writes without `--propose --confirm`; path-safe inputs |
| P documentation/claim boundary | Complete | README, SECURITY, CHANGELOG, release checklist, PRD, ADR, threat model |
| Q tests/CI | Complete locally, CI configured | Split npm scripts; GitHub Actions matrix configured for Node 20/22/24 |
| R source archive/release process | Complete | `release:check` and `archive:source`; pack smoke excludes unwanted files |

## Follow-Up Blocker Audit

| Blocker | Result | Evidence |
| --- | --- | --- |
| CLI suggest secret leakage | Complete | `mempr suggest` now emits `safeCandidatePreview` through central output; observation/transcript/memory-file tests assert no raw secrets and no `.mempr` writes |
| Central CLI output sanitization | Complete | Single `printJsonOrText` in `src/cli-output.ts`; static scan leaves only central helper and package-smoke fixture |
| MCP resource/read bodies | Complete | `resources/read` sanitizes with `sanitizeJsonForBoundary`; resources project records/policy safely |
| Legacy/corrupt record IDs | Complete | Context records, warnings, export previews/content, diagnostics, CLI list text, and MCP resources use reportable hash labels |
| MCP admin/read trust boundary | Complete | `mempr.records.admin` and `mempr.review.read` added; list/resources default to safe summaries; HTTP resource scopes are URI-aware |
| Absolute output paths | Complete | Public export preview/diff/guard/MCP preview payloads omit `outputPath`; docs keep paths internal only |
| Deterministic npm test | Complete | MCP tests split into separate scripts with `--test-concurrency=1`; `npm test` is the CI contributor command |
| Public `blockSecretsWithoutPersistence` config | Complete | Built-in blocking remains unconditional; legacy `true` accepted but not exposed; `false` still fails |
| Source archive hygiene | Complete | Release checklist includes `git archive --format zip --output mempr-source.zip HEAD` and `npm pack`; no working-directory zip flow |
| Safe repo-file reads | Complete | `safeReadRepoFile` validates root-relative paths, lstat/stat type, symlink policy, and max bytes before `readFile`; provenance, suggest file reads, export preview/diff/guard use it |
| Safe internal store paths | Complete | `src/store-paths.ts` allowlists internal `.mempr` filenames, rejects symlinked/non-directory stores and non-regular store files, enforces read sizes, and backs ledger/events/policy/read-policy/principals/diagnostics/lock paths |
| MCP/test subprocess cleanup | Complete | Shared test helper closes stdin, waits for exit, escalates SIGTERM then SIGKILL, and destroys streams; MCP/provenance/HTTP subprocess tests use it |
| Aggregate test determinism | Complete | `scripts/run-node-tests.mjs` runs aggregate suites as per-file child processes with per-file timeouts and process-group termination; `npm test`, `test:mcp`, `test:cli`, and `release:check` pass locally |
| Sanitizer mode split | Complete | Value sanitizer redacts control characters aggressively; rendered-text sanitizer preserves normal newlines while stripping ANSI/control sequences; dynamic fields are value-sanitized before rendering |
| Raw IDs internal/reportable IDs external | Complete | Live sync now matches raw accepted records internally while context/reporting expose reportable IDs; legacy and unsafe ID tests cover both paths |
| JSON error contract | Complete | CLI `--json` failures now emit `{ ok: false, error: { code, message } }` through central output with sanitized messages |
| Hardlink filesystem boundary | Complete | Internal store files, repo-file reads, Git-diff suggestions, and existing export destinations reject `nlink !== 1` before trusted reads or writes |

## Residual Release Gate

For every `1.0.x` release artifact, commit the hardened changes, confirm
`git status --porcelain` is empty before archive generation, run the GitHub
Actions matrix on Node 20, 22, and 24 from a clean checkout, and rerun the
manual probes in the release workspace. `npm run archive:source` intentionally
refuses a dirty worktree so `git archive --format zip --output mempr-source.zip
HEAD` can only package committed hardened code.

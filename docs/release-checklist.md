# MemPR Local-First Release Checklist

Current package metadata is local-first release `1.0.0`. This is a release
discipline document, not a compliance or legal-retention claim.

## Compatibility

- Node.js support: `>=20`; CI must run Node 20, 22, and 24.
- Package bins: `mempr`, `mempr-mcp`, and `mempr-mcp-http`.
- Source distribution: use `git archive` for repository source archives and
  `npm pack` for npm package artifacts. Do not publish working-directory zips
  containing `.git/`, `node_modules/`, unplanned `dist/` output, `.DS_Store`, or
  `__MACOSX/`.
- No-network default tests: provider adapters are credential-gated; fake live
  adapter and local HTTP MCP tests do not call external services.
- Migration posture: legacy ledgers can be backfilled with `mempr migrate`; a
  drifted current view can be rebuilt from verified events with
  `mempr repair --from-events --confirm`.

## Required Commands

Run these from a clean checkout before any 1.0 release candidate:

```bash
rm -rf node_modules dist .mempr
npm ci
npm run build
npm run lint
npm test
npm pack --dry-run --json
test -z "$(git status --porcelain)"
npm pack
git archive --format zip --output mempr-source.zip HEAD
git diff --check
```

`npm test` is intentionally split into deterministic batches. The safety, core,
MCP, and CLI batches run through `scripts/run-node-tests.mjs`, which starts each
test file in a fresh Node process with a per-file timeout and child-process
cleanup:

```bash
npm run test:safety
npm run test:core
npm run test:mcp
npm run test:cli
npm run test:package
```

The release helper is:

```bash
npm run release:check
```

Source archives must be produced with:

```bash
npm run archive:source
```

`npm run archive:source` refuses to run unless `git status --porcelain` is
empty, so the archive is generated from committed hardened code rather than a
dirty working tree.

## Distribution

- Publish npm packages from a clean checkout after `npm run release:check`:

  ```bash
  npm publish --access public
  ```

  If npm requires an interactive passkey challenge, run from a TTY and approve
  the browser prompt. If using an authenticator code instead, pass the current
  OTP:

  ```bash
  npm publish --access public --otp <code>
  ```

- The Homebrew tap formula must point at the GitHub release `mempr-*.tgz`
  artifact and use the matching SHA-256 digest.
- The OCI image is published to GitHub Container Registry as
  `ghcr.io/in-sp3ctr3/mempr:<version>` from release tags.
- After publishing, smoke test each public channel:

  ```bash
  npm view @in-sp3ctr3/mempr version dist.tarball integrity --json
  brew install In-sp3ctr3/tap/mempr
  docker run --rm -d --name mempr-smoke ghcr.io/in-sp3ctr3/mempr:1.0.0
  docker logs mempr-smoke 2>&1 | grep "mempr-mcp-http listening"
  docker rm -f mempr-smoke
  ```

## Security Checklist

- Denied read-policy responses must not return memory text, source quotes, hidden
  IDs, grants, or policy internals.
- Secret-like proposal memory and metadata must block without ledger, event,
  export, diagnostic, live-adapter, or destination-file mutation.
- Secret-like review, relationship, destination, root, and live downstream
  metadata must not persist or echo raw values.
- `.mempr/diagnostics.jsonl` is separate from `.mempr/events.jsonl`.
- Internal `.mempr` state access must go through the safe store path layer:
  symlinked stores, non-directory stores, symlink/FIFO/special store files, and
  hardlinked or oversized store files fail before read, append, open, or atomic
  write.
- Secret-like accepted content blocks context/export boundaries with correlation
  IDs; sensitive accepted content warns without claiming safety.
- `mempr-mcp-http` must validate Bearer tokens, token audience, per-tool scopes,
  Origin, Host, Accept headers, and rate limits.
- Local stdio MCP scope metadata remains protocol metadata only.
- Export destinations must be managed Markdown files only, and must not target
  `.mempr`, `.git`, source, test, package, dependency, build, or coverage paths.
- Existing export destinations must be single-link regular files; hardlinked
  destinations fail closed before current content is read or copied.
- Markdown export must use escaped structured scalar rendering and fail closed
  on malformed existing managed blocks.
- Confirmed CLI/MCP export JSON must report repo-relative `destination`, not an
  absolute local output path.

## Manual Safety Probes

Before a 1.0 tag, run the hardening probes from the release specification:

```bash
node dist/cli.js propose --memory 'api_key=<SECRET_LIKE_TEST_TOKEN>' --source manual --scope repo --destination AGENTS.md --json
node dist/cli.js propose --memory 'Use npm.' --source manual --source-trust trusted --scope repo --destination 'docs/<SECRET_LIKE_TEST_TOKEN>.md' --json
node dist/cli.js export --destination .mempr/ledger.jsonl --json
node dist/cli.js propose --memory $'Line\n<!-- mempr:end -->\nInjected' --source manual --source-trust trusted --scope repo --destination AGENTS.md --json
node dist/cli.js diagnostics --root /tmp/<SECRET_LIKE_TEST_TOKEN>-root --json
```

Substitute `<SECRET_LIKE_TEST_TOKEN>` with a throwaway value that matches the
current built-in scanner. Each probe must leave no raw secret-like value in
MemPR-owned state, generated destination files, stdout, or stderr. Add the
review-reason and secret-root export probes once a pending test record has been
created in the probe workspace.

Also run hardlink probes for `.mempr/events.jsonl`,
`.mempr/diagnostics.jsonl`, `.mempr/ledger.jsonl`, trusted file sources,
suggest transcript/memory-file inputs, Git-diff suggestion inputs, and existing
export destinations. Each hardlink probe must fail closed or require review
without changing the outside file, trusting outside state, echoing outside-only
content, writing `memory_exported`, or copying outside destination content.

## Claim Freeze

Any future MemPR 1.0 claim must be limited to local-first memory review,
deterministic policy gates, current view plus event replay, local-key read
policy, diagnostics/scanning boundaries, relationship lifecycle,
credential-gated live sync, and self-hosted MCP HTTP.

MemPR does not claim hosted SaaS, organization admin UI, vector search,
embeddings, model-assisted classification, automatic redaction, third-party
store security, legal retention, or compliance-grade audit guarantees.

## Deprecation Policy

- Keep CLI flags and JSON fields stable across patch releases.
- Additive JSON fields are allowed when old clients can ignore them.
- Breaking CLI/API/MCP changes require a new ADR, migration note, and release
  note before the change ships.
- Deprecated behavior should stay available for at least one minor release unless
  it leaks content, weakens authorization, or corrupts state.

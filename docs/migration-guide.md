# MemPR 1.0 Migration Guide

MemPR 1.0 keeps the local `.mempr/ledger.jsonl` current view and
`.mempr/events.jsonl` event history. Existing stores can remain in place.

## From Older Local Stores

1. Run `npm run build`.
2. Run `node dist/cli.js check --json` to inspect current/event parity.
3. If events are missing for an older ledger, run
   `node dist/cli.js migrate --dry-run --json`, then `node dist/cli.js migrate --json`.
4. If the current ledger drifts from verified events, run
   `node dist/cli.js repair --from-events --json`, then add `--confirm` after
   reviewing the reported record counts and IDs.

## New Optional Files

- `.mempr/principals.json`: local Ed25519 read principals.
- `.mempr/read-policy.json`: deterministic allow/deny read policy.
- `.mempr/diagnostics.jsonl`: explicit admin diagnostics stream.
- Adapter sync state remains under `.mempr/` and is reconstructed from sync
  events where possible.

## Compatibility Notes

- Missing read policy keeps existing read behavior unchanged.
- When read policy exists, signed local-key read access is required for gated
  read surfaces.
- `source_trust: "untrusted"` now prevents automatic acceptance; `trusted` does
  not bypass deny, secret, sensitive, relationship, TTL, or policy blockers.
- `retired` is a valid status and never deletes or rewrites historical records.

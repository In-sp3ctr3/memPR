# Threat Model

MemPR protects the write path for durable AI memory. It does not claim to be a
complete compliance system, hosted organization policy engine, legal retention
manager, or full OAuth authorization server.

## Scenarios

| Scenario | Mitigation | Residual Risk |
| --- | --- | --- |
| Secret accidentally proposed as memory. | Proposal policy scans memory text, source URI, quotes, destinations, tags, retention labels, applies-to paths, relationship metadata, review reasons, reviewer labels, and other persisted user-controlled fields before writes. Secret-like proposals are blocked without raw ledger persistence, and blocked events store hashes and redacted previews. Accepted records are recursively scanned before context/export/live-sync boundaries. | Pattern-based scanning can miss novel secret formats. Users still need secret management and rotation procedures. |
| Malicious agent injects `<!-- mempr:end -->` into exported Markdown. | Managed block markers are rejected by policy/scanner and rendered fields are Markdown-encoded so record content cannot terminate a managed block. | Reviewers must still watch unmanaged file content outside MemPR blocks. |
| Agent marks an untrusted source as trusted. | Safer defaults keep unknown/untrusted memories in review, source trust is explicit in record/export/history output, and source verification metadata can be attached with file quotes, line ranges, or hashes. Failed source verification cannot auto-accept. | MemPR cannot prove a caller is honest about trust labels without external identity and process controls. `gitCommit` is caller-supplied metadata unless a future verifier checks content at that commit. |
| Existing destination has malformed managed block markers. | Export replacement only accepts unambiguous managed marker pairs and refuses unsafe marker shapes. | Humans may need to repair destination files manually before export can resume. |
| MCP HTTP exposed beyond localhost. | HTTP transport requires static bearer-token checks, audience checks, host/origin validation, scope enforcement, request body limits, and rate limiting. Docs state it is self-hosted and not a full OAuth authorization server. | Operators remain responsible for network exposure, TLS, token issuance, rotation, and reverse proxy configuration. |
| Old ledger contains invalid destination records. | Context/export/status paths scan accepted records and block unsafe destinations with non-leaky diagnostics. Proposal-time validation allows only managed Markdown destinations outside reserved/internal paths before ledger writes. | Legacy data may need migration or manual cleanup before exports pass. |
| Accepted record becomes stale or expired. | TTL expiry blocks export/read context for expired accepted records and status surfaces warnings for records approaching expiry. | MemPR cannot determine business freshness unless TTLs and review practices are maintained. |

Architectural threat model changes should be captured in ADRs and reflected in
[the PRD security requirements](prd.md#15-security-and-trust-requirements).

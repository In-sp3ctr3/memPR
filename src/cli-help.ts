export function printHelp(): void {
  console.log(`mempr

Usage:
  mempr propose --memory <text> [--source <uri>] [--source-trust trusted|unknown|untrusted] [--verify-source] [--source-line-start <n> --source-line-end <n>] [--source-hash <sha256>] [--git-commit <sha>] [--kind <kind>] [--tags <csv>] [--confidence <0..1>] [--retention-class <label>] [--priority <1..5>] [--applies-to-paths <csv>] [--scope repo|project|user] [--risk low|medium|high] [--ttl <value>] [--supersedes <ids>] [--conflicts-with <ids>] [--destination <path>]
  mempr list [--status pending|accepted|rejected|retired] [--risk low|medium|high] [--destination <path>]
  mempr inbox [--risk low|medium|high] [--destination <path>] [--json]
  mempr diff <id> [--json]
  mempr review <id> --accept|--reject --reason <text> [--reviewer <id>] [--retire-superseded] [--override-relationships] [--json]
  mempr history <id> [--json]
  mempr blame <id> [--json]
  mempr accept <id> [--reason <text>] [--reviewer <id>] [--retire-superseded] [--override-relationships]
  mempr reject <id> [--reason <text>]
  mempr retire <id> --reason <text>
  mempr relationships [id] [--json]
  mempr suggest --from-transcript <path>|--from-git-diff [range]|--from-memory-file <path>|--observation <text> [--destination <path>] [--scope <scope>] [--source-trust trusted|unknown|untrusted] [--limit <n>] [--propose --confirm] [--json]
  mempr export [--destination <path>] [--dry-run] [--json]
  mempr diff-export --destination <path> [--json]
  mempr guard --destination <path> [--json]
  mempr sync-live --adapter fake|mem0|langgraph|llm-wiki|custom [--destination <path>] --dry-run|--confirm [--max-retries <n>] [--json]
  mempr context [--destination <path>] [--scope <scope[,scope]>] [--actor <label> --allowed-scopes <scope[,scope]>] [--read-valid-until <ttl>] [--read-exclude-conflicts] [--read-exclude-supersedes] [--json]
  mempr context-status [--destination <path>] [--json]
  mempr check [--json]
  mempr diagnostics [--dry-run] [--json]
  mempr migrate [--dry-run] [--json]

Options:
  --root <path>          Run against another workspace.
  --dry-run              Preview export or migration/backfill without writing events.
                         With diagnostics, preview the redacted support bundle without appending diagnostics.
  --json                 Print JSON output.
  --reason <text>        Reviewer rationale; required for risky changes and status reversals.
  --retire-superseded    Accept a proposal and retire accepted same-destination records it supersedes.
  --override-relationships Accept with explicit unresolved relationship evidence.
  --confirm              Confirm live adapter sync writes/network attempts.
  --adapter <id>         Live adapter id; defaults to fake.
  --max-retries <n>      Retry count for confirmed live adapter operations; default 2.
  --risk <level>         Explicit proposal risk: low, medium, or high.
  --kind <kind>          Proposal kind: fact, preference, instruction, procedure, decision, warning, constraint.
  --tags <csv>           Proposal tags; normalized to lowercase unique values.
  --confidence <0..1>    Proposal confidence score.
  --retention-class <v>  Optional retention label.
  --priority <1..5>      Optional integer priority.
  --applies-to-paths <csv> Repo-relative paths the memory applies to.
  --reviewer <id>        Caller-asserted reviewer label stored on accepted records.
  --scope <value>        Proposal scope or context scope filter; context accepts comma-separated scopes.
  --actor <label>        Optional read-context actor label used with --allowed-scopes.
  --read-actor <label>   Alias for --actor.
  --allowed-scopes <csv> Optional read-context allowed scopes used with --actor.
  --read-valid-until <v> Optional read-context expiry threshold used with --actor and --allowed-scopes.
  --read-exclude-conflicts Optional read-context filter for records declaring conflicts.
  --read-exclude-supersedes Optional read-context filter for records declaring supersessions.
  --read-principal <id> Local-key principal id used when .mempr/read-policy.json exists.
  --read-signature <v> Signature over the deterministic MemPR read request payload.
  --read-signed-at <v> Optional signed request timestamp included in the signed payload.
  --read-nonce <v>     Optional signed request nonce included in the signed payload.
  --source-trust <level> Source trust metadata: trusted, unknown, or untrusted.
  --verify-source        Require source verification evidence during proposal classification.
  --source-line-start <n> 1-based source line range start; must be paired with --source-line-end.
  --source-line-end <n>  1-based source line range end; must be paired with --source-line-start.
  --source-hash <sha256> Expected SHA-256 hex hash for the full source content.
  --git-commit <sha>     Optional source git commit label.
  --ttl <value>          Store a canonical expiry; expired accepted records block export.
  --supersedes <ids>     Comma-separated memory ids this proposal supersedes.
  --conflicts-with <ids> Comma-separated memory ids this proposal conflicts with.
  --destination <path>   Destination path for proposal/export filtering; defaults to MEMORY.md.
`);
}

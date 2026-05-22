import type { MemoryRecord, MemoryStatus } from "./types.js";

export type RelationshipField = "supersedes" | "conflicts_with";

export interface RelationshipReferenceSet {
  supersedes: string[];
  conflicts_with: string[];
}

export interface RelationshipMissingReference {
  recordId: string;
  relationship: RelationshipField;
  missingRecordId: string;
}

export interface RelationshipCycle {
  relationship: "supersedes";
  recordIds: string[];
  statuses: MemoryStatus[];
  destinations: string[];
}

export interface RelationshipGraphAnalysis {
  recordIds: string[];
  incoming: Record<string, RelationshipReferenceSet>;
  outgoing: Record<string, RelationshipReferenceSet>;
  missingReferences: RelationshipMissingReference[];
  cycles: RelationshipCycle[];
}

export function analyzeRelationships(
  records: readonly MemoryRecord[]
): RelationshipGraphAnalysis {
  const byId = new Map(records.map((record) => [record.id, record]));
  const incoming: Record<string, RelationshipReferenceSet> = {};
  const outgoing: Record<string, RelationshipReferenceSet> = {};
  const missingReferences: RelationshipMissingReference[] = [];

  for (const record of records) {
    incoming[record.id] = emptyReferenceSet();
    outgoing[record.id] = {
      supersedes: [...record.supersedes],
      conflicts_with: [...record.conflicts_with]
    };
  }

  for (const record of records) {
    for (const linkedRecordId of record.supersedes) {
      if (byId.has(linkedRecordId)) {
        incoming[linkedRecordId].supersedes.push(record.id);
      } else {
        missingReferences.push({
          recordId: record.id,
          relationship: "supersedes",
          missingRecordId: linkedRecordId
        });
      }
    }

    for (const linkedRecordId of record.conflicts_with) {
      if (byId.has(linkedRecordId)) {
        incoming[linkedRecordId].conflicts_with.push(record.id);
      } else {
        missingReferences.push({
          recordId: record.id,
          relationship: "conflicts_with",
          missingRecordId: linkedRecordId
        });
      }
    }
  }

  return {
    recordIds: records.map((record) => record.id),
    incoming,
    outgoing,
    missingReferences,
    cycles: detectSupersessionCycles(records, byId)
  };
}

export function filterRelationshipAnalysis(
  analysis: RelationshipGraphAnalysis,
  ids: readonly string[]
): RelationshipGraphAnalysis {
  const selected = new Set(ids);
  const incoming: Record<string, RelationshipReferenceSet> = {};
  const outgoing: Record<string, RelationshipReferenceSet> = {};

  for (const id of ids) {
    incoming[id] = cloneReferenceSet(analysis.incoming[id] ?? emptyReferenceSet());
    outgoing[id] = cloneReferenceSet(analysis.outgoing[id] ?? emptyReferenceSet());
  }

  return {
    recordIds: [...ids],
    incoming,
    outgoing,
    missingReferences: analysis.missingReferences.filter((reference) => {
      return selected.has(reference.recordId) || selected.has(reference.missingRecordId);
    }),
    cycles: analysis.cycles.filter((cycle) => {
      return cycle.recordIds.some((id) => selected.has(id));
    })
  };
}

function detectSupersessionCycles(
  records: readonly MemoryRecord[],
  byId: ReadonlyMap<string, MemoryRecord>
): RelationshipCycle[] {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const cycleKeys = new Set<string>();
  const cycles: RelationshipCycle[] = [];

  function visit(id: string): void {
    if (visited.has(id)) {
      return;
    }

    if (visiting.has(id)) {
      const start = stack.indexOf(id);

      if (start >= 0) {
        pushCycle(stack.slice(start));
      }

      return;
    }

    const record = byId.get(id);

    if (!record) {
      return;
    }

    visiting.add(id);
    stack.push(id);

    for (const linkedRecordId of record.supersedes) {
      if (byId.has(linkedRecordId)) {
        visit(linkedRecordId);
      }
    }

    stack.pop();
    visiting.delete(id);
    visited.add(id);
  }

  function pushCycle(recordIds: string[]): void {
    const key = canonicalCycleKey(recordIds);

    if (cycleKeys.has(key)) {
      return;
    }

    cycleKeys.add(key);
    cycles.push({
      relationship: "supersedes",
      recordIds,
      statuses: recordIds.map((id) => byId.get(id)!.status),
      destinations: recordIds.map((id) => byId.get(id)!.destination)
    });
  }

  for (const record of records) {
    visit(record.id);
  }

  return cycles;
}

function canonicalCycleKey(recordIds: readonly string[]): string {
  if (recordIds.length === 0) {
    return "";
  }

  const rotations = recordIds.map((_, index) => {
    return [
      ...recordIds.slice(index),
      ...recordIds.slice(0, index)
    ].join(">");
  });

  return rotations.sort()[0];
}

function emptyReferenceSet(): RelationshipReferenceSet {
  return {
    supersedes: [],
    conflicts_with: []
  };
}

function cloneReferenceSet(value: RelationshipReferenceSet): RelationshipReferenceSet {
  return {
    supersedes: [...value.supersedes],
    conflicts_with: [...value.conflicts_with]
  };
}

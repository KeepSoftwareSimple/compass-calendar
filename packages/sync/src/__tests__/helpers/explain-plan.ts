import { type Document } from "mongodb";

export interface ExplainWalk {
  nReturned: number;
  totalDocsExamined: number;
  totalKeysExamined: number;
  indexNames: string[];
  stages: string[];
}

function visit(node: unknown, indexNames: string[], stages: string[]): void {
  if (!node || typeof node !== "object") return;
  const rec = node as Record<string, unknown>;
  if (typeof rec["stage"] === "string") stages.push(rec["stage"]);
  if (typeof rec["indexName"] === "string") indexNames.push(rec["indexName"]);
  visit(rec["inputStage"], indexNames, stages);
  if (Array.isArray(rec["inputStages"])) {
    for (const child of rec["inputStages"]) visit(child, indexNames, stages);
  }
  visit(rec["winningPlan"], indexNames, stages);
  visit(rec["queryPlanner"], indexNames, stages);
  visit(rec["executionStats"], indexNames, stages);
  visit(rec["executionStages"], indexNames, stages);
  if (Array.isArray(rec["shards"])) {
    for (const shard of rec["shards"]) visit(shard, indexNames, stages);
  }
}

export function walkExplain(plan: Document): ExplainWalk {
  const indexNames: string[] = [];
  const stages: string[] = [];
  visit(plan, indexNames, stages);
  const stats = plan["executionStats"] as
    | {
        nReturned?: number;
        totalDocsExamined?: number;
        totalKeysExamined?: number;
      }
    | undefined;
  return {
    nReturned: stats?.nReturned ?? -1,
    totalDocsExamined: stats?.totalDocsExamined ?? -1,
    totalKeysExamined: stats?.totalKeysExamined ?? -1,
    indexNames: [...new Set(indexNames)],
    stages,
  };
}

import type { GraphEdge, GraphNode } from "../types";

const GROUPS: GraphNode["group"][] = ["method", "dataset", "metric", "author", "concept"];

function asGroup(g: unknown): GraphNode["group"] {
  return typeof g === "string" && (GROUPS as string[]).includes(g) ? (g as GraphNode["group"]) : "concept";
}

/** Normalize backend JSON (camelCase / snake_case) into GraphNode. */
export function normalizeGraphNode(raw: unknown): GraphNode {
  if (typeof raw !== "object" || raw === null) {
    return { id: "unknown", label: "?", group: "concept" };
  }
  const o = raw as Record<string, unknown>;
  const keyPointsRaw = o.keyPoints ?? o.key_points;
  const keyPoints = Array.isArray(keyPointsRaw)
    ? keyPointsRaw.map((x) => String(x).trim()).filter(Boolean)
    : undefined;
  const summary =
    typeof o.summary === "string"
      ? o.summary
      : typeof o.detail === "string"
        ? o.detail
        : undefined;
  const sessions = Array.isArray(o.sessions) ? o.sessions.map((s) => String(s)) : undefined;

  return {
    id: String(o.id ?? "").trim() || "unknown",
    label: String(o.label ?? "").trim() || "?",
    group: asGroup(o.group),
    sessions,
    summary: summary?.trim() || undefined,
    keyPoints: keyPoints && keyPoints.length > 0 ? keyPoints : undefined,
  };
}

export function normalizeGraphEdge(raw: unknown): GraphEdge {
  if (typeof raw !== "object" || raw === null) {
    return { source: "", target: "", relation: "" };
  }
  const o = raw as Record<string, unknown>;
  return {
    source: String(o.source ?? ""),
    target: String(o.target ?? ""),
    relation: String(o.relation ?? o.label ?? ""),
  };
}

import { useEffect, useMemo, useState } from "react";
import ReactFlow, { Background, Controls, MarkerType, MiniMap, type Edge, type Node } from "reactflow";
import "reactflow/dist/style.css";

import { useT } from "../lib/i18n";
import { getKnowledgeGraph } from "../lib/tauri";
import { useUiStore } from "../store/uiStore";
import type { GraphEdge, GraphNode } from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";

const groupColorMap: Record<string, string> = {
  method: "#2563EB",
  dataset: "#059669",
  metric: "#D97706",
  author: "#7C3AED",
  concept: "#E11D48",
};

function nodeColor(group: string): string {
  return groupColorMap[group] ?? "#71717A";
}

export function GraphViewer(): JSX.Element {
  const t = useT();
  const graphRefreshNonce = useUiStore((s) => s.graphRefreshNonce);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const graph = await getKnowledgeGraph();
        if (!cancelled) {
          setNodes(graph.nodes ?? []);
          setEdges(graph.edges ?? []);
        }
      } catch (error) {
        console.error("Failed to load knowledge graph:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [graphRefreshNonce]);

  const flowNodes = useMemo<Node[]>(() => {
    const cols = Math.max(3, Math.ceil(Math.sqrt(nodes.length)));
    return nodes.map((node, index) => ({
      id: node.id,
      data: {
        label: (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{node.label}</div>
            <div
              style={{
                fontSize: 10,
                color: nodeColor(node.group),
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginTop: 2,
              }}
            >
              {node.group}
            </div>
          </div>
        ),
      },
      position: {
        x: 80 + (index % cols) * 260,
        y: 60 + Math.floor(index / cols) * 140,
      },
      style: {
        borderRadius: 12,
        border: `1.5px solid ${nodeColor(node.group)}`,
        background: "#FFFFFF",
        padding: "8px 12px",
        minWidth: 180,
        fontSize: 13,
        color: "#27272A",
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
      },
    }));
  }, [nodes]);

  const flowEdges = useMemo<Edge[]>(
    () =>
      edges.map((edge, index) => ({
        id: `${edge.source}-${edge.target}-${index}`,
        source: edge.source,
        target: edge.target,
        label: edge.relation,
        labelStyle: { fill: "#52525B", fontSize: 10 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#71717A" },
        style: { stroke: "#A1A1AA", strokeWidth: 1.2 },
      })),
    [edges],
  );

  const groupCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const n of nodes) {
      counts[n.group] = (counts[n.group] ?? 0) + 1;
    }
    return counts;
  }, [nodes]);

  return (
    <Card className="h-full">
      <CardHeader className="border-b border-zinc-200/80 pb-4 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{t("graph.title")}</CardTitle>
          <div className="flex items-center gap-2">
            {Object.entries(groupCounts).map(([group, count]) => (
              <Badge
                key={group}
                variant="secondary"
                className="text-xs"
                style={{ borderColor: nodeColor(group), color: nodeColor(group) }}
              >
                {group} ({count})
              </Badge>
            ))}
            <Badge variant="secondary" className="text-xs">
              {edges.length} {t("graph.edges")}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="h-[680px] p-0">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-zinc-400">
            {t("graph.loading")}
          </div>
        ) : nodes.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-zinc-400">
            <p>{t("graph.empty")}</p>
            <p className="text-xs">{t("graph.emptyHint")}</p>
          </div>
        ) : (
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            fitView
            panOnDrag
            zoomOnScroll
            attributionPosition="top-right"
          >
            <MiniMap
              pannable
              zoomable
              nodeStrokeWidth={2}
              nodeColor={(node) => {
                const graphNode = nodes.find((item) => item.id === node.id);
                return graphNode ? nodeColor(graphNode.group) : "#A1A1AA";
              }}
            />
            <Controls />
            <Background gap={18} color="#E4E4E7" />
          </ReactFlow>
        )}
      </CardContent>
    </Card>
  );
}

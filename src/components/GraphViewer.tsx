import { useMemo } from "react";
import ReactFlow, { Background, Controls, MarkerType, MiniMap, type Edge, type Node } from "reactflow";
import "reactflow/dist/style.css";

import type { GraphEdge, GraphNode } from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

interface GraphViewerProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const groupColorMap: Record<GraphNode["group"], string> = {
  method: "#2563EB",
  dataset: "#059669",
  metric: "#D97706",
  author: "#7C3AED",
};

export function GraphViewer({ nodes, edges }: GraphViewerProps): JSX.Element {
  const flowNodes = useMemo<Node[]>(
    () =>
      nodes.map((node, index) => ({
        id: node.id,
        data: { label: node.label },
        position: {
          x: 110 + (index % 2) * 320,
          y: 80 + Math.floor(index / 2) * 160,
        },
        style: {
          borderRadius: 12,
          border: `1px solid ${groupColorMap[node.group]}`,
          background: "#FFFFFF",
          padding: "6px 8px",
          minWidth: 220,
          fontSize: 13,
          fontWeight: 500,
          color: "#27272A",
          boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
        },
      })),
    [nodes],
  );

  const flowEdges = useMemo<Edge[]>(
    () =>
      edges.map((edge, index) => ({
        id: `${edge.source}-${edge.target}-${index}`,
        source: edge.source,
        target: edge.target,
        label: edge.relation,
        labelStyle: { fill: "#52525B", fontSize: 11 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#71717A" },
        style: { stroke: "#A1A1AA", strokeWidth: 1.2 },
      })),
    [edges],
  );

  return (
    <Card className="h-full">
      <CardHeader className="border-b border-zinc-200/80 pb-4 dark:border-zinc-800">
        <CardTitle className="text-lg">Knowledge Graph</CardTitle>
      </CardHeader>
      <CardContent className="h-[680px] p-0">
        <ReactFlow nodes={flowNodes} edges={flowEdges} fitView panOnDrag zoomOnScroll attributionPosition="top-right">
          <MiniMap
            pannable
            zoomable
            nodeStrokeWidth={2}
            nodeColor={(node) => {
              const graphNode = nodes.find((item) => item.id === node.id);
              return graphNode ? groupColorMap[graphNode.group] : "#A1A1AA";
            }}
          />
          <Controls />
          <Background gap={18} color="#E4E4E7" />
        </ReactFlow>
      </CardContent>
    </Card>
  );
}

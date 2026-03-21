import { useEffect, useMemo, useState } from "react";
import ReactFlow, { Background, Controls, MarkerType, MiniMap, type Edge, type Node } from "reactflow";
import "reactflow/dist/style.css";

import { useT } from "../lib/i18n";
import { getKnowledgeGraph } from "../lib/tauri";
import { useUiStore } from "../store/uiStore";
import type { GlobalMindMapFile, GraphEdge, GraphNode, MindMapCategory, MindMapEntry } from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

type Translate = ReturnType<typeof useT>;

const groupColorMap: Record<string, string> = {
  method: "#2563EB",
  dataset: "#059669",
  metric: "#D97706",
  author: "#7C3AED",
  concept: "#E11D48",
  context: "#64748B",
  theme: "#0D9488",
};

function nodeColor(group: string): string {
  return groupColorMap[group] ?? "#71717A";
}

function groupLabel(t: Translate, group: string): string {
  const key = `graph.group.${group}` as Parameters<Translate>[0];
  const translated = t(key);
  return translated === key ? group : translated;
}

type ViewMode = "mindmap" | "network";

function MindMapTreeView(props: {
  tree: {
    sessionId: string;
    topic: string;
    keywords?: string[];
    categories: MindMapCategory[];
  };
  t: Translate;
}): JSX.Element {
  const { tree, t } = props;
  const topic = tree.topic?.trim() || t("graph.topicFallback");
  const kws = (tree.keywords ?? []).map((k) => k.trim()).filter(Boolean);

  return (
    <div className="flex min-h-[560px] flex-col gap-6 p-4">
      <div className="flex justify-center">
        <div
          className="max-w-3xl rounded-2xl border-2 border-violet-500/40 bg-violet-50 px-6 py-5 text-center shadow-sm dark:border-violet-400/30 dark:bg-violet-950/40 sm:px-10"
          style={{ boxShadow: "0 4px 24px rgba(124, 58, 237, 0.12)" }}
        >
          <div className="text-xs font-medium uppercase tracking-wider text-violet-600/80 dark:text-violet-300/90">
            {t("graph.mindMapDomain")}
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">{t("graph.mindMapSubtitle")}</p>
          <h2 className="mt-3 text-xl font-semibold leading-snug text-zinc-900 dark:text-zinc-100">{topic}</h2>
          {kws.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{t("graph.themeKeywords")}</span>
              {kws.map((kw) => (
                <span
                  key={kw}
                  className="rounded-full border border-violet-300/80 bg-white/90 px-2.5 py-0.5 text-xs font-medium text-violet-800 dark:border-violet-500/50 dark:bg-violet-900/50 dark:text-violet-200"
                >
                  {kw}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tree.categories.map((cat) => (
          <MindMapCategoryColumn key={cat.id} category={cat} t={t} />
        ))}
      </div>
    </div>
  );
}

function MindMapCategoryColumn(props: {
  category: MindMapCategory;
  t: Translate;
}): JSX.Element {
  const { category, t } = props;
  const color = nodeColor(category.group);

  return (
    <div
      className="flex min-h-[220px] flex-col rounded-xl border bg-white/90 dark:bg-zinc-900/80"
      style={{ borderColor: `${color}55` }}
    >
      <div
        className="rounded-t-xl px-3 py-2 text-sm font-semibold text-white"
        style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
      >
        {category.label || groupLabel(t, category.group)}
      </div>
      <ul className="flex flex-1 flex-col gap-2 p-3 text-sm">
        {category.entries?.length ? (
          category.entries.map((entry) => <MindMapEntryBlock key={entry.id} entry={entry} accent={color} />)
        ) : (
          <li className="text-xs text-zinc-400">—</li>
        )}
      </ul>
    </div>
  );
}

function MindMapEntryBlock(props: { entry: MindMapEntry; accent: string }): JSX.Element {
  const { entry, accent } = props;
  return (
    <li className="rounded-lg border border-zinc-200/90 bg-zinc-50/80 px-2.5 py-2 dark:border-zinc-700 dark:bg-zinc-800/60">
      <div className="font-medium text-zinc-800 dark:text-zinc-100">{entry.label}</div>
      {entry.children && entry.children.length > 0 && (
        <ul className="mt-2 space-y-1 border-l-2 pl-2 text-xs text-zinc-600 dark:text-zinc-400" style={{ borderColor: accent }}>
          {entry.children.map((ch) => (
            <li key={ch.id} className="leading-relaxed">
              {ch.label}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function GraphViewer(): JSX.Element {
  const t = useT();
  const graphRefreshNonce = useUiStore((s) => s.graphRefreshNonce);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [mindMap, setMindMap] = useState<GlobalMindMapFile | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("mindmap");
  const [treeIndex, setTreeIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const graph = await getKnowledgeGraph();
        if (!cancelled) {
          setNodes(graph.nodes ?? []);
          setEdges(graph.edges ?? []);
          setMindMap(graph.mindMap ?? null);
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

  const trees = mindMap?.trees ?? [];
  const hasMindMap = trees.length > 0;
  const hasNetwork = nodes.length > 0;

  useEffect(() => {
    if (treeIndex >= trees.length) setTreeIndex(0);
  }, [trees.length, treeIndex]);

  const selectedTree = trees[treeIndex];

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

  const showMindMapPanel = hasMindMap && (viewMode === "mindmap" || !hasNetwork);
  const showNetworkPanel = hasNetwork && (viewMode === "network" || !hasMindMap);

  const headerBadges =
    viewMode === "network" || !hasMindMap ? (
      <>
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
      </>
    ) : (
      <Badge variant="secondary" className="text-xs">
        {trees.length} {t("graph.selectSession")}
      </Badge>
    );

  return (
    <Card className="h-full">
      <CardHeader className="border-b border-zinc-200/80 pb-4 dark:border-zinc-800">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-lg">{t("graph.title")}</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {hasMindMap && hasNetwork && (
              <div className="mr-1 flex gap-1 rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 dark:border-zinc-700 dark:bg-zinc-900">
                <Button
                  type="button"
                  variant={viewMode === "mindmap" ? "default" : "ghost"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setViewMode("mindmap")}
                >
                  {t("graph.mindMap")}
                </Button>
                <Button
                  type="button"
                  variant={viewMode === "network" ? "default" : "ghost"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setViewMode("network")}
                >
                  {t("graph.network")}
                </Button>
              </div>
            )}
            {hasMindMap && trees.length > 1 && showMindMapPanel && (
              <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                <span>{t("graph.selectSession")}</span>
                <select
                  className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                  value={treeIndex}
                  onChange={(e) => setTreeIndex(Number(e.target.value))}
                >
                  {trees.map((tr, i) => (
                    <option key={tr.sessionId} value={i}>
                      {(tr.topic || tr.sessionId).slice(0, 48)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {headerBadges}
          </div>
        </div>
      </CardHeader>
      <CardContent className="h-[680px] overflow-auto p-0">
        {loading ? (
          <div className="flex h-full min-h-[400px] items-center justify-center text-sm text-zinc-400">
            {t("graph.loading")}
          </div>
        ) : !hasMindMap && !hasNetwork ? (
          <div className="flex h-full min-h-[400px] flex-col items-center justify-center gap-2 text-sm text-zinc-400">
            <p>{t("graph.empty")}</p>
            <p className="text-xs">{t("graph.emptyHint")}</p>
          </div>
        ) : showMindMapPanel && selectedTree ? (
          <MindMapTreeView tree={selectedTree} t={t} />
        ) : showNetworkPanel ? (
          <div className="h-[680px]">
            <ReactFlow
              key={`reactflow-${graphRefreshNonce}`}
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
          </div>
        ) : (
          <div className="flex h-full min-h-[400px] items-center justify-center text-sm text-zinc-400">
            {t("graph.empty")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

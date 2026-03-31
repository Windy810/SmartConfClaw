import { useCallback, useEffect, useMemo, useState } from "react";
import "reactflow/dist/style.css";
import ReactFlow, {
	Background,
	Controls,
	type Edge,
	MarkerType,
	MiniMap,
	type Node,
	ReactFlowProvider,
	useReactFlow,
} from "reactflow";
import { layoutKnowledgeGraph } from "../lib/dagreLayout";
import type { TranslateFn } from "../lib/i18n";
import type { GraphEdge, GraphNode } from "../types";
import { KnowledgeGraphNode } from "./KnowledgeGraphNode";
import { Button } from "./ui/button";

const nodeTypes = { knowledge: KnowledgeGraphNode };

function nodeAccent(group: string): string {
	const map: Record<string, string> = {
		method: "#2563EB",
		dataset: "#059669",
		metric: "#D97706",
		author: "#7C3AED",
		concept: "#E11D48",
	};
	return map[group] ?? "#71717A";
}

function FitViewOnLayoutChange(props: {
	layoutSig: string;
	refreshKey: number;
}): null {
	const { layoutSig, refreshKey } = props;
	const { fitView } = useReactFlow();

	// biome-ignore lint/correctness/useExhaustiveDependencies: layoutSig and refreshKey trigger refit when graph layout or parent refresh changes
	useEffect(() => {
		const id = window.setTimeout(() => {
			void fitView({ padding: 0.18, duration: 220 });
		}, 90);
		return () => window.clearTimeout(id);
	}, [fitView, layoutSig, refreshKey]);

	return null;
}

export type NetworkGraphViewProps = {
	nodes: GraphNode[];
	edges: GraphEdge[];
	refreshKey: number;
	t: TranslateFn;
};

export function NetworkGraphView(props: NetworkGraphViewProps): JSX.Element {
	const { nodes, edges, refreshKey, t } = props;
	const [selectedId, setSelectedId] = useState<string | null>(null);

	const positions = useMemo(
		() => layoutKnowledgeGraph(nodes, edges),
		[nodes, edges],
	);

	const layoutSig = useMemo(
		() =>
			`${nodes.map((n) => n.id).join("|")}#${edges.map((e) => `${e.source}-${e.target}`).join("|")}`,
		[nodes, edges],
	);

	useEffect(() => {
		setSelectedId(null);
	}, []);

	useEffect(() => {
		const onKey = (e: KeyboardEvent): void => {
			if (e.key === "Escape") setSelectedId(null);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	const flowNodes = useMemo<Node[]>(
		() =>
			nodes.map((n) => ({
				id: n.id,
				type: "knowledge",
				position: positions.get(n.id) ?? { x: 0, y: 0 },
				data: {
					graphNode: n,
					selected: selectedId === n.id,
					accent: nodeAccent(n.group),
					clickHint: t("graph.clickNodeHint"),
				},
			})),
		[nodes, positions, selectedId, t],
	);

	const flowEdges = useMemo<Edge[]>(
		() =>
			edges.map((edge, index) => ({
				id: `${edge.source}-${edge.target}-${index}`,
				source: edge.source,
				target: edge.target,
				label: edge.relation,
				labelStyle: { fill: "#475569", fontSize: 11, fontWeight: 500 },
				labelBgPadding: [6, 4] as [number, number],
				labelBgBorderRadius: 6,
				labelBgStyle: { fill: "rgba(248, 250, 252, 0.95)", fillOpacity: 1 },
			})),
		[edges],
	);

	const selectedNode = useMemo(
		() => nodes.find((n) => n.id === selectedId) ?? null,
		[nodes, selectedId],
	);

	const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
		setSelectedId(node.id);
	}, []);

	const onPaneClick = useCallback(() => {
		setSelectedId(null);
	}, []);

	return (
		<div className="flex h-[680px] w-full min-h-0">
			<ReactFlowProvider>
				<div className="relative min-h-0 flex-1">
					<ReactFlow
						key={`flow-${refreshKey}`}
						nodes={flowNodes}
						edges={flowEdges}
						nodeTypes={nodeTypes}
						onNodeClick={onNodeClick}
						onPaneClick={onPaneClick}
						fitView
						minZoom={0.25}
						maxZoom={1.35}
						panOnDrag
						zoomOnScroll
						defaultEdgeOptions={{
							type: "smoothstep",
							style: { strokeWidth: 2.25, stroke: "#94A3B8" },
							markerEnd: {
								type: MarkerType.ArrowClosed,
								color: "#64748B",
								width: 18,
								height: 18,
							},
						}}
						attributionPosition="bottom-left"
					>
						<FitViewOnLayoutChange
							layoutSig={layoutSig}
							refreshKey={refreshKey}
						/>
						<MiniMap
							pannable
							zoomable
							nodeStrokeWidth={2}
							className="!rounded-lg !border !border-zinc-200 dark:!border-zinc-700"
							nodeColor={(node) => {
								const gn = nodes.find((n) => n.id === node.id);
								return gn ? nodeAccent(gn.group) : "#A1A1AA";
							}}
						/>
						<Controls className="!rounded-lg !border !border-zinc-200 !shadow-sm dark:!border-zinc-700" />
						<Background gap={20} color="#E2E8F0" />
					</ReactFlow>
				</div>
			</ReactFlowProvider>
			{selectedNode ? (
				<aside className="flex w-[min(100%,320px)] shrink-0 flex-col border-l border-zinc-200 bg-zinc-50/95 dark:border-zinc-800 dark:bg-zinc-900/95">
					<div className="flex items-start justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
						<div>
							<p
								className="text-[10px] font-semibold uppercase tracking-wide"
								style={{ color: nodeAccent(selectedNode.group) }}
							>
								{selectedNode.group}
							</p>
							<h3 className="mt-1 text-base font-semibold leading-snug text-zinc-900 dark:text-zinc-50">
								{selectedNode.label}
							</h3>
						</div>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-8 shrink-0 text-xs"
							onClick={() => setSelectedId(null)}
						>
							{t("graph.closePanel")}
						</Button>
					</div>
					<div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 text-sm">
						{selectedNode.summary ? (
							<section>
								<h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
									{t("graph.nodeSummary")}
								</h4>
								<p className="leading-relaxed text-zinc-700 dark:text-zinc-300">
									{selectedNode.summary}
								</p>
							</section>
						) : (
							<p className="text-xs text-zinc-500">
								{t("graph.noNodeSummary")}
							</p>
						)}
						{selectedNode.keyPoints && selectedNode.keyPoints.length > 0 ? (
							<section>
								<h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
									{t("graph.keyPoints")}
								</h4>
								<ul className="list-disc space-y-1.5 pl-4 text-zinc-700 dark:text-zinc-300">
									{selectedNode.keyPoints.map((p) => (
										<li key={p} className="leading-relaxed">
											{p}
										</li>
									))}
								</ul>
							</section>
						) : null}
						{selectedNode.sessions && selectedNode.sessions.length > 0 ? (
							<section>
								<h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
									{t("graph.sourceSessions")}
								</h4>
								<div className="flex flex-wrap gap-1">
									{selectedNode.sessions.map((sid) => (
										<span
											key={sid}
											className="rounded-md bg-zinc-200/80 px-2 py-0.5 font-mono text-[10px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
										>
											{sid.slice(0, 12)}
											{sid.length > 12 ? "…" : ""}
										</span>
									))}
								</div>
							</section>
						) : null}
					</div>
				</aside>
			) : null}
		</div>
	);
}

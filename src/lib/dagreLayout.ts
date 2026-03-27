import dagre from "dagre";

import type { GraphEdge, GraphNode } from "../types";

const NODE_W = 260;
const NODE_H = 108;

/**
 * Auto-layout for knowledge graph (LR flow). Falls back to grid when dagre fails.
 */
export function layoutKnowledgeGraph(
	nodes: GraphNode[],
	edges: GraphEdge[],
): Map<string, { x: number; y: number }> {
	const out = new Map<string, { x: number; y: number }>();
	if (nodes.length === 0) {
		return out;
	}

	try {
		const g = new dagre.graphlib.Graph();
		g.setDefaultEdgeLabel(() => ({}));
		g.setGraph({
			rankdir: "LR",
			align: "UL",
			nodesep: 48,
			ranksep: 72,
			marginx: 32,
			marginy: 32,
		});

		for (const n of nodes) {
			g.setNode(n.id, { width: NODE_W, height: NODE_H });
		}
		for (const e of edges) {
			if (
				nodes.some((n) => n.id === e.source) &&
				nodes.some((n) => n.id === e.target)
			) {
				g.setEdge(e.source, e.target);
			}
		}

		dagre.layout(g);

		for (const n of nodes) {
			const np = g.node(n.id);
			if (np && typeof np.x === "number" && typeof np.y === "number") {
				out.set(n.id, { x: np.x - NODE_W / 2, y: np.y - NODE_H / 2 });
			}
		}
	} catch {
		// fall through to grid
	}

	if (out.size < nodes.length) {
		const cols = Math.max(2, Math.ceil(Math.sqrt(nodes.length)));
		nodes.forEach((n, i) => {
			out.set(n.id, {
				x: 40 + (i % cols) * (NODE_W + 40),
				y: 40 + Math.floor(i / cols) * (NODE_H + 48),
			});
		});
	}

	return out;
}

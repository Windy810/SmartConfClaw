import { memo } from "react";
import { Handle, type NodeProps, Position } from "reactflow";

import type { GraphNode } from "../types";

export type KnowledgeGraphNodeData = {
	graphNode: GraphNode;
	selected: boolean;
	accent: string;
	clickHint: string;
};

function KnowledgeGraphNodeInner(
	props: NodeProps<KnowledgeGraphNodeData>,
): JSX.Element {
	const { data } = props;
	const { graphNode, selected, accent, clickHint } = data;

	return (
		<div
			className={`max-w-[260px] cursor-pointer rounded-xl border-2 bg-white px-3 py-2.5 shadow-sm transition-[box-shadow,transform] dark:bg-zinc-900 ${
				selected
					? "ring-2 ring-offset-2 ring-violet-500 ring-offset-zinc-100 dark:ring-offset-zinc-950"
					: "hover:shadow-md"
			}`}
			style={{ borderColor: accent }}
		>
			<Handle
				type="target"
				position={Position.Left}
				className="!h-2 !w-2 !border-0 !bg-zinc-400"
			/>
			<div
				className="text-[10px] font-semibold uppercase tracking-wide"
				style={{ color: accent }}
			>
				{graphNode.group}
			</div>
			<div className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug text-zinc-900 dark:text-zinc-50">
				{graphNode.label}
			</div>
			{graphNode.summary ? (
				<p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
					{graphNode.summary}
				</p>
			) : null}
			<p className="mt-1.5 text-[10px] text-zinc-400 dark:text-zinc-500">
				{clickHint}
			</p>
			<Handle
				type="source"
				position={Position.Right}
				className="!h-2 !w-2 !border-0 !bg-zinc-400"
			/>
		</div>
	);
}

export const KnowledgeGraphNode = memo(KnowledgeGraphNodeInner);

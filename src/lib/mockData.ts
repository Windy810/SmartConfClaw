import type { AcademicSession, GraphEdge, GraphNode } from "../types";

export const mockAcademicSession: AcademicSession = {
	id: "session-neurips-2025-peft-moe-01",
	title:
		"NeurIPS 2025 | Parameter-Efficient Fine-Tuning for Sparse MoE Transformers",
	date: "2025-12-11T09:30:00Z",
	tags: ["NeurIPS", "PEFT", "MoE", "LLM Optimization", "Efficient Training"],
	concepts: [
		{
			term: "LoRA",
			definition:
				"Low-Rank Adaptation: a parameter-efficient fine-tuning method that adds low-rank matrices to frozen pretrained weights.",
		},
		{
			term: "Mixture of Experts (MoE)",
			definition:
				"An architecture that uses a gating network to route inputs to a sparse subset of expert sub-networks.",
		},
		{
			term: "Router Collapse",
			definition:
				"A failure mode where the MoE gating mechanism routes all tokens to a small subset of experts, leaving others unused.",
		},
	],
	timeline: [
		{
			id: "tl-001",
			timestamp: 42,
			pptScreenshotPath: "/placeholders/ppt-slide-01.png",
			originalTranscript:
				"Good morning everyone. We study parameter-efficient fine-tuning for sparse Mixture of Experts transformers. " +
				"The motivation is simple: full fine-tuning on multi-hundred-billion-parameter models is too expensive for most labs.",
			summary:
				"Introduces the core problem: full fine-tuning of sparse MoE models is financially and computationally prohibitive, " +
				"so the talk targets a parameter-efficient alternative.",
			annotations: [
				{
					term: "Mixture of Experts (MoE)",
					definition:
						"A neural architecture where only a subset of expert subnetworks is activated per token, improving compute efficiency at scale.",
					sourceUrl: "https://arxiv.org/abs/1701.06538",
				},
			],
		},
		{
			id: "tl-002",
			timestamp: 186,
			pptScreenshotPath: "/placeholders/ppt-slide-02.png",
			originalTranscript:
				"Our baseline uses LoRA on shared attention blocks only, but that ignores routing dynamics. " +
				"We propose Router-Aware LoRA that adds low-rank adaptation to gating projections and introduces entropy regularization.",
			summary:
				"Presents Router-Aware LoRA: extend low-rank adaptation from attention-only baselines to MoE routing layers, " +
				"plus an entropy objective to stabilize token-to-expert allocation.",
			annotations: [
				{
					term: "LoRA",
					definition:
						"Low-Rank Adaptation injects trainable low-rank matrices into frozen pretrained weights to reduce trainable parameters.",
					sourceUrl: "https://arxiv.org/abs/2106.09685",
				},
				{
					term: "Router Collapse",
					definition:
						"A failure mode in sparse MoE where the router over-selects a small subset of experts, causing load imbalance and degraded quality.",
					sourceUrl: "https://arxiv.org/abs/2202.08906",
				},
			],
		},
		{
			id: "tl-003",
			timestamp: 404,
			pptScreenshotPath: "/placeholders/ppt-slide-03.png",
			originalTranscript:
				"On 64-GPU experiments across multilingual summarization and code generation, our method matches full fine-tuning " +
				"within 0.3 points while reducing trainable parameters by 97.6 percent and cutting deployment latency by 18 percent.",
			summary:
				"Empirical results show near-parity with full fine-tuning while dramatically reducing trainable parameter count " +
				"and improving inference latency in production-like settings.",
			annotations: [
				{
					term: "Latency",
					definition:
						"Time delay between receiving an input request and producing model output, critical for interactive applications.",
				},
			],
		},
	],
	extendedReport:
		"This session outlines a practical PEFT strategy for sparse MoE transformers under realistic research budgets. " +
		"The speaker argues that conventional LoRA placements miss key bottlenecks in MoE systems: unstable routing and expert imbalance. " +
		"By adapting router projections directly and adding entropy regularization, Router-Aware LoRA improves expert utilization without " +
		"requiring full-model updates. Across multilingual summarization and code generation tasks, the method approaches full fine-tuning " +
		"quality with far lower trainable parameter counts and better serving latency. Potential risks include sensitivity to routing " +
		"temperature schedules and dataset-specific collapse behavior, suggesting that robust hyperparameter defaults remain an open area.",
	qaSimulator: [
		{
			question:
				"How does this method compare to standard adapters in terms of latency?",
			suggestedAnswerPoints: [
				"Standard adapters add extra feed-forward blocks, which can increase per-token compute and memory movement at inference.",
				"Router-Aware LoRA modifies existing linear projections with low-rank updates, typically introducing smaller runtime overhead.",
				"In this talk's benchmarks, the reported end-to-end serving latency improved by roughly 18 percent versus full fine-tuning baselines.",
			],
		},
		{
			question:
				"Why is router collapse particularly harmful in sparse MoE fine-tuning, and how does entropy regularization help?",
			suggestedAnswerPoints: [
				"Sparse MoE relies on balanced expert usage; collapse causes a few experts to saturate while others under-train.",
				"Imbalanced routing harms both quality and hardware efficiency due to uneven token distribution.",
				"Entropy regularization encourages a healthier routing distribution, reducing expert over-specialization early in fine-tuning.",
			],
		},
		{
			question:
				"What trade-offs would you expect when applying Router-Aware LoRA to smaller open-source MoE models?",
			suggestedAnswerPoints: [
				"Benefits may persist, but gains can shrink if baseline models already have stable routing behavior.",
				"Smaller models might be more sensitive to rank selection and regularization strength, requiring tighter tuning.",
				"Even when quality gains are modest, parameter and memory savings can still be valuable for rapid experimentation.",
			],
		},
	],
	references: [],
};

export const mockGraphNodes: GraphNode[] = [
	{
		id: "method-router-aware-lora",
		label: "Router-Aware LoRA",
		group: "method",
	},
	{ id: "method-lora", label: "LoRA", group: "method" },
	{
		id: "dataset-multilingual-sum",
		label: "Multilingual Summarization Set",
		group: "dataset",
	},
	{ id: "metric-latency", label: "Serving Latency", group: "metric" },
	{ id: "author-neurips-speaker", label: "Primary Author", group: "author" },
];

export const mockGraphEdges: GraphEdge[] = [
	{
		source: "method-router-aware-lora",
		target: "method-lora",
		relation: "extends",
	},
	{
		source: "method-router-aware-lora",
		target: "dataset-multilingual-sum",
		relation: "evaluated_on",
	},
	{
		source: "method-router-aware-lora",
		target: "metric-latency",
		relation: "improves",
	},
	{
		source: "author-neurips-speaker",
		target: "method-router-aware-lora",
		relation: "proposed",
	},
];

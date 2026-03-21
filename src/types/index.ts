export interface AcademicSession {
  id: string;
  title: string;
  date: string;
  tags: string[];
  concepts: ConceptAnnotation[];
  timeline: TimelineItem[];
  extendedReport: string;
  qaSimulator: QAMock[];
  references: Reference[];
}

export interface Reference {
  title: string;
  authors: string;
  venue: string;
  year: string;
  url: string;
  relevance: string;
}

export interface TimelineItem {
  id: string;
  timestamp: number;
  pptScreenshotPath: string;
  originalTranscript: string;
  summary: string;
  annotations: ConceptAnnotation[];
}

export interface ConceptAnnotation {
  term: string;
  definition: string;
  sourceUrl?: string;
}

export interface QAMock {
  question: string;
  suggestedAnswerPoints: string[];
}

export interface GraphNode {
  id: string;
  label: string;
  group: "method" | "dataset" | "metric" | "author" | "concept";
  sessions?: string[];
  /** One sentence: role of this concept in the session (from AI). */
  summary?: string;
  /** Short bullets for the detail panel (from AI). */
  keyPoints?: string[];
}

export interface MindMapChild {
  id: string;
  label: string;
  sessions?: string[];
}

export interface MindMapEntry {
  id: string;
  label: string;
  children?: MindMapChild[];
  sessions?: string[];
}

export interface MindMapCategory {
  id: string;
  /** Facet of the research domain (not fixed buckets — chosen to fit this session). */
  label: string;
  /** UI accent only; model may use `theme` for domain-level branches. */
  group: "method" | "dataset" | "metric" | "author" | "concept" | "context" | "theme";
  entries: MindMapEntry[];
}

/** AI-generated mind map for one analysis (also one item in global `trees`) */
export interface SessionMindMap {
  /** One line: core research theme of this session (the map center). */
  topic: string;
  /** 3–6 short theme keywords anchoring the domain. */
  keywords?: string[];
  /** 5–7 thematic branches extending the topic into this research field. */
  categories: MindMapCategory[];
}

/** Persisted global mind map: one tree per session */
export interface GlobalMindMapFile {
  version: number;
  trees: Array<{
    sessionId: string;
    topic: string;
    keywords?: string[];
    categories: MindMapCategory[];
  }>;
}

export interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** When present, prefer mind-map view over force-directed graph */
  mindMap?: GlobalMindMapFile | null;
}

export interface GraphEdge {
  source: string;
  target: string;
  relation: string;
}

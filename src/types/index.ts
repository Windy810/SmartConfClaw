export interface AcademicSession {
  id: string;
  title: string;
  date: string;
  tags: string[];
  timeline: TimelineItem[];
  extendedReport: string;
  qaSimulator: QAMock[];
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
  group: "method" | "dataset" | "metric" | "author";
}

export interface GraphEdge {
  source: string;
  target: string;
  relation: string;
}

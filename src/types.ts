export interface RAGSettings {
  provider: "lm_studio" | "ollama" | "gemini" | "anything_llm";
  apiUrl: string; // http://localhost:1234/v1 for LM Studio, etc.
  apiKey: string; // for Gemini or authenticated endpoints
  modelName: string; // selected LLM
  embeddingProvider: "local_tfidf" | "lm_studio" | "gemini" | "ollama";
  embeddingModel: string; // selected embedding model
  chunkSize: number;
  chunkOverlap: number;
  systemPrompt: string;
  temperature: number;
  topK: number; // number of chunks to retrieve
  vectorDb?: "in_memory" | "chroma";
  chromaUrl?: string;
  chromaCollection?: string;
  ragMode?: "naive" | "advanced" | "agentic" | "graph" | "hybrid" | "adaptive";
  sandboxCapacity?: number;
}

export type SourceType = "file" | "youtube" | "url" | "text";

export interface SourceDocument {
  id: string;
  title: string;
  sourceType: SourceType;
  sourceUrl?: string;
  content: string;
  charCount: number;
  chunkCount: number;
  addedAt: string;
}

export interface DocumentChunk {
  id: string;
  docId: string;
  docTitle: string;
  text: string;
  index: number;
  vector?: number[];
  sourceType: SourceType;
  sourceUrl?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  sources?: RetrievedSource[];
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  generationTimeMs?: number;
  structured?: {
    executiveSummary?: string;
    detailedAnalysis?: string;
    keyTakeaways?: string[];
    citations?: string[];
  };
}

export interface RetrievedSource {
  docId: string;
  docTitle: string;
  text: string;
  score: number;
  sourceType: SourceType;
  sourceUrl?: string;
}

export interface RAGState {
  documents: SourceDocument[];
  chunks: DocumentChunk[];
  settings: RAGSettings;
}

export interface IngestResponse {
  success: boolean;
  document?: SourceDocument;
  chunksCount?: number;
  error?: string;
}

export interface QueryResponse {
  answer: string;
  sources: RetrievedSource[];
  promptUsed: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  generationTimeMs?: number;
}

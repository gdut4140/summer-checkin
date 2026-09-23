// ============================================================
// RAG: 统一导出
// ============================================================

export { embedTexts, embedText } from "./client";
export { splitText, splitMarkdown } from "./chunk";
export { searchSimilarChunks, toPgVector } from "./retriever";
export type { DocChunk } from "./retriever";
export { rerankChunks, orderByRerank, clampRerankDocuments } from "./rerank";
export type { RerankOutcome } from "./rerank";
export {
  searchKnowledge,
  formatKnowledgeForPrompt,
} from "./search";
export type { KnowledgeResult, SearchResult } from "./search";

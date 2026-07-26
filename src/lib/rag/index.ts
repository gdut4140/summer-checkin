// ============================================================
// Day 16 RAG: 统一导出
// ============================================================

export { embedTexts, embedText, rerank } from "./client";
export { splitText, splitMarkdown } from "./chunk";
export { searchSimilarChunks, cosineSimilarity } from "./retriever";
export type { DocChunk } from "./retriever";
export {
  searchKnowledge,
  formatKnowledgeForPrompt,
} from "./search";
export type { KnowledgeResult, SearchResult } from "./search";

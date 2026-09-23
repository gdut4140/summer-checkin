// ============================================================
// RAG: 统一导出
// ============================================================

export { embedTexts, embedText } from "./client";
export { splitText, splitMarkdown } from "./chunk";
export { searchSimilarChunks, toPgVector } from "./retriever";
export type { DocChunk } from "./retriever";
export {
  searchKnowledge,
  formatKnowledgeForPrompt,
} from "./search";
export type { KnowledgeResult, SearchResult } from "./search";

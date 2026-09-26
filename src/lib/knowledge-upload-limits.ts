export const KNOWLEDGE_UPLOAD_LIMITS = {
  md: 5 * 1024 * 1024,
  txt: 5 * 1024 * 1024,
  pdf: 20 * 1024 * 1024,
  docx: 20 * 1024 * 1024,
} as const;

export type KnowledgeUploadExtension = keyof typeof KNOWLEDGE_UPLOAD_LIMITS;

export function getKnowledgeUploadLimit(ext: string): number | null {
  return ext in KNOWLEDGE_UPLOAD_LIMITS
    ? KNOWLEDGE_UPLOAD_LIMITS[ext as KnowledgeUploadExtension]
    : null;
}

export function isKnowledgeUploadTooLarge(ext: string, size: number): boolean {
  const limit = getKnowledgeUploadLimit(ext);
  return limit !== null && size > limit;
}

export function formatUploadLimit(bytes: number): string {
  return `${Math.floor(bytes / 1024 / 1024)} MB`;
}

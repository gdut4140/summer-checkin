// ============================================================
// 知识库上传边界：文件大小、文本长度、分片数量、解析错误映射
//
// 为什么单独成模块：这些规则同时被 API 路由、入库管道和前端使用，
// 散在三处迟早会漂移；而且它们是纯函数，可以直接测边界值。
//
// 限额不是拍脑袋：分片数直接决定 embedding 调用次数与入库耗时，
// 文本长度决定了内存与解析成本。具体数值见下方常量，调整时同步
// 更新 UI 提示（knowledge-base.tsx）与 eval/README。
// ============================================================

const MB = 1024 * 1024;

/** 单文件上限（字节） */
export const MAX_FILE_BYTES = 10 * MB;

/**
 * 整个请求体上限。
 * multipart 会比文件本身多一些边界和头部开销，所以留 1 MB 余量。
 * 用于在解析 body 之前快速拒绝明显超限的请求。
 */
export const MAX_REQUEST_BYTES = MAX_FILE_BYTES + 1 * MB;

/** 提取文本的字符上限 */
export const MAX_TEXT_CHARS = 200_000;

/** 单文档分片数量上限（直接对应 embedding 调用量） */
export const MAX_CHUNK_COUNT = 1_000;

/** PDF/DOCX Python 解析超时 */
export const PDF_PARSE_TIMEOUT_MS = 30_000;

// ---- 错误类型 ----

/**
 * 上限类错误。独立成类型，方便 API 路由返回 400/413，
 * 而不是被当成普通的 500 处理失败。
 */
export class KnowledgeLimitError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "KnowledgeLimitError";
    this.status = status;
  }
}

// ---- 纯检查函数：返回错误文案，未超限返回 null ----

export function fileSizeError(bytes: number): string | null {
  if (bytes <= MAX_FILE_BYTES) return null;
  return `文件过大（${(bytes / MB).toFixed(1)} MB），单文件上限 ${MAX_FILE_BYTES / MB} MB`;
}

/**
 * 请求体大小检查。
 * content-length 可能缺失（chunked 传输），缺失时交给后续 file.size 检查。
 */
export function requestSizeError(contentLength: number | null): string | null {
  if (contentLength === null || !Number.isFinite(contentLength) || contentLength <= 0) {
    return null;
  }
  if (contentLength <= MAX_REQUEST_BYTES) return null;
  return `请求体过大（${(contentLength / MB).toFixed(1)} MB），单文件上限 ${MAX_FILE_BYTES / MB} MB`;
}

export function textLengthError(text: string): string | null {
  if (text.length <= MAX_TEXT_CHARS) return null;
  return `文档文本过长（${text.length} 字），上限 ${MAX_TEXT_CHARS} 字；请拆分后再上传`;
}

export function chunkCountError(count: number): string | null {
  if (count <= MAX_CHUNK_COUNT) return null;
  return `文档分片过多（${count} 个），上限 ${MAX_CHUNK_COUNT} 个；请拆分后再上传`;
}

// ---- 抛错版本：供入库管道使用 ----

export function assertTextLimit(text: string): void {
  const error = textLengthError(text);
  if (error) throw new KnowledgeLimitError(error);
}

export function assertChunkLimit(count: number): void {
  const error = chunkCountError(count);
  if (error) throw new KnowledgeLimitError(error);
}

// ---- 解析错误映射 ----

export interface ExtractionErrorOptions {
  /** exec 超时（killed / SIGTERM） */
  timedOut: boolean;
  /** exec 自带的 error.message，stderr 为空时兜底 */
  fallback: string;
}

/**
 * 把 Python 解析脚本的失败转成用户能看懂的一句话。
 *
 * 之前直接把 stderr 透传给前端，用户会看到整段 traceback，
 * 既看不懂也不安全（会暴露服务器路径与依赖版本）。
 * 完整 stderr 由调用方写日志，这里只回一句可操作的原因。
 */
export function describeExtractionError(
  ext: "pdf" | "docx",
  stderr: string,
  opts: ExtractionErrorOptions
): string {
  const label = ext === "pdf" ? "PDF" : "Word";

  if (opts.timedOut) {
    return `${label} 解析超时（${PDF_PARSE_TIMEOUT_MS / 1000} 秒），文件可能过大或损坏`;
  }

  if (/ModuleNotFoundError|No module named/i.test(stderr)) {
    return `${label} 解析依赖未安装（服务器缺少 Python 包），请联系管理员`;
  }

  const lines = stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  // 优先取真正说明原因的那一行，而不是 "Traceback (most recent call last):"
  let detail = "";
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/error|exception|not found|denied|invalid/i.test(lines[i])) {
      detail = lines[i];
      break;
    }
  }
  if (!detail) detail = lines[0] ?? opts.fallback;

  return `${label} 文本提取失败：${detail.slice(0, 200)}`;
}

/* ============================================================
 * RAG 检索质量评测
 *
 * 回答一个问题：当前的召回池、重排、切片参数到底有没有用。
 * 不做「感觉更好」，只输出可复现的数字。
 *
 * 用法:
 *   npx tsx scripts/eval-rag.ts --validate-only
 *   npx tsx scripts/eval-rag.ts --exclude 个人简历.docx
 *   npx tsx scripts/eval-rag.ts --docs eval/rag/corpus --configs current,flat-300-50
 *
 * 常见参数:
 *   --questions <path>   评测题 JSONL，默认 eval/rag/questions.local.jsonl
 *   --docs <db|dir>      语料来源：数据库里的 knowledgedoc，或一个目录
 *   --user <id>          仅取某个用户的文档（默认全部）
 *   --exclude a,b        排除的文档名（例如个人简历）
 *   --configs a,b        只跑指定切片配置
 *   --pools 20,30,50     重排候选池大小，可传多个做对照（默认 20）
 *   --limit <n>          只跑前 n 题（冒烟用）
 *   --out <path>         结果 JSON 路径
 *   --validate-only      只校验题目标注，不调用任何 API
 *   --refresh-embeddings 忽略向量缓存
 *
 * 指标定义:
 *   Hit@5 / Hit@20  问题级命中：至少一个相关片段进入前 5 / 前 20
 *   Recall@20       片段级召回：命中的相关片段数 / 该题全部相关片段数（前 20 内）
 *   MRR@5           第一个相关片段排名的倒数（前 5 内，否则 0）
 *   NDCG@5          二值相关性归一化折损累计增益
 *   无答案题不参与上述指标，单独报告 top1 分数（用于判断能否用阈值拒答）
 *
 * 切片配置与线上一致：current 对 Markdown 用 splitMarkdown(800)，其余 splitText(500,50)。
 * 其余 flat-* 配置对所有文档统一用 splitText(size, overlap)，用于比较切片参数。
 *
 * 成本口径：embedding 调用次数（每条查询/每 10 个分片一批）、重排调用次数与文档数。
 * 没有内置价格表；需要金额时用报告里的调用量乘当时单价。
 * ============================================================ */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

// ---- 类型 ----

type QuestionType = "fact" | "concept" | "cross" | "no-answer";

interface Evidence {
  sourceName: string;
  /** 原文中的连续片段（空白会被忽略后比对） */
  quote: string;
}

interface EvalQuestion {
  id: string;
  type: QuestionType;
  query: string;
  evidence: Evidence[];
}

interface SourceDoc {
  sourceName: string;
  sourceType: string;
  content: string;
}

interface ChunkConfig {
  id: string;
  kind: "production" | "flat";
  chunkSize: number;
  overlap: number;
  /** production 模式下 Markdown 文档的上限（与 splitMarkdown 默认一致） */
  mdMax?: number;
}

interface EvalChunk {
  sourceName: string;
  sourceType: string;
  chunkIndex: number;
  content: string;
}

interface ScoredChunk extends EvalChunk {
  similarity: number;
}

interface QuestionRun {
  id: string;
  type: QuestionType;
  query: string;
  relevantTotal: number;
  vectorTop5: string[];
  rerankTop5: string[];
  vectorTop20: string[];
  rerankTop20: string[];
  vectorRanks: number[];
  rerankRanks: number[];
  top1Score: number;
  rerankTop1Score?: number;
  rerankModel?: string;
  rerankFailed: boolean;
  rerankMs: number;
}

// ---- 配置 ----

const CONFIGS: ChunkConfig[] = [
  // 线上默认
  { id: "current", kind: "production", chunkSize: 500, overlap: 50, mdMax: 800 },
  { id: "flat-300-50", kind: "flat", chunkSize: 300, overlap: 50 },
  { id: "flat-500-50", kind: "flat", chunkSize: 500, overlap: 50 },
  { id: "flat-800-100", kind: "flat", chunkSize: 800, overlap: 100 },
];

const TOP_K = 5;
/** Recall@20 的窗口。重排池最小也不能低于它，否则指标名会失真 */
const RECALL_METRIC_K = 20;
const DEFAULT_POOLS = [20];
/** 证据片段被分片截断时，至少要共享这么长的连续文本才算命中 */
const MIN_MATCH_RUN = 30;
const EMBEDDING_BATCH = 10;
const CACHE_VERSION = 1;
const CACHE_PATH = "eval/rag/.cache/embeddings.json";

// ---- 工具 ----

const normalize = (s: string) => s.replace(/\s+/g, "");
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function parseArgs(argv: string[]) {
  const args = {
    questions: "eval/rag/questions.local.jsonl",
    docs: "db",
    user: undefined as string | undefined,
    exclude: [] as string[],
    configs: undefined as string[] | undefined,
    pools: DEFAULT_POOLS,
    out: undefined as string | undefined,
    limit: undefined as number | undefined,
    validateOnly: false,
    refresh: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${key} 缺少参数`);
      return v;
    };
    switch (key) {
      case "--questions": args.questions = next(); break;
      case "--docs": args.docs = next(); break;
      case "--user": args.user = next(); break;
      case "--exclude":
        args.exclude = next().split(",").map((s) => s.trim()).filter(Boolean);
        break;
      case "--configs":
        args.configs = next().split(",").map((s) => s.trim()).filter(Boolean);
        break;
      case "--pools": {
        args.pools = next().split(",").map((s) => Number(s.trim()));
        for (const p of args.pools) {
          if (!Number.isInteger(p) || p < RECALL_METRIC_K) {
            throw new Error(`--pools 必须是 ≥${RECALL_METRIC_K} 的整数（收到 ${p}）`);
          }
        }
        break;
      }
      case "--out": args.out = next(); break;
      case "--limit": args.limit = Number(next()); break;
      case "--validate-only": args.validateOnly = true; break;
      case "--refresh-embeddings": args.refresh = true; break;
      case "--help":
        console.log(readFileSync(new URL(import.meta.url), "utf-8").split("*/")[0]);
        process.exit(0);
      default:
        throw new Error(`未知参数: ${key}`);
    }
  }
  return args;
}

function loadQuestions(file: string, docs: SourceDoc[]): EvalQuestion[] {
  if (!existsSync(file)) {
    throw new Error(`评测题文件不存在: ${file}（参考 eval/rag/README.md）`);
  }
  const docByName = new Map(docs.map((d) => [d.sourceName, d]));
  const questions: EvalQuestion[] = [];
  const ids = new Set<string>();
  const errors: string[] = [];

  readFileSync(file, "utf-8")
    .split(/\r?\n/)
    .forEach((line, i) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      let q: EvalQuestion;
      try {
        q = JSON.parse(trimmed) as EvalQuestion;
      } catch {
        throw new Error(`${file}:${i + 1} 不是合法 JSON`);
      }
      const where = `${file}:${i + 1} (${q.id ?? "无 id"})`;
      if (!q.id || !q.query || !q.type) {
        errors.push(`${where} 缺少 id / query / type`);
        return;
      }
      if (ids.has(q.id)) errors.push(`${where} id 重复`);
      ids.add(q.id);

      const evidence = q.evidence ?? [];
      if (q.type === "no-answer") {
        if (evidence.length > 0) errors.push(`${where} 无答案题不应标注 evidence`);
      } else if (evidence.length === 0) {
        errors.push(`${where} 可答题必须标注 evidence`);
      }

      for (const e of evidence) {
        const doc = docByName.get(e.sourceName);
        if (!doc) {
          errors.push(`${where} 找不到文档 "${e.sourceName}"（检查 --exclude / --docs）`);
          continue;
        }
        if (normalize(e.quote).length < 8) {
          errors.push(`${where} evidence 太短，不足以定位: "${e.quote}"`);
          continue;
        }
        if (!normalize(doc.content).includes(normalize(e.quote))) {
          errors.push(`${where} evidence 不是 "${e.sourceName}" 的原文片段: "${e.quote}"`);
        }
      }

      questions.push({ ...q, evidence });
    });

  if (errors.length > 0) {
    throw new Error(`评测题校验失败：\n  - ${errors.join("\n  - ")}`);
  }
  return questions;
}

async function loadDocsFromDb(userId?: string): Promise<SourceDoc[]> {
  const { PrismaClient } = await import("../prisma/generated/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
  try {
    const rows = await prisma.knowledgeDoc.findMany({
      where: userId ? { userId } : undefined,
      select: { sourceName: true, sourceType: true, content: true },
      orderBy: { sourceName: "asc" },
    });
    return rows;
  } finally {
    await prisma.$disconnect();
  }
}

function loadDocsFromDir(dir: string): SourceDoc[] {
  if (!existsSync(dir)) throw new Error(`语料目录不存在: ${dir}`);
  return readdirSync(dir)
    .filter((f) => /\.(md|txt)$/i.test(f))
    .sort()
    .map((f) => ({
      sourceName: f,
      sourceType: /\.md$/i.test(f) ? "markdown" : "text",
      content: readFileSync(path.join(dir, f), "utf-8"),
    }));
}

interface Chunkers {
  splitText: (text: string, size?: number, overlap?: number) => string[];
  splitMarkdown: (text: string, maxChunkSize?: number) => string[];
}

function chunkDocs(docs: SourceDoc[], cfg: ChunkConfig, chunkers: Chunkers): EvalChunk[] {
  const out: EvalChunk[] = [];
  for (const doc of docs) {
    const pieces =
      cfg.kind === "production"
        ? doc.sourceType === "markdown"
          ? chunkers.splitMarkdown(doc.content, cfg.mdMax)
          : chunkers.splitText(doc.content, cfg.chunkSize, cfg.overlap)
        : chunkers.splitText(doc.content, cfg.chunkSize, cfg.overlap);
    pieces.forEach((content, chunkIndex) =>
      out.push({
        sourceName: doc.sourceName,
        sourceType: doc.sourceType,
        chunkIndex,
        content,
      })
    );
  }
  return out;
}

// ---- 向量缓存 ----

interface CacheEntry {
  model: string;
  vector: number[];
}
type VectorCache = Record<string, CacheEntry>;

function loadCache(): VectorCache {
  if (!existsSync(CACHE_PATH)) return {};
  try {
    const raw = JSON.parse(readFileSync(CACHE_PATH, "utf-8")) as {
      version?: number;
      entries?: VectorCache;
    };
    if (raw.version !== CACHE_VERSION || !raw.entries) return {};
    return raw.entries;
  } catch {
    return {};
  }
}

function saveCache(cache: VectorCache): void {
  mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  writeFileSync(
    CACHE_PATH,
    JSON.stringify({ version: CACHE_VERSION, entries: cache }),
    "utf-8"
  );
}

// ---- 相似度 ----

function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

function norm(a: number[]): number {
  return Math.sqrt(dot(a, a)) || 1;
}

function rankChunks(
  chunks: EvalChunk[],
  vectors: Map<string, number[]>,
  queryVector: number[]
): ScoredChunk[] {
  const qn = norm(queryVector);
  return chunks
    .map((c) => {
      const v = vectors.get(sha256(c.content));
      if (!v) throw new Error(`分片缺少向量: ${c.sourceName}#${c.chunkIndex}`);
      return { ...c, similarity: dot(queryVector, v) / (qn * norm(v)) };
    })
    .sort((a, b) => b.similarity - a.similarity);
}

// ---- 相关性 ----

function chunkMatches(chunk: EvalChunk, e: Evidence): boolean {
  if (chunk.sourceName !== e.sourceName) return false;
  const quote = normalize(e.quote);
  const text = normalize(chunk.content);
  if (text.includes(quote)) return true;

  // 证据片段可能跨分片边界；共享一段足够长的连续文本仍算命中。
  const run = Math.min(MIN_MATCH_RUN, quote.length);
  const step = Math.max(1, Math.floor(run / 2));
  for (let i = 0; i + run <= quote.length; i += step) {
    if (text.includes(quote.slice(i, i + run))) return true;
  }
  return false;
}

function relevantSet(chunks: EvalChunk[], q: EvalQuestion): Set<string> {
  const set = new Set<string>();
  for (const c of chunks) {
    const key = `${c.sourceName}#${c.chunkIndex}`;
    if (q.evidence.some((e) => chunkMatches(c, e))) set.add(key);
  }
  return set;
}

const chunkKey = (c: EvalChunk) => `${c.sourceName}#${c.chunkIndex}`;

// ---- 指标 ----

function mrrAt5(ranks: number[]): number {
  const first = ranks.find((r) => r <= TOP_K);
  return first === undefined ? 0 : 1 / first;
}

function ndcgAt5(relevance: boolean[]): number {
  let dcg = 0;
  relevance.slice(0, TOP_K).forEach((rel, i) => {
    if (rel) dcg += 1 / Math.log2(i + 2);
  });
  const idealHits = Math.min(relevance.filter(Boolean).length, TOP_K);
  let idcg = 0;
  for (let i = 0; i < idealHits; i++) idcg += 1 / Math.log2(i + 2);
  return idcg === 0 ? 0 : dcg / idcg;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

interface Aggregate {
  config: string;
  variant: "vector" | "rerank";
  pool: number;
  questions: number;
  labelMisses: number;
  hit5: number;
  hit20: number;
  recall20: number;
  mrr5: number;
  ndcg5: number;
  byType: Record<string, { n: number; hit5: number; mrr5: number; ndcg5: number }>;
  embedMeanMs: number;
  embedP95Ms: number;
  rerankMeanMs: number;
  rerankP95Ms: number;
  rerankFailures: number;
  noAnswer: { n: number; top1Mean: number };
}

function aggregate(
  runs: QuestionRun[],
  questions: EvalQuestion[],
  config: string,
  variant: "vector" | "rerank",
  pool: number,
  embedMs: number[],
  labels: Map<string, Set<string>>
): Aggregate {
  const answerable = questions.filter(
    (q) => q.type !== "no-answer" && runs.some((r) => r.id === q.id)
  );
  const rows = answerable
    .map((q) => {
      const run = runs.find((r) => r.id === q.id)!;
      return { q, run, relevant: labels.get(q.id)! };
    })
    .filter((r) => r.relevant.size > 0);

  const labelMisses = answerable.length - rows.length;
  const byType: Aggregate["byType"] = {};
  for (const row of rows) {
    const t = row.q.type;
    byType[t] ??= { n: 0, hit5: 0, mrr5: 0, ndcg5: 0 };
  }

  let hit5 = 0;
  let hit20 = 0;
  let recall20 = 0;
  let mrr5 = 0;
  let ndcg5 = 0;

  for (const { q, run, relevant } of rows) {
    const top5 = variant === "vector" ? run.vectorTop5 : run.rerankTop5;
    const top20 = variant === "vector" ? run.vectorTop20 : run.rerankTop20;
    const in5 = top5.filter((k) => relevant.has(k)).length;
    const in20 = top20.filter((k) => relevant.has(k)).length;
    const h5 = in5 > 0 ? 1 : 0;
    const h20 = in20 > 0 ? 1 : 0;
    const rec = in20 / relevant.size;
    const rr = mrrAt5(variant === "vector" ? run.vectorRanks : run.rerankRanks);
    const ndcg = ndcgAt5(top5.map((k) => relevant.has(k)));

    hit5 += h5;
    hit20 += h20;
    recall20 += rec;
    mrr5 += rr;
    ndcg5 += ndcg;

    const b = byType[q.type];
    b.n += 1;
    b.hit5 += h5;
    b.mrr5 += rr;
    b.ndcg5 += ndcg;
  }

  const n = rows.length || 1;
  for (const b of Object.values(byType)) {
    b.hit5 /= b.n || 1;
    b.mrr5 /= b.n || 1;
    b.ndcg5 /= b.n || 1;
  }

  const rerankTimes = runs
    .filter((r) => variant === "rerank" && !r.rerankFailed)
    .map((r) => r.rerankMs);
  const noAnswerRuns = runs.filter((r) => {
    const q = questions.find((x) => x.id === r.id);
    return q?.type === "no-answer";
  });
  const noAnswerScores = noAnswerRuns
    .map((r) => {
      if (variant === "vector") return r.top1Score;
      // 重排降级时 rerankTop1Score 里放的是余弦分，不能和 cross-encoder 分混在一起统计
      return r.rerankFailed ? undefined : r.rerankTop1Score;
    })
    .filter((x): x is number => x !== undefined && Number.isFinite(x));

  return {
    config,
    variant,
    pool,
    questions: rows.length,
    labelMisses,
    hit5: hit5 / n,
    hit20: hit20 / n,
    recall20: recall20 / n,
    mrr5: mrr5 / n,
    ndcg5: ndcg5 / n,
    byType,
    embedMeanMs: embedMs.reduce((a, b) => a + b, 0) / (embedMs.length || 1),
    embedP95Ms: percentile(embedMs, 95),
    rerankMeanMs: rerankTimes.reduce((a, b) => a + b, 0) / (rerankTimes.length || 1),
    rerankP95Ms: percentile(rerankTimes, 95),
    rerankFailures: runs.filter((r) => r.rerankFailed).length,
    noAnswer: {
      n: noAnswerScores.length,
      top1Mean: noAnswerScores.reduce((a, b) => a + b, 0) / (noAnswerScores.length || 1),
    },
  };
}

// ---- 主流程 ----

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const docs = (args.docs === "db"
    ? await loadDocsFromDb(args.user)
    : loadDocsFromDir(args.docs)
  ).filter((d) => !args.exclude.includes(d.sourceName));

  if (docs.length === 0) throw new Error("语料为空（检查 --exclude / --docs）");

  const questions = loadQuestions(args.questions, docs).slice(
    0,
    args.limit ?? Number.POSITIVE_INFINITY
  );

  const configs = args.configs
    ? CONFIGS.filter((c) => args.configs!.includes(c.id))
    : CONFIGS;
  if (configs.length === 0) throw new Error(`没有匹配的 --configs`);

  const counts = (t: string) => questions.filter((q) => q.type === t).length;
  console.log(
    `语料 ${docs.length} 篇 / ${docs.reduce((s, d) => s + d.content.length, 0)} 字；` +
      `评测题 ${questions.length} 道（事实 ${counts("fact")}、概念 ${counts("concept")}、` +
      `跨段 ${counts("cross")}、无答案 ${counts("no-answer")}）`
  );
  for (const d of docs) console.log(`  · ${d.sourceName} (${d.content.length} 字)`);

  if (args.validateOnly) {
    console.log("✅ 标注校验通过（--validate-only，未调用任何 API）");
    return;
  }

  // 动态 import：env 必须在 model-pool 初始化之前加载
  const chunkers: Chunkers = await import("../src/lib/rag/chunk");
  const { embedTexts } = await import("../src/lib/rag/client");
  const { rerankChunks } = await import("../src/lib/rag/rerank");

  // 1. 建索引（每个切片配置一套）
  const cache = loadCache();
  let cacheDirty = false;
  let embeddingCalls = 0;

  const embedMissing = async (texts: string[]) => {
    const missing = [
      ...new Set(
        texts.filter((t) => args.refresh || !cache[sha256(t)])
      ),
    ];
    if (missing.length === 0) return;
    console.log(`[eval] 需要生成向量: ${missing.length} 条`);
    const vectors = await embedTexts(missing);
    embeddingCalls += Math.ceil(missing.length / EMBEDDING_BATCH);
    if (vectors.length !== missing.length) {
      throw new Error(`向量数量不一致: ${vectors.length}/${missing.length}`);
    }
    missing.forEach((text, i) => {
      cache[sha256(text)] = { model: "text-embedding-v4", vector: vectors[i] };
    });
    cacheDirty = true;
    saveCache(cache);
  };

  const indices = new Map<
    string,
    { chunks: EvalChunk[]; vectors: Map<string, number[]>; labels: Map<string, Set<string>> }
  >();

  for (const cfg of configs) {
    const chunks = chunkDocs(docs, cfg, chunkers);
    await embedMissing(chunks.map((c) => c.content));
    const vectors = new Map(
      chunks.map((c) => [sha256(c.content), cache[sha256(c.content)].vector])
    );
    const labels = new Map(questions.map((q) => [q.id, relevantSet(chunks, q)]));
    const misses = questions.filter(
      (q) => q.type !== "no-answer" && (labels.get(q.id)?.size ?? 0) === 0
    ).length;
    console.log(
      `[eval] 配置 ${cfg.id}: ${chunks.length} 个分片` +
        (misses > 0 ? `，⚠️ ${misses} 道题找不到任何相关分片` : "")
    );
    indices.set(cfg.id, { chunks, vectors, labels });
  }

  // 2. 查询向量（逐条调用，顺便记录真实 embedding 延迟）
  const queryVectors = new Map<string, number[]>();
  const embedMs: number[] = [];
  for (const q of questions) {
    const started = performance.now();
    const [vector] = await embedTexts([q.query]);
    embeddingCalls += 1;
    embedMs.push(performance.now() - started);
    queryVectors.set(q.id, vector);
  }
  if (cacheDirty) saveCache(cache);

  // 3. 跑题
  const allRuns: Array<{
    config: string;
    variant: "vector" | "rerank";
    pool: number;
    runs: QuestionRun[];
  }> = [];
  const usage = { rerankCalls: 0, rerankDocs: 0 };

  for (const cfg of configs) {
    const { chunks, vectors, labels } = indices.get(cfg.id)!;
    const vectorRuns: QuestionRun[] = [];
    const rerankRuns = new Map<number, QuestionRun[]>(
      args.pools.map((p) => [p, []])
    );
    process.stdout.write(`[eval] 跑 ${cfg.id} ...`);

    for (const q of questions) {
      const qv = queryVectors.get(q.id)!;
      const rankedAll = rankChunks(chunks, vectors, qv);
      const relevant = labels.get(q.id)!;
      const base = {
        id: q.id,
        type: q.type,
        query: q.query,
        relevantTotal: relevant.size,
        top1Score: rankedAll[0]?.similarity ?? 0,
      };

      // 纯向量：直接从全量排序取前 5；Recall@20 用前 20
      const vectorTop20 = rankedAll.slice(0, RECALL_METRIC_K).map(chunkKey);
      const vectorTop5 = vectorTop20.slice(0, TOP_K);
      const vectorRankByKey = new Map(vectorTop20.map((k, i) => [k, i + 1]));
      const vectorRanks = [...relevant]
        .map((k) => vectorRankByKey.get(k) ?? 0)
        .filter(Boolean)
        .sort((a, b) => a - b);

      vectorRuns.push({
        ...base,
        vectorTop5,
        vectorTop20,
        vectorRanks,
        rerankTop5: vectorTop5,
        rerankTop20: vectorTop20,
        rerankRanks: vectorRanks,
        rerankFailed: false,
        rerankMs: 0,
      });

      // 重排：每个候选池大小各跑一次（池子只影响送什么给 cross-encoder）
      for (const pool of args.pools) {
        const candidates = rankedAll.slice(0, pool);
        const vectorTop20ForPool = candidates
          .slice(0, RECALL_METRIC_K)
          .map(chunkKey);

        const started = performance.now();
        let outcome: Awaited<ReturnType<typeof rerankChunks>> = null;
        try {
          usage.rerankCalls += 1;
          usage.rerankDocs += candidates.length;
          outcome = await rerankChunks(
            q.query,
            candidates.map((c) => ({
              id: chunkKey(c),
              sourceName: c.sourceName,
              sourceType: c.sourceType,
              chunkIndex: c.chunkIndex,
              content: c.content,
              createdAt: new Date(0),
              similarity: c.similarity,
            }))
          );
        } catch (err) {
          // rerankChunks 自己会吞掉失败并返回 null；这里只兜底意外异常
          console.warn(`\n[eval] ${cfg.id}/pool${pool}/${q.id} 重排异常:`, err);
        }
        const rerankMs = performance.now() - started;

        let rerankTop20 = vectorTop20ForPool;
        let rerankTop5 = rerankTop20.slice(0, TOP_K);
        let rerankRanks: number[] = [];
        let rerankModel: string | undefined;
        let rerankFailed = false;
        let rerankTop1Score: number | undefined;

        if (outcome) {
          rerankModel = outcome.model;
          const orderedKeys = outcome.ordered.map(chunkKey);
          rerankTop20 = orderedKeys.slice(0, RECALL_METRIC_K);
          rerankTop5 = orderedKeys.slice(0, TOP_K);
          const rankByKey = new Map(orderedKeys.map((k, i) => [k, i + 1]));
          rerankRanks = [...relevant]
            .map((k) => rankByKey.get(k) ?? 0)
            .filter(Boolean)
            .sort((a, b) => a - b);
          const topId = outcome.ordered[0]?.id;
          rerankTop1Score = topId ? outcome.scoreById.get(topId) : undefined;
        } else {
          rerankFailed = true;
          // 降级为向量序（与线上行为一致）
          const poolRankByKey = new Map(
            candidates.map((c, i) => [chunkKey(c), i + 1])
          );
          rerankRanks = [...relevant]
            .map((k) => poolRankByKey.get(k) ?? 0)
            .filter(Boolean)
            .sort((a, b) => a - b);
          rerankTop1Score = candidates[0]?.similarity;
        }

        rerankRuns.get(pool)!.push({
          ...base,
          vectorTop5,
          vectorTop20,
          vectorRanks,
          rerankTop5,
          rerankTop20,
          rerankRanks,
          rerankTop1Score,
          rerankModel,
          rerankFailed,
          rerankMs,
        });
      }
    }

    process.stdout.write(` ${questions.length} 题\n`);
    allRuns.push({
      config: cfg.id,
      variant: "vector",
      pool: RECALL_METRIC_K,
      runs: vectorRuns,
    });
    for (const pool of args.pools) {
      allRuns.push({
        config: cfg.id,
        variant: "rerank",
        pool,
        runs: rerankRuns.get(pool)!,
      });
    }
  }

  // 4. 汇总
  const aggregates: Aggregate[] = [];
  for (const { config, variant, pool, runs } of allRuns) {
    const { labels } = indices.get(config)!;
    aggregates.push(
      aggregate(runs, questions, config, variant, pool, embedMs, labels)
    );
  }

  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  console.log(
    "\n配置         变体    池   Hit@5   Hit@20  Recall@20  MRR@5   NDCG@5  embed(mean/p95)  rerank(mean/p95)  失败"
  );
  for (const a of aggregates) {
    console.log(
      `${a.config.padEnd(13)}${a.variant.padEnd(7)}${String(a.pool).padStart(3)} ` +
        `${pct(a.hit5).padStart(6)}  ${pct(a.hit20).padStart(6)}  ${pct(a.recall20).padStart(9)}  ` +
        `${pct(a.mrr5).padStart(6)}  ${pct(a.ndcg5).padStart(6)}  ` +
        `${a.embedMeanMs.toFixed(0).padStart(6)}/${a.embedP95Ms.toFixed(0).padStart(5)}ms  ` +
        `${a.rerankMeanMs.toFixed(0).padStart(6)}/${a.rerankP95Ms.toFixed(0).padStart(5)}ms  ` +
        `${a.rerankFailures}`
    );
    const types = Object.entries(a.byType)
      .map(([t, v]) => `${t} ${v.n}题 hit5=${pct(v.hit5)} mrr=${pct(v.mrr5)}`)
      .join("；");
    console.log(`  ${types}`);
    console.log(
      `  无答案 ${a.noAnswer.n} 题：top1 分数均值 ${a.noAnswer.top1Mean.toFixed(4)}` +
        (a.labelMisses ? `；${a.labelMisses} 题标注失配已排除` : "")
    );
  }
  console.log(
    `\n调用量：embedding ${embeddingCalls} 次（含查询，命中缓存的不计），` +
      `重排 ${usage.rerankCalls} 次 / ${usage.rerankDocs} 篇文档`
  );

  const outPath =
    args.out ??
    `eval/rag/results/${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        docs: docs.map((d) => ({ sourceName: d.sourceName, chars: d.content.length })),
        questions: questions.length,
        aggregates,
        usage: {
          ...usage,
          embeddingCalls,
        },
        runs: allRuns,
      },
      null,
      2
    ),
    "utf-8"
  );
  console.log(`结果已写入 ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

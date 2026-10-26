# RAG 检索评测

用一组带标注的真实问题，量化“当前召回池 / 重排 / 切片参数是否真的有用”。

脚本：`scripts/eval-rag.ts`

## 快速开始

```bash
# 1. 先只校验题目标注，不调用任何 API
npx tsx scripts/eval-rag.ts --validate-only --exclude 个人简历.docx

# 2. 跑完整评测（默认 40 题 × 4 种切片配置）
npx tsx scripts/eval-rag.ts --exclude 个人简历.docx

# 3. 只比较重排池大小
npx tsx scripts/eval-rag.ts --exclude 个人简历.docx --configs current --pools 20,30,50

# 4. 只跑前 5 题做冒烟
npx tsx scripts/eval-rag.ts --exclude 个人简历.docx --configs current --limit 5
```

语料默认从数据库的 `knowledgedoc` 读取（原始上传文本）。也可以用 `--docs <目录>`
直接读 `.md` / `.txt` 文件。没有 `knowledgedoc` 记录的历史文档会被跳过。

## 题目格式

`questions.local.jsonl`，一行一道题：

```json
{"id":"q01","type":"fact","query":"这个学习计划总共多少周？","evidence":[{"sourceName":"PLAN.md","quote":"用 8 周建立 AI Agent 的工程化能力"}]}
```

| 字段 | 说明 |
| --- | --- |
| `id` | 唯一编号 |
| `type` | `fact` 具体事实 / `concept` 概念理解 / `cross` 跨段落或多文档 / `no-answer` 知识库没有答案 |
| `query` | 用户会真的问出口的问题 |
| `evidence` | 可答题必填。`quote` 必须是 `sourceName` 原文里的连续片段（空白不敏感） |

无答案题的 `evidence` 为空数组。

**标注要点**

- 引用原文，不要改写。校验会逐条检查 quote 是否真的在文档里。
- quote 至少 8 个字；建议一整句，便于在任意切片配置下定位。
- 跨段落题给多条 evidence，分别指向不同段落/文档。
- 无答案题要“看起来合理但知识库里确实没有”，不要拿知识库能回答的问题凑数。

## 指标

| 指标 | 含义 |
| --- | --- |
| Hit@5 / Hit@20 | 问题级：至少一个相关片段进入前 5 / 前 20 |
| Recall@20 | 片段级：前 20 命中的相关片段数 / 该题全部相关片段数 |
| MRR@5 | 第一个相关片段排名的倒数（不在前 5 记 0） |
| NDCG@5 | 二值相关性的归一化折损累计增益 |
| 无答案题 | 不参与上述指标，单独报告 top1 分数，用来判断能否用阈值拒答 |

相关性判定：分片文本包含 evidence（忽略空白）即相关；如果 evidence 跨分片边界，
共享 ≥30 个连续字符也算命中。所以切片参数不同也能公平比较。

## 切片配置

| 配置 | 行为 |
| --- | --- |
| `current` | 与线上一致：Markdown 用 `splitMarkdown(800)`，其他用 `splitText(500, 50)` |
| `flat-300-50` | 所有文档 `splitText(300, 50)` |
| `flat-500-50` | 所有文档 `splitText(500, 50)` |
| `flat-800-100` | 所有文档 `splitText(800, 100)` |

`--pools` 只影响重排候选池；纯向量结果不随池大小变化。

## 成本与缓存

- 分片向量缓存在 `eval/rag/.cache/embeddings.json`，按文本 hash 复用；
  换 embedding 模型后请删除该文件或加 `--refresh-embeddings`。
- 报告里的“调用量”是 embedding / 重排调用次数与送排文档数。没有内置价格表，
  需要金额时乘当时单价。
- 查询向量逐条生成，所以报告里的 embed 延迟是线上单次查询的真实量级；
  分片向量属于离线建库，不计入查询延迟。

## 本地文件

`questions.local.jsonl`、`.cache/`、`results/` 已在 `.gitignore` 中：
题目引用真实文档内容，只保留在本地。结果 JSON 含每题 top5 与排名，便于复查。

// ============================================================
// Memory v2 抽取：门控 + 候选入队 + LLM 抽取 + 交给 Manager 提交
//
// 成本控制：
//   · 规则门控先挡掉大部分寒暄；
//   · 每 3 轮兜底一次；
//   · 每轮最多 1 次 LOW 档调用。
//
// 可靠性：
//   · 先落 memorycandidate（messageId 唯一），再调模型；
//   · 失败/进程重启由每日任务继续处理；
//   · 模型输出只是候选，最终由 manager.ts 校验并写库。
// ============================================================

import { prisma } from "@/lib/prisma";
import { completionsWithFallback } from "@/lib/model-pool";
import { extractJsonText } from "@/lib/llm-json";
import { embedText } from "@/lib/rag/client";
import {
  countAssistantMessagesSince,
  createCandidate,
  findCandidateById,
  findLatestCandidateForConversation,
  listExtractionContextMemories,
  listRecentConversationMessages,
  listResumableCandidates,
  markCandidate,
} from "./store";
import {
  EXTRACTION_PROMPT,
  buildExtractionUserMessage,
} from "./extraction-prompt";
import { validateRawOperations } from "./validation";
import { commitCandidate } from "./manager";
import { CORRECTION_SIGNAL, evaluateExtractionGate } from "./gate";
import type {
  ExtractionGateDecision,
  MemorySourceType,
} from "./types";

const MAX_ATTEMPTS = 3;
const STALE_RUNNING_MS = 10 * 60 * 1000;

/** 从数据库读取“距离上次抽取过了几条助手消息”，再套规则。 */
export async function decideExtraction(input: {
  userId: string;
  conversationId: string;
  userMessage: string;
}): Promise<ExtractionGateDecision> {
  const latest = await findLatestCandidateForConversation(
    input.conversationId
  );
  const since = latest?.createdAt ?? new Date(0);
  const assistantTurns = await countAssistantMessagesSince(
    input.conversationId,
    since
  );
  return evaluateExtractionGate({
    userMessage: input.userMessage,
    assistantTurnsSinceLastExtraction: assistantTurns,
  });
}

/**
 * 回复落库后调用。
 *
 * 只有门控通过才创建 candidate；创建成功后异步处理，不阻塞响应。
 * 返回值方便日志/调试，调用方通常不需要 await 处理结果。
 */
export async function scheduleExtraction(input: {
  userId: string;
  conversationId: string | null;
  messageId: string;
  userMessage: string;
}): Promise<ExtractionGateDecision> {
  if (!input.conversationId) {
    return { shouldExtract: false, reason: "not_eligible" };
  }

  const gate = await decideExtraction({
    userId: input.userId,
    conversationId: input.conversationId,
    userMessage: input.userMessage,
  });
  if (!gate.shouldExtract) return gate;

  const { created, candidateId } = await createCandidate({
    userId: input.userId,
    conversationId: input.conversationId,
    messageId: input.messageId,
  });
  if (created && candidateId) {
    // fire-and-forget：失败会落到 candidate.status=failed，由每日任务重试
    void processCandidate(candidateId).catch((error) => {
      console.error("[Memory] 候选处理异常:", error);
    });
  }
  return gate;
}

/**
 * 处理一个候选：抽取 → 校验 → 提交。
 *
 * 幂等：
 *   · ready 直接提交；
 *   · pending/failed 用 updateMany 原子抢占为 running；
 *   · done/noop/skipped 直接返回。
 */
export async function processCandidate(candidateId: string): Promise<void> {
  const initial = await findCandidateById(candidateId);
  if (!initial) return;
  if (
    initial.status === "done" ||
    initial.status === "noop" ||
    initial.status === "skipped"
  ) {
    return;
  }

  if (initial.status === "ready") {
    try {
      await commitCandidate(candidateId);
    } catch (error) {
      await markCandidate(candidateId, {
        status: "failed",
        error: (error instanceof Error ? error.message : String(error)).slice(
          0,
          500
        ),
        processedAt: new Date(),
      });
    }
    return;
  }

  const claim = await prisma.memoryCandidate.updateMany({
    where: {
      id: candidateId,
      status: { in: ["pending", "failed"] },
      attempts: { lt: MAX_ATTEMPTS },
    },
    data: {
      status: "running",
      attempts: { increment: 1 },
      // 置空让 runCandidateQueue 能在进程崩溃后识别“卡死的 running”
      processedAt: null,
    },
  });

  if (claim.count === 0) {
    // 可能是并发已经把它推到 ready，或者已经达到重试上限
    const latest = await findCandidateById(candidateId);
    if (latest?.status === "ready") await commitCandidate(candidateId);
    return;
  }

  const candidate = await findCandidateById(candidateId);
  if (!candidate) return;

  if (!candidate.conversationId) {
    await markCandidate(candidateId, {
      status: "failed",
      error: "missing_conversation",
      processedAt: new Date(),
    });
    return;
  }

  try {
    const messages = await listRecentConversationMessages(
      candidate.conversationId,
      candidate.messageId,
      6
    );
    if (messages.length === 0) {
      await markCandidate(candidateId, {
        status: "skipped",
        error: "no_messages",
        processedAt: new Date(),
      });
      return;
    }

    const userMessages = messages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .filter((content) => content.trim() !== "");

    if (userMessages.length === 0) {
      await markCandidate(candidateId, {
        status: "noop",
        processedAt: new Date(),
      });
      return;
    }

    const lastUserMessage = userMessages[userMessages.length - 1];

    let queryEmbedding: number[] | null = null;
    try {
      queryEmbedding = await embedText(lastUserMessage);
    } catch (error) {
      console.warn("[Memory] 抽取时 embedding 失败，使用重要度兜底:", error);
    }

    const existing = await listExtractionContextMemories(
      candidate.userId,
      queryEmbedding,
      12
    );

    const { data: response, model } = await completionsWithFallback(
      "low",
      (entry, client, extraBody) =>
        client.chat.completions.create({
          model: entry.modelName,
          messages: [
            { role: "system", content: EXTRACTION_PROMPT },
            {
              role: "user",
              content: buildExtractionUserMessage({
                messages: messages.map((m) => ({
                  role: m.role,
                  content: m.content,
                })),
                existing,
              }),
            },
          ],
          temperature: 0.2,
          max_tokens: 700,
          response_format: { type: "json_object" },
          ...extraBody,
        }),
      { userId: candidate.userId, surface: "memory" }
    );

    const text = response.choices[0]?.message?.content?.trim();
    if (!text) throw new Error("extraction_empty_response");

    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJsonText(text));
    } catch {
      throw new Error("extraction_json_parse_failed");
    }

    const sourceType: MemorySourceType = userMessages.some((message) =>
      CORRECTION_SIGNAL.test(message)
    )
      ? "user_correction"
      : "user_statement";

    const validation = validateRawOperations(parsed, {
      userMessages,
      existing: existing.map((m) => ({
        id: m.id,
        kind: m.kind,
        content: m.content,
        normalizedKey: m.normalizedKey,
      })),
      sourceType,
    });

    if (validation.rejected.length > 0) {
      console.warn(
        `[Memory] 候选 ${candidateId} 丢弃 ${validation.rejected.length} 条非法操作:`,
        validation.rejected
      );
    }

    const actionable = validation.operations.filter(
      (operation) => operation.op !== "NOOP"
    );

    if (actionable.length === 0) {
      await markCandidate(candidateId, {
        status: "noop",
        model,
        rawOutput: parsed,
        operations: validation.operations,
        processedAt: new Date(),
      });
      return;
    }

    await markCandidate(candidateId, {
      status: "ready",
      model,
      rawOutput: parsed,
      operations: validation.operations,
      error: null,
      processedAt: new Date(),
    });

    await commitCandidate(candidateId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Memory] 抽取失败:", message);
    await markCandidate(candidateId, {
      status: "failed",
      error: message.slice(0, 500),
      processedAt: new Date(),
    });
  }
}

/**
 * 每日任务/补偿入口：处理该用户（或全量）可继续的候选。
 */
export async function runCandidateQueue(options?: {
  userId?: string;
  limit?: number;
}): Promise<{ examined: number; processed: number; failed: number }> {
  // 进程重启后遗留的 running 行，超过 10 分钟视为卡死，放回 pending
  await prisma.memoryCandidate.updateMany({
    where: {
      ...(options?.userId ? { userId: options.userId } : {}),
      status: "running",
      processedAt: null,
      createdAt: { lt: new Date(Date.now() - STALE_RUNNING_MS) },
    },
    data: { status: "pending" },
  });

  const candidates = await listResumableCandidates(options);
  let processed = 0;
  let failed = 0;

  for (const candidate of candidates) {
    try {
      await processCandidate(candidate.id);
      processed++;
    } catch (error) {
      failed++;
      console.error("[Memory] 队列处理失败:", error);
    }
  }

  return { examined: candidates.length, processed, failed };
}

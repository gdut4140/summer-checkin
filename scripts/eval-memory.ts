/* ============================================================
 * Memory v2 抽取质量评测
 *
 * 用固定用例跑真实的 LOW 档模型，输出可复现的数字：
 *   · 每个用例是否命中期望操作
 *   · Extraction Precision / Recall（仅统计可执行操作）
 *   · Operation Accuracy（op + target + kind + 内容片段）
 *
 * 不走数据库：existing memories 由用例提供，校验逻辑复用 validation.ts。
 *
 * 用法:
 *   npx tsx scripts/eval-memory.ts
 *   npx tsx scripts/eval-memory.ts --limit 5
 *   npx tsx scripts/eval-memory.ts --only explicit_delete
 *   npx tsx scripts/eval-memory.ts --validate-only
 * ============================================================ */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

import { readFileSync } from "node:fs";

interface CaseMessage {
  role: string;
  content: string;
}

interface ExistingMemory {
  id: string;
  kind: string;
  content: string;
  normalizedKey: string | null;
}

interface ExpectedOperation {
  anyOf: string[];
  kind?: string;
  contentContains?: string;
  targetId?: string;
}

interface EvalCase {
  name: string;
  messages: CaseMessage[];
  existing: ExistingMemory[];
  expected: ExpectedOperation;
}

function loadCases(path = "eval/memory/cases.json"): EvalCase[] {
  return JSON.parse(readFileSync(path, "utf8")) as EvalCase[];
}

function validateCases(cases: EvalCase[]): string[] {
  const errors: string[] = [];
  for (const item of cases) {
    if (!item.name) errors.push("case 缺少 name");
    if (!Array.isArray(item.messages) || item.messages.length === 0) {
      errors.push(`${item.name}: messages 为空`);
    }
    if (!item.expected?.anyOf?.length) {
      errors.push(`${item.name}: expected.anyOf 为空`);
    }
    for (const op of item.expected?.anyOf ?? []) {
      if (!["ADD", "UPDATE", "DELETE", "NOOP"].includes(op)) {
        errors.push(`${item.name}: 未知期望操作 ${op}`);
      }
    }
  }
  return errors;
}

async function main() {
  const args = process.argv.slice(2);
  const validateOnly = args.includes("--validate-only");
  const limitIndex = args.indexOf("--limit");
  const limit =
    limitIndex >= 0 ? Number(args[limitIndex + 1] ?? 0) || undefined : undefined;
  const onlyIndex = args.indexOf("--only");
  const only = onlyIndex >= 0 ? args[onlyIndex + 1] : undefined;

  const cases = loadCases();
  const errors = validateCases(cases);
  if (errors.length > 0) {
    console.error("用例校验失败:\n" + errors.map((e) => `  - ${e}`).join("\n"));
    process.exit(1);
  }
  console.log(`用例校验通过：${cases.length} 个`);
  if (validateOnly) return;

  // 动态 import：保证 dotenv 先加载，model-pool 才能拿到 API key
  const { completionsWithFallback } = await import("../src/lib/model-pool");
  const { EXTRACTION_PROMPT, buildExtractionUserMessage } = await import(
    "../src/lib/memory/extraction-prompt"
  );
  const { validateRawOperations } = await import(
    "../src/lib/memory/validation"
  );
  const { extractJsonText } = await import("../src/lib/llm-json");

  const selected = (only ? cases.filter((c) => c.name === only) : cases).slice(
    0,
    limit ?? Number.POSITIVE_INFINITY
  );
  if (selected.length === 0) {
    console.error(`没有匹配的用例: ${only ?? "(全部)"}`);
    process.exit(1);
  }

  let passed = 0;
  let actionableExpected = 0;
  let actionableActual = 0;
  let actionableMatched = 0;

  for (const item of selected) {
    const userMessages = item.messages
      .filter((m) => m.role === "user")
      .map((m) => m.content);

    try {
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
                  messages: item.messages,
                  existing: item.existing.map((m) => ({
                    id: m.id,
                    kind: m.kind as never,
                    content: m.content,
                    normalizedKey: m.normalizedKey,
                    importance: 0.5,
                    confidence: 0.8,
                    similarity: 0,
                  })),
                }),
              },
            ],
            temperature: 0.2,
            max_tokens: 700,
            response_format: { type: "json_object" },
            ...extraBody,
          })
        // 评测不记账：没有真实 userId，也不该占用任何用户的额度
      );

      const text = response.choices[0]?.message?.content?.trim() ?? "";
      let parsed: unknown = {};
      try {
        parsed = JSON.parse(extractJsonText(text));
      } catch {
        // 解析失败按空操作处理，计入失败
      }

      const validation = validateRawOperations(parsed, {
        userMessages,
        existing: item.existing.map((m) => ({
          id: m.id,
          kind: m.kind as never,
          content: m.content,
          normalizedKey: m.normalizedKey,
        })),
        sourceType: "user_statement",
      });

      const actual = validation.operations;
      const actualActionable = actual.filter((op) => op.op !== "NOOP");
      const expectedActionable = item.expected.anyOf.filter(
        (op) => op !== "NOOP"
      );

      const existingKindById = new Map(
        item.existing.map((m) => [m.id, m.kind])
      );
      const matchedExpected = expectedActionable.length > 0;
      const match = matchedExpected
        ? actual.some((op) => {
            const opKind =
              "kind" in op
                ? op.kind
                : "targetId" in op
                  ? existingKindById.get(op.targetId)
                  : undefined;
            return (
              item.expected.anyOf.includes(op.op) &&
              (!item.expected.kind || opKind === item.expected.kind) &&
              (!item.expected.contentContains ||
                ("content" in op &&
                  op.content.includes(item.expected.contentContains))) &&
              (!item.expected.targetId ||
                ("targetId" in op &&
                  op.targetId === item.expected.targetId))
            );
          })
        : actualActionable.length === 0 ||
          actual.every((op) => op.op === "NOOP");

      if (match) passed++;
      if (matchedExpected) {
        actionableExpected++;
        actionableActual += actualActionable.length;
        actionableMatched += match ? 1 : 0;
      }

      const actualSummary =
        actual.length === 0
          ? "(空)"
          : actual
              .map((op) =>
                op.op === "NOOP"
                  ? "NOOP"
                  : `${op.op} ${"kind" in op ? op.kind : ""} ${
                      "content" in op ? op.content : ""
                    }`.trim()
              )
              .join(" | ");

      console.log(
        `${match ? "✅" : "❌"} ${item.name.padEnd(30)} model=${model}\n` +
          `   expected: ${item.expected.anyOf.join("/")} ${
            item.expected.kind ?? ""
          } ${item.expected.contentContains ?? ""}\n` +
          `   actual:   ${actualSummary}`
      );

      if (validation.rejected.length > 0) {
        console.log(
          `   rejected: ${validation.rejected
            .map((r) => `${r.reason}@${r.index}`)
            .join(", ")}`
        );
        console.log(`   raw: ${JSON.stringify(parsed)}`);
      }
    } catch (error) {
      console.error(`❌ ${item.name}: 调用失败`, error);
    }
  }

  const precision =
    actionableActual === 0
      ? actionableExpected === 0
        ? 1
        : 0
      : actionableMatched / actionableActual;
  const recall =
    actionableExpected === 0 ? 1 : actionableMatched / actionableExpected;

  console.log("\n================ 结果 ================");
  console.log(`Pass:                 ${passed}/${selected.length}`);
  console.log(`Extraction Precision: ${precision.toFixed(2)}`);
  console.log(`Extraction Recall:    ${recall.toFixed(2)}`);
  console.log(
    `Operation Accuracy:   ${(passed / selected.length).toFixed(2)}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

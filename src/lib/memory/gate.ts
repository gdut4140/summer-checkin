// ============================================================
// Memory v2 抽取门控（纯函数）
//
// 独立成文件是为了：
//   · 单测不需要拉起 Prisma / 模型池；
//   · 门控规则与抽取流程解耦，调参时只改这里。
// ============================================================

import type { ExtractionGateDecision } from "./types";

/** 明确的记忆指令（不依赖“我 + 谓语”的句式） */
export const EXPLICIT_SIGNAL =
  /(记住|记一下|以后都|从现在开始|不要再|帮我记住)/;

/**
 * 自我披露信号。
 *
 * 中文口语很少严格以“我是/我用”开头：“喜欢吃奥利奥”同样是在提供个人信息。
 * 所以不再强制要求出现“我”，改为「披露谓词 + 不是提问 + 不是请求」。
 * 门控只负责控制成本，误触发的代价是一次 LOW 档调用，由模型返回 NOOP。
 */
export const SELF_DISCLOSURE =
  /(使用|用|学|做|准备|计划|目标|喜欢|爱吃|享受|偏好|习惯|擅长|不擅长|容易|想|正在|目前|最近|以前|之前|会|掌握|讨厌|需要|希望|专业|工作|实习|面试|住在|来自|年级|岁)/;

/** 提问句：不把“怎么学习 React？”“我喜欢吃什么”当成用户披露。 */
const QUESTION =
  /[?？]|(吗|呢)\s*$|怎么|如何|为什么|什么|哪些|哪个|多少|是否|能不能|可不可以|是不是|要不要|该不该/;

/** 请求句：不把“帮我用 React 写个组件”当成用户披露。 */
const REQUEST_INTENT =
  /^(帮我|请|给我|麻烦|能不能|可以|写|做|改|查|找|生成|拆|列|推荐|介绍|解释|搜|打开|创建|删除)/;

/** 修正旧信息 / 改变偏好的信号 */
export const CORRECTION_SIGNAL =
  /(之前|以前|原来|此前|说错|改成|纠正|不再|已经换成|转向|转到)/;

/**
 * 规则门控。
 *
 * @param assistantTurnsSinceLastExtraction 距离上次抽取已经过了几条助手消息
 */
export function evaluateExtractionGate(input: {
  userMessage: string;
  assistantTurnsSinceLastExtraction: number;
}): ExtractionGateDecision {
  const message = input.userMessage.trim();

  if (message.length < 4) {
    // “记住”这种短指令仍可能携带信息（如“记住：我用 React”），单独放行
    if (!/记住|记一下/.test(message)) {
      return { shouldExtract: false, reason: "too_short" };
    }
  }

  const isCorrection = CORRECTION_SIGNAL.test(message) && /我/.test(message);
  if (isCorrection) {
    return { shouldExtract: true, reason: "correction" };
  }

  const isQuestion = QUESTION.test(message);
  const isRequest = REQUEST_INTENT.test(message);
  const isSelfDisclosure = SELF_DISCLOSURE.test(message) && !isQuestion && !isRequest;

  if (isSelfDisclosure || EXPLICIT_SIGNAL.test(message)) {
    return { shouldExtract: true, reason: "explicit_signal" };
  }

  if (input.assistantTurnsSinceLastExtraction >= 2) {
    return { shouldExtract: true, reason: "every_three_turns" };
  }

  return { shouldExtract: false, reason: "not_eligible" };
}

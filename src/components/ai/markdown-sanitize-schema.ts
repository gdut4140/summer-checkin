import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

/**
 * rehype-sanitize 的白名单类型。它自己没导出，从插件签名里取，
 * 免得为了一个类型去直接依赖它的传递依赖 hast-util-sanitize。
 */
type SanitizeSchema = NonNullable<Parameters<typeof rehypeSanitize>[0]>;

/**
 * Markdown 渲染的 HTML 净化白名单（rehype-sanitize）
 *
 * 渲染器的输入都是不可信内容：AI 输出（可被 prompt injection 影响）、用户导入的 .md、
 * 聊天室里他人发的消息。而 rehype-raw 会把其中的原生 HTML 解析成真实 DOM，所以必须过白名单。
 *
 * 以 GitHub 默认白名单为基线，只做两处扩展：
 *  1. 补回本项目有意支持、但默认被禁的标签：mark（==高亮==）/ u / figure / figcaption
 *  2. 放开 KaTeX 依赖的 className —— remark-math 产出 <span class="math math-inline"> 与
 *     <div class="math math-display">，rehype-katex 靠它识别公式节点。收窄为 math* 而非放开任意类名。
 *
 * 放置位置有硬性要求：在 rehypePlugins 里必须紧跟在 rehype-raw 之后、rehype-katex / rehype-highlight
 * 之前。若放到最后，KaTeX 生成的 style 与 MathML 会被一并清掉，公式会退化成纯文本。
 *
 * 单独成模块（而不是写在 markdown-renderer.tsx 里）是为了让 tests/markdown-sanitize.test.ts
 * 直接导入同一份定义。测试里另抄一份白名单会随实现漂移，变成假绿灯。
 */
export const SANITIZE_SCHEMA: SanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "mark", "u", "figure", "figcaption"],
  attributes: {
    ...defaultSchema.attributes,
    span: [...(defaultSchema.attributes?.span ?? []), ["className", /^math(-inline)?$/]],
    div: [...(defaultSchema.attributes?.div ?? []), ["className", /^math(-display)?$/]],
  },
};

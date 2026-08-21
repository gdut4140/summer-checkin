"use client";

import { motion } from "motion/react";
import { BookOpen, Books, Calculator, Code, ListBullets, NotePencil, Sparkle, Table } from "@phosphor-icons/react";

const features = [
  { icon: ListBullets, label: "标题大纲", desc: "自动生成文档目录，点击跳转" },
  { icon: Code, label: "代码高亮", desc: "200+ 语言语法着色" },
  { icon: Calculator, label: "LaTeX 公式", desc: "行内与块级数学公式渲染" },
  { icon: Table, label: "表格/任务", desc: "GFM 表格与复选框任务列表" },
  { icon: NotePencil, label: "所见即所得", desc: "实时预览 + 左右对照编辑" },
  { icon: Sparkle, label: "AI 协作", desc: "框选文字让 AI 解释或改写" },
];

const docOutline = [
  { level: 1, text: "React 核心原理笔记" },
  { level: 2, text: "一、虚拟 DOM 与 Diff 算法" },
  { level: 3, text: "1.1 什么是虚拟 DOM" },
  { level: 3, text: "1.2 Diff 的时间复杂度" },
  { level: 2, text: "二、Hooks 深入理解" },
  { level: 3, text: "2.1 useState 的闭包陷阱" },
  { level: 3, text: "2.2 useEffect 依赖数组" },
];

export function StudioShowcase() {
  return (
    <section className="bg-[#0a2618]/60 px-4 py-20 text-white md:px-8 md:py-28">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-center">
          
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6 }}
          >
            <p className="text-sm font-semibold text-[#d7ef83]">Markdown 阅读器</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight md:text-5xl">
              一份笔记，<br />
              就是你的<span className="text-[#d7ef83]">知识花园</span>
            </h2>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-white/56">
              Summer Checkin 内置完整的 Markdown 阅读器与编辑器，支持代码高亮、数学公式、
              表格、任务列表。框选任意文字，直接让 AI 帮你解释、总结或改写。
            </p>

            <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {features.map(({ icon: Icon, label, desc }, i) => (
                <motion.div
                  key={label}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.06 }}
                  className="rounded-lg border border-white/8 bg-[#071d16]/70 p-4"
                >
                  <Icon className="size-5 text-[#d7ef83]" weight="duotone" />
                  <p className="mt-3 text-sm font-medium">{label}</p>
                  <p className="mt-1 text-[11px] leading-4 text-white/40">{desc}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="lg:pl-8"
          >
            <div className="overflow-hidden rounded-lg border border-white/10 bg-[#061510] shadow-xl">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <BookOpen className="size-4 text-white/40" />
                  <span className="text-xs text-white/60">React 核心原理笔记.md</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="flex items-center gap-1 rounded-full bg-[#d7ef83]/15 px-2 py-0.5 text-[10px] text-[#d7ef83]">
                    <Sparkle className="size-2.5" weight="fill" />
                    AI 已就绪
                  </div>
                  <Books className="size-3.5 text-white/30" />
                </div>
              </div>

              <div className="grid grid-cols-[140px_1fr]">
                <aside className="border-r border-white/8 p-3">
                  <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-white/30">目录</p>
                  <div className="space-y-1.5">
                    {docOutline.map((item, i) => (
                      <div
                        key={i}
                        className={`text-[11px] leading-4 ${
                          item.level === 1
                            ? "font-semibold text-white/80"
                            : item.level === 2
                            ? "pl-2 text-white/55"
                            : "pl-4 text-white/35"
                        }`}
                      >
                        {item.text}
                      </div>
                    ))}
                  </div>
                </aside>

                <div className="p-5">
                  <h3 className="text-lg font-bold text-white/90">虚拟 DOM 与 Diff 算法</h3>
                  <p className="mt-2 text-xs leading-5 text-white/50">
                    React 通过在内存中维护一棵虚拟 DOM 树，当状态变化时
                    对比<strong className="text-[#d7ef83]">新旧两棵树的差异</strong>，
                    最小化真实 DOM 操作。
                  </p>

                  <div className="mt-3 rounded border border-white/10 bg-black/30 p-2.5">
                    <div className="flex items-center gap-1.5 text-[10px] text-white/25">
                      <Code className="size-3" />
                      JavaScript
                    </div>
                    <pre className="mt-1.5 text-[10px] leading-4 text-white/60">
                      {"function diff(oldNode, newNode) {\n  // 深度遍历 + key 复用\n  if (oldNode.type === newNode.type) {\n    updateProps(oldNode, newNode);\n  }\n}"}
                    </pre>
                  </div>

                  <div className="mt-3 flex items-start gap-2 rounded border-l-2 border-[#d7ef83] bg-[#d7ef83]/5 px-3 py-2">
                    <Sparkle className="mt-0.5 size-3.5 shrink-0 text-[#d7ef83]" weight="fill" />
                    <p className="text-[11px] leading-4 text-white/55">
                      <span className="font-medium text-white/75">AI 批注：</span>
                      时间复杂度 O(n)，利用同层比较 + key 策略优化。
                    </p>
                  </div>

                  <div className="mt-4 flex items-center justify-between text-[10px] text-white/25">
                    <span>第 2 章 / 共 6 章</span>
                    <div className="h-1 w-24 overflow-hidden rounded-full bg-white/8">
                      <div className="h-full w-[33%] rounded-full bg-[#d7ef83]" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] text-white/30">
              <span className="flex items-center gap-1"><Code className="size-3" />代码高亮</span>
              <span className="flex items-center gap-1"><Table className="size-3" />表格渲染</span>
              <span className="flex items-center gap-1"><Calculator className="size-3" />LaTeX 公式</span>
              <span className="flex items-center gap-1"><Sparkle className="size-3 text-[#d7ef83]" weight="fill" />AI 即时协助</span>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
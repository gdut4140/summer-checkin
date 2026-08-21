import { PrismaClient } from "../src/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const badges = [
  {
    name: "初次打卡",
    description: "完成你的第一次打卡",
    icon: "Circle",
    criteria: "打卡次数 >= 1",
  },
  {
    name: "连续七天",
    description: "连续打卡 7 天",
    icon: "Flame",
    criteria: "连续打卡 >= 7 天",
  },
  {
    name: "月度全勤",
    description: "连续打卡 30 天",
    icon: "Fire",
    criteria: "连续打卡 >= 30 天",
  },
  {
    name: "50 小时",
    description: "累计学习达到 50 小时",
    icon: "Clock",
    criteria: "总时长 >= 50h",
  },
  {
    name: "100 小时",
    description: "累计学习达到 100 小时",
    icon: "ClockAfternoon",
    criteria: "总时长 >= 100h",
  },
  {
    name: "科目精通",
    description: "单科学习超过 20 小时",
    icon: "BookOpen",
    criteria: "单科时长 >= 20h",
  },
  {
    name: "早起鸟",
    description: "早上 8 点前完成 5 次打卡",
    icon: "SunHorizon",
    criteria: "早起打卡 >= 5 次",
  },
  {
    name: "夜猫子",
    description: "晚上 10 点后完成 5 次打卡",
    icon: "MoonStars",
    criteria: "深夜打卡 >= 5 次",
  },
  {
    name: "规划师",
    description: "创建你的第一个学习计划",
    icon: "ListChecks",
    criteria: "学习计划 >= 1",
  },
  {
    name: "目标达成",
    description: "完成一个学习计划的目标时长",
    icon: "Trophy",
    criteria: "完成计划目标",
  },
];

// ── 新用户引导模板：注册时克隆给新用户 ──
const PLAN_TEMPLATE = {
  id: "guide-plan",
  name: "通关 Summer Checkin 计划",
  description: "按任务顺序做一遍，你就掌握了全部核心玩法。",
  goal: "用几天时间，亲手走一遍 Summer Checkin 的核心功能，完成一次完整的学习闭环。",
  document: `# 通关 Summer Checkin 计划

## 目标
用几天时间，亲手走一遍 Summer Checkin 的核心功能，完成一次完整的学习闭环。

## 计划说明
这不是一份真的学习计划，而是一份「使用指南」——按任务顺序做一遍，你就掌握了全部核心玩法。

## 任务安排
- [ ] 完成一次 25 分钟的专注（你就在专注房间里，直接开一个番茄钟）
- [ ] 去小岛完成一次打卡
- [ ] 查看统计页，看看你的成长数据
- [ ] 用「新建计划」创建一个学习计划，在 AI 框里直接告诉它你的目标
- [ ] 和 AI 助手聊一次，问一个学习问题
- [ ] 在文档系统里写一篇学习笔记

## 学习笔记
在这里记录你的通关感想…
`,
};

const DOCUMENT_TEMPLATE = {
  id: "guide-doc",
  title: "👋 欢迎使用 Summer Checkin",
  content: `# 👋 欢迎使用 Summer Checkin

欢迎来到你的学习空间。计划、专注、打卡和成长记录都放在一起，让努力可量化、可回顾。

## 你的第一天
1. **开始专注**：你就在专注房间里，开一个番茄钟，试试 25 分钟心无旁骛。
2. **去小岛打卡**：在「小岛」签到，留下今天的足迹。
3. **查看成长**：在**主页**看专注时长和连续活跃。
4. **规划目标**：当你想安排一个长期目标时，点「新建计划」，在 AI 框里告诉它你的目标，它会帮你生成计划。

## 核心功能
- **计划 / 文档工作室**：Markdown 编辑 + AI 直接修改文档。
- **AI 学习助手**：结合你的数据给个性化建议。
- **知识库**：上传学习资料，AI 问答可检索引用。
- **小岛打卡**：场景随主题切换，签到让努力有迹可循。

## 最后
学习像种一棵树，今天看不见，明天也看不见，但每一个专注的 25 分钟、每一次在小岛留下的足迹，都在悄悄往土壤里扎根。Summer Checkin 不会催促你，它只是站在你身边，把你的每一步记进风景里——真正让这棵树长大的，是你自己。

这里没有截止日期，只有温柔的见证。愿你把每一份努力种进今天，然后从容地等它发芽、生长、开花。

这篇文档属于你，可以保留、改写，也可以直接删掉。祝你学习愉快。
`,
};

async function main() {
  console.log("正在写入勋章数据...");

  for (const badge of badges) {
    await prisma.badge.upsert({
      where: { id: badge.name.toLowerCase().replace(/\s+/g, "-") },
      update: badge,
      create: {
        id: badge.name.toLowerCase().replace(/\s+/g, "-"),
        ...badge,
      },
    });
  }

  console.log(`成功写入 ${badges.length} 个勋章。`);

  console.log("正在写入新用户引导模板...");

  await prisma.planTemplate.upsert({
    where: { id: PLAN_TEMPLATE.id },
    update: PLAN_TEMPLATE,
    create: PLAN_TEMPLATE,
  });
  await prisma.documentTemplate.upsert({
    where: { id: DOCUMENT_TEMPLATE.id },
    update: DOCUMENT_TEMPLATE,
    create: DOCUMENT_TEMPLATE,
  });

  console.log("成功写入引导模板（通关计划 + 引导文档）。");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

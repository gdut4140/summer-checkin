import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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

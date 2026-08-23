/* ============================================================
 * 模拟一条"周报"通知（type=report），用于查看通知中心的 Markdown 渲染效果
 * 用法:  tsx scripts/mock-weekly-report.ts <用户邮箱>
 * 示例:  tsx scripts/mock-weekly-report.ts user@example.com
 * 本地跑: 连本地库（.env 的 DATABASE_URL）
 * ============================================================ */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
import { PrismaClient } from "../src/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const email = process.argv[2];
if (!email) {
  console.error("用法: tsx scripts/mock-weekly-report.ts <用户邮箱>");
  process.exit(1);
}

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`❌ 找不到用户: ${email}`);
    await prisma.$disconnect();
    process.exit(1);
  }

  const content = [
    `晚上好，这是你 2026-08-17 ~ 2026-08-23 的周度学习小结 ☀️`,
    ``,
    `这周整体节奏稳定，连续打卡保持了不错的势头，继续加油！`,
    ``,
    `已经连续打卡 **9 天**，这周完成了 **14 个番茄钟**，专注了 **420 分钟** 🍅`,
    ``,
    `做得好的地方：`,
    `- 数据结构与算法：链表练习完成 3 题，达到计划预期`,
    `- 英语单词：连续 5 天打卡，本周新增 120 词`,
    ``,
    `可以多关注一下：`,
    `- 操作系统：本周任务完成率 40%，进度有些落后`,
    `- 高数：上次学习在 3 天前，容易断档`,
    ``,
    `一些小建议：`,
    `- 明天优先完成 1 道「操作系统 · 进程调度」的题目，找回手感`,
    `- 每天固定 20 分钟背单词，比集中一天补更轻松`,
    ``,
  ].join("\n");

  const notification = await prisma.notification.create({
    data: {
      userId: user.id,
      type: "report",
      title: "本周学习周报",
      content,
      actionUrl: "/agent",
      read: false,
    },
  });

  console.log(`✅ 已为 ${email} (${user.id}) 创建周报通知: ${notification.id}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("失败:", e.message);
  process.exit(1);
});

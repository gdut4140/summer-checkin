/* ============================================================
 * 发布一条全站公告
 *
 * 用法:  tsx scripts/announce.ts <标题> <正文(Markdown)> [--popup] [--draft]
 * 示例:  tsx scripts/announce.ts "知识库升级" "已支持 **PDF** 解析。" --popup
 *
 * 本地跑:   改本地库（.env 的 DATABASE_URL）
 * 服务器跑: docker exec summer-checkin-app node node_modules/tsx/dist/cli.mjs /app/scripts/announce.ts <标题> <正文> --popup
 *
 * --popup  参与「每天首次进入弹一次」；不加则只出现在铃铛的公告列表里
 * --draft  先不发（published=false），之后 UPDATE announcement SET published=true 再放出来
 * ============================================================ */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
import { PrismaClient } from "../prisma/generated/client";
import { PrismaPg } from "@prisma/adapter-pg";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const [title, body] = args.filter((a) => !a.startsWith("--"));

if (!title || !body) {
  console.error("用法: tsx scripts/announce.ts <标题> <正文(Markdown)> [--popup] [--draft]");
  process.exit(1);
}

const popup = flags.has("--popup");
const published = !flags.has("--draft");

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  const created = await prisma.announcement.create({
    data: { title, body, popup, published },
  });

  console.log(`✅ 已创建公告 ${created.id}`);
  console.log(`   标题:   ${created.title}`);
  console.log(`   可见:   ${created.published ? "是" : "否（草稿）"}`);
  console.log(`   每天弹: ${created.popup ? "是" : "否"}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("失败:", e.message);
  process.exit(1);
});

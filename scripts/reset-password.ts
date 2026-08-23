/* ============================================================
 * 管理员重置用户密码
 * 用法:  tsx scripts/reset-password.ts <用户邮箱> <新密码>
 * 示例:  tsx scripts/reset-password.ts user@example.com newPass123
 *
 * 本地跑: 改本地库（.env 的 DATABASE_URL）
 * 服务器跑: docker exec summer-checkin-app node node_modules/tsx/dist/cli.mjs /app/scripts/reset-password.ts <邮箱> <新密码>
 *
 * 哈希算法与 Better Auth 完全一致（scrypt: N=16384, r=16, p=1, dkLen=64, salt:hash 十六进制）
 * 所以重置后登录验证能正常通过。
 * ============================================================ */
import { randomBytes, scryptSync } from "node:crypto";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
import { PrismaClient } from "../src/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const email = process.argv[2];
const newPassword = process.argv[3];

if (!email || !newPassword) {
  console.error("用法: tsx scripts/reset-password.ts <用户邮箱> <新密码>");
  process.exit(1);
}
if (newPassword.length < 8) {
  console.error("新密码至少需要 8 位");
  process.exit(1);
}

/** 生成与 Better Auth 相同的 scrypt 密码哈希 */
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password.normalize("NFKC"), salt, 64, {
    N: 16384,
    r: 16,
    p: 1,
    maxmem: 128 * 16384 * 16 * 2,
  });
  return `${salt}:${key.toString("hex")}`;
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

  const hash = hashPassword(newPassword);
  const account = await prisma.account.findFirst({
    where: { userId: user.id, providerId: "credential" },
  });

  if (account) {
    await prisma.account.update({ where: { id: account.id }, data: { password: hash } });
    console.log(`✅ 已重置 ${email} 的密码（哈希已更新）`);
  } else {
    // 该用户之前可能是纯 OAuth，没有密码；给他建一个密码账号
    await prisma.account.create({
      data: { userId: user.id, providerId: "credential", accountId: email, password: hash },
    });
    console.log(`✅ ${email} 原本没有密码，已创建密码账号并设置新密码`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("失败:", e.message);
  process.exit(1);
});

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { VALID_AVATAR_IDS } from "@/lib/avatar-presets";
import { deleteObject, getObjectMeta, isOssConfigured, isOwnedAvatarUrl } from "@/lib/oss";

// OSS 头像大小上限（5MB），超出拒绝并清理该对象
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

// ── 上传头像限流（只限 OSS 上传；预设不限流） ──
const MINUTE_LIMIT = 3; // 3 次/分钟（内存窗口，重启清零）
const DAY_LIMIT = 5;    // 5 次/天（数据库持久，真正的防滥用门槛）
const WINDOW_MS = 60_000;
const minuteUsage = new Map<string, { windowStart: number; count: number }>();

function checkMinuteBudget(userId: string): boolean {
  const now = Date.now();
  const u = minuteUsage.get(userId);
  if (!u || now - u.windowStart > WINDOW_MS) {
    minuteUsage.set(userId, { windowStart: now, count: 1 });
    return true;
  }
  if (u.count >= MINUTE_LIMIT) return false;
  u.count++;
  return true;
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { avatar } = (await req.json()) as { avatar: string };

  // ── 预设头像：保持原逻辑（id "1"~"16" / "ai"），不限流 ──
  if (VALID_AVATAR_IDS.has(avatar)) {
    await prisma.user.update({ where: { id: user.id }, data: { image: avatar } });
    return NextResponse.json({ ok: true });
  }

  // ── OSS 上传头像：URL 必须落在本 bucket 的 avatars/{当前userId}/ 前缀下 ──
  if (isOssConfigured() && isOwnedAvatarUrl(avatar, user.id)) {
    // 1. 3/min 内存限流
    if (!checkMinuteBudget(user.id)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    // 2. 5/day 数据库限流
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayCount = await prisma.avatarChange.count({
      where: { userId: user.id, createdAt: { gte: startOfDay } },
    });
    if (todayCount >= DAY_LIMIT) {
      return NextResponse.json({ error: "Daily avatar limit reached" }, { status: 429 });
    }

    // 3. 对象需已存在（浏览器先直传 OSS 再 PATCH），并校验大小
    const meta = await getObjectMeta(avatar);
    if (!meta) {
      return NextResponse.json({ error: "Object not found" }, { status: 400 });
    }
    if (meta.size > MAX_AVATAR_SIZE) {
      await deleteObject(avatar).catch(() => {});
      return NextResponse.json({ error: "Image too large" }, { status: 400 });
    }

    // 4. 写入 + 计数 + 清理旧对象（best-effort，不影响主流程）
    const oldImage = user.image;
    await prisma.user.update({ where: { id: user.id }, data: { image: avatar } });
    await prisma.avatarChange.create({ data: { userId: user.id } }).catch(() => {});
    // 顺手清 30 天前的计数行，防表膨胀（量极小）
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    await prisma.avatarChange.deleteMany({ where: { createdAt: { lt: cutoff } } }).catch(() => {});
    if (oldImage && oldImage !== avatar && isOwnedAvatarUrl(oldImage, user.id)) {
      await deleteObject(oldImage).catch(() => {});
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid avatar" }, { status: 400 });
}

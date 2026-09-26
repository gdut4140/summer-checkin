import { prisma } from "@/lib/prisma";

/**
 * 已发布的公告，最新在前。
 *
 * 全站公告不按用户存 —— 一份所有人看同一份，所以没有 userId 过滤。
 * `popup` 字段一并带出去：铃铛列表展示全部，弹窗只挑 popup=true 的第一条。
 */
export async function listAnnouncements(limit = 20) {
  return prisma.announcement.findMany({
    where: { published: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/**
 * 该用户上次被弹公告的日期（客户端本地日期字符串，跨设备共用）。
 *
 * 服务端**不解释**这个值 —— "今天"是哪天只有客户端按自己的时区知道。
 * 这里只负责存和取，比较由客户端做。
 */
export async function getAnnouncementSeenOn(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { announcementSeenOn: true },
  });
  return user?.announcementSeenOn ?? null;
}

/** 记下「今天弹过了」（day 由客户端按本地时区给出，格式 YYYY-MM-DD） */
export async function markAnnouncementSeen(userId: string, day: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { announcementSeenOn: day },
  });
}

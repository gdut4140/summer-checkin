// ============================================================
// Phase 3: 通知系统
//
// 核心能力：
// ① createNotification — Agent 生成通知（提醒、分析结果、系统消息）
// ② listNotifications — 用户查看通知列表（支持分页、按类型/已读过滤）
// ③ markAsRead / markAllAsRead — 标记已读
// ④ getUnreadCount — 未读数（前端 badge 用）
// ⑤ deleteNotification — 删除单条通知
//
// 设计原则：
// - 通知由 Agent 自动生成（非用户操作）
// - 支持多种类型：reminder / analysis / report / encouragement / system
// - actionUrl 可选，用于点击通知跳转到具体页面
// ============================================================

import { prisma } from "@/lib/prisma";

// ---- 类型 ----

export type NotificationType =
  | "reminder"      // 学习提醒（"今天还有算法任务未完成"）
  | "analysis"      // 分析结果（"算法连续3天未完成，需要增加练习"）
  | "report"        // 报告推送（"本周学习报告已生成"）
  | "encouragement" // 鼓励（"连续7天打卡，继续保持！"）
  | "system";       // 系统通知（计划调整成功等）

export interface NotificationRecord {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  content: string;
  read: boolean;
  actionUrl: string | null;
  createdAt: string;
}

// ---- 创建通知 ----

interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  content: string;
  actionUrl?: string;
}

export async function createNotification(
  input: CreateNotificationInput
): Promise<NotificationRecord | null> {
  try {
    // 每日节流：同一用户当天同类型通知只保留一条。
    // 通知全部由 Agent 自动生成（每日 cron 可能被多次调用/多次运行），
    // 去重保证用户每天每种提醒最多收到一条，避免重复打扰。
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const existingToday = await prisma.notification.findFirst({
      where: {
        userId: input.userId,
        type: input.type,
        createdAt: { gte: startOfDay },
      },
      select: { id: true },
    });

    if (existingToday) {
      console.log(
        `[Notification] 今日同类型通知已存在，跳过: type=${input.type} user=${input.userId}`
      );
      return null;
    }

    const notification = await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        content: input.content,
        actionUrl: input.actionUrl ?? null,
      },
    });

    console.log(
      `[Notification] 创建通知: type=${notification.type} user=${input.userId} title="${notification.title.slice(0, 40)}"`
    );

    return {
      id: notification.id,
      userId: notification.userId,
      type: notification.type as NotificationType,
      title: notification.title,
      content: notification.content,
      read: notification.read,
      actionUrl: notification.actionUrl,
      createdAt: notification.createdAt.toISOString(),
    };
  } catch (error) {
    console.error("[Notification] 创建失败:", error);
    return null;
  }
}

// ---- 查询通知列表 ----

interface ListNotificationsOptions {
  type?: NotificationType;
  unreadOnly?: boolean;
  limit?: number;
  offset?: number;
}

export async function listNotifications(
  userId: string,
  options: ListNotificationsOptions = {}
): Promise<{ notifications: NotificationRecord[]; total: number }> {
  const where: Record<string, unknown> = { userId };
  if (options.type) where.type = options.type;
  if (options.unreadOnly) where.read = false;

  const [records, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: options.limit ?? 20,
      skip: options.offset ?? 0,
    }),
    prisma.notification.count({ where }),
  ]);

  return {
    notifications: records.map((n) => ({
      id: n.id,
      userId: n.userId,
      type: n.type as NotificationType,
      title: n.title,
      content: n.content,
      read: n.read,
      actionUrl: n.actionUrl,
      createdAt: n.createdAt.toISOString(),
    })),
    total,
  };
}

// ---- 获取未读数 ----

export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { userId, read: false },
  });
}

// ---- 标记已读 ----

export async function markAsRead(
  notificationId: string,
  userId: string
): Promise<boolean> {
  try {
    const result = await prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { read: true },
    });
    return result.count > 0;
  } catch {
    return false;
  }
}

export async function markAllAsRead(userId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  });
  return result.count;
}

// ---- 删除通知 ----

export async function deleteNotification(
  notificationId: string,
  userId: string
): Promise<boolean> {
  try {
    await prisma.notification.delete({
      where: { id: notificationId },
    });
    // 所有权校验：Prisma 会抛异常如果 userId 不匹配？
    // 上面用 delete（不是 deleteMany）如果记录不存在也会抛异常
    return true;
  } catch {
    return false;
  }
}

// ---- 清理旧通知 ----

/**
 * 清理 N 天前的已读通知（防止数据膨胀）
 * 由 cron job 或手动调用
 */
export async function cleanupOldNotifications(
  userId: string,
  olderThanDays: number = 30
): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);

  const result = await prisma.notification.deleteMany({
    where: {
      userId,
      read: true,
      createdAt: { lt: cutoff },
    },
  });

  if (result.count > 0) {
    console.log(
      `[Notification] 清理 ${result.count} 条旧通知 (user=${userId})`
    );
  }
  return result.count;
}

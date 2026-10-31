/**
 * 固定时间窗口限流器。
 *
 * 同一个用户的所有 WebSocket 连接共享同一个限流桶。
 * 限流桶不放在 Connection 连接对象里，是为了避免用户打开多个标签页后，
 * 每个标签页都获得一份独立额度，从而绕过限流。
 */
export interface RateLimitConfig {
  /** 统计时间窗口，单位是毫秒，例如 60_000 表示 60 秒。 */
  windowMs: number;
  /** 一个时间窗口内允许的最大次数。 */
  max: number;
}

interface Bucket {
  /** 当前时间窗口的开始时间戳，单位是毫秒。 */
  windowStart: number;
  /** 当前时间窗口内已经使用的次数。 */
  count: number;
}

export class UserRateLimiter {
  /** key 是 userId，value 是这个用户当前时间窗口的限流记录。 */
  private readonly buckets = new Map<string, Bucket>();
  private readonly config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  /**
   * 判断用户这次操作是否允许通过。
   *
   * @param userId 用户 ID；同一用户的多个连接共用额度
   * @param now 当前时间戳，默认使用系统当前时间；传入它主要方便测试
   * @returns true 表示允许，false 表示超过限额
   */
  allow(userId: string, now = Date.now()): boolean {
    const bucket = this.buckets.get(userId);

    // 用户第一次操作，或者旧时间窗口已经结束：创建一个新窗口，
    // 并把本次操作计为该窗口的第 1 次。
    if (!bucket || now - bucket.windowStart >= this.config.windowMs) {
      this.buckets.set(userId, { windowStart: now, count: 1 });
      return this.config.max >= 1;
    }

    // 仍在当前时间窗口内，先记录本次操作，再判断是否超过上限。
    bucket.count += 1;
    return bucket.count <= this.config.max;
  }

  /**
   * 删除已经过期的时间窗口。
   *
   * 这个方法不会影响仍在有效窗口内的用户，通常由外部定时器周期性调用，
   * 以免长期不再操作的用户一直占用 Map 中的内存。
   */
  prune(now = Date.now()): void {
    for (const [userId, bucket] of this.buckets) {
      // 当前时间距离窗口开始时间达到 windowMs，说明该窗口已过期。
      if (now - bucket.windowStart >= this.config.windowMs) {
        this.buckets.delete(userId);
      }
    }
  }

  /** 清空所有用户的限流记录，通常在服务关闭时调用。 */
  clear(): void {
    this.buckets.clear();
  }
}

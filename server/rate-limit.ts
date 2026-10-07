/**
 * Fixed-window rate limiter shared by all WebSocket connections of a user.
 * Keeping the bucket outside of Connection prevents multiple tabs from
 * giving the same user one separate quota per tab.
 */
export interface RateLimitConfig {
  windowMs: number;
  max: number;
}

interface Bucket {
  windowStart: number;
  count: number;
}

export class UserRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  allow(userId: string, now = Date.now()): boolean {
    const bucket = this.buckets.get(userId);
    if (!bucket || now - bucket.windowStart >= this.config.windowMs) {
      this.buckets.set(userId, { windowStart: now, count: 1 });
      return this.config.max >= 1;
    }

    bucket.count += 1;
    return bucket.count <= this.config.max;
  }

  prune(now = Date.now()): void {
    for (const [userId, bucket] of this.buckets) {
      if (now - bucket.windowStart >= this.config.windowMs) {
        this.buckets.delete(userId);
      }
    }
  }

  clear(): void {
    this.buckets.clear();
  }
}

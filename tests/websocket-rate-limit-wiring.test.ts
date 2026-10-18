import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// 这条不是「测逻辑」，是钉住 wiring —— 它守的是一个测试盲区。
//
// tests/websocket-rate-limit.test.ts 把 UserRateLimiter 这个类本身测得挺全
// （多连接共享、用户隔离、窗口重置、prune），但它对「server/index.ts 到底把
// 什么传给了 allow()」一无所知。把调用点改回按连接记账，那几条测试照样全绿，
// 多标签页绕过的漏洞就静默回来了 —— 而漏洞正是这次修复的全部意义。
//
// 为什么不直接 import server/index.ts 来跑真实调用链：它是自动 listen(3001)
// 的入口脚本，import 会把整个进程拉起来（加载 .env、连 Prisma、连 better-auth、
// 占端口），单测里跑不动。要覆盖真正的调用链，得先把入口拆成可 import 的
// start()，那是比这次修复大得多的重构。
//
// 所以这里退一步读源码。代价：对重命名敏感，改了变量名要跟着改。收益：它只会
// 「误报」不会「漏报」—— 真出问题时一定是红的，不会安静地放过。
// ---------------------------------------------------------------------------

const indexSrc = readFileSync(new URL("../server/index.ts", import.meta.url), "utf8");

describe("WebSocket 限流的 wiring（server/index.ts → UserRateLimiter）", () => {
  it("调用点传的是 conn.userId（按用户），不是 conn 本身（按连接）", () => {
    expect(indexSrc).toMatch(/rateLimiter\.allow\(\s*conn\.userId\s*\)/);
  });

  it("限流器是模块级单例，不是每条连接各 new 一个", () => {
    // 每条连接各建一个 = 又变回按连接计数，多标签页照样各拿一份配额
    expect(indexSrc.match(/new UserRateLimiter\(/g) ?? []).toHaveLength(1);
  });
});

import { describe, expect, it } from "vitest";
import { allowedOrigins, isAllowedUpgrade } from "../server/origin";

// 这道校验是 fail-closed 的，两个方向出错都有代价：
// 判太松 = 跨站站点能借用户 cookie 连上聊天室（CSWSH）；
// 判太紧 = 聊天室整个连不上，而且是静默的 —— 握手被拒只留一行日志。

const ALLOWED = new Set(["https://study.example.com"]);

describe("isAllowedUpgrade", () => {
  it("放行 /ws 且 Origin 在白名单里", () => {
    expect(isAllowedUpgrade("/ws", "https://study.example.com", ALLOWED)).toBe(true);
    // 带查询串不影响
    expect(
      isAllowedUpgrade("/ws?client=browser", "https://study.example.com", ALLOWED)
    ).toBe(true);
  });

  it("拒绝跨站 Origin 与缺失 Origin（fail-closed）", () => {
    expect(isAllowedUpgrade("/ws", "https://evil.example", ALLOWED)).toBe(false);
    expect(isAllowedUpgrade("/ws", undefined, ALLOWED)).toBe(false);
    expect(isAllowedUpgrade("/ws", "not a url", ALLOWED)).toBe(false);
  });

  it("只放行 /ws —— 前缀相同的其它路径一律拒绝", () => {
    // nginx 的 location /ws 是前缀匹配，而 sidecar 原本从不看路径，
    // 两者叠加会让 /ws/anything 也连得进来。这条钉住它。
    expect(isAllowedUpgrade("/ws/ws", "https://study.example.com", ALLOWED)).toBe(false);
    expect(isAllowedUpgrade("/wsfoo", "https://study.example.com", ALLOWED)).toBe(false);
    expect(isAllowedUpgrade("/health", "https://study.example.com", ALLOWED)).toBe(false);
    expect(isAllowedUpgrade(undefined, "https://study.example.com", ALLOWED)).toBe(false);
  });
});

describe("allowedOrigins", () => {
  it("把 BETTER_AUTH_URL 归一成 origin（丢掉路径和默认端口）", () => {
    const origins = allowedOrigins("https://study.example.com/auth/callback", true);
    expect([...origins]).toEqual(["https://study.example.com"]);

    // http 的 80 是默认端口，origin 里会被省掉
    expect([...allowedOrigins("http://8.163.59.196:80", true)]).toEqual([
      "http://8.163.59.196",
    ]);
  });

  it("生产不放行 localhost，开发放行", () => {
    expect([...allowedOrigins("http://8.163.59.196", true)]).toEqual([
      "http://8.163.59.196",
    ]);

    const dev = allowedOrigins("http://localhost:3000", false);
    expect(dev.has("http://localhost:3000")).toBe(true);
    expect(dev.has("http://localhost:3001")).toBe(true);
  });

  it("BETTER_AUTH_URL 缺失时生产白名单为空（所有握手都会被拒）", () => {
    expect(allowedOrigins("", true).size).toBe(0);
  });
});

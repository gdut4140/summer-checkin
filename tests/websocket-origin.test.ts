import { describe, expect, it } from "vitest";
import {
  configuredWebSocketOrigins,
  isAllowedWebSocketUpgrade,
} from "../server/origin";

describe("WebSocket upgrade origin validation", () => {
  const allowed = new Set(["https://study.example.com"]);

  it("accepts the exact websocket path and configured origin", () => {
    expect(
      isAllowedWebSocketUpgrade(
        "/ws?client=browser",
        "https://study.example.com",
        allowed
      )
    ).toBe(true);
  });

  it("rejects cross-site and missing origins", () => {
    expect(isAllowedWebSocketUpgrade("/ws", "https://evil.example", allowed)).toBe(false);
    expect(isAllowedWebSocketUpgrade("/ws", undefined, allowed)).toBe(false);
  });

  it("rejects upgrades for routes other than /ws", () => {
    expect(
      isAllowedWebSocketUpgrade("/health", "https://study.example.com", allowed)
    ).toBe(false);
  });

  it("normalizes BETTER_AUTH_URL to an origin", () => {
    expect(
      configuredWebSocketOrigins("https://study.example.com/auth/callback").has(
        "https://study.example.com"
      )
    ).toBe(true);
  });
});

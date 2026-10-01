import {
  DESKTOP_BRIDGE_VERSION,
  DesktopBridgeOutboundMessageSchema,
} from "@core/types/desktop-bridge.contracts";
import { describe, expect, it } from "bun:test";

describe("DesktopBridgeOutboundMessageSchema", () => {
  it("accepts openExternal messages", () => {
    const parsed = DesktopBridgeOutboundMessageSchema.parse({
      method: "openExternal",
      url: "https://accounts.google.com/",
    });
    expect(parsed.method).toBe("openExternal");
  });

  it("accepts setAgenda messages", () => {
    const parsed = DesktopBridgeOutboundMessageSchema.parse({
      method: "setAgenda",
      items: [{ title: "Standup", startsAt: "2026-10-01T14:00:00.000Z" }],
    });
    expect(parsed.items).toHaveLength(1);
  });

  it("accepts restartToUpdate messages", () => {
    expect(
      DesktopBridgeOutboundMessageSchema.parse({ method: "restartToUpdate" }),
    ).toEqual({ method: "restartToUpdate" });
  });

  it("accepts showNotification messages", () => {
    const parsed = DesktopBridgeOutboundMessageSchema.parse({
      method: "showNotification",
      title: "Standup",
      body: "Starts at 9:00 AM",
      tag: "evt-1|2026-10-01T14:00:00.000Z",
      eventId: "evt-1",
    });
    expect(parsed.method).toBe("showNotification");
  });
});

describe("DESKTOP_BRIDGE_VERSION", () => {
  it("matches the macOS shell marketing version", () => {
    expect(DESKTOP_BRIDGE_VERSION).toBe("0.1.0");
  });
});

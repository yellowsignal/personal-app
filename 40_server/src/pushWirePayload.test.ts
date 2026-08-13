import assert from "node:assert/strict";
import { test } from "node:test";
import { toPushWirePayload } from "./services/pushService.js";

test("toPushWirePayload uses Declarative Web Push with sound enabled", () => {
  const wire = toPushWirePayload({
    title: "치과",
    body: "1시간 전",
    url: "/calendar",
    tag: "cal-1-2026-08-13",
  });
  assert.equal(wire.web_push, 8030);
  const notification = wire.notification as Record<string, unknown>;
  assert.equal(notification.title, "치과");
  assert.equal(notification.silent, false);
  assert.equal(notification.renotify, true);
  assert.match(String(notification.navigate), /\/calendar$/);
});

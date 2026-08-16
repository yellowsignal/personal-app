import assert from "node:assert/strict";
import { test } from "node:test";
import {
  collectChanges,
  formatFamilyActivityPushTitle,
  formatFamilyActivitySummary,
  serializeActivityDetail,
} from "./domain/familyActivityFormat.js";

test("formatFamilyActivitySummary describes calendar date change", () => {
  const detailJson = serializeActivityDetail({
    changes: collectChanges([
      { field: "date", from: "2026-08-16", to: "2026-08-20" },
    ]),
  });
  const ko = formatFamilyActivitySummary({
    languagePref: "ko",
    action: "UPDATED",
    entityType: "CALENDAR_EVENT",
    title: "여행",
    detailJson,
  });
  assert.match(ko, /여행/);
  assert.match(ko, /2026-08-16/);
  assert.match(ko, /2026-08-20/);
  assert.match(ko, /날짜/);
  assert.doesNotMatch(ko, /일정/);
});

test("formatFamilyActivitySummary create and delete", () => {
  const created = formatFamilyActivitySummary({
    languagePref: "ko",
    action: "CREATED",
    entityType: "CHECKLIST",
    title: "사는 것",
  });
  assert.match(created, /등록/);
  const deleted = formatFamilyActivitySummary({
    languagePref: "ja",
    action: "DELETED",
    entityType: "ASSET",
    title: "예금",
  });
  assert.match(deleted, /削除/);
});

test("formatFamilyActivitySummary localizes shared toggle", () => {
  const detailJson = serializeActivityDetail({
    changes: collectChanges([{ field: "shared", from: "off", to: "on" }]),
  });
  const ko = formatFamilyActivitySummary({
    languagePref: "ko",
    action: "UPDATED",
    entityType: "SUBSCRIPTION",
    title: "Netflix",
    detailJson,
  });
  assert.match(ko, /켜짐/);
});

test("formatFamilyActivityPushTitle is who + feature", () => {
  const ko = formatFamilyActivityPushTitle({
    languagePref: "ko",
    actorName: "민호",
    entityType: "CALENDAR_EVENT",
  });
  assert.equal(ko, "민호 · 일정");
  const ja = formatFamilyActivityPushTitle({
    languagePref: "ja",
    actorName: "민호",
    entityType: "CHECKLIST",
  });
  assert.equal(ja, "민호さん · チェックリスト");
});

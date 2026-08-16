import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldNotifyFamilyActivityActor } from "./domain/familyActivityNotifySelf.js";

test("shouldNotifyFamilyActivityActor respects explicit flag", () => {
  assert.equal(shouldNotifyFamilyActivityActor({ FAMILY_ACTIVITY_NOTIFY_ACTOR: "1" }), true);
  assert.equal(shouldNotifyFamilyActivityActor({ FAMILY_ACTIVITY_NOTIFY_ACTOR: "0" }), false);
  assert.equal(
    shouldNotifyFamilyActivityActor({
      FAMILY_ACTIVITY_NOTIFY_ACTOR: "0",
      WEBAUTHN_RP_ID: "sumicchogurashi-dev.duckdns.org",
    }),
    false,
  );
});

test("shouldNotifyFamilyActivityActor defaults on dig hostname only", () => {
  assert.equal(
    shouldNotifyFamilyActivityActor({ WEBAUTHN_RP_ID: "sumicchogurashi-dev.duckdns.org" }),
    true,
  );
  assert.equal(
    shouldNotifyFamilyActivityActor({ WEBAUTHN_RP_ID: "sumicchogurashi.duckdns.org" }),
    false,
  );
  assert.equal(shouldNotifyFamilyActivityActor({}), false);
});

/**
 * Dig/dev-only: also push family-activity notifications to the actor so solo
 * testing works. Prod must keep this off (`FAMILY_ACTIVITY_NOTIFY_ACTOR=0` or
 * non-dev hostnames).
 */
export function shouldNotifyFamilyActivityActor(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const flag = env.FAMILY_ACTIVITY_NOTIFY_ACTOR?.trim().toLowerCase();
  if (flag === "1" || flag === "true" || flag === "yes") return true;
  if (flag === "0" || flag === "false" || flag === "no") return false;
  const hay = [
    env.WEBAUTHN_RP_ID ?? "",
    env.WEBAUTHN_ORIGIN ?? "",
    env.PUBLIC_APP_ORIGIN ?? "",
  ].join(" ");
  return hay.includes("sumicchogurashi-dev");
}

export const PUSH_ONBOARDING_KEY = "myfamilyhub_push_onboarding_v1";

export type NotificationPermissionState = NotificationPermission | "unsupported";

export function readPushOnboardingAsked(): boolean {
  try {
    return window.localStorage.getItem(PUSH_ONBOARDING_KEY) === "1";
  } catch {
    return true;
  }
}

export function markPushOnboardingAsked(): void {
  try {
    window.localStorage.setItem(PUSH_ONBOARDING_KEY, "1");
  } catch {
    /* ignore quota / private mode */
  }
}

export function notificationPermission(): NotificationPermissionState {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

/** First-launch prompt: home-screen PWA, logged in, OS permission still default. */
export function shouldShowPushOnboarding(input: {
  hasToken: boolean;
  standalone: boolean;
  permission: NotificationPermissionState;
  alreadyAsked: boolean;
}): boolean {
  if (!input.hasToken || !input.standalone || input.alreadyAsked) return false;
  return input.permission === "default";
}

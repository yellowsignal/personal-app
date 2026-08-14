import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DEBUG_LOG = "/opt/cursor/logs/debug.log";

/** Compact NDJSON probe for calendar reminder investigation. Never log secrets. */
export function agentLog(
  hypothesisId: string,
  location: string,
  message: string,
  data: Record<string, unknown> = {},
): void {
  try {
    mkdirSync(dirname(DEBUG_LOG), { recursive: true });
    appendFileSync(
      DEBUG_LOG,
      JSON.stringify({ hypothesisId, location, message, data, timestamp: Date.now() }) + "\n",
    );
  } catch {
    /* ignore missing perms in some hosts */
  }
}

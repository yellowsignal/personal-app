/** Allowed browser Origins for CORS (same-origin nginx + local Vite). */
export function allowedCorsOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const fromEnv = [env.WEBAUTHN_ORIGIN, env.PUBLIC_APP_ORIGIN, env.CORS_ORIGINS]
    .flatMap((value) => (value ? value.split(",") : []))
    .map((s) => s.trim())
    .filter(Boolean);

  const defaults = [
    "https://sumicchogurashi.duckdns.org",
    "https://sumicchogurashi-dev.duckdns.org",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ];

  return [...new Set([...defaults, ...fromEnv])];
}

export function isAllowedCorsOrigin(
  origin: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!origin) return true; // same-origin / curl / mobile webview without Origin
  return allowedCorsOrigins(env).includes(origin);
}

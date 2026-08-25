export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

/** True when value is a real JWT (not the in-app cookie-session sentinel). */
export function isBearerToken(token: string | null | undefined): token is string {
  return Boolean(token && token.includes("."));
}

/** Same-origin credentialed fetch; Bearer optional when httpOnly cookie is set. */
export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const { token, headers, ...rest } = options;
  const res = await fetch(path, {
    credentials: "include",
    ...rest,
    headers: {
      "content-type": "application/json",
      ...(isBearerToken(token) ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  if (res.status === 204) return undefined as T;

  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
  };

  if (!res.ok) {
    throw new ApiError(data.error ?? `request failed (${res.status})`, res.status, data.code);
  }

  return data as T;
}

/** Binary / non-JSON authenticated requests (uploads, image blobs). */
export async function authedFetch(
  path: string,
  options: RequestInit & { token?: string | null } = {},
): Promise<Response> {
  const { token, headers, ...rest } = options;
  return fetch(path, {
    credentials: "include",
    ...rest,
    headers: {
      ...(isBearerToken(token) ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
}

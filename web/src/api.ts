const stateCache = new Map<
  string,
  { etag: string; data: Record<string, unknown>; receivedAt: number }
>();
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export async function api<T = unknown>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> =
    body !== undefined ? { "Content-Type": "application/json" } : {};
  const isState = method === "GET" && path.startsWith("/state");
  const cached = isState ? stateCache.get(path) : undefined;
  if (cached) headers["If-None-Match"] = cached.etag;
  if (path.startsWith("/auth/")) stateCache.clear();
  const authenticatedPost = method === "POST" && !path.startsWith("/auth/");
  if (authenticatedPost) headers["Idempotency-Key"] = crypto.randomUUID();
  let response: Response;
  const request = () =>
    fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  try {
    response = await request();
  } catch (error) {
    if (authenticatedPost) {
      try {
        response = await request();
      } catch {
        throw new Error(
          "Could not confirm the change. Reconnect and refresh before trying again.",
        );
      }
    } else
      throw new Error(
        "Could not reach Crops. Check your connection and try again.",
      );
  }
  if (response.status === 304 && cached) {
    // CDNs can generate their own 304 and omit custom headers. HTTP Date is
    // still a fresh server clock; never replay an old timestamp as current.
    let serverTime = response.headers.get("X-Crops-Server-Time");
    if (!serverTime || !Number.isFinite(Date.parse(serverTime))) {
      const httpDate = Date.parse(response.headers.get("Date") || "");
      const previousTime = Date.parse(String(cached.data.serverTime));
      const clock = Number.isFinite(httpDate)
        ? httpDate
        : previousTime + Math.max(0, Date.now() - cached.receivedAt);
      if (!Number.isFinite(clock))
        throw new Error(
          "Crops returned an invalid server clock. Refresh to try again.",
        );
      serverTime = new Date(clock).toISOString();
    }
    const data = {
      ...cached.data,
      serverTime,
    };
    stateCache.set(path, { ...cached, data, receivedAt: Date.now() });
    return data as T;
  }
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      data?.error || `Request failed (${response.status}). Please try again.`,
      response.status,
    );
  if (isState && response.headers.get("ETag"))
    stateCache.set(path, {
      etag: response.headers.get("ETag")!,
      data,
      receivedAt: Date.now(),
    });
  return data as T;
}

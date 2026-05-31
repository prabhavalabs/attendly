/**
 * API client — mirrors the admin client (apps/admin/src/lib/api.ts):
 *   - prefixes the API base URL
 *   - attaches the Bearer access token
 *   - persists & echoes the `x-d1-bookmark` header (D1 read-after-write, SRS §6.1)
 *   - normalizes `{ error, details }` responses into ApiError
 *   - transparently refreshes the access token once on 401
 *
 * Token getter + refresh handler are injected via `configureApi` to avoid an
 * import cycle with the auth store.
 */
import { API_BASE_URL, BOOKMARK_KEY } from "./config";
import { getItem, setItem } from "./secure";

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, details?: unknown) {
    super(code);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface ApiHooks {
  getAccessToken: () => string | null;
  refresh: () => Promise<boolean>;
  onAuthLost: () => void;
}

let hooks: ApiHooks = {
  getAccessToken: () => null,
  refresh: async () => false,
  onAuthLost: () => {},
};

export function configureApi(next: ApiHooks): void {
  hooks = next;
}

// In-memory bookmark, hydrated once at startup and persisted on change.
let bookmark: string | null = null;
export async function hydrateBookmark(): Promise<void> {
  bookmark = await getItem(BOOKMARK_KEY);
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  auth?: boolean;
  _retry?: boolean;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true, _retry = true } = opts;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (bookmark) headers["x-d1-bookmark"] = bookmark;

  if (auth) {
    const token = hooks.getAccessToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const newBookmark = res.headers.get("x-d1-bookmark");
  if (newBookmark) {
    bookmark = newBookmark;
    void setItem(BOOKMARK_KEY, newBookmark);
  }

  if (res.status === 401 && auth && _retry) {
    const refreshed = await hooks.refresh();
    if (refreshed) return request<T>(path, { ...opts, _retry: false });
    hooks.onAuthLost();
  }

  if (res.status === 204) return undefined as T;

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const err = data as { error?: string; details?: unknown } | null;
    throw new ApiError(res.status, err?.error ?? "request_failed", err?.details);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, opts?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...opts, method: "GET" }),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...opts, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...opts, method: "PATCH", body }),
  delete: <T>(path: string, opts?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...opts, method: "DELETE" }),
};

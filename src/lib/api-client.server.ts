// Server-only HTTP helper: calls the FastAPI backend from TanStack server
// functions, forwarding the user's Supabase bearer token so FastAPI can
// authenticate. Load this ONLY from server function handlers (`.handler{...}`)
// — never import it into a route/component file directly, or it ships to the
// browser bundle.
const FASTAPI_URL = (process.env["FASTAPI_URL"] ?? "").replace(/\/+$/, "");

function requireApiUrl(): string {
  if (!FASTAPI_URL) {
    throw new Error("Missing FASTAPI_URL env var — the backend proxy cannot reach FastAPI.");
  }
  return FASTAPI_URL;
}

/** Error carrying the backend HTTP status, so call sites can distinguish a
 * genuine backend failure (throw) from a "not found" (catch status 404 ->
 * return null), mirroring the TS server code's not-found-vs-error split. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
  }
}

export interface ApiCallOptions<TBody = unknown> {
  /** Backend path, e.g. "/api/portfolio/my-slug". */
  path: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: TBody;
  request?: {
    request?: { headers?: Headers | Record<string, string> };
    headers?: Headers | Record<string, string>;
  };
}

export async function callApi<TResponse = unknown>(
  options: ApiCallOptions,
): Promise<TResponse> {
  const base = requireApiUrl();
  const method = options.method ?? "GET";

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const auth = extractAuthHeader(options.request);
  if (auth) headers["Authorization"] = auth;

  const init: RequestInit = { method, headers };
  if (options.body !== undefined) init.body = JSON.stringify(options.body);

  const res = await fetch(`${base}${options.path}`, init);
  if (!res.ok) {
    let detail: string | undefined;
    try {
      detail = (await res.json())?.detail;
    } catch {
      /* non-JSON error body — ignore */
    }
    throw new ApiError(res.status, detail ?? `Backend ${method} ${options.path} failed (${res.status})`);
  }
  // FastAPI 204 / empty responses have no body.
  if (res.status === 204) return undefined as TResponse;
  return (await res.json()) as TResponse;
}

/** Pull the caller's Authorization header out of the TanStack server-function
 * handler context (either `ctx.request.headers` or `ctx.headers`). */
function extractAuthHeader(
  input?: ApiCallOptions["request"],
): string | null {
  if (!input) return null;
  const source = input.request?.headers ?? input.headers;
  if (!source) return null;
  if (source instanceof Headers) return source.get("Authorization");
  return source["authorization"] ?? source["Authorization"] ?? null;
}
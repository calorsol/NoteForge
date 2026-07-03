const TOKEN_KEY = "noteforge_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
};

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }

  const response = await fetch(`/api${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 401) {
    clearToken();
    // 让上层感知登录失效
    throw new ApiError(401, "登录已过期，请重新登录");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(response.status, (data as { error?: string }).error ?? "请求失败");
  }
  return data as T;
}

// ---- 类型 ----
export type User = { id: number; username: string };

export type DayStat = { day: string; count: number };

export type MaterialAnnotation = {
  id: number;
  material_id: number;
  quote: string;
  note: string;
  occurrence: number;
  created_at: string;
  updated_at: string;
};

export type Material = {
  id: number;
  day: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
  annotations: MaterialAnnotation[];
};

export type DocumentSummary = {
  id: number;
  title: string;
  updated_at: string;
};

export type DocumentFull = {
  id: number;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
};

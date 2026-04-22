/**
 * Tiny typed fetch wrapper. All API calls go through here so we can:
 *  - send credentials (cookies) by default,
 *  - centralise base URL + content-type handling,
 *  - turn non-2xx responses into thrown ApiError instances.
 */
const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
  }

  /** Best-effort human-readable extraction from the API's error envelope. */
  get displayMessage(): string {
    if (this.body && typeof this.body === 'object') {
      const maybe = this.body as { message?: unknown; error?: unknown };
      if (typeof maybe.message === 'string') return maybe.message;
      if (typeof maybe.error === 'string') return maybe.error;
    }
    return this.message;
  }
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  // Only set a JSON content-type when the caller is actually sending a body;
  // a GET request with that header triggers a pre-flight on some setups and
  // adds no value.
  const headers = new Headers(init.headers ?? {});
  if (init.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers,
  });
  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text().catch(() => undefined);
    }
    throw new ApiError(res.status, `API ${res.status}`, body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  role: 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER';
}

export interface Project {
  id: string;
  name: string;
  workspaceId: string;
  updatedAt: string;
  _count?: { documents: number };
}

export interface DocumentSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentFull extends DocumentSummary {
  projectId: string;
  content: unknown;
}

export interface VersionEntry {
  id: string;
  label: string | null;
  createdAt: string;
  author: SessionUser | null;
}

import type { CampusUser, ModuleKey, TableRow } from './types';

type Records = Record<ModuleKey, TableRow[]>;

class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: 'same-origin',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new ApiError('The server returned an invalid response. Verify the backend is running.', response.status);
  }
  const body: unknown = await response.json();
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
      ? body.error
      : `Request failed with status ${response.status}.`;
    throw new ApiError(message, response.status);
  }
  return body as T;
}

export async function authenticate(email: string, password: string): Promise<CampusUser> {
  const result = await request<{ user: CampusUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return result.user;
}

export async function getSession(): Promise<CampusUser | null> {
  try {
    const result = await request<{ user: CampusUser }>('/api/auth/session');
    return result.user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export function endSession(): Promise<void> {
  return request<void>('/api/auth/logout', { method: 'POST' });
}

export async function createAccount(setupToken: string, account: {
  name: string;
  email: string;
  password: string;
  role: CampusUser['role'];
  department: string;
  programme: string;
}) {
  return request<{ user: Pick<CampusUser, 'id' | 'name' | 'email' | 'role'> }>('/api/users', {
    method: 'POST',
    headers: { 'X-CampusFlow-Setup-Token': setupToken },
    body: JSON.stringify(account),
  });
}

export async function getRecords(user: CampusUser, onWarning?: (message: string) => void): Promise<Records> {
  const { records } = await request<{ records: Records }>('/api/records');
  if (user.role !== 'student') return records;

  let stored: string | null;
  try {
    stored = localStorage.getItem(`campusflow-complaints-${user.id}`);
  } catch (error) {
    console.error('Could not read saved anonymous complaint tracking details.', error);
    onWarning?.('This browser could not load saved anonymous complaint tracking keys.');
    return records;
  }
  if (!stored) return records;
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    throw new Error('Saved complaint tracking details are invalid. Clear this browser’s CampusFlow complaint data and try again.');
  }
  if (!Array.isArray(parsed) || parsed.length > 50 || parsed.some((item) =>
    typeof item?.id !== 'string' || typeof item?.token !== 'string' || item.token.length < 32 || item.token.length > 128,
  )) {
    throw new Error('Saved complaint tracking details are invalid. Clear this browser’s CampusFlow complaint data and try again.');
  }
  const cases = parsed as { id: string; token: string }[];
  const tracked = await request<{ records: TableRow[] }>('/api/records/complaints/track', {
    method: 'POST',
    body: JSON.stringify({ cases }),
  });
  return { ...records, complaints: tracked.records };
}

export async function createRecord(module: ModuleKey, payload: Record<string, string>, ownerEmail?: string) {
  return request<{ record: TableRow; trackingToken?: string }>(`/api/records/${module}`, {
    method: 'POST',
    body: JSON.stringify({ payload, ...(ownerEmail?.trim() ? { ownerEmail: ownerEmail.trim() } : {}) }),
  });
}

export async function updateRecord(module: ModuleKey, id: string, payload: Record<string, string>) {
  const encodedId = encodeURIComponent(id);
  const result = await request<{ record: TableRow }>(`/api/records/${module}/${encodedId}`, {
    method: 'PATCH',
    body: JSON.stringify({ payload }),
  });
  return result.record;
}

export function saveComplaintTracking(id: string, token: string, userId: string) {
  const key = `campusflow-complaints-${userId}`;
  const stored = localStorage.getItem(key);
  const parsed: unknown = stored ? JSON.parse(stored) : [];
  if (!Array.isArray(parsed) || parsed.length > 50 || parsed.some((item) =>
    typeof item?.id !== 'string' || typeof item?.token !== 'string' || item.token.length < 32 || item.token.length > 128,
  )) {
    throw new Error('Saved complaint tracking details are invalid. Clear this browser’s CampusFlow complaint data and try again.');
  }
  const cases = parsed as { id: string; token: string }[];
  if (!cases.some((item) => item.id === id)) cases.push({ id, token });
  localStorage.setItem(key, JSON.stringify(cases.slice(-50)));
}

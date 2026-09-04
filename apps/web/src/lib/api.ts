export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api/v1';

export class ApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

interface ApiEnvelope<T> {
  data: T;
  csrfToken?: string;
  pagination?: { page: number; pageSize: number; total: number };
  requestId: string;
}

export function saveCsrfToken(token: string): void {
  sessionStorage.setItem('ht_csrf', token);
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<ApiEnvelope<T>> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('content-type', 'application/json');
  if (init.method && !['GET', 'HEAD'].includes(init.method.toUpperCase())) {
    const csrf =
      typeof window === 'undefined' ? null : sessionStorage.getItem('ht_csrf');
    if (csrf) headers.set('x-csrf-token', csrf);
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });
  if (response.status === 204) return { data: undefined as T, requestId: '' };
  const payload = (await response.json()) as ApiEnvelope<T> & {
    error?: { code: string; message: string; details?: unknown };
  };
  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload.error?.code ?? 'REQUEST_FAILED',
      payload.error?.message ?? '请求失败',
      payload.error?.details,
    );
  }
  if (payload.csrfToken && typeof window !== 'undefined')
    saveCsrfToken(payload.csrfToken);
  return payload;
}

export interface CurrentUser {
  id: string;
  username: string;
  displayName: string;
  role: 'SUPER_ADMIN' | 'EDITOR' | 'VIEWER';
}

export interface RecordItem {
  id: string;
  recordType: 'TENDER_DOCUMENT' | 'CONTRACT';
  recordNumber: string;
  title: string;
  issuerName: string;
  documentVersion: string;
  businessDate: string;
  status: 'DRAFT' | 'ACTIVE' | 'CHANGED' | 'VOID';
  publicRemark?: string;
  internalNote?: string;
  fileSha256?: string;
  tendererName?: string;
  agencyName?: string;
  projectType?: string;
  publishDate?: string;
  counterpartyName?: string;
  amountDisplay?: string;
  signedDate?: string;
  validFrom?: string;
  validUntil?: string;
  publicToken: string;
  verificationUrl: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

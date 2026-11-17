import { DEFAULT_API_URL } from '@/config';
import { tokenStorage } from '@/lib/storage';

import type { ApiErrorResponse } from './types';

/**
 * Web frontend'deki lib/api-client.ts'in mobil karşılığı: aynı JSON
 * zarfı, aynı ApiError şekli, aynı "401 → oturumu kapat" davranışı.
 * Farklar: token SecureStore'da (async) ve API adresi çalışma anında
 * Ayarlar ekranından değiştirilebilir.
 */
let apiUrl = DEFAULT_API_URL;
let onUnauthorized: (() => void) | null = null;

export function setApiUrl(url: string) {
  apiUrl = url.replace(/\/+$/, '');
}

export function getApiUrl() {
  return apiUrl;
}

/** AuthProvider, 401 alındığında kullanıcıyı çıkış yaptırmak için kaydeder. */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public errorCode?: string,
    public fieldErrors?: Record<string, string[]>,
    public context?: Record<string, unknown> | null,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  fieldError(field: string): string | undefined {
    return this.fieldErrors?.[field]?.[0];
  }
}

type Options = { method?: string; body?: unknown; auth?: boolean; signal?: AbortSignal };

async function request<T>(path: string, { method = 'GET', body, auth = true, signal }: Options = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' };
  if (auth) {
    const token = await tokenStorage.get();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${apiUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err;
    // Telefon sunucuya ulaşamıyor (yanlış IP, farklı Wi-Fi, sunucu kapalı).
    throw new ApiError('NETWORK', 0, 'NETWORK_ERROR');
  }

  if (response.status === 204) return undefined as T;

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const error = json as ApiErrorResponse | null;
    if (response.status === 401 && auth) {
      await tokenStorage.clear();
      onUnauthorized?.();
    }
    throw new ApiError(error?.message ?? 'Unknown error', response.status, error?.error_code, error?.errors, error?.context);
  }
  return json as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown, auth = true) => request<T>(path, { method: 'POST', body, auth }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

/**
 * /api/* isteklerine localStorage'tan token enjekte eder; token yoksa hiçbir şey
 * eklemeden orijinal fetch çağrılır (auth-disabled backend modu için şart).
 *
 * Kullanım: main.tsx'te `installAuthInterceptor()` bir kez çağrılır.
 */

const STORAGE_KEY = 'nm_api_token';

export function getApiToken(): string {
  return localStorage.getItem(STORAGE_KEY) || '';
}

export function setApiToken(token: string): void {
  if (token) localStorage.setItem(STORAGE_KEY, token);
  else localStorage.removeItem(STORAGE_KEY);
}

/**
 * URL'nin /api/ ile başlayıp başlamadığını kontrol eder
 * (string veya URL/Request olabilir).
 */
function isApiUrl(input: RequestInfo | URL): boolean {
  let url = '';
  if (typeof input === 'string') url = input;
  else if (input instanceof URL) url = input.toString();
  else if (input instanceof Request) url = input.url;
  return url.includes('/api/');
}

/**
 * Custom event yayını: write isteği 401 alırsa App, bunu yakalayıp toast
 * gösterip kullanıcıyı Ayarlar → API Token bölümüne yönlendirir.
 */
export const AUTH_REQUIRED_EVENT = 'nm:auth-required';

export interface AuthRequiredDetail {
  reason: 'missing' | 'invalid';  // token hiç yok mu, yanlış mı
  method: string;                 // 401 dönen isteğin HTTP method'u
}

/**
 * /api/* isteklerinde localStorage'taki token'ı Authorization header olarak
 * ekler. 401 dönerse AUTH_REQUIRED_EVENT yayınlar — kullanıcıdan prompt
 * istemek yerine UI tarafında toast + Ayarlar yönlendirmesi yapılır.
 */
export function installAuthInterceptor(): void {
  const originalFetch = window.fetch.bind(window);

  const withAuth = (input: RequestInfo | URL, init: RequestInit | undefined, token: string): [RequestInfo | URL, RequestInit] => {
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    headers.set('Authorization', `Bearer ${token}`);
    return [input, { ...init, headers }];
  };

  const getMethod = (input: RequestInfo | URL, init?: RequestInit): string => {
    if (init?.method) return init.method.toUpperCase();
    if (input instanceof Request) return input.method.toUpperCase();
    return 'GET';
  };

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!isApiUrl(input)) return originalFetch(input, init);

    const token = getApiToken();
    const response = token
      ? await originalFetch(...withAuth(input, init, token))
      : await originalFetch(input, init);

    if (response.status !== 401) return response;

    // Backend method-aware: GET'ler zaten serbest, 401 yalnızca write'larda gelir.
    // Tek prompt yerine event yay; UI durumu kullanıcıya net göstersin.
    window.dispatchEvent(new CustomEvent<AuthRequiredDetail>(AUTH_REQUIRED_EVENT, {
      detail: { reason: token ? 'invalid' : 'missing', method: getMethod(input, init) },
    }));
    return response;
  };
}

/**
 * WebSocket URL'sine token query parametresi ekler (token varsa).
 */
export function appendWsToken(wsUrl: string): string {
  const token = getApiToken();
  if (!token) return wsUrl;
  const sep = wsUrl.includes('?') ? '&' : '?';
  return `${wsUrl}${sep}token=${encodeURIComponent(token)}`;
}

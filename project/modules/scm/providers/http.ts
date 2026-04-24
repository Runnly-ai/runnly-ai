interface RequestJsonOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

/**
 * Executes JSON HTTP requests and throws rich errors for non-2xx responses.
 */
export async function requestJson<T>(url: string, options: RequestJsonOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.headers || {}),
  };

  let body: string | undefined;
  if (options.body !== undefined) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  }

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body,
  });

  if (!response.ok) {
    const raw = await response.text();
    throw new Error(`Request failed (${response.status} ${response.statusText}) ${url}: ${raw}`);
  }

  const text = await response.text();
  if (!text) {
    return {} as T;
  }
  return JSON.parse(text) as T;
}

/**
 * Safely builds a basic auth header from token-only credentials.
 */
export function toBasicTokenAuth(token: string): string {
  return `Basic ${Buffer.from(`:${token}`, 'utf8').toString('base64')}`;
}

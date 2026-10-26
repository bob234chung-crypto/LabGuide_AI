import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp, securityHeaders } from './app.js';

/** Query parameter the Vercel route uses to pass the original /api sub-path to this function. */
export const PATH_PARAM = '__lgpath';

let app: ReturnType<typeof createApp>['app'] | null = null;

/** Vercel Node.js function: every /api/* request is routed here (see scripts/build-vercel.mjs). */
export default function handler(req: IncomingMessage, res: ServerResponse) {
  app ??= createApp().app;
  const url = new URL(req.url ?? '/', 'http://internal');
  if (url.searchParams.has(PATH_PARAM)) {
    const sub = url.searchParams.get(PATH_PARAM) ?? '';
    url.searchParams.delete(PATH_PARAM);
    req.url = `/api${sub ? `/${sub.replace(/^\/+/, '')}` : ''}${url.search}`;
  }
  app(req as Parameters<typeof app>[0], res as Parameters<typeof app>[1]);
}

/** The helmet headers the API sends, so the static files on Vercel's CDN get the same ones. */
export function staticHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const res = {
    setHeader: (k: string, v: string | number) => void (headers[k.toLowerCase()] = String(v)),
    removeHeader: (k: string) => void delete headers[k.toLowerCase()],
    getHeader: (k: string) => headers[k.toLowerCase()],
  };
  securityHeaders(true)({} as never, res as never, () => undefined);
  return headers;
}

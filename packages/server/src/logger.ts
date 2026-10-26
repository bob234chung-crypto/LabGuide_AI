const SECRET_KEYS = /(authorization|cookie|token|secret|password|code_verifier|code|state|api[-_]?key|credential|ciphertext)/i;

/** Redacts secrets and student free text before anything is logged. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[depth]';
  if (Array.isArray(value)) return value.slice(0, 10).map((v) => redact(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_KEYS.test(k)) out[k] = '[redacted]';
      else if (k === 'text' || k === 'hypothesis' || k === 'label') out[k] = `[${String(v ?? '').length} chars]`;
      else out[k] = redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

export function redactUrl(url: string): string {
  return url.replace(/([?&](code|state|token|access_token|code_verifier)=)[^&]*/gi, '$1[redacted]');
}

export const log = {
  info(msg: string, meta?: Record<string, unknown>) {
    if (process.env.NODE_ENV === 'test') return;
    console.log(JSON.stringify({ level: 'info', msg, ...(meta ? (redact(meta) as object) : {}) }));
  },
  warn(msg: string, meta?: Record<string, unknown>) {
    if (process.env.NODE_ENV === 'test') return;
    console.warn(JSON.stringify({ level: 'warn', msg, ...(meta ? (redact(meta) as object) : {}) }));
  },
};

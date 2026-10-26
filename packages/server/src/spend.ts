import type { KvClient } from './kv.js';
import { log } from './logger.js';

const MICROS = 1_000_000;

/** Hong Kong calendar date (UTC+8, no daylight saving), so the daily cap resets at local midnight. */
export function hkDay(nowMs: number): string {
  return new Date(nowMs + 8 * 3600_000).toISOString().slice(0, 10);
}

export interface Reservation {
  key: string;
  micros: number;
}

/**
 * Daily spend cap shared by every server instance. Amounts are integer micro-dollars in Redis.
 * Each call first reserves its worst-case cost (INCRBY, atomic), so concurrent calls cannot
 * overshoot the cap together; the reservation is then corrected to the real token usage.
 * Any storage error counts as "over budget" (fail closed).
 */
export class SpendMeter {
  private capMicros: number;

  constructor(
    private kv: KvClient,
    capUsd: number,
    private clock: () => number = Date.now,
  ) {
    this.capMicros = Math.round(capUsd * MICROS);
  }

  private key(): string {
    return `lg:spend:${hkDay(this.clock())}`;
  }

  /** Returns a reservation, or null when the cap would be passed (or the store is unreachable). */
  async reserve(costUsd: number): Promise<Reservation | null> {
    const micros = Math.max(1, Math.ceil(costUsd * MICROS));
    const key = this.key();
    try {
      const [, total] = await this.kv.exec([
        ['SET', key, 0, 'EX', 2 * 24 * 3600, 'NX'],
        ['INCRBY', key, micros],
      ]);
      if (Number(total) > this.capMicros) {
        await this.kv.exec([['INCRBY', key, -micros]]);
        return null;
      }
      return { key, micros };
    } catch {
      log.warn('spend_store_unavailable');
      return null;
    }
  }

  /** Replaces the reserved amount with the real cost (0 when the provider did not bill the call). */
  async settle(r: Reservation, actualUsd: number): Promise<void> {
    const delta = Math.ceil(actualUsd * MICROS) - r.micros;
    if (!delta) return;
    try {
      await this.kv.exec([['INCRBY', r.key, delta]]);
    } catch {
      log.warn('spend_store_unavailable');
    }
  }

  async spentTodayUsd(): Promise<number | null> {
    try {
      const [v] = await this.kv.exec([['GET', this.key()]]);
      return Number(v ?? 0) / MICROS;
    } catch {
      return null;
    }
  }

  /** True when no further call fits (or the spend store cannot be read). */
  async exhausted(minCallUsd: number): Promise<boolean> {
    const spent = await this.spentTodayUsd();
    return spent === null || (spent + minCallUsd) * MICROS > this.capMicros;
  }
}

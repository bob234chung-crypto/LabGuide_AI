import type { ServerConfig } from '../config.js';
import type { Store } from '../store.js';
import { DemoAdapter } from './demo.js';
import { GeminiAdapter } from './gemini.js';
import { PoeAdapter } from './poe.js';
import { validateTutorDraft } from './schema.js';
import { ProviderError, type TutorDraft, type TutorProvider, type TutorTurnContext } from './types.js';

export class ProviderRegistry {
  readonly demo = new DemoAdapter();
  readonly poe: PoeAdapter;
  readonly gemini: GeminiAdapter;

  constructor(private cfg: ServerConfig) {
    this.poe = new PoeAdapter(cfg);
    this.gemini = new GeminiAdapter(cfg);
  }

  /**
   * The server picks the provider from admin config. The client cannot choose a provider,
   * upstream URL, model or system prompt. If the configured real provider is not usable,
   * we stay in demo and say so; we never silently switch between real providers whose
   * privacy or billing behaviour differs.
   */
  active(store: Store): TutorProvider {
    const chosen = store.data.providerConfig.active ?? this.cfg.provider.active;
    if (!this.cfg.provider.allowlist.includes(chosen)) return this.demo;
    if (chosen === 'poe' && this.poe.configured) return this.poe;
    if (chosen === 'gemini' && this.gemini.configured) return this.gemini;
    return this.demo;
  }

  /** Timeouts, bounded retries and output validation around any provider call. */
  async sendTurn(
    store: Store,
    ctx: TutorTurnContext,
    opts: { simulateError?: boolean } = {},
  ): Promise<{ draft: TutorDraft; demo: boolean }> {
    const provider = this.active(store);
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.cfg.provider.maxRetries; attempt++) {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), this.cfg.provider.timeoutMs);
      try {
        if (opts.simulateError) {
          throw new ProviderError('Simulated provider outage (Demo mode).', true, 'unavailable');
        }
        const raw = await provider.sendTurn(ctx, ac.signal);
        return { draft: validateTutorDraft(raw), demo: provider.demo };
      } catch (err) {
        lastErr = err;
        if (err instanceof ProviderError && !err.retryable) break;
      } finally {
        clearTimeout(timer);
      }
    }
    if (lastErr instanceof ProviderError) throw lastErr;
    throw new ProviderError('The tutor is not available right now.', true, 'unavailable');
  }
}

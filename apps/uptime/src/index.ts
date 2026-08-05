/**
 * fold-uptime — cron monitor for the public fold.run properties.
 *
 * Every 5 minutes: HTTP checks on the site and docs. State lives in one
 * Durable Object; /status serves the latest snapshot; an optional
 * ALERT_WEBHOOK secret receives a POST on every state transition (down
 * after 2 consecutive failures, and recovery).
 */

export interface Env {
  MONITOR: DurableObjectNamespace;
  ALERT_WEBHOOK?: string;
}

interface Target {
  id: string;
  kind: 'http';
  url: string;
}

// TODO: restore an MCP-level ping (JSON-RPC round trip) when a public
// gateway endpoint exists again.
const TARGETS: Target[] = [
  { id: 'site', kind: 'http', url: 'https://fold.run' },
  { id: 'docs', kind: 'http', url: 'https://docs.fold.run' },
];

const FAILURES_BEFORE_DOWN = 2;
const CHECK_TIMEOUT_MS = 10_000;
const HISTORY_LIMIT = 288; // 24h of 5-minute checks per target

interface TargetState {
  id: string;
  url: string;
  status: 'up' | 'down';
  consecutiveFailures: number;
  lastCheckAt: string;
  lastOkAt?: string;
  lastError?: string;
  latencyMs?: number;
}

async function checkTarget(
  target: Target,
): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const started = Date.now();
  try {
    const res = await fetch(target.url, { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
    const latencyMs = Date.now() - started;
    if (!res.ok) return { ok: false, latencyMs, error: `HTTP ${res.status}` };
    return { ok: true, latencyMs };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const stub = env.MONITOR.get(env.MONITOR.idFromName('monitor'));
    ctx.waitUntil(stub.fetch('https://monitor.internal/run', { method: 'POST' }));
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const stub = env.MONITOR.get(env.MONITOR.idFromName('monitor'));
    if (url.pathname === '/status') return await stub.fetch('https://monitor.internal/status');
    if (url.pathname === '/run' && request.method === 'POST') {
      return await stub.fetch('https://monitor.internal/run', { method: 'POST' });
    }
    return new Response('fold-uptime: GET /status\n', {
      headers: { 'content-type': 'text/plain' },
    });
  },
};

export class UptimeMonitorDO implements DurableObject {
  readonly #state: DurableObjectState;
  readonly #env: Env;
  #targets = new Map<string, TargetState>();

  constructor(state: DurableObjectState, env: Env) {
    this.#state = state;
    this.#env = env;
    state.blockConcurrencyWhile(async () => {
      const stored = await state.storage.list<TargetState>({ prefix: 'target:' });
      for (const t of stored.values()) this.#targets.set(t.id, t);
    });
  }

  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === '/run') {
      await this.#runChecks();
      return Response.json({ ran: true, at: new Date().toISOString() });
    }
    if (path === '/status') {
      const targets = [...this.#targets.values()];
      const allUp = targets.length > 0 && targets.every((t) => t.status === 'up');
      return Response.json(
        { overall: allUp ? 'up' : 'degraded', targets },
        { status: allUp ? 200 : 503 },
      );
    }
    return new Response('not found', { status: 404 });
  }

  async #runChecks(): Promise<void> {
    const results = await Promise.all(TARGETS.map(async (t) => ({ t, r: await checkTarget(t) })));
    for (const { t, r } of results) {
      const prev: TargetState = this.#targets.get(t.id) ?? {
        id: t.id,
        url: t.url,
        status: 'up',
        consecutiveFailures: 0,
        lastCheckAt: '',
      };
      const consecutiveFailures = r.ok ? 0 : prev.consecutiveFailures + 1;
      const status: 'up' | 'down' =
        consecutiveFailures >= FAILURES_BEFORE_DOWN ? 'down' : r.ok ? 'up' : prev.status;
      const next: TargetState = {
        id: t.id,
        url: t.url,
        status,
        consecutiveFailures,
        lastCheckAt: new Date().toISOString(),
        latencyMs: r.latencyMs,
        ...(r.ok
          ? { lastOkAt: new Date().toISOString() }
          : prev.lastOkAt !== undefined && { lastOkAt: prev.lastOkAt }),
        ...(r.error !== undefined && { lastError: r.error }),
      };
      this.#targets.set(t.id, next);
      await this.#state.storage.put(`target:${t.id}`, next);
      await this.#appendHistory(t.id, r.ok, r.latencyMs);

      if (prev.status !== next.status && prev.lastCheckAt !== '') {
        await this.#alert(next, prev.status);
      }
    }
  }

  async #appendHistory(id: string, ok: boolean, latencyMs: number): Promise<void> {
    const key = `history:${id}`;
    const history = (await this.#state.storage.get<unknown[]>(key)) ?? [];
    history.push({ at: new Date().toISOString(), ok, latencyMs });
    await this.#state.storage.put(key, history.slice(-HISTORY_LIMIT));
  }

  /** Best-effort webhook on up↔down transitions; silence must never break checks. */
  async #alert(target: TargetState, from: 'up' | 'down'): Promise<void> {
    const webhook = this.#env.ALERT_WEBHOOK;
    if (webhook === undefined || webhook === '') return;
    const emoji = target.status === 'down' ? '🔴' : '🟢';
    try {
      await fetch(webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          // `text` renders on Slack-compatible webhooks; the rest is structure.
          text: `${emoji} fold-uptime: ${target.id} is ${target.status.toUpperCase()} (was ${from}) — ${target.url}${target.lastError ? ` · ${target.lastError}` : ''}`,
          target,
        }),
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      });
    } catch {
      // alerting is best-effort by design
    }
  }
}

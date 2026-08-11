/**
 * fold-uptime — cron monitor for the public fold.run properties.
 *
 * Every 5 minutes: HTTP checks on the site and docs, plus an MCP initialize
 * round trip against the demo gateway. State lives in one
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
  kind: 'http' | 'mcp-init';
  url: string;
  /**
   * The release this deployment is supposed to be serving, compared against
   * `serverInfo.version` from the initialize round trip we already make.
   *
   * Availability checks cannot see this class of failure: a gateway two
   * releases behind answers every probe perfectly. It happened — the demo
   * served v1.4.1 for three days against a v1.5.0 pin, because bumping the
   * pin and redeploying the container are separate acts and only the first
   * one is in a commit.
   *
   * Must equal the tag in apps/demo/Dockerfile; CI fails if it drifts.
   */
  expectVersion?: string;
}

const TARGETS: Target[] = [
  { id: 'site', kind: 'http', url: 'https://fold.run' },
  { id: 'docs', kind: 'http', url: 'https://docs.fold.run' },
  // Real JSON-RPC round trips (initialize), not just a 200 — we monitor
  // the protocol, not the port. Checking the tasks upstream directly also
  // separates "gateway down" from "upstream down" when demo alerts fire.
  { id: 'demo', kind: 'mcp-init', url: 'https://demo.fold.run/mcp', expectVersion: 'v1.10.1' },
  { id: 'demo-tasks', kind: 'mcp-init', url: 'https://tasks.fold.run/mcp' },
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
  /** Last `serverInfo.version` seen, for targets that report one. */
  version?: string;
  expectVersion?: string;
  /** Running something other than `expectVersion`. Serving fine, wrong build. */
  versionStale?: boolean;
}

async function checkTarget(
  target: Target,
): Promise<{ ok: boolean; latencyMs: number; error?: string; version?: string }> {
  const started = Date.now();
  try {
    const res =
      target.kind === 'mcp-init'
        ? await fetch(target.url, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              accept: 'application/json, text/event-stream',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'initialize',
              params: {
                protocolVersion: '2026-07-28',
                capabilities: {},
                clientInfo: { name: 'fold-uptime', version: '1' },
              },
            }),
            signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
          })
        : await fetch(target.url, { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
    const latencyMs = Date.now() - started;
    if (!res.ok) return { ok: false, latencyMs, error: `HTTP ${res.status}` };
    if (target.kind === 'mcp-init') {
      const body = await res.text();
      if (!body.includes('"serverInfo"')) {
        return { ok: false, latencyMs, error: 'no initialize result in response' };
      }
      // Scoped to serverInfo so the sibling `protocolVersion` can't be read as
      // the build. The body is SSE or plain JSON depending on the server, so
      // this matches the text rather than parsing a frame format twice.
      const version = body.match(/"serverInfo"\s*:\s*\{[^}]*?"version"\s*:\s*"([^"]+)"/)?.[1];
      return { ok: true, latencyMs, ...(version !== undefined && { version }) };
    }
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
    if (url.pathname === '/status') {
      const res = await stub.fetch('https://monitor.internal/status');
      // Public data, read cross-origin by the fold.run/status page.
      const headers = new Headers(res.headers);
      headers.set('access-control-allow-origin', '*');
      return new Response(res.body, { status: res.status, headers });
    }
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
      // `overall` and the HTTP code stay a pure availability signal: a target
      // on the wrong build is serving every request correctly, and flipping
      // the status page red for it would both lie and train people to ignore
      // it. Drift rides alongside, in its own field.
      const stale = targets.filter((t) => t.versionStale === true).map((t) => t.id);
      return Response.json(
        { overall: allUp ? 'up' : 'degraded', stale, targets },
        { status: allUp ? 200 : 503 },
      );
    }
    return new Response('not found', { status: 404 });
  }

  async #runChecks(): Promise<void> {
    // Prune state for targets that no longer exist (e.g. removed from TARGETS
    // in a deploy) — the DO outlives the target list that wrote it.
    const known = new Set(TARGETS.map((t) => t.id));
    for (const id of [...this.#targets.keys()]) {
      if (!known.has(id)) {
        this.#targets.delete(id);
        await this.#state.storage.delete(`target:${id}`);
        await this.#state.storage.delete(`history:${id}`);
      }
    }

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
      // A failed check tells us nothing new about the build, so hold the last
      // version we saw rather than letting an outage read as a version change.
      const version = r.version ?? prev.version;
      const versionStale =
        t.expectVersion !== undefined && version !== undefined && version !== t.expectVersion;
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
        ...(version !== undefined && { version }),
        ...(t.expectVersion !== undefined && { expectVersion: t.expectVersion, versionStale }),
      };
      this.#targets.set(t.id, next);
      await this.#state.storage.put(`target:${t.id}`, next);
      await this.#appendHistory(t.id, r.ok, r.latencyMs);

      if (prev.status !== next.status && prev.lastCheckAt !== '') {
        await this.#alert(next, prev.status);
      }
      // Drift alerts are independent of up/down: the whole point is that this
      // fires while the target is up and every availability signal is green.
      const wasStale = prev.versionStale === true;
      const isStale = next.versionStale === true;
      if (wasStale !== isStale && prev.lastCheckAt !== '') {
        await this.#alertDrift(next, isStale);
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

  /** Best-effort webhook when a target starts or stops serving the wrong build. */
  async #alertDrift(target: TargetState, stale: boolean): Promise<void> {
    const webhook = this.#env.ALERT_WEBHOOK;
    if (webhook === undefined || webhook === '') return;
    const text = stale
      ? `🟠 fold-uptime: ${target.id} is UP but serving ${target.version} — expected ${target.expectVersion}. The pin moved and the deploy did not.`
      : `🟢 fold-uptime: ${target.id} is back on ${target.expectVersion}.`;
    try {
      await fetch(webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, target }),
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      });
    } catch {
      // alerting is best-effort by design
    }
  }
}

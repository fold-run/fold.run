/**
 * fold-uptime — cron monitor for the public fold.run properties.
 *
 * Every 5 minutes: HTTP checks on the site and docs, an MCP initialize round
 * trip against the open gateways, and — for a gateway that requires a token —
 * an assertion that it refuses one that has none. State lives in one
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
  /**
   * `mcp-guarded` is for a gateway with `auth.mode: "required"`, where the
   * `mcp-init` probe would read a correct 401 as an outage. It asserts the
   * refusal instead: a 401 carrying a `WWW-Authenticate` challenge is the
   * pass condition, and anything else — including a 200 — is a failure.
   * A gateway that started answering initialize unauthenticated has lost its
   * auth config, which no availability check would otherwise notice.
   */
  kind: 'http' | 'mcp-init' | 'mcp-guarded';
  url: string;
  /**
   * `mcp-guarded` only: an unauthenticated endpoint carrying `version`.
   * The refusal above proves the door is locked but says nothing about the
   * build behind it, and `/health` is open by design on every fold gateway.
   */
  versionUrl?: string;
  /**
   * The status code that means healthy, when it is not a 2xx.
   *
   * The console proxies the control plane so both share one origin, and an
   * anonymous `/v1/me` is *supposed* to be a 401. A 404 there is the failure
   * worth catching: a Worker that fetches another Worker by hostname is
   * answered by itself, the request never leaves, and the 404 it returns is
   * indistinguishable from the other service saying no. Availability checks
   * read that as fine, because the origin is up — it is the binding behind it
   * that is gone.
   */
  expectStatus?: number;
  /**
   * What the status page calls this, when the URL is not the answer.
   *
   * The page names a row by its URL, which reads well for `fold.run` and badly
   * for a probe: `mcp.fold.run/.well-known/oauth-protected-resource` is a
   * mouthful, and `console.fold.run/v1/me` looks like something leaked. The
   * URL stays the thing that is checked; this is the thing that is read.
   */
  label?: string;
  /**
   * Publish this target on fold.run/status. Default true.
   *
   * The product estate is monitored before it is announced: alerting is the
   * point, and the status page is a separate, editorial decision about what
   * customers are told exists. `overall` is computed from published targets
   * only, so the page never shows "degraded" with every visible row green —
   * a private failure still fires ALERT_WEBHOOK, which is what it is for.
   */
  public?: boolean;
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
   * Must equal the tag pinned in the container apps' Dockerfiles — every
   * gateway runs one release — and CI fails if any of them drift apart.
   */
  expectVersion?: string;
}

const TARGETS: Target[] = [
  { id: 'site', kind: 'http', url: 'https://fold.run' },
  { id: 'docs', kind: 'http', url: 'https://docs.fold.run' },
  // Real JSON-RPC round trips (initialize), not just a 200 — we monitor
  // the protocol, not the port. Checking the tasks upstream directly also
  // separates "gateway down" from "upstream down" when demo alerts fire.
  { id: 'demo', kind: 'mcp-init', url: 'https://demo.fold.run/mcp', expectVersion: 'v1.14.0' },
  { id: 'demo-tasks', kind: 'mcp-init', url: 'https://tasks.fold.run/mcp' },
  // The governed gateway. Its correct answer to an anonymous initialize is a
  // 401, so it needs the guarded check rather than the one the demo uses.
  {
    id: 'enterprise',
    kind: 'mcp-guarded',
    url: 'https://enterprise.fold.run/mcp',
    versionUrl: 'https://enterprise.fold.run/health',
    expectVersion: 'v1.14.0',
  },

  // fold cloud — the half of the estate that has customers. Published: with no
  // ALERT_WEBHOOK set, the status page is the only channel these have, and a
  // check nobody can see is not monitoring. `public: false` stays available
  // for the next property that is watched before it is announced.
  //
  // No `expectVersion` on the two Go services yet. Their /health has just
  // learned to report the commit it was built from, but these deploy from
  // main rather than from a tag, so there is nothing here to compare it to —
  // the value is worth surfacing before it is worth asserting.
  { id: 'cloud-api', kind: 'http', label: 'api.fold.run', url: 'https://api.fold.run/health' },
  {
    id: 'cloud-broker',
    kind: 'http',
    label: 'broker.fold.run',
    url: 'https://broker.fold.run/health',
  },
  // The router's apex metadata (RFC 9728) — what a gateway's 401 challenge
  // points a client at, so a client that cannot read this cannot find its way
  // in at all, however healthy the gateway behind it is.
  {
    id: 'cloud-mcp',
    kind: 'http',
    label: 'mcp.fold.run',
    url: 'https://mcp.fold.run/.well-known/oauth-protected-resource',
  },
  {
    id: 'cloud-console',
    kind: 'http',
    label: 'console.fold.run',
    url: 'https://console.fold.run/',
  },
  // The console's other half, and a row of its own because it fails on its
  // own: serving assets proves nothing about the proxy that makes the console
  // and the API one origin, and that proxy is a service binding — see
  // `expectStatus`. A customer whose console loads but cannot sign in is
  // looking at exactly this row.
  {
    id: 'cloud-console-api',
    kind: 'http',
    label: 'console.fold.run · API',
    url: 'https://console.fold.run/v1/me',
    expectStatus: 401,
  },
];

const FAILURES_BEFORE_DOWN = 2;
const CHECK_TIMEOUT_MS = 10_000;
const HISTORY_LIMIT = 288; // 24h of 5-minute checks per target
/**
 * The floor between check cycles, whoever asked for one.
 *
 * /run is unauthenticated, which is right — forcing a check after a deploy
 * should not need a credential, and the endpoint reveals nothing /status does
 * not. But each call fans out to every target, so without a floor it is a
 * small amplifier aimed at fold's own properties by anyone who finds it.
 *
 * Well under the 5-minute cron, so the schedule never trips it, and short
 * enough that a human forcing a check still gets one.
 */
const MIN_RUN_INTERVAL_MS = 30_000;

interface TargetState {
  id: string;
  url: string;
  /** What the status page shows instead of the URL, when one is set. */
  label?: string;
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

/**
 * A gateway that requires a token: assert the refusal, then read the build
 * from the open health endpoint. Two requests rather than one, which also
 * keeps its container as warm as the demo's single ping keeps that one.
 */
async function checkGuarded(
  target: Target,
  started: number,
): Promise<{ ok: boolean; latencyMs: number; error?: string; version?: string }> {
  const res = await fetch(target.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
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
  });
  const latencyMs = Date.now() - started;
  if (res.status !== 401) {
    // A 200 here is the alarming case, not a relief: the gateway is serving
    // MCP to anyone. Name it as such rather than reporting a bare status.
    const detail =
      res.status === 200 ? 'answered initialize UNAUTHENTICATED' : `HTTP ${res.status}`;
    return { ok: false, latencyMs, error: `expected 401, ${detail}` };
  }
  if (!res.headers.get('www-authenticate')) {
    return { ok: false, latencyMs, error: '401 without a WWW-Authenticate challenge' };
  }
  if (!target.versionUrl) return { ok: true, latencyMs };
  try {
    const health = await fetch(target.versionUrl, {
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    if (!health.ok) return { ok: false, latencyMs, error: `health HTTP ${health.status}` };
    const version = (await health.json<{ version?: string }>()).version;
    return { ok: true, latencyMs, ...(version !== undefined && { version }) };
  } catch (error) {
    return {
      ok: false,
      latencyMs,
      error: `health: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function checkTarget(
  target: Target,
): Promise<{ ok: boolean; latencyMs: number; error?: string; version?: string }> {
  const started = Date.now();
  try {
    if (target.kind === 'mcp-guarded') return await checkGuarded(target, started);
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
    if (target.expectStatus !== undefined) {
      return res.status === target.expectStatus
        ? { ok: true, latencyMs }
        : {
            ok: false,
            latencyMs,
            error: `expected ${target.expectStatus}, got HTTP ${res.status}`,
          };
    }
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
  /** Held in memory only: an evicted DO forgets and allows a run, which is the
   *  direction a monitor should fail in. */
  #lastRunAt = 0;

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
      const now = Date.now();
      if (now - this.#lastRunAt < MIN_RUN_INTERVAL_MS) {
        // Deliberately not an error: the caller asked for fresh state and the
        // state is fresh. Saying so beats running the fan-out again.
        return Response.json(
          {
            ran: false,
            reason: 'checked moments ago',
            at: new Date(this.#lastRunAt).toISOString(),
          },
          { status: 429 },
        );
      }
      this.#lastRunAt = now;
      await this.#runChecks();
      return Response.json({ ran: true, at: new Date().toISOString() });
    }
    if (path === '/status') {
      // Published targets only. Everything is checked and everything alerts;
      // this endpoint is what fold.run/status renders, and an unannounced
      // property showing up there would announce it.
      const publish = new Set(TARGETS.filter((t) => t.public !== false).map((t) => t.id));
      const targets = [...this.#targets.values()].filter((t) => publish.has(t.id));
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
        ...(t.label !== undefined && { label: t.label }),
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
        ...(t.label !== undefined && { label: t.label }),
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
    if (webhook === undefined || webhook === '') {
      // A published target still shows the transition on the status page, so
      // no webhook is a thin channel rather than no channel. An unpublished
      // one has nowhere else to appear: it is filtered out of /status by
      // design, so this transition just happened to nobody. Say so, loudly,
      // because the failure is silence and silence is what it looks like when
      // everything is fine.
      const published = TARGETS.find((t) => t.id === target.id)?.public !== false;
      if (!published) {
        console.warn(
          `fold-uptime: ${target.id} went ${target.status} and nothing was told — ` +
            'it is unpublished and ALERT_WEBHOOK is not set. ' +
            'Set the secret, or make the target public.',
        );
      }
      return;
    }
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

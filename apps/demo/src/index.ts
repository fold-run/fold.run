/**
 * fold-demo — Worker fronting the singleton fold container at demo.fold.run.
 *
 * The container runs the unmodified fold release; this Worker only routes.
 * One named instance ("demo") keeps every request on the same container,
 * which fold's session-keyed client side requires.
 */
import { Container, getContainer } from '@cloudflare/containers';

// The federation the demo presents. Upstreams are public MCP servers:
// Cloudflare's docs server, GitMCP (2025-era session handshake), and the
// task-minting demo server (apps/demo-tasks — Go, official SDK).
const FOLD_CONFIG = {
  upstreams: [
    { id: 'cf-docs', url: 'https://docs.mcp.cloudflare.com/mcp', namespace: 'cfdocs' },
    { id: 'gitmcp', url: 'https://gitmcp.io/docs', namespace: 'git' },
    { id: 'demo-tasks', url: 'https://tasks.fold.run/mcp', namespace: 'jobs' },
  ],
  server: {
    allowedHosts: ['demo.fold.run'],
    rateLimit: { requestsPerMinute: 300 },
    // The console doubles as the demo's front door: /console shows the
    // federation live, and its test console is a plain governed MCP client.
    // Since v1.9 the page and the API it reads are configured separately, and
    // the page requires the API — a console-only config is refused at startup,
    // not degraded, so these two move together.
    introspection: { enabled: true },
    console: { enabled: true },
  },
};

export class FoldDemo extends Container {
  defaultPort = 8080;
  // This is now the only thing bounding what the container costs. It used to
  // be a backstop — the uptime monitor pinged every 5 minutes, so in practice
  // the container never slept — but that monitor is undeployed, so an idle
  // hour after one visitor is an hour of provisioned memory and disk on the
  // bill. Shorten it to trade a ~1.7s cold start for that tail.
  sleepAfter = '1h';
  enableInternet = true; // fold dials the public upstreams
  envVars = { FOLD_CONFIG: JSON.stringify(FOLD_CONFIG) };
}

interface Env {
  FOLD_DEMO: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Bare host is the "I pasted the URL in a browser" case: fold answers 404
    // there, so send it to the console instead. Trailing slash is fold's own
    // canonical path for it — redirecting to /console would only hop again.
    const url = new URL(request.url);
    if (url.pathname === '/') {
      return Response.redirect(new URL('/console/', url).toString(), 302);
    }

    try {
      return await getContainer(env.FOLD_DEMO as never, 'demo').fetch(request);
    } catch {
      // Container cold-start hiccup: a clean 503 beats an opaque 1101.
      return new Response('demo gateway is starting, retry in a few seconds\n', { status: 503 });
    }
  },
};

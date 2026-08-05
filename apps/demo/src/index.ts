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
    { id: 'demo-tasks', url: 'https://fold-demo-tasks.bauman.workers.dev/mcp', namespace: 'jobs' },
  ],
  server: {
    allowedHosts: ['demo.fold.run', 'fold-demo.bauman.workers.dev'],
    rateLimit: { requestsPerMinute: 300 },
    // The console doubles as the demo's front door: /console shows the
    // federation live, and its test console is a plain governed MCP client.
    console: { enabled: true },
  },
};

export class FoldDemo extends Container {
  defaultPort = 8080;
  // The uptime monitor pings every 5 minutes, so in practice this never
  // sleeps; the timeout is the backstop if monitoring stops.
  sleepAfter = '1h';
  enableInternet = true; // fold dials the public upstreams
  envVars = { FOLD_CONFIG: JSON.stringify(FOLD_CONFIG) };
}

interface Env {
  FOLD_DEMO: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await getContainer(env.FOLD_DEMO as never, 'demo').fetch(request);
    } catch {
      // Container cold-start hiccup: a clean 503 beats an opaque 1101.
      return new Response('demo gateway is starting, retry in a few seconds\n', { status: 503 });
    }
  },
};

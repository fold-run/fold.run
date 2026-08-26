/**
 * fold-demo-tasks — Worker fronting the singleton task-server container.
 *
 * The Go server (main.go) holds the job board in memory, so every request
 * must land on the same instance; one named container gives that. Jobs are
 * ephemeral by design — a container restart clears the board.
 */
import { Container, getContainer } from '@cloudflare/containers';

export class TasksBoard extends Container {
  defaultPort = 8080;
  // Matched to the gateways rather than left at the 2h it had. The board is
  // ephemeral by design and demo jobs run for seconds, so there is no state
  // here worth paying to keep warm — and the gateway forwards every tasks
  // call, which keeps this awake for exactly as long as anyone is using it.
  // A poll that does land on a cold start gets the 503-and-retry below.
  sleepAfter = '15m';
  enableInternet = false; // it dials nothing; it only answers
}

interface Env {
  TASKS_BOARD: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await getContainer(env.TASKS_BOARD as never, 'board').fetch(request);
    } catch {
      return new Response('demo-tasks is starting, retry in a few seconds\n', { status: 503 });
    }
  },
};

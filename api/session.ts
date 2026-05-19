// =============================================================================
// api/session.ts — Server-Sent Events channel (Vercel's "WebSocket equivalent")
// =============================================================================
//
// WHY SSE and not WebSocket: Vercel does NOT support persistent WebSocket
// connections on Serverless or Edge Functions — the request/response model
// has no upgrade path. SSE is the closest server->client streaming primitive
// that works inside the constraints, and Edge runtime supports streaming
// ReadableStream responses natively. We use SSE so the proxy can push
// real-time session updates (cookie set, redirect, error) to the browser
// without the client polling.
//
// LIMITATIONS:
//   - One-way only (server -> client). For client -> server you still POST
//     to /api/proxy.
//   - Connection lifetime is bounded by Edge function max-duration (30s on
//     Hobby, 300s on Pro). The client must auto-reconnect — EventSource
//     does this for free.
//   - Subscribers live in this isolate's memory. If /api/proxy runs in a
//     *different* isolate, its events won't reach this isolate's
//     subscribers. For demo this is fine; for prod use Vercel KV pub/sub
//     or Upstash Redis pubsub to fan out across isolates.
// =============================================================================

export const config = {
	runtime: 'edge',
};

type SessionEvent = { type: string; [k: string]: unknown };
type Subscriber = (ev: SessionEvent) => void;

// Shared with api/proxy.ts via globalThis (same caveat as the cookie jar there)
const subscribers: Map<string, Set<Subscriber>> =
	(globalThis as any).__edgeSubscribers ?? new Map();
(globalThis as any).__edgeSubscribers = subscribers;

export default async function handler(req: Request): Promise<Response> {
	const url = new URL(req.url);
	const sessionId = url.searchParams.get('session') || 'default';

	const encoder = new TextEncoder();

	// WHY a manual ReadableStream (not a generator): we need access to the
	// `controller` from inside the subscriber callback, which fires
	// asynchronously when the proxy publishes an event.
	const stream = new ReadableStream({
		start(controller) {
			let closed = false;
			const enqueue = (chunk: string) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(chunk));
				} catch {
					closed = true;
				}
			};

			// SSE wire format: `event: <name>\ndata: <json>\n\n`
			const send = (event: string, data: unknown) => {
				enqueue(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
			};

			// Initial hello so the client knows the channel is live
			send('open', { session: sessionId, t: Date.now() });

			const sub: Subscriber = (ev) => send(ev.type, ev);
			let set = subscribers.get(sessionId);
			if (!set) {
				set = new Set();
				subscribers.set(sessionId, set);
			}
			set.add(sub);

			// WHY a heartbeat: many proxies/load balancers will drop a
			// connection that's been idle for ~30s. Sending a comment line
			// (lines starting with `:`) is the SSE-standard keep-alive and
			// is ignored by EventSource.
			const heartbeat = setInterval(() => {
				enqueue(`: keep-alive ${Date.now()}\n\n`);
			}, 15_000);

			// WHY we listen for the request's AbortSignal: when the client
			// closes the EventSource, Edge runtime aborts the request, and
			// that's our only signal to clean up. Without this, dead
			// subscribers accumulate in the Set and leak memory on the
			// isolate (until it gets recycled).
			const abort = () => {
				closed = true;
				clearInterval(heartbeat);
				set?.delete(sub);
				if (set && set.size === 0) subscribers.delete(sessionId);
				try {
					controller.close();
				} catch {
					/* already closed */
				}
			};
			req.signal.addEventListener('abort', abort);
		},
	});

	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream; charset=utf-8',
			// WHY no-transform: some intermediary proxies will gzip the stream
			// and that buffers SSE events. no-transform tells them to stop.
			'cache-control': 'no-cache, no-transform',
			connection: 'keep-alive',
			// WHY X-Accel-Buffering: defends against nginx-like front-ends
			// (Vercel's edge included) that buffer responses by default.
			'x-accel-buffering': 'no',
			'access-control-allow-origin': '*',
		},
	});
}

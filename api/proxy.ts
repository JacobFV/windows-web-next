// =============================================================================
// api/proxy.ts — Edge-runtime web proxy for the in-browser Edge app
// =============================================================================
//
// Run locally with: npx vercel dev    (vite alone won't serve /api/*)
//
// WHY Edge runtime (not Node): Vercel's default Node serverless runtime expects
// a (req: VercelRequest, res: VercelResponse) handler signature. Exporting a
// Web-Standard `(req: Request) => Response` handler under Node causes
// FUNCTION_INVOCATION_FAILED (the 500 we were seeing). Edge runtime accepts
// Web Standard `Request`/`Response` natively, supports streaming bodies (which
// we need to pipe binary content through), and gives 30s of wall time on the
// Hobby plan (vs 10s on Node Hobby). Pro raises this to 60/300s.
//
// WHY no true WebSocket: Vercel Serverless AND Edge Functions are
// request/response only — they cannot hold a persistent socket open. There is
// no upgrade path. If you need real WS, deploy a separate server (Fly.io /
// Railway / Render) and point the client at it. For everything else, see
// api/session.ts which gives us a server->client stream over SSE — that's our
// "WS-equivalent" on Vercel.
//
// WHY proxified URL goes in `?url=` not in the path: putting the target URL
// in the path forces double-encoding (the browser re-encodes any %xx in the
// path), which mangles query strings and breaks signed URLs. Query params are
// only encoded once, which is what we want.
//
// EDGE RUNTIME LIMITS (don't accidentally break these):
//   - No Node modules. No `fs`, no `http`, no `Buffer` constructor (use
//     `Uint8Array` or `TextEncoder`/`TextDecoder`).
//   - Global `fetch` is available and is the only HTTP client.
//   - 4 MB request-body cap.
//   - In-memory state (this file's top-level Maps) lives only for the
//     lifetime of an Edge isolate. Cold starts wipe it. See "cookie jar
//     caveat" below.
// =============================================================================

export const config = {
	runtime: 'edge',
};

// -----------------------------------------------------------------------------
// Cookie jar
// -----------------------------------------------------------------------------
// WHY in-memory and not Redis/KV: zero new deps, demo-grade. Each Edge isolate
// gets its own jar; if a user's request routes to a cold instance their
// session may appear "logged out". For production, swap this Map for Vercel
// KV / Upstash Redis behind the same get/set/clear interface — nothing else
// in this file should need to change.
// -----------------------------------------------------------------------------

type Cookie = {
	name: string;
	value: string;
	domain?: string;
	path?: string;
	expires?: number; // epoch ms
	secure?: boolean;
	httpOnly?: boolean;
	sameSite?: string;
};

// keyed by `${sessionId}|${originHost}`
const cookieJar: Map<string, Cookie[]> = (globalThis as any).__edgeCookieJar ?? new Map();
(globalThis as any).__edgeCookieJar = cookieJar;

function jarKey(sessionId: string, originHost: string): string {
	return `${sessionId}|${originHost}`;
}

// WHY a hand-rolled Set-Cookie parser: Edge runtime has no `tough-cookie`
// equivalent. We do the bare minimum needed for session continuity (name,
// value, expires/max-age, path, domain). We ignore HttpOnly/Secure for
// transmission decisions since we're the only client of the upstream.
function parseSetCookie(header: string, originHost: string): Cookie | null {
	const parts = header.split(';').map((s) => s.trim());
	if (parts.length === 0) return null;
	const [nv] = parts;
	const eq = nv.indexOf('=');
	if (eq < 0) return null;
	const name = nv.slice(0, eq).trim();
	const value = nv.slice(eq + 1).trim();
	if (!name) return null;
	const cookie: Cookie = { name, value, domain: originHost, path: '/' };
	for (let i = 1; i < parts.length; i++) {
		const attr = parts[i];
		const lower = attr.toLowerCase();
		if (lower.startsWith('domain=')) {
			cookie.domain = attr.slice(7).replace(/^\./, '').toLowerCase();
		} else if (lower.startsWith('path=')) {
			cookie.path = attr.slice(5);
		} else if (lower.startsWith('expires=')) {
			const t = Date.parse(attr.slice(8));
			if (!Number.isNaN(t)) cookie.expires = t;
		} else if (lower.startsWith('max-age=')) {
			const s = parseInt(attr.slice(8), 10);
			if (!Number.isNaN(s)) cookie.expires = Date.now() + s * 1000;
		} else if (lower === 'secure') {
			cookie.secure = true;
		} else if (lower === 'httponly') {
			cookie.httpOnly = true;
		} else if (lower.startsWith('samesite=')) {
			cookie.sameSite = attr.slice(9);
		}
	}
	return cookie;
}

function storeCookies(sessionId: string, originHost: string, setCookies: string[]): string[] {
	const key = jarKey(sessionId, originHost);
	const existing = cookieJar.get(key) ?? [];
	const changed: string[] = [];
	for (const raw of setCookies) {
		const c = parseSetCookie(raw, originHost);
		if (!c) continue;
		// drop any existing cookie with same name+path
		const filtered = existing.filter((e) => !(e.name === c.name && e.path === c.path));
		filtered.push(c);
		// replace `existing` reference in-place so the loop sees prior writes
		existing.length = 0;
		existing.push(...filtered);
		changed.push(c.name);
	}
	cookieJar.set(key, existing);
	return changed;
}

function buildCookieHeader(sessionId: string, originHost: string, path: string): string {
	const key = jarKey(sessionId, originHost);
	const all = cookieJar.get(key) ?? [];
	const now = Date.now();
	const matched = all.filter((c) => {
		if (c.expires && c.expires < now) return false;
		if (c.path && !path.startsWith(c.path)) return false;
		return true;
	});
	return matched.map((c) => `${c.name}=${c.value}`).join('; ');
}

function clearJar(sessionId: string): void {
	for (const key of Array.from(cookieJar.keys())) {
		if (key.startsWith(`${sessionId}|`)) cookieJar.delete(key);
	}
}

// -----------------------------------------------------------------------------
// Cross-module event bus (consumed by api/session.ts)
// -----------------------------------------------------------------------------
// WHY globalThis-attached: api/session.ts and api/proxy.ts are separate Edge
// functions and may run in *different* isolates, but within a single isolate
// we share state via globalThis. Same caveat as the cookie jar: best-effort,
// demo-grade. Use Vercel KV pub/sub or Upstash Redis pubsub for cross-isolate
// fanout in production.
// -----------------------------------------------------------------------------

type SessionEvent = { type: string; [k: string]: unknown };
type Subscriber = (ev: SessionEvent) => void;

const subscribers: Map<string, Set<Subscriber>> =
	(globalThis as any).__edgeSubscribers ?? new Map();
(globalThis as any).__edgeSubscribers = subscribers;

function publish(sessionId: string, ev: SessionEvent): void {
	const set = subscribers.get(sessionId);
	if (!set) return;
	for (const fn of set) {
		try {
			fn(ev);
		} catch {
			/* subscriber errors must not break the proxy */
		}
	}
}

// -----------------------------------------------------------------------------
// URL helpers
// -----------------------------------------------------------------------------

function proxify(absoluteUrl: string, sessionId: string): string {
	// WHY path-based (not ?url=…): webpack's __webpack_require__.p (publicPath)
	// auto-detect uses document.currentScript.src.lastIndexOf('/') to figure
	// out where assets live. With a query-based URL like /api/proxy?url=… the
	// last `/` is in `/api/proxy`, so webpack sets publicPath="/api/" and
	// chunks request /api/<chunkId>.js → 404. With a path-based URL like
	// /api/proxy/host/assets/main.js, publicPath becomes
	// /api/proxy/host/assets/ and chunks load from /api/proxy/host/assets/<chunkId>.js
	// which routes back through us correctly.
	//
	// Format: /api/proxy/<scheme>/<host>/<path...>?<upstream-query>&__s=<session>
	// We keep the scheme in the path because some sites use http: and some https:
	// (yes, plain HTTP still exists). The leading slash separators preserve
	// path structure exactly so webpack's substring math works.
	//
	// Session id moves to query param "__s" to avoid collision with upstream
	// query params (which we want to forward as-is).
	try {
		const u = new URL(absoluteUrl);
		const scheme = u.protocol.slice(0, -1); // 'https:' -> 'https'
		const host = u.host; // includes port if present
		const pathname = u.pathname || '/';
		const search = u.search; // includes leading '?' or empty
		const sep = search ? '&' : '?';
		return `/api/proxy/${scheme}/${host}${pathname}${search}${sep}__s=${encodeURIComponent(sessionId)}`;
	} catch {
		// Malformed URL — fall back to query form so we still attempt the fetch.
		return `/api/proxy?url=${encodeURIComponent(absoluteUrl)}&__s=${encodeURIComponent(sessionId)}`;
	}
}

// Inverse of proxify(): parse /api/proxy/<scheme>/<host>/<path>?<query>&__s=… back
// into the original absolute URL + sessionId. Also accepts the legacy
// ?url=… form so existing bookmarks / inflight requests keep working.
function deproxify(reqUrl: URL): { target: string | null; sessionId: string } {
	const sessionId = reqUrl.searchParams.get('__s') ?? reqUrl.searchParams.get('session') ?? 'default';
	const legacy = reqUrl.searchParams.get('url');
	if (legacy) return { target: legacy, sessionId };

	// Path-based form: /api/proxy/<scheme>/<host>/<rest...>
	const m = reqUrl.pathname.match(/^\/api\/proxy\/(https?|http)\/([^/]+)(\/.*)?$/);
	if (!m) return { target: null, sessionId };
	const scheme = m[1];
	const host = m[2];
	const pathname = m[3] ?? '/';

	// Forward all upstream query params (everything except our __s/session).
	const upstream = new URLSearchParams();
	for (const [k, v] of reqUrl.searchParams) {
		if (k === '__s' || k === 'session') continue;
		upstream.append(k, v);
	}
	const qs = upstream.toString();
	return {
		target: `${scheme}://${host}${pathname}${qs ? '?' + qs : ''}`,
		sessionId,
	};
}

function absolutize(maybeRelative: string, base: string): string | null {
	if (!maybeRelative) return null;
	// WHY skip these schemes: data: and blob: are inline content, javascript:
	// is a no-op in iframes (and dangerous), mailto/tel/etc don't need
	// proxying.
	if (/^(data|blob|javascript|mailto|tel|sms|about|chrome):/i.test(maybeRelative)) return null;
	if (maybeRelative.startsWith('#')) return null;
	try {
		return new URL(maybeRelative, base).toString();
	} catch {
		return null;
	}
}

// -----------------------------------------------------------------------------
// HTML rewriting
// -----------------------------------------------------------------------------
// WHY regex and not a real parser: Edge runtime can't pull in cheerio/jsdom
// without massive bundle bloat, and a real parser would also struggle with
// the malformed HTML you encounter in the wild. The trade-off: we will miss
// a few exotic cases (HTML inside template strings, weird quoting). The
// injected runtime script (see injectClientScript) catches dynamic
// assignments at runtime which covers most of what we miss statically.
// -----------------------------------------------------------------------------

function rewriteHtmlAttributes(html: string, base: string, sessionId: string): string {
	// WHY this exact attribute list: these are every standard attribute that
	// can issue a network request, PLUS the most common data-* URL stashes used
	// by modern frameworks (and GitHub specifically — github.com uses data-href
	// to JS-swap its theme stylesheets, and if we don't proxify those the
	// browser tries to load them cross-origin from githubassets.com and fails
	// silently, producing an unstyled page).
	// `formaction` — htmx and form-override patterns.
	// `data-src`, `data-href`, `data-url`, `data-bg-src` — lazy-load / theme-swap.
	// `data-base-href` — GitHub's pjax-style base anchor for swapped sheets.
	// `xlink:href` — SVG <use> references (also rewritten further down because
	//   the colon breaks the simple-attr regex).
	const attrs = ['src', 'href', 'action', 'formaction', 'data-src', 'data-href', 'data-url', 'data-bg-src', 'data-base-href', 'poster', 'background'];

	let out = html;
	for (const attr of attrs) {
		// double-quoted: attr="..."
		out = out.replace(
			new RegExp(`(\\s${attr})\\s*=\\s*"([^"]*)"`, 'gi'),
			(_m, pre: string, val: string) => {
				const abs = absolutize(val, base);
				if (!abs) return `${pre}="${val}"`;
				return `${pre}="${proxify(abs, sessionId)}"`;
			},
		);
		// single-quoted
		out = out.replace(
			new RegExp(`(\\s${attr})\\s*=\\s*'([^']*)'`, 'gi'),
			(_m, pre: string, val: string) => {
				const abs = absolutize(val, base);
				if (!abs) return `${pre}='${val}'`;
				return `${pre}='${proxify(abs, sessionId)}'`;
			},
		);
	}

	// WHY xlink:href separately: the regex above keys on `\s${attr}` and the
	// colon in `xlink:href` breaks the pattern when fed through `new RegExp`.
	// Hand-write the two SVG variants here. SVG <use href|xlink:href="..."> is
	// the canonical way to reference sprite assets — common in icon libraries.
	out = out.replace(/\sxlink:href\s*=\s*"([^"]*)"/gi, (_m, val: string) => {
		const abs = absolutize(val, base);
		return ` xlink:href="${abs ? proxify(abs, sessionId) : val}"`;
	});
	out = out.replace(/\sxlink:href\s*=\s*'([^']*)'/gi, (_m, val: string) => {
		const abs = absolutize(val, base);
		return ` xlink:href='${abs ? proxify(abs, sessionId) : val}'`;
	});

	// srcset is comma-separated `url descriptor` pairs
	out = out.replace(/\s(srcset|imagesrcset|data-srcset)\s*=\s*"([^"]*)"/gi, (_m, attr: string, val: string) => {
		const rewritten = val
			.split(',')
			.map((part) => {
				const trimmed = part.trim();
				const sp = trimmed.indexOf(' ');
				const url = sp < 0 ? trimmed : trimmed.slice(0, sp);
				const desc = sp < 0 ? '' : trimmed.slice(sp);
				const abs = absolutize(url, base);
				return (abs ? proxify(abs, sessionId) : url) + desc;
			})
			.join(', ');
		return ` ${attr}="${rewritten}"`;
	});

	// inline style="...url(...)..."
	out = out.replace(/\sstyle\s*=\s*"([^"]*)"/gi, (_m, css: string) => {
		return ` style="${rewriteCssUrls(css, base, sessionId)}"`;
	});

	// <style>...</style> blocks
	out = out.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (_m, attrsRaw: string, body: string) => {
		return `<style${attrsRaw}>${rewriteCssUrls(body, base, sessionId)}</style>`;
	});

	// WHY strip CSP meta tags: even though we strip the *header*, sites also
	// inject CSP via <meta http-equiv="Content-Security-Policy" ...>. Leaving
	// these would block our injected client script and most rewritten URLs.
	out = out.replace(
		/<meta\b[^>]*http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi,
		'<!-- CSP meta stripped by proxy -->',
	);

	// <meta http-equiv="refresh" content="N; url=..."> — rewrite the URL
	out = out.replace(
		/(<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*content\s*=\s*["'])([^"']*)(["'])/gi,
		(_m, pre: string, content: string, post: string) => {
			const match = content.match(/^\s*(\d+)\s*;\s*url\s*=\s*(.*)$/i);
			if (!match) return pre + content + post;
			const abs = absolutize(match[2].trim(), base);
			if (!abs) return pre + content + post;
			return `${pre}${match[1]}; url=${proxify(abs, sessionId)}${post}`;
		},
	);

	return out;
}

function rewriteCssUrls(css: string, base: string, sessionId: string): string {
	let out = css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (_m, quote: string, url: string) => {
		const abs = absolutize(url, base);
		if (!abs) return `url(${quote}${url}${quote})`;
		return `url(${quote}${proxify(abs, sessionId)}${quote})`;
	});
	// WHY @import handled separately: it can take either url("...") OR a bare
	// quoted string ("foo.css" without url(...)). The url() branch above only
	// catches the first form. The bare-string form is common in CSS reset
	// libraries and font kits.
	out = out.replace(/@import\s+(['"])([^'"]+)\1/gi, (_m, quote: string, url: string) => {
		const abs = absolutize(url, base);
		if (!abs) return `@import ${quote}${url}${quote}`;
		return `@import ${quote}${proxify(abs, sessionId)}${quote}`;
	});
	return out;
}

// -----------------------------------------------------------------------------
// Client-side runtime injection
// -----------------------------------------------------------------------------
// WHY we wrap setAttribute, fetch, XHR, history, window.open: modern SPAs
// (React, Vue, Svelte) assemble URLs in JS at runtime. Static HTML rewriting
// only catches the initial server-rendered markup; everything else gets set
// programmatically and would bypass the proxy. By patching the global APIs
// we intercept those late assignments and re-route them.
//
// The script also posts navigation events to the parent window so the Edge
// app can update its address bar and title.
// -----------------------------------------------------------------------------

function injectClientScript(html: string, targetOrigin: string, sessionId: string): string {
	const safeSession = JSON.stringify(sessionId);
	const safeOrigin = JSON.stringify(targetOrigin);

	const script = `<script>(function(){
		var SESSION = ${safeSession};
		var ORIGIN = ${safeOrigin};
		// MUST match the server-side proxify() in api/proxy.ts. Path-based
		// (not ?url=…) so webpack's publicPath auto-detect works for chunk loads.
		// See the WHY comment on proxify() in api/proxy.ts for full reasoning.
		function proxify(u){
			try {
				if (!u) return u;
				if (typeof u !== 'string') u = String(u);
				if (u.indexOf('/api/proxy') === 0) return u;
				if (/^(data|blob|javascript|mailto|tel|about):/i.test(u)) return u;
				if (u.charAt(0) === '#') return u;
				var p = new URL(u, ORIGIN);
				if (p.protocol !== 'http:' && p.protocol !== 'https:') return u;
				var scheme = p.protocol.slice(0, -1);
				var sep = p.search ? '&' : '?';
				return '/api/proxy/' + scheme + '/' + p.host + p.pathname + p.search + sep + '__s=' + encodeURIComponent(SESSION);
			} catch(e) { return u; }
		}
		// WHY a try-around-each-patch: if a browser quirk makes one patch throw
		// we still install the rest. Failing closed would break the whole page.
		try {
			var origFetch = window.fetch;
			window.fetch = function(input, init){
				if (typeof input === 'string') return origFetch(proxify(input), init);
				if (input && input.url) {
					try { return origFetch(new Request(proxify(input.url), input), init); }
					catch(e) { return origFetch(input, init); }
				}
				return origFetch(input, init);
			};
		} catch(e){}
		try {
			var origOpen = XMLHttpRequest.prototype.open;
			XMLHttpRequest.prototype.open = function(method, url){
				arguments[1] = proxify(url);
				return origOpen.apply(this, arguments);
			};
		} catch(e){}
		try {
			var origWinOpen = window.open;
			window.open = function(url, name, features){
				return origWinOpen.call(window, proxify(url), name, features);
			};
		} catch(e){}
		// WHY setAttribute: React often does \`el.setAttribute('src', dynamicUrl)\`
		// for late-bound images, scripts, iframes. Without this, those late
		// requests escape the proxy.
		try {
			var origSet = Element.prototype.setAttribute;
			Element.prototype.setAttribute = function(name, value){
				var lower = (name + '').toLowerCase();
				if (lower === 'src' || lower === 'href' || lower === 'action' || lower === 'formaction' || lower === 'poster') {
					value = proxify(value);
				}
				return origSet.call(this, name, value);
			};
		} catch(e){}
		// WHY history wrapping: SPA route changes go through pushState/replaceState
		// rather than full navigations. We post these to the parent so the
		// address bar in the Edge app stays in sync.
		try {
			var origPush = history.pushState;
			history.pushState = function(s, t, u){
				try { parent.postMessage({ __edge: true, type: 'nav', url: u ? new URL(u, ORIGIN).toString() : location.href }, '*'); } catch(e){}
				return origPush.apply(this, arguments);
			};
			var origReplace = history.replaceState;
			history.replaceState = function(s, t, u){
				try { parent.postMessage({ __edge: true, type: 'nav', url: u ? new URL(u, ORIGIN).toString() : location.href }, '*'); } catch(e){}
				return origReplace.apply(this, arguments);
			};
		} catch(e){}
		window.addEventListener('DOMContentLoaded', function(){
			try {
				parent.postMessage({ __edge: true, type: 'loaded', url: ORIGIN, title: document.title }, '*');
			} catch(e){}
		});
		window.addEventListener('error', function(e){
			try {
				parent.postMessage({ __edge: true, type: 'error', message: (e && e.message) || 'error' }, '*');
			} catch(e){}
		}, true);
	})();</script>`;

	// WHY we DON'T inject <base href="<target-origin>/">:
	// Our rewriter turns every link/script/img/stylesheet src into a root-relative
	// path like `/api/proxy?url=...`. A <base href="https://github.com/"> would
	// make the browser resolve those against the TARGET origin (github.com),
	// producing requests like https://github.com/api/proxy?url=... — which
	// 404 at github and fail CORS. Without the base tag, root-relative paths
	// resolve against the iframe's actual document URL (our proxy host), which
	// is exactly what we want.
	//
	// What we lose by NOT setting <base>: relative URLs not starting with /
	// (e.g. `href="foo.css"`) won't resolve correctly. But the static rewriter
	// already absolutizes those at proxy-fetch time, and any runtime-added
	// relative URLs hit the patched fetch/XHR/setAttribute wrappers in the
	// injected script which absolutize via URL(u, ORIGIN). So this case is
	// covered without breaking root-relative resolution.

	// Strip any existing <base href> in the upstream HTML — leaving it would
	// re-create the bug we just avoided.
	const stripped = html.replace(/<base\b[^>]*>/gi, '');

	// Inject right after the opening <head>, or fall back to right after <html>,
	// or just prepend if neither exists.
	if (/<head\b[^>]*>/i.test(stripped)) {
		return stripped.replace(/(<head\b[^>]*>)/i, `$1${script}`);
	}
	if (/<html\b[^>]*>/i.test(stripped)) {
		return stripped.replace(/(<html\b[^>]*>)/i, `$1<head>${script}</head>`);
	}
	return `<head>${script}</head>${stripped}`;
}

function escapeHtmlAttr(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// -----------------------------------------------------------------------------
// Response header sanitisation
// -----------------------------------------------------------------------------
// WHY we strip these specifically:
//   x-frame-options:       blocks rendering the page inside our iframe.
//   content-security-policy (and -report-only): the page's CSP would forbid
//                          our injected inline <script>, plus any cross-origin
//                          requests to /api/proxy (which is technically the
//                          same origin from the iframe's POV but CSP applies
//                          to the document URL the browser saw).
//   cross-origin-*-policy: COOP/COEP/CORP will refuse to load us inside the
//                          parent window or block subresources.
//   permissions-policy:    can disable features (clipboard, fullscreen) we
//                          want to expose.
//   strict-transport-security: irrelevant for the proxied response and
//                          would mistakenly upgrade our HTTP-served dev
//                          environment.
//   content-encoding/transfer-encoding: dropped because the upstream body is
//                          already decoded by `fetch` — leaving these would
//                          confuse the browser.
//   content-length:        invalid after we mutate the body.
// -----------------------------------------------------------------------------

const STRIP_HEADERS = new Set([
	'x-frame-options',
	'content-security-policy',
	'content-security-policy-report-only',
	'cross-origin-opener-policy',
	'cross-origin-embedder-policy',
	'cross-origin-resource-policy',
	'permissions-policy',
	'strict-transport-security',
	'content-encoding',
	'transfer-encoding',
	'content-length',
]);

function sanitiseHeaders(upstream: Headers): Headers {
	const out = new Headers();
	upstream.forEach((value, key) => {
		if (STRIP_HEADERS.has(key.toLowerCase())) return;
		// WHY skip set-cookie here: cookies are stored in our jar, not relayed
		// to the browser. If we relayed them, they'd be set on OUR domain
		// (because that's what the iframe sees), which is wrong and also
		// would mix sessions across users sharing the deployment.
		if (key.toLowerCase() === 'set-cookie') return;
		out.set(key, value);
	});
	out.set('access-control-allow-origin', '*');
	return out;
}

// -----------------------------------------------------------------------------
// Main handler
// -----------------------------------------------------------------------------

export default async function handler(req: Request): Promise<Response> {
	const url = new URL(req.url);

	// CORS preflight
	if (req.method === 'OPTIONS') {
		return new Response(null, {
			status: 204,
			headers: {
				'access-control-allow-origin': '*',
				'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
				'access-control-allow-headers': '*',
				'access-control-max-age': '86400',
			},
		});
	}

	// Parse both URL formats (path-based + legacy ?url=…)
	const { target, sessionId } = deproxify(url);

	// DELETE /api/proxy?__s=X — clear the cookie jar for that session
	if (req.method === 'DELETE') {
		clearJar(sessionId);
		publish(sessionId, { type: 'jar-cleared' });
		return new Response(JSON.stringify({ ok: true }), {
			status: 200,
			headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
		});
	}

	if (!target) {
		return new Response('Missing target URL (use /api/proxy/<scheme>/<host>/<path>)', { status: 400 });
	}

	let targetUrl: URL;
	try {
		targetUrl = new URL(target);
	} catch {
		return new Response('Invalid target URL', { status: 400 });
	}
	if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
		return new Response('Only http(s) supported', { status: 400 });
	}

	// -------------------------------------------------------------------------
	// Build upstream request headers
	// -------------------------------------------------------------------------
	const upstreamHeaders = new Headers();
	// WHY pick-not-pass: forwarding ALL incoming headers leaks our deployment
	// host, vercel cookies, and CDN markers into the upstream — many sites
	// then 403. Whitelist only what's load-bearing for a real browser fetch.
	const passthrough = ['accept', 'accept-language', 'user-agent', 'content-type'];
	for (const name of passthrough) {
		const v = req.headers.get(name);
		if (v) upstreamHeaders.set(name, v);
	}
	// WHY a desktop UA: many sites serve degraded mobile HTML or block unknown
	// UAs entirely.
	if (!upstreamHeaders.has('user-agent')) {
		upstreamHeaders.set(
			'user-agent',
			'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
		);
	}
	// WHY Referer = target origin: sites use Referer for CSRF protection and
	// hotlink prevention. Sending the actual upstream origin keeps us looking
	// like a same-site navigation.
	upstreamHeaders.set('referer', targetUrl.origin + '/');
	upstreamHeaders.set('origin', targetUrl.origin);

	// Attach stored cookies
	const cookieHeader = buildCookieHeader(sessionId, targetUrl.hostname, targetUrl.pathname);
	if (cookieHeader) upstreamHeaders.set('cookie', cookieHeader);

	// -------------------------------------------------------------------------
	// Body forwarding
	// -------------------------------------------------------------------------
	// WHY null body for GET/HEAD: Edge runtime throws if you pass a body for
	// these methods. Also: req.body is a ReadableStream — passing it directly
	// keeps memory bounded for large POSTs.
	let body: BodyInit | null = null;
	if (req.method !== 'GET' && req.method !== 'HEAD') {
		body = req.body;
	}

	// -------------------------------------------------------------------------
	// Fetch upstream — with manual redirect handling so we can re-proxify
	// the Location header. Returning the upstream Location directly would
	// send the browser away from /api/proxy and break the iframe.
	// -------------------------------------------------------------------------
	let upstream: Response;
	try {
		upstream = await fetch(targetUrl.toString(), {
			method: req.method,
			headers: upstreamHeaders,
			body,
			redirect: 'manual',
			// WHY duplex: 'half': Edge runtime requires this when streaming a
			// request body. Without it, fetch throws on POSTs.
			// @ts-expect-error -- duplex is part of the Edge fetch spec, not in lib.dom yet.
			duplex: 'half',
		});
	} catch (err: any) {
		publish(sessionId, { type: 'error', message: String(err?.message ?? err) });
		return new Response(`Upstream fetch failed: ${String(err?.message ?? err)}`, {
			status: 502,
			headers: { 'access-control-allow-origin': '*' },
		});
	}

	// -------------------------------------------------------------------------
	// Capture Set-Cookie BEFORE we sanitise the headers (sanitise drops it)
	// -------------------------------------------------------------------------
	// WHY headers.getSetCookie(): Set-Cookie can appear multiple times and
	// canonical Headers.get() folds them with commas — which corrupts
	// expires=Wed, 01 Jan 2025 ... values. getSetCookie() returns the array.
	const setCookies: string[] = (upstream.headers as any).getSetCookie
		? (upstream.headers as any).getSetCookie()
		: [];
	if (setCookies.length > 0) {
		const changed = storeCookies(sessionId, targetUrl.hostname, setCookies);
		publish(sessionId, { type: 'cookie', host: targetUrl.hostname, names: changed });
	}

	// -------------------------------------------------------------------------
	// Handle 3xx server-side — chase the redirect through the proxy
	// -------------------------------------------------------------------------
	if (upstream.status >= 300 && upstream.status < 400) {
		const loc = upstream.headers.get('location');
		if (loc) {
			const abs = absolutize(loc, targetUrl.toString());
			if (abs) {
				publish(sessionId, { type: 'redirect', from: targetUrl.toString(), to: abs });
				// WHY 302 with proxified Location (instead of HTML refresh): keeps
				// fetch()/XHR clients working too, not just iframe navigations.
				return new Response(null, {
					status: 302,
					headers: {
						location: proxify(abs, sessionId),
						'access-control-allow-origin': '*',
					},
				});
			}
		}
	}

	const headers = sanitiseHeaders(upstream.headers);
	const contentType = (upstream.headers.get('content-type') || '').toLowerCase();

	// -------------------------------------------------------------------------
	// HTML: read fully, rewrite, inject runtime, return as text
	// -------------------------------------------------------------------------
	if (contentType.includes('text/html')) {
		const text = await upstream.text();
		let rewritten = rewriteHtmlAttributes(text, targetUrl.toString(), sessionId);
		rewritten = injectClientScript(rewritten, targetUrl.origin, sessionId);
		headers.set('content-type', 'text/html; charset=utf-8');
		return new Response(rewritten, { status: upstream.status, headers });
	}

	// -------------------------------------------------------------------------
	// CSS: read fully, rewrite url() refs
	// -------------------------------------------------------------------------
	if (contentType.includes('text/css')) {
		const text = await upstream.text();
		const rewritten = rewriteCssUrls(text, targetUrl.toString(), sessionId);
		headers.set('content-type', 'text/css; charset=utf-8');
		return new Response(rewritten, { status: upstream.status, headers });
	}

	// -------------------------------------------------------------------------
	// Everything else (JS, images, fonts, video, etc.): stream the body
	// straight through. Edge runtime forwards ReadableStream without
	// buffering, which is critical for video/audio and large assets.
	// -------------------------------------------------------------------------
	// WHY not .text() for binary: would decode bytes as UTF-8 and corrupt
	// images/fonts/wasm. Streaming the body preserves the bytes exactly.
	return new Response(upstream.body, { status: upstream.status, headers });
}

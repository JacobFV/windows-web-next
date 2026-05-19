/**
 * Vercel Serverless Function: HTTP(S) browsing proxy for the Edge app.
 *
 * Endpoint: GET|POST /api/proxy?url=<encoded-target-url>&session=<sessionId>
 *
 * What it does:
 *   1. Server-side fetches the target URL with cookies stored for `sessionId`.
 *   2. Persists Set-Cookie headers back into the per-session jar.
 *   3. Rewrites HTML/CSS so that all subresource/link/form URLs route back
 *      through /api/proxy?url=...&session=...
 *   4. Injects a small client-side script into proxied HTML to re-route
 *      fetch / XHR / location / history calls through the proxy and forward
 *      navigation events to the parent via postMessage.
 *   5. Strips frame-blocking response headers (X-Frame-Options, CSP, COOP, CORP)
 *      so the proxied page can be embedded in our <iframe>.
 *
 * Known limits / non-goals:
 *   - In-memory cookie jar: per-instance only. Serverless instances are
 *     ephemeral and per-region, so cookies will appear to "expire" between
 *     instances. TODO(prod): swap in Redis / Vercel KV.
 *   - No WebSocket support — sites that rely on `new WebSocket(...)` won't
 *     work fully (chat, live updates). The injected script can't transparently
 *     proxy WS handshakes from inside the iframe.
 *   - Anti-bot / CSP-strict sites (Cloudflare challenges, banking) will reject
 *     the request server-side. That's expected.
 *   - Regex-based HTML/CSS rewriting handles ~80% of real sites. Edge cases
 *     (template strings building URLs at runtime, exotic srcset spacing) may
 *     slip through. We deliberately avoid cheerio/jsdom to stay dep-free.
 *
 * Why the Web Standard fetch() handler signature:
 *   - Request/Response are global in TypeScript's DOM lib, so no @vercel/node
 *     or @types/node dependency is needed (project rule: no new deps).
 *   - Vercel runs this on Node 20+ where fetch/Request/Response are native.
 */

export const config = {
	// Request the highest timeout Vercel will allow on the deployment plan.
	// Hobby caps at 10s, Pro at 60s — asking for 60 doesn't hurt on Hobby.
	maxDuration: 60,
};

// ---------------------------------------------------------------------------
// Per-instance cookie jar.
// Keyed by `${sessionId}|${origin}` so a single session can hold cookies for
// multiple origins (cross-site cookies are intentionally not shared — same
// model as a real browser tab).
// ---------------------------------------------------------------------------

interface StoredCookie {
	name: string;
	value: string;
	expires?: number; // epoch ms; undefined = session cookie
	path?: string;
}

const cookieJar = new Map<string, Map<string, StoredCookie>>();

function jarKey(sessionId: string, origin: string): string {
	return `${sessionId}|${origin}`;
}

function getCookies(sessionId: string, origin: string): string {
	const jar = cookieJar.get(jarKey(sessionId, origin));
	if (!jar) return '';
	const now = Date.now();
	const out: string[] = [];
	for (const [name, c] of jar) {
		if (c.expires !== undefined && c.expires < now) {
			jar.delete(name);
			continue;
		}
		out.push(`${c.name}=${c.value}`);
	}
	return out.join('; ');
}

function storeSetCookie(sessionId: string, origin: string, setCookieHeaders: string[]): void {
	if (setCookieHeaders.length === 0) return;
	const key = jarKey(sessionId, origin);
	let jar = cookieJar.get(key);
	if (!jar) {
		jar = new Map();
		cookieJar.set(key, jar);
	}
	for (const raw of setCookieHeaders) {
		// Parse "name=value; Expires=...; Path=...; Secure; HttpOnly"
		const parts = raw.split(';').map((p) => p.trim());
		if (parts.length === 0) continue;
		const [name, ...valueParts] = parts[0].split('=');
		if (!name) continue;
		const value = valueParts.join('=');
		const cookie: StoredCookie = { name: name.trim(), value };
		for (let i = 1; i < parts.length; i++) {
			const [k, v] = parts[i].split('=');
			const lk = k.toLowerCase();
			if (lk === 'expires' && v) {
				const t = Date.parse(v);
				if (!Number.isNaN(t)) cookie.expires = t;
			} else if (lk === 'max-age' && v) {
				const sec = parseInt(v, 10);
				if (!Number.isNaN(sec)) cookie.expires = Date.now() + sec * 1000;
			} else if (lk === 'path' && v) {
				cookie.path = v;
			}
		}
		jar.set(cookie.name, cookie);
	}
}

// ---------------------------------------------------------------------------
// URL rewriting helpers.
// ---------------------------------------------------------------------------

function proxify(targetAbsoluteUrl: string, sessionId: string): string {
	return `/api/proxy?url=${encodeURIComponent(targetAbsoluteUrl)}&session=${encodeURIComponent(sessionId)}`;
}

/** Resolve a possibly-relative URL against a base. Returns null on failure. */
function absolutize(maybeRelative: string, baseUrl: string): string | null {
	const trimmed = maybeRelative.trim();
	if (!trimmed) return null;
	// Skip non-HTTP schemes (data:, javascript:, mailto:, tel:, about:, blob:, #anchor)
	if (
		trimmed.startsWith('data:') ||
		trimmed.startsWith('javascript:') ||
		trimmed.startsWith('mailto:') ||
		trimmed.startsWith('tel:') ||
		trimmed.startsWith('about:') ||
		trimmed.startsWith('blob:') ||
		trimmed.startsWith('#')
	) {
		return null;
	}
	try {
		return new URL(trimmed, baseUrl).toString();
	} catch {
		return null;
	}
}

/**
 * Rewrite a single attribute-value-style URL. Returns the proxied URL or the
 * original (untouched) string if it shouldn't be rewritten.
 */
function rewriteAttrUrl(raw: string, baseUrl: string, sessionId: string): string {
	const abs = absolutize(raw, baseUrl);
	if (!abs) return raw;
	return proxify(abs, sessionId);
}

/**
 * Rewrite an `srcset` attribute. Format: "url1 1x, url2 2x" or "url1 100w, url2 200w".
 * Splits on commas at the top level, then preserves descriptors.
 */
function rewriteSrcset(value: string, baseUrl: string, sessionId: string): string {
	return value
		.split(',')
		.map((entry) => {
			const trimmed = entry.trim();
			if (!trimmed) return entry;
			// First token is the URL, remainder is the descriptor (e.g. "2x" / "300w")
			const spaceIdx = trimmed.search(/\s/);
			const url = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
			const descriptor = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx);
			const rewritten = rewriteAttrUrl(url, baseUrl, sessionId);
			return rewritten + descriptor;
		})
		.join(', ');
}

/**
 * Rewrite the HTML body so that all sub-resource / link / form URLs route
 * back through us.
 *
 * Why regex and not a real parser:
 *   - We must stay dep-free per project rules (no cheerio/jsdom/htmlparser2).
 *   - HTML proxying is inherently best-effort; even "real" parsers can't
 *     reliably catch URLs constructed at JS runtime. We aim for ~80% coverage.
 *
 * Caveats: we don't try to handle URLs in inline JS strings; that's the job
 * of the injected runtime hook (intercepting fetch / XHR / location).
 */
function rewriteHtml(html: string, baseUrl: string, sessionId: string): string {
	let out = html;

	// 1. <base href="..."> — strip; we inject our own further down so relative
	//    URLs inside the proxied page resolve correctly inside the iframe.
	out = out.replace(/<base\b[^>]*>/gi, '');

	// 2. Common URL-bearing attributes: src, href, action, poster, data,
	//    formaction, background. Match attribute value in single or double
	//    quotes; we deliberately ignore unquoted attrs (rare and risky to regex).
	out = out.replace(
		/\b(src|href|action|poster|data|formaction|background)\s*=\s*("([^"]*)"|'([^']*)')/gi,
		(_full: string, attr: string, _quoted: string, dq: string | undefined, sq: string | undefined) => {
			const rawUrl = dq ?? sq ?? '';
			const quote = dq !== undefined ? '"' : "'";
			const rewritten = rewriteAttrUrl(rawUrl, baseUrl, sessionId);
			return `${attr}=${quote}${rewritten}${quote}`;
		}
	);

	// 3. srcset attribute (comma-separated list of URL + descriptor).
	out = out.replace(
		/\bsrcset\s*=\s*("([^"]*)"|'([^']*)')/gi,
		(_full: string, _quoted: string, dq: string | undefined, sq: string | undefined) => {
			const raw = dq ?? sq ?? '';
			const quote = dq !== undefined ? '"' : "'";
			return `srcset=${quote}${rewriteSrcset(raw, baseUrl, sessionId)}${quote}`;
		}
	);

	// 4. url(...) references inside <style> blocks and style="" attributes.
	out = rewriteCssUrls(out, baseUrl, sessionId);

	// 5. <meta http-equiv="refresh" content="0; url=..."> — rewrite the URL.
	out = out.replace(
		/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*content\s*=\s*("([^"]*)"|'([^']*)')[^>]*>/gi,
		(full: string, _quoted: string, dq: string | undefined, sq: string | undefined) => {
			const content = dq ?? sq ?? '';
			const m = content.match(/^(\s*\d+\s*;\s*url\s*=\s*)(.+)$/i);
			if (!m) return full;
			const rewritten = rewriteAttrUrl(m[2], baseUrl, sessionId);
			const newContent = m[1] + rewritten;
			return full.replace(content, newContent);
		}
	);

	// 6. Inject our <base> and runtime hook script right after <head>, or at
	//    the very top if there is no <head>.
	const baseTag = `<base href="${escapeAttr(baseUrl)}">`;
	const runtimeScript = `<script>${buildRuntimeHook(sessionId)}</script>`;
	const inject = baseTag + runtimeScript;

	if (/<head\b[^>]*>/i.test(out)) {
		out = out.replace(/<head\b[^>]*>/i, (m) => m + inject);
	} else if (/<html\b[^>]*>/i.test(out)) {
		out = out.replace(/<html\b[^>]*>/i, (m) => m + '<head>' + inject + '</head>');
	} else {
		out = inject + out;
	}

	return out;
}

/** Rewrite `url(...)` references in a CSS body (or HTML with embedded CSS). */
function rewriteCssUrls(css: string, baseUrl: string, sessionId: string): string {
	return css.replace(
		/url\(\s*("([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi,
		(full: string, _quoted: string, dq: string | undefined, sq: string | undefined, bare: string | undefined) => {
			const raw = (dq ?? sq ?? bare ?? '').trim();
			if (!raw) return full;
			const rewritten = rewriteAttrUrl(raw, baseUrl, sessionId);
			return `url("${rewritten}")`;
		}
	);
}

function escapeAttr(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Runtime hook injected into every proxied HTML page.
// Plain JS string — we deliberately avoid eval/Function constructors. The
// browser parses this as part of the HTML.
// ---------------------------------------------------------------------------

function buildRuntimeHook(sessionId: string): string {
	// IIFE; uses simple ES5+ constructs. The single placeholder is the session id.
	return `
(function(){
	var SESSION=${JSON.stringify(sessionId)};
	function proxify(u){
		try{
			if(!u) return u;
			var s=String(u);
			if(s.indexOf('/api/proxy?url=')===0) return s;
			if(s.indexOf('data:')===0||s.indexOf('blob:')===0||s.indexOf('javascript:')===0||s.indexOf('mailto:')===0||s.indexOf('about:')===0||s[0]==='#') return s;
			var abs=new URL(s, document.baseURI).toString();
			return '/api/proxy?url='+encodeURIComponent(abs)+'&session='+encodeURIComponent(SESSION);
		}catch(e){return u;}
	}
	function notifyNav(url){
		try{ window.parent && window.parent.postMessage({source:'edge-proxy', type:'navigate', url:url}, '*'); }catch(e){}
	}
	// Patch fetch
	if(typeof fetch==='function'){
		var origFetch=fetch;
		window.fetch=function(input, init){
			try{
				if(typeof input==='string'){ input=proxify(input); }
				else if(input && input.url){ input=new Request(proxify(input.url), input); }
			}catch(e){}
			return origFetch.call(this, input, init);
		};
	}
	// Patch XHR
	if(window.XMLHttpRequest){
		var origOpen=XMLHttpRequest.prototype.open;
		XMLHttpRequest.prototype.open=function(method, url){
			arguments[1]=proxify(url);
			return origOpen.apply(this, arguments);
		};
	}
	// Patch location.assign / replace — best effort.
	// Direct \`location.href = "..."\` is hard to intercept on the location
	// object itself (it's an exotic object), so we also catch clicks below.
	try{
		var origAssign=window.location.assign.bind(window.location);
		var origReplace=window.location.replace.bind(window.location);
		window.location.assign=function(u){ var p=proxify(u); notifyNav(u); origAssign(p); };
		window.location.replace=function(u){ var p=proxify(u); notifyNav(u); origReplace(p); };
	}catch(e){}
	// history.pushState / replaceState — keep the iframe URL synced with parent.
	var origPush=history.pushState, origRepl=history.replaceState;
	history.pushState=function(){ try{ notifyNav(arguments[2]||location.href); }catch(e){} return origPush.apply(this, arguments); };
	history.replaceState=function(){ try{ notifyNav(arguments[2]||location.href); }catch(e){} return origRepl.apply(this, arguments); };
	// Capture link clicks (target=_self) so we can post to parent before navigation.
	document.addEventListener('click', function(e){
		var a=e.target && e.target.closest && e.target.closest('a[href]');
		if(!a) return;
		var href=a.getAttribute('href');
		if(!href) return;
		notifyNav(href);
	}, true);
	// Initial load — tell the parent which URL we're showing.
	window.addEventListener('load', function(){ notifyNav(location.href); });
	// Block window.open from spawning an unproxied tab; rewrite to proxy and notify.
	var origOpen2=window.open;
	window.open=function(u){ var p=proxify(u); notifyNav(u); return origOpen2.call(this, p); };
})();
`;
}

// ---------------------------------------------------------------------------
// Header filtering.
// We strip headers from the upstream response that would prevent the page
// from rendering inside our iframe (X-Frame-Options blocks framing; CSP can
// block inline scripts including our hook; COOP/CORP block cross-origin
// resource use). This is the core trade-off of building a "browse anything"
// proxy and the user has accepted it.
// ---------------------------------------------------------------------------

const BLOCKED_RESPONSE_HEADERS = new Set([
	'x-frame-options',
	'content-security-policy',
	'content-security-policy-report-only',
	'cross-origin-resource-policy',
	'cross-origin-opener-policy',
	'cross-origin-embedder-policy',
	'permissions-policy',
	'feature-policy',
	// strip transport-related headers — the platform sets these itself
	'content-encoding',
	'content-length',
	'transfer-encoding',
	'connection',
]);

// Vercel Web Standard handler. Request/Response are globals.
export default async function handler(req: Request): Promise<Response> {
	const corsHeaders: Record<string, string> = {
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
		'Access-Control-Allow-Headers': '*',
	};

	if (req.method === 'OPTIONS') {
		return new Response(null, { status: 204, headers: corsHeaders });
	}

	const reqUrl = new URL(req.url);
	const targetParam = reqUrl.searchParams.get('url');
	const sessionId = reqUrl.searchParams.get('session') || 'default';

	if (!targetParam) {
		return errorPage(400, 'Missing url parameter', 'No target URL was specified.', corsHeaders);
	}

	let targetUrl: URL;
	try {
		targetUrl = new URL(targetParam);
	} catch {
		return errorPage(400, 'Invalid URL', 'The provided URL could not be parsed.', corsHeaders);
	}

	if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
		return errorPage(400, 'Unsupported protocol', `Only http: and https: are supported (got ${targetUrl.protocol}).`, corsHeaders);
	}

	// Build upstream request headers.
	const reqHeaders: Record<string, string> = {
		'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 EdgeProxy/1.0',
		'Accept': req.headers.get('accept') || 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
		'Accept-Language': req.headers.get('accept-language') || 'en-US,en;q=0.9',
		// Ask for uncompressed responses so we can safely rewrite. undici's
		// fetch handles decompression automatically but being explicit avoids
		// edge cases where a Content-Encoding header survives.
		'Accept-Encoding': 'identity',
	};
	const storedCookies = getCookies(sessionId, targetUrl.origin);
	if (storedCookies) reqHeaders['Cookie'] = storedCookies;

	// Forward request body for non-GET/HEAD methods.
	let body: BodyInit | undefined;
	const method = (req.method || 'GET').toUpperCase();
	if (method !== 'GET' && method !== 'HEAD') {
		const buf = await req.arrayBuffer();
		if (buf.byteLength > 0) body = buf;
		const ct = req.headers.get('content-type');
		if (ct) reqHeaders['Content-Type'] = ct;
	}

	let upstream: Response;
	try {
		// Abort if upstream takes too long; cap below maxDuration so we have
		// time to rewrite and stream HTML back.
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 25_000);
		try {
			upstream = await fetch(targetUrl.toString(), {
				method,
				headers: reqHeaders,
				body,
				redirect: 'manual',
				signal: controller.signal,
			});
		} finally {
			clearTimeout(timer);
		}
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return errorPage(502, 'Upstream fetch failed', `Could not reach ${targetUrl.host}: ${msg}`, corsHeaders);
	}

	// Persist Set-Cookie before we filter headers.
	// undici's Headers exposes getSetCookie() in Node >=20.
	const upstreamHeadersAny = upstream.headers as unknown as { getSetCookie?: () => string[] };
	const setCookieList: string[] = typeof upstreamHeadersAny.getSetCookie === 'function'
		? upstreamHeadersAny.getSetCookie()
		: (() => {
			const acc: string[] = [];
			upstream.headers.forEach((v, k) => { if (k.toLowerCase() === 'set-cookie') acc.push(v); });
			return acc;
		})();
	if (setCookieList.length) storeSetCookie(sessionId, targetUrl.origin, setCookieList);

	// Handle redirects ourselves: rewrite Location and pass through as 302
	// so the iframe's navigation stays under our origin.
	if (upstream.status >= 300 && upstream.status < 400) {
		const loc = upstream.headers.get('location');
		if (loc) {
			const abs = absolutize(loc, targetUrl.toString());
			if (abs) {
				return new Response(null, {
					status: 302,
					headers: { ...corsHeaders, Location: proxify(abs, sessionId) },
				});
			}
		}
	}

	// Build the response header set, dropping headers that would break framing.
	const outHeaders = new Headers();
	for (const [k, v] of corsHeaders as unknown as Iterable<[string, string]>) outHeaders.set(k, v);
	upstream.headers.forEach((value, key) => {
		const lk = key.toLowerCase();
		if (BLOCKED_RESPONSE_HEADERS.has(lk)) return;
		if (lk === 'set-cookie') return; // we handle cookies server-side
		if (lk === 'location') return; // already handled above
		try { outHeaders.set(key, value); } catch { /* invalid header — skip */ }
	});

	const contentType = (upstream.headers.get('content-type') || '').toLowerCase();

	if (contentType.includes('text/html')) {
		const text = await upstream.text();
		const rewritten = rewriteHtml(text, targetUrl.toString(), sessionId);
		outHeaders.set('Content-Type', 'text/html; charset=utf-8');
		return new Response(rewritten, { status: upstream.status, headers: outHeaders });
	}

	if (contentType.includes('text/css')) {
		const text = await upstream.text();
		const rewritten = rewriteCssUrls(text, targetUrl.toString(), sessionId);
		outHeaders.set('Content-Type', 'text/css; charset=utf-8');
		return new Response(rewritten, { status: upstream.status, headers: outHeaders });
	}

	// Pass-through for everything else (images, fonts, JS, JSON, binary).
	const buf = await upstream.arrayBuffer();
	return new Response(buf, { status: upstream.status, headers: outHeaders });
}

function errorPage(status: number, title: string, detail: string, baseHeaders: Record<string, string>): Response {
	const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
body{font-family:Segoe UI,system-ui,sans-serif;max-width:560px;margin:80px auto;padding:0 24px;color:#202020;background:#fafafa}
h1{font-size:22px;font-weight:600;margin:0 0 12px}
p{font-size:14px;line-height:1.6;color:#444}
.code{display:inline-block;padding:2px 8px;background:#eee;border-radius:4px;font-family:Consolas,monospace;font-size:12px}
</style></head><body>
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(detail)}</p>
<p><span class="code">HTTP ${status}</span></p>
</body></html>`;
	return new Response(html, {
		status,
		headers: { ...baseHeaders, 'Content-Type': 'text/html; charset=utf-8' },
	});
}

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

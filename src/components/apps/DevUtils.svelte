<script lang="ts">
	type ToolId =
		| 'json'
		| 'base64'
		| 'url'
		| 'jwt'
		| 'timestamp'
		| 'hash'
		| 'uuid'
		| 'color'
		| 'lorem'
		| 'regex';

	interface ToolDef {
		id: ToolId;
		label: string;
		icon: string;
	}

	const tools: ToolDef[] = [
		{ id: 'json', label: 'JSON Formatter', icon: '{ }' },
		{ id: 'base64', label: 'Base64', icon: '64' },
		{ id: 'url', label: 'URL Encode/Decode', icon: '%' },
		{ id: 'jwt', label: 'JWT Decoder', icon: '🔐' },
		{ id: 'timestamp', label: 'Timestamp Converter', icon: '⏱' },
		{ id: 'hash', label: 'Hash Generator', icon: '#' },
		{ id: 'uuid', label: 'UUID v4', icon: 'id' },
		{ id: 'color', label: 'Color Converter', icon: '🎨' },
		{ id: 'lorem', label: 'Lorem Ipsum', icon: '¶' },
		{ id: 'regex', label: 'Regex Tester', icon: '.*' },
	];

	let activeTool = $state<ToolId>('json');

	// ── JSON Formatter ─────────────────────────────────────

	let jsonInput = $state(
		'{"name":"John","age":30,"city":"New York","hobbies":["reading","coding","hiking"],"address":{"street":"123 Main St","zip":"10001"}}',
	);
	let jsonOutput = $state('');
	let jsonError = $state('');

	function jsonFormat() {
		try {
			const parsed = JSON.parse(jsonInput);
			jsonOutput = JSON.stringify(parsed, null, 2);
			jsonError = '';
		} catch (err) {
			jsonError = (err as Error).message;
			jsonOutput = '';
		}
	}

	function jsonMinify() {
		try {
			const parsed = JSON.parse(jsonInput);
			jsonOutput = JSON.stringify(parsed);
			jsonError = '';
		} catch (err) {
			jsonError = (err as Error).message;
			jsonOutput = '';
		}
	}

	function jsonValidate() {
		try {
			JSON.parse(jsonInput);
			jsonError = '';
			jsonOutput = '✓ Valid JSON';
		} catch (err) {
			jsonError = (err as Error).message;
			jsonOutput = '';
		}
	}

	// ── Base64 ─────────────────────────────────────────────

	let b64Input = $state('Hello, World!');
	let b64Output = $state('');
	let b64Error = $state('');

	function b64Encode() {
		try {
			b64Output = btoa(unescape(encodeURIComponent(b64Input)));
			b64Error = '';
		} catch (err) {
			b64Error = (err as Error).message;
			b64Output = '';
		}
	}

	function b64Decode() {
		try {
			b64Output = decodeURIComponent(escape(atob(b64Input)));
			b64Error = '';
		} catch (err) {
			b64Error = (err as Error).message;
			b64Output = '';
		}
	}

	// ── URL ────────────────────────────────────────────────

	let urlInput = $state('https://example.com/search?q=hello world&lang=en&page=1');
	let urlOutput = $state('');
	let urlError = $state('');

	function urlEncode() {
		try {
			urlOutput = encodeURIComponent(urlInput);
			urlError = '';
		} catch (err) {
			urlError = (err as Error).message;
		}
	}

	function urlDecode() {
		try {
			urlOutput = decodeURIComponent(urlInput);
			urlError = '';
		} catch (err) {
			urlError = (err as Error).message;
		}
	}

	// ── JWT ────────────────────────────────────────────────

	let jwtInput = $state(
		'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
	);
	let jwtHeader = $state('');
	let jwtPayload = $state('');
	let jwtError = $state('');

	function jwtDecode() {
		try {
			const parts = jwtInput.trim().split('.');
			if (parts.length < 2) throw new Error('JWT must have at least 2 segments (header.payload).');
			const decode = (s: string) => {
				// Convert base64url to base64
				const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
				const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
				return decodeURIComponent(escape(atob(b64 + pad)));
			};
			const header = JSON.parse(decode(parts[0]));
			const payload = JSON.parse(decode(parts[1]));
			jwtHeader = JSON.stringify(header, null, 2);
			jwtPayload = JSON.stringify(payload, null, 2);
			jwtError = '';
		} catch (err) {
			jwtError = (err as Error).message;
			jwtHeader = '';
			jwtPayload = '';
		}
	}

	// ── Timestamp ──────────────────────────────────────────

	const initialUnix = Math.floor(Date.now() / 1000);
	let tsUnix = $state(initialUnix);
	let tsIso = $state(new Date(initialUnix * 1000).toISOString());
	let tsLocal = $state(new Date(initialUnix * 1000).toString());
	let tsError = $state('');

	function tsFromUnix(value: number) {
		try {
			const d = new Date(value * 1000);
			if (isNaN(d.getTime())) throw new Error('Invalid unix timestamp');
			tsIso = d.toISOString();
			tsLocal = d.toString();
			tsError = '';
		} catch (err) {
			tsError = (err as Error).message;
		}
	}

	function tsFromIso(value: string) {
		try {
			const d = new Date(value);
			if (isNaN(d.getTime())) throw new Error('Invalid ISO string');
			tsUnix = Math.floor(d.getTime() / 1000);
			tsLocal = d.toString();
			tsError = '';
		} catch (err) {
			tsError = (err as Error).message;
		}
	}

	function tsNow() {
		tsUnix = Math.floor(Date.now() / 1000);
		tsFromUnix(tsUnix);
	}

	// ── Hash ───────────────────────────────────────────────

	type HashAlg = 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';
	let hashAlgorithm = $state<HashAlg>('SHA-256');
	let hashInput = $state('Hello, World!');
	let hashOutput = $state('');
	let hashError = $state('');

	async function computeHash() {
		try {
			const encoder = new TextEncoder();
			const data = encoder.encode(hashInput);
			const buf = await crypto.subtle.digest(hashAlgorithm, data);
			const bytes = new Uint8Array(buf);
			let hex = '';
			for (const b of bytes) hex += b.toString(16).padStart(2, '0');
			hashOutput = hex;
			hashError = '';
		} catch (err) {
			hashError = (err as Error).message;
			hashOutput = '';
		}
	}

	// ── UUID ───────────────────────────────────────────────

	let uuidSingle = $state('');
	let uuidList = $state<string[]>([]);

	function genUuid() {
		uuidSingle = crypto.randomUUID();
	}

	function genUuidList() {
		const list: string[] = [];
		for (let i = 0; i < 10; i++) list.push(crypto.randomUUID());
		uuidList = list;
	}

	// ── Color ──────────────────────────────────────────────

	let colorHex = $state('#3b82f6');
	let colorRgb = $state('rgb(59, 130, 246)');
	let colorHsl = $state('hsl(217, 91%, 60%)');

	function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
		r /= 255;
		g /= 255;
		b /= 255;
		const max = Math.max(r, g, b);
		const min = Math.min(r, g, b);
		let h = 0;
		let s = 0;
		const l = (max + min) / 2;
		if (max !== min) {
			const d = max - min;
			s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
			switch (max) {
				case r: h = (g - b) / d + (g < b ? 6 : 0); break;
				case g: h = (b - r) / d + 2; break;
				case b: h = (r - g) / d + 4; break;
			}
			h /= 6;
		}
		return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
	}

	function hexToRgb(hex: string): [number, number, number] | null {
		const m = hex.replace('#', '').match(/^([0-9a-f]{6}|[0-9a-f]{3})$/i);
		if (!m) return null;
		let v = m[1];
		if (v.length === 3) v = v.split('').map((c) => c + c).join('');
		return [
			parseInt(v.slice(0, 2), 16),
			parseInt(v.slice(2, 4), 16),
			parseInt(v.slice(4, 6), 16),
		];
	}

	function colorFromHex(hex: string) {
		const rgb = hexToRgb(hex);
		if (!rgb) return;
		colorHex = hex;
		colorRgb = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
		const [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
		colorHsl = `hsl(${h}, ${s}%, ${l}%)`;
	}

	function colorFromRgb(input: string) {
		const m = input.match(/(\d+)\D+(\d+)\D+(\d+)/);
		if (!m) return;
		const r = Math.max(0, Math.min(255, parseInt(m[1])));
		const g = Math.max(0, Math.min(255, parseInt(m[2])));
		const b = Math.max(0, Math.min(255, parseInt(m[3])));
		const hex = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
		colorRgb = `rgb(${r}, ${g}, ${b})`;
		colorHex = hex;
		const [h, s, l] = rgbToHsl(r, g, b);
		colorHsl = `hsl(${h}, ${s}%, ${l}%)`;
	}

	// ── Lorem Ipsum ────────────────────────────────────────

	const LOREM_CORPUS = [
		'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
		'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
		'Curabitur pretium tincidunt lacus. Nulla gravida orci a odio. Nullam varius, turpis et commodo pharetra, est eros bibendum elit, nec luctus magna felis sollicitudin mauris. Integer in mauris eu nibh euismod gravida.',
		'Duis ac tellus et risus vulputate vehicula. Donec lobortis risus a elit. Etiam tempor. Ut ullamcorper, ligula eu tempor congue, eros est euismod turpis, id tincidunt sapien risus a quam. Maecenas fermentum consequat mi.',
		'Donec fermentum. Pellentesque malesuada nulla a mi. Duis sapien sem, aliquet nec, commodo eget, consequat quis, neque. Aliquam faucibus, elit ut dictum aliquet, felis nisl adipiscing sapien, sed malesuada diam lacus eget erat.',
	];

	let loremCount = $state(3);
	let loremOutput = $state('');

	function genLorem() {
		const n = Math.max(1, Math.min(50, loremCount | 0));
		const out: string[] = [];
		for (let i = 0; i < n; i++) {
			out.push(LOREM_CORPUS[i % LOREM_CORPUS.length]);
		}
		loremOutput = out.join('\n\n');
	}

	// ── Regex Tester ───────────────────────────────────────

	let regexPattern = $state('\\b(\\w+)@(\\w+\\.\\w+)\\b');
	let regexFlags = $state('g');
	let regexInput = $state('Email me at alice@example.com or bob@test.org for details.');
	let regexMatches = $state<{ match: string; index: number; groups: string[] }[]>([]);
	let regexError = $state('');

	function runRegex() {
		try {
			const re = new RegExp(regexPattern, regexFlags);
			const results: { match: string; index: number; groups: string[] }[] = [];
			if (regexFlags.includes('g')) {
				let m: RegExpExecArray | null;
				while ((m = re.exec(regexInput)) !== null) {
					results.push({ match: m[0], index: m.index, groups: m.slice(1) });
					if (m.index === re.lastIndex) re.lastIndex++;
					if (results.length > 200) break;
				}
			} else {
				const m = re.exec(regexInput);
				if (m) results.push({ match: m[0], index: m.index, groups: m.slice(1) });
			}
			regexMatches = results;
			regexError = '';
		} catch (err) {
			regexError = (err as Error).message;
			regexMatches = [];
		}
	}

	// Render the input with match highlights as plain text + marked segments.
	const regexHighlighted = $derived.by(() => {
		if (regexMatches.length === 0) return [{ text: regexInput, match: false }];
		const segs: { text: string; match: boolean }[] = [];
		const sorted = [...regexMatches].sort((a, b) => a.index - b.index);
		let cursor = 0;
		for (const m of sorted) {
			if (m.index < cursor) continue; // skip overlapping matches
			if (m.index > cursor) segs.push({ text: regexInput.slice(cursor, m.index), match: false });
			segs.push({ text: m.match, match: true });
			cursor = m.index + m.match.length;
		}
		if (cursor < regexInput.length) segs.push({ text: regexInput.slice(cursor), match: false });
		return segs;
	});

	// ── Initialize ─────────────────────────────────────────

	jsonFormat();
</script>

<div class="devutils">
	<aside class="sidebar">
		<div class="sidebar-header">Tools</div>
		{#each tools as tool (tool.id)}
			<button
				class="tool-item"
				class:active={activeTool === tool.id}
				onclick={() => (activeTool = tool.id)}
			>
				<span class="tool-icon">{tool.icon}</span>
				<span class="tool-label">{tool.label}</span>
			</button>
		{/each}
	</aside>

	<main class="content">
		{#if activeTool === 'json'}
			<header class="tool-header">
				<h2>JSON Formatter</h2>
				<div class="actions">
					<button class="btn" onclick={jsonFormat}>Format</button>
					<button class="btn" onclick={jsonMinify}>Minify</button>
					<button class="btn" onclick={jsonValidate}>Validate</button>
				</div>
			</header>
			{#if jsonError}<div class="error">{jsonError}</div>{/if}
			<div class="split">
				<div class="pane">
					<div class="pane-label">Input</div>
					<textarea bind:value={jsonInput} spellcheck="false"></textarea>
				</div>
				<div class="pane">
					<div class="pane-label">Output</div>
					<textarea value={jsonOutput} readonly spellcheck="false"></textarea>
				</div>
			</div>

		{:else if activeTool === 'base64'}
			<header class="tool-header">
				<h2>Base64 Encoder / Decoder</h2>
				<div class="actions">
					<button class="btn" onclick={b64Encode}>Encode</button>
					<button class="btn" onclick={b64Decode}>Decode</button>
				</div>
			</header>
			{#if b64Error}<div class="error">{b64Error}</div>{/if}
			<div class="split">
				<div class="pane">
					<div class="pane-label">Input</div>
					<textarea bind:value={b64Input} spellcheck="false"></textarea>
				</div>
				<div class="pane">
					<div class="pane-label">Output</div>
					<textarea value={b64Output} readonly spellcheck="false"></textarea>
				</div>
			</div>

		{:else if activeTool === 'url'}
			<header class="tool-header">
				<h2>URL Encoder / Decoder</h2>
				<div class="actions">
					<button class="btn" onclick={urlEncode}>Encode</button>
					<button class="btn" onclick={urlDecode}>Decode</button>
				</div>
			</header>
			{#if urlError}<div class="error">{urlError}</div>{/if}
			<div class="split">
				<div class="pane">
					<div class="pane-label">Input</div>
					<textarea bind:value={urlInput} spellcheck="false"></textarea>
				</div>
				<div class="pane">
					<div class="pane-label">Output</div>
					<textarea value={urlOutput} readonly spellcheck="false"></textarea>
				</div>
			</div>

		{:else if activeTool === 'jwt'}
			<header class="tool-header">
				<h2>JWT Decoder</h2>
				<div class="actions">
					<button class="btn" onclick={jwtDecode}>Decode</button>
				</div>
			</header>
			{#if jwtError}<div class="error">{jwtError}</div>{/if}
			<div class="single">
				<div class="pane">
					<div class="pane-label">JWT Token</div>
					<textarea bind:value={jwtInput} spellcheck="false" style:min-height="80px"></textarea>
				</div>
				<div class="split">
					<div class="pane">
						<div class="pane-label">Header</div>
						<textarea value={jwtHeader} readonly spellcheck="false"></textarea>
					</div>
					<div class="pane">
						<div class="pane-label">Payload</div>
						<textarea value={jwtPayload} readonly spellcheck="false"></textarea>
					</div>
				</div>
				<div class="muted-note">Signature is not verified. JWT decoder displays the header and payload only.</div>
			</div>

		{:else if activeTool === 'timestamp'}
			<header class="tool-header">
				<h2>Timestamp Converter</h2>
				<div class="actions">
					<button class="btn" onclick={tsNow}>Now</button>
				</div>
			</header>
			{#if tsError}<div class="error">{tsError}</div>{/if}
			<div class="single">
				<div class="row">
					<label class="row-label" for="ts-unix">Unix (seconds)</label>
					<input
						id="ts-unix"
						type="number"
						class="text-input"
						value={tsUnix}
						oninput={(e) => {
							const v = parseInt((e.target as HTMLInputElement).value);
							if (!isNaN(v)) { tsUnix = v; tsFromUnix(v); }
						}}
					/>
				</div>
				<div class="row">
					<label class="row-label" for="ts-iso">ISO 8601</label>
					<input
						id="ts-iso"
						type="text"
						class="text-input"
						value={tsIso}
						oninput={(e) => {
							const v = (e.target as HTMLInputElement).value;
							tsIso = v;
							tsFromIso(v);
						}}
					/>
				</div>
				<div class="row">
					<label class="row-label" for="ts-local">Local</label>
					<input
						id="ts-local"
						type="text"
						class="text-input"
						value={tsLocal}
						readonly
					/>
				</div>
			</div>

		{:else if activeTool === 'hash'}
			<header class="tool-header">
				<h2>Hash Generator</h2>
				<div class="actions">
					<select class="select" bind:value={hashAlgorithm}>
						<option value="SHA-1">SHA-1</option>
						<option value="SHA-256">SHA-256</option>
						<option value="SHA-384">SHA-384</option>
						<option value="SHA-512">SHA-512</option>
					</select>
					<button class="btn" onclick={computeHash}>Compute</button>
				</div>
			</header>
			{#if hashError}<div class="error">{hashError}</div>{/if}
			<div class="single">
				<div class="pane">
					<div class="pane-label">Input</div>
					<textarea bind:value={hashInput} spellcheck="false"></textarea>
				</div>
				<div class="pane">
					<div class="pane-label">Hex Digest ({hashAlgorithm})</div>
					<textarea value={hashOutput} readonly spellcheck="false" class="mono-output"></textarea>
				</div>
			</div>

		{:else if activeTool === 'uuid'}
			<header class="tool-header">
				<h2>UUID v4 Generator</h2>
				<div class="actions">
					<button class="btn" onclick={genUuid}>Generate</button>
					<button class="btn" onclick={genUuidList}>Generate 10</button>
				</div>
			</header>
			<div class="single">
				{#if uuidSingle}
					<div class="row">
						<span class="row-label">UUID</span>
						<code class="code-block">{uuidSingle}</code>
					</div>
				{/if}
				{#if uuidList.length > 0}
					<div class="pane">
						<div class="pane-label">List</div>
						<textarea value={uuidList.join('\n')} readonly spellcheck="false" class="mono-output"></textarea>
					</div>
				{/if}
				{#if !uuidSingle && uuidList.length === 0}
					<div class="muted-note">Click a button above to generate UUID v4 values using crypto.randomUUID().</div>
				{/if}
			</div>

		{:else if activeTool === 'color'}
			<header class="tool-header">
				<h2>Color Converter</h2>
			</header>
			<div class="single">
				<div class="color-row">
					<input
						type="color"
						class="color-picker"
						value={colorHex}
						oninput={(e) => colorFromHex((e.target as HTMLInputElement).value)}
					/>
					<div class="color-swatch" style:background={colorHex}></div>
				</div>
				<div class="row">
					<label class="row-label" for="col-hex">Hex</label>
					<input
						id="col-hex"
						type="text"
						class="text-input"
						value={colorHex}
						oninput={(e) => colorFromHex((e.target as HTMLInputElement).value)}
					/>
				</div>
				<div class="row">
					<label class="row-label" for="col-rgb">RGB</label>
					<input
						id="col-rgb"
						type="text"
						class="text-input"
						value={colorRgb}
						oninput={(e) => colorFromRgb((e.target as HTMLInputElement).value)}
					/>
				</div>
				<div class="row">
					<label class="row-label" for="col-hsl">HSL</label>
					<input
						id="col-hsl"
						type="text"
						class="text-input"
						value={colorHsl}
						readonly
					/>
				</div>
			</div>

		{:else if activeTool === 'lorem'}
			<header class="tool-header">
				<h2>Lorem Ipsum Generator</h2>
				<div class="actions">
					<label class="inline-label">
						Paragraphs
						<input
							type="number"
							class="text-input"
							min="1"
							max="50"
							bind:value={loremCount}
							style:width="80px"
						/>
					</label>
					<button class="btn" onclick={genLorem}>Generate</button>
				</div>
			</header>
			<div class="single">
				<div class="pane">
					<div class="pane-label">Output</div>
					<textarea value={loremOutput} readonly spellcheck="false"></textarea>
				</div>
			</div>

		{:else if activeTool === 'regex'}
			<header class="tool-header">
				<h2>Regex Tester</h2>
				<div class="actions">
					<button class="btn" onclick={runRegex}>Test</button>
				</div>
			</header>
			{#if regexError}<div class="error">{regexError}</div>{/if}
			<div class="single">
				<div class="row">
					<label class="row-label" for="re-pattern">Pattern</label>
					<input
						id="re-pattern"
						type="text"
						class="text-input mono-output"
						bind:value={regexPattern}
					/>
				</div>
				<div class="row">
					<label class="row-label" for="re-flags">Flags</label>
					<input
						id="re-flags"
						type="text"
						class="text-input mono-output"
						bind:value={regexFlags}
						style:max-width="120px"
					/>
				</div>
				<div class="pane">
					<div class="pane-label">Test String</div>
					<textarea bind:value={regexInput} spellcheck="false"></textarea>
				</div>
				<div class="pane">
					<div class="pane-label">Highlighted</div>
					<div class="highlight-output">{#each regexHighlighted as seg, i (i)}{#if seg.match}<mark class="hl">{seg.text}</mark>{:else}{seg.text}{/if}{/each}</div>
				</div>
				<div class="pane">
					<div class="pane-label">Matches ({regexMatches.length})</div>
					<div class="matches-list">
						{#each regexMatches as m, i (i)}
							<div class="match-row">
								<span class="match-idx">@{m.index}</span>
								<code class="match-text">{m.match}</code>
								{#if m.groups.length > 0}
									<span class="match-groups">groups: [{m.groups.map((g) => JSON.stringify(g)).join(', ')}]</span>
								{/if}
							</div>
						{/each}
						{#if regexMatches.length === 0 && !regexError}
							<div class="muted-note">No matches yet. Click Test.</div>
						{/if}
					</div>
				</div>
			</div>
		{/if}
	</main>
</div>

<style>
	.devutils {
		height: 100%;
		display: flex;
		background: #ffffff;
		color: var(--win-text-primary);
		font-family: 'Segoe UI', sans-serif;
		font-size: 13px;
		overflow: hidden;
	}

	/* ── Sidebar ────────────────────────────────────────── */

	.sidebar {
		width: 200px;
		flex-shrink: 0;
		background: var(--win-surface);
		border-right: 1px solid rgba(0, 0, 0, 0.06);
		display: flex;
		flex-direction: column;
		padding: 8px 6px;
		gap: 2px;
		overflow-y: auto;
	}

	.sidebar-header {
		padding: 8px 10px 6px;
		font-size: 11px;
		font-weight: 600;
		color: var(--win-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.tool-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 7px 10px;
		font-size: 13px;
		color: var(--win-text-primary);
		text-align: left;
		background: transparent;
		border: none;
		border-radius: var(--win-radius-sm);
		cursor: pointer;
		transition: background-color 0.08s ease;
	}

	.tool-item:hover {
		background: rgba(0, 0, 0, 0.04);
	}

	.tool-item.active {
		background: var(--win-accent, #005fb8);
		color: #ffffff;
	}

	.tool-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		font-size: 12px;
		font-family: 'Consolas', 'Menlo', monospace;
		color: inherit;
		flex-shrink: 0;
	}

	.tool-label {
		flex: 1;
	}

	/* ── Content ────────────────────────────────────────── */

	.content {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		padding: 16px 20px;
		overflow: hidden;
	}

	.tool-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 12px;
		gap: 12px;
		flex-wrap: wrap;
	}

	.tool-header h2 {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
		color: var(--win-text-primary);
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.btn {
		padding: 5px 14px;
		font-size: 12px;
		background: var(--win-surface);
		color: var(--win-text-primary);
		border: 1px solid rgba(0, 0, 0, 0.12);
		border-radius: var(--win-radius-sm);
		cursor: pointer;
		transition: background-color 0.08s ease;
	}

	.btn:hover {
		background: rgba(0, 0, 0, 0.04);
	}

	.select {
		padding: 5px 8px;
		font-size: 12px;
		background: var(--win-surface);
		color: var(--win-text-primary);
		border: 1px solid rgba(0, 0, 0, 0.15);
		border-radius: var(--win-radius-sm);
		outline: none;
	}

	.error {
		background: #fdecea;
		color: #b71c1c;
		border: 1px solid #f5c2c0;
		padding: 8px 12px;
		border-radius: var(--win-radius-sm);
		font-size: 12px;
		margin-bottom: 10px;
		font-family: 'Consolas', 'Menlo', monospace;
		white-space: pre-wrap;
	}

	.split {
		display: flex;
		gap: 12px;
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}

	.single {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-height: 0;
		overflow: hidden;
	}

	.pane {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-height: 0;
		gap: 4px;
	}

	.pane-label {
		font-size: 11px;
		font-weight: 600;
		color: var(--win-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	textarea {
		flex: 1;
		min-height: 80px;
		padding: 10px;
		background: #fafafa;
		color: var(--win-text-primary);
		border: 1px solid rgba(0, 0, 0, 0.12);
		border-radius: var(--win-radius-sm);
		font-family: 'Cascadia Code', 'Consolas', 'Menlo', monospace;
		font-size: 12px;
		line-height: 1.5;
		resize: none;
		outline: none;
		overflow: auto;
	}

	textarea:focus {
		border-color: var(--win-accent, #005fb8);
	}

	textarea[readonly] {
		background: #f3f3f3;
	}

	.mono-output {
		font-family: 'Cascadia Code', 'Consolas', 'Menlo', monospace;
	}

	.text-input {
		flex: 1;
		padding: 5px 8px;
		font-size: 13px;
		border: 1px solid rgba(0, 0, 0, 0.15);
		border-radius: var(--win-radius-sm);
		outline: none;
		color: var(--win-text-primary);
		background: #ffffff;
	}

	.text-input:focus {
		border-color: var(--win-accent, #005fb8);
	}

	.row {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.row-label {
		width: 110px;
		flex-shrink: 0;
		font-size: 12px;
		color: var(--win-text-secondary);
	}

	.inline-label {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: var(--win-text-secondary);
	}

	.muted-note {
		font-size: 12px;
		color: var(--win-text-secondary);
		padding: 4px 0;
	}

	.code-block {
		flex: 1;
		padding: 6px 10px;
		font-family: 'Cascadia Code', 'Consolas', 'Menlo', monospace;
		font-size: 12px;
		background: #f3f3f3;
		border: 1px solid rgba(0, 0, 0, 0.08);
		border-radius: var(--win-radius-sm);
		word-break: break-all;
	}

	/* ── Color tool ─────────────────────────────────────── */

	.color-row {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.color-picker {
		width: 60px;
		height: 36px;
		padding: 0;
		border: 1px solid rgba(0, 0, 0, 0.15);
		border-radius: var(--win-radius-sm);
		background: transparent;
		cursor: pointer;
	}

	.color-swatch {
		flex: 1;
		height: 36px;
		border-radius: var(--win-radius-sm);
		border: 1px solid rgba(0, 0, 0, 0.08);
	}

	/* ── Regex tool ─────────────────────────────────────── */

	.highlight-output {
		flex: 1;
		min-height: 60px;
		padding: 10px;
		background: #fafafa;
		border: 1px solid rgba(0, 0, 0, 0.12);
		border-radius: var(--win-radius-sm);
		font-family: 'Cascadia Code', 'Consolas', 'Menlo', monospace;
		font-size: 12px;
		line-height: 1.5;
		white-space: pre-wrap;
		overflow: auto;
		color: var(--win-text-primary);
	}

	.hl {
		background: #ffeb3b;
		color: #000000;
		padding: 0 2px;
		border-radius: 2px;
	}

	.matches-list {
		flex: 1;
		min-height: 60px;
		padding: 6px;
		background: #fafafa;
		border: 1px solid rgba(0, 0, 0, 0.12);
		border-radius: var(--win-radius-sm);
		overflow: auto;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.match-row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 4px 8px;
		font-family: 'Cascadia Code', 'Consolas', 'Menlo', monospace;
		font-size: 12px;
		background: #ffffff;
		border: 1px solid rgba(0, 0, 0, 0.06);
		border-radius: var(--win-radius-sm);
	}

	.match-idx {
		color: var(--win-text-secondary);
		flex-shrink: 0;
	}

	.match-text {
		color: var(--win-accent, #005fb8);
		font-weight: 600;
	}

	.match-groups {
		color: var(--win-text-secondary);
		font-size: 11px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>

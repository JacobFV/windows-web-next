<script lang="ts">
	import { wm } from '../../state/windows.svelte.ts';
	import { readFile, writeFile, exists } from '../../state/vfs.svelte';
	import { notify } from '../../state/notifications.svelte';

	interface Cell { v: string | number; style?: Record<string, string>; }
	interface Sheet { name: string; cells: Record<string, Cell>; }

	const COLS = 26;
	const ROWS = 50;
	const COL_LETTERS = Array.from({ length: COLS }, (_, i) => String.fromCharCode(65 + i));

	let sheets = $state<Sheet[]>([{ name: 'Sheet1', cells: {} }]);
	let activeSheetIdx = $state(0);
	let activeSheet = $derived(sheets[activeSheetIdx]);
	let selected = $state<{ row: number; col: number }>({ row: 0, col: 0 });
	let editing = $state(false);
	let editValue = $state('');
	let formulaInput = $state('');
	let filePath = $state<string | null>(null);
	let docTitle = $state('Book1');

	$effect(() => {
		const args = (wm as any).appLaunchArgs?.excel;
		if (args?.path && !filePath) {
			filePath = args.path;
			docTitle = args.path.split('/').pop() || 'Book1';
			if (exists(args.path)) {
				try {
					const data = JSON.parse(readFile(args.path) || '{}');
					if (data.sheets) sheets = data.sheets;
				} catch (e) {
					const csv = readFile(args.path) || '';
					const rows = csv.split('\n').map(r => r.split(','));
					const cells: Record<string, Cell> = {};
					rows.forEach((row, ri) => row.forEach((val, ci) => {
						if (ci < COLS && ri < ROWS && val) cells[ref(ri, ci)] = { v: val };
					}));
					sheets = [{ name: 'Sheet1', cells }];
				}
			}
		}
	});

	function ref(row: number, col: number): string {
		return COL_LETTERS[col] + (row + 1);
	}

	function parseRef(s: string): { row: number; col: number } | null {
		const m = s.match(/^([A-Z]+)(\d+)$/);
		if (!m) return null;
		const col = m[1].charCodeAt(0) - 65;
		const row = parseInt(m[2]) - 1;
		if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
		return { row, col };
	}

	function getCellValue(r: string, visited = new Set<string>()): number | string {
		if (visited.has(r)) return '#CYCLE!';
		visited.add(r);
		const cell = activeSheet.cells[r];
		if (!cell) return '';
		if (typeof cell.v === 'number') return cell.v;
		const v = String(cell.v);
		if (!v.startsWith('=')) {
			const n = Number(v);
			return isNaN(n) || v === '' ? v : n;
		}
		try { return evaluateFormula(v.slice(1), visited); }
		catch (e) { return '#ERROR!'; }
	}

	function evaluateFormula(expr: string, visited: Set<string>): number | string {
		const tokens = tokenize(expr);
		const parser = new Parser(tokens, visited);
		return parser.parse();
	}

	function tokenize(s: string): string[] {
		const tokens: string[] = [];
		let i = 0;
		while (i < s.length) {
			const c = s[i];
			if (/\s/.test(c)) { i++; continue; }
			if (/[0-9.]/.test(c)) {
				let j = i;
				while (j < s.length && /[0-9.]/.test(s[j])) j++;
				tokens.push(s.slice(i, j));
				i = j;
			} else if (/[A-Z]/i.test(c)) {
				let j = i;
				while (j < s.length && /[A-Z0-9_]/i.test(s[j])) j++;
				tokens.push(s.slice(i, j).toUpperCase());
				i = j;
			} else if (c === '"') {
				let j = i + 1;
				while (j < s.length && s[j] !== '"') j++;
				tokens.push('"' + s.slice(i + 1, j) + '"');
				i = j + 1;
			} else { tokens.push(c); i++; }
		}
		return tokens;
	}

	class Parser {
		pos = 0;
		tokens: string[];
		visited: Set<string>;
		constructor(tokens: string[], visited: Set<string>) { this.tokens = tokens; this.visited = visited; }
		peek() { return this.tokens[this.pos]; }
		eat() { return this.tokens[this.pos++]; }
		parse(): number | string { return this.parseExpr(); }
		parseExpr(): number | string {
			let left = this.parseTerm();
			while (this.peek() === '+' || this.peek() === '-') {
				const op = this.eat();
				const right = this.parseTerm();
				left = op === '+' ? Number(left) + Number(right) : Number(left) - Number(right);
			}
			return left;
		}
		parseTerm(): number | string {
			let left = this.parsePow();
			while (this.peek() === '*' || this.peek() === '/') {
				const op = this.eat();
				const right = this.parsePow();
				if (op === '*') left = Number(left) * Number(right);
				else { if (Number(right) === 0) return '#DIV/0!'; left = Number(left) / Number(right); }
			}
			return left;
		}
		parsePow(): number | string {
			let left = this.parseFactor();
			while (this.peek() === '^') { this.eat(); left = Math.pow(Number(left), Number(this.parseFactor())); }
			return left;
		}
		parseFactor(): number | string {
			const t = this.peek();
			if (t === '(') { this.eat(); const v = this.parseExpr(); this.eat(); return v; }
			if (t === '-') { this.eat(); return -Number(this.parseFactor()); }
			if (t === '+') { this.eat(); return this.parseFactor(); }
			if (!t) return 0;
			if (/^[0-9.]/.test(t)) { this.eat(); return Number(t); }
			if (t.startsWith('"')) { this.eat(); return t.slice(1, -1); }
			// Identifier — cell ref, range, or function
			this.eat();
			if (this.peek() === '(') {
				// Function call
				this.eat();
				const args: (number | string)[] = [];
				while (this.peek() !== ')') {
					const next = this.peek();
					if (next && /^[A-Z]+\d+$/i.test(next) && this.tokens[this.pos + 1] === ':') {
						const start = this.eat();
						this.eat();
						const end = this.eat();
						const sR = parseRef(start);
						const eR = parseRef(end);
						if (sR && eR) {
							for (let r = sR.row; r <= eR.row; r++) for (let c = sR.col; c <= eR.col; c++) {
								args.push(getCellValue(ref(r, c), new Set(this.visited)));
							}
						}
					} else {
						args.push(this.parseExpr());
					}
					if (this.peek() === ',') this.eat();
				}
				this.eat();
				return applyFunc(t, args);
			}
			// Cell ref
			if (parseRef(t)) return getCellValue(t, new Set(this.visited));
			return '#NAME?';
		}
	}

	function applyFunc(name: string, args: (number | string)[]): number | string {
		const nums = args.filter(a => typeof a === 'number') as number[];
		switch (name) {
			case 'SUM': return nums.reduce((a, b) => a + b, 0);
			case 'AVERAGE': return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
			case 'MIN': return Math.min(...nums);
			case 'MAX': return Math.max(...nums);
			case 'COUNT': return nums.length;
			case 'ABS': return Math.abs(Number(args[0]));
			case 'ROUND': return Math.round(Number(args[0]) * Math.pow(10, Number(args[1] ?? 0))) / Math.pow(10, Number(args[1] ?? 0));
			case 'IF': return Number(args[0]) ? args[1] : args[2];
			case 'CONCAT':
			case 'CONCATENATE': return args.map(String).join('');
			default: return '#NAME?';
		}
	}

	function selectCell(r: number, c: number) {
		commitEdit();
		selected = { row: r, col: c };
		const cell = activeSheet.cells[ref(r, c)];
		formulaInput = cell ? String(cell.v) : '';
	}

	function startEdit() {
		editing = true;
		const cell = activeSheet.cells[ref(selected.row, selected.col)];
		editValue = cell ? String(cell.v) : '';
	}

	function commitEdit() {
		if (!editing) return;
		const r = ref(selected.row, selected.col);
		if (editValue === '') delete activeSheet.cells[r];
		else {
			const n = Number(editValue);
			activeSheet.cells[r] = { v: isNaN(n) || editValue.startsWith('=') || editValue === '' ? editValue : n };
		}
		editing = false;
		formulaInput = editValue;
	}

	function handleKey(e: KeyboardEvent) {
		if (editing) {
			if (e.key === 'Enter') { e.preventDefault(); commitEdit(); selectCell(Math.min(ROWS - 1, selected.row + 1), selected.col); }
			else if (e.key === 'Escape') { editing = false; }
			else if (e.key === 'Tab') { e.preventDefault(); commitEdit(); selectCell(selected.row, Math.min(COLS - 1, selected.col + 1)); }
			return;
		}
		if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveBook(); return; }
		if (e.key === 'Enter' || e.key === 'F2') { startEdit(); e.preventDefault(); }
		else if (e.key === 'ArrowUp') selectCell(Math.max(0, selected.row - 1), selected.col);
		else if (e.key === 'ArrowDown') selectCell(Math.min(ROWS - 1, selected.row + 1), selected.col);
		else if (e.key === 'ArrowLeft') selectCell(selected.row, Math.max(0, selected.col - 1));
		else if (e.key === 'ArrowRight') selectCell(selected.row, Math.min(COLS - 1, selected.col + 1));
		else if (e.key === 'Delete') { delete activeSheet.cells[ref(selected.row, selected.col)]; formulaInput = ''; }
		else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) { startEdit(); editValue = e.key; e.preventDefault(); }
	}

	function commitFormula() {
		const r = ref(selected.row, selected.col);
		if (formulaInput === '') delete activeSheet.cells[r];
		else {
			const n = Number(formulaInput);
			activeSheet.cells[r] = { v: isNaN(n) || formulaInput.startsWith('=') ? formulaInput : n };
		}
	}

	function saveBook() {
		const path = filePath ?? `C:/Users/User/Documents/${docTitle}`;
		writeFile(path, JSON.stringify({ sheets }));
		filePath = path;
		notify({ title: 'Excel', body: `Saved ${docTitle}`, icon: '📊' });
	}

	function addSheet() {
		sheets = [...sheets, { name: `Sheet${sheets.length + 1}`, cells: {} }];
		activeSheetIdx = sheets.length - 1;
	}

	function displayValue(r: number, c: number): string {
		const cell = activeSheet.cells[ref(r, c)];
		if (!cell) return '';
		if (typeof cell.v === 'string' && cell.v.startsWith('=')) {
			const v = getCellValue(ref(r, c));
			return String(v);
		}
		return String(cell.v);
	}
</script>

<svelte:window onkeydown={handleKey} />

<div class="excel-app">
	<div class="ribbon">
		<button class="primary" onclick={saveBook}>💾 Save</button>
		<div class="sep"></div>
		<button onclick={() => activeSheet.cells[ref(selected.row, selected.col)] = { v: activeSheet.cells[ref(selected.row, selected.col)]?.v ?? '', style: { ...(activeSheet.cells[ref(selected.row, selected.col)]?.style ?? {}), fontWeight: 'bold' } }}><b>B</b></button>
		<button onclick={() => activeSheet.cells[ref(selected.row, selected.col)] = { v: activeSheet.cells[ref(selected.row, selected.col)]?.v ?? '', style: { ...(activeSheet.cells[ref(selected.row, selected.col)]?.style ?? {}), fontStyle: 'italic' } }}><i>I</i></button>
		<button onclick={() => activeSheet.cells[ref(selected.row, selected.col)] = { v: activeSheet.cells[ref(selected.row, selected.col)]?.v ?? '', style: { ...(activeSheet.cells[ref(selected.row, selected.col)]?.style ?? {}), textDecoration: 'underline' } }}><u>U</u></button>
	</div>

	<div class="formula-bar">
		<span class="cell-ref">{ref(selected.row, selected.col)}</span>
		<input
			class="formula-input"
			bind:value={formulaInput}
			onkeydown={(e) => { if (e.key === 'Enter') { commitFormula(); (e.currentTarget as HTMLInputElement).blur(); } }}
			onblur={commitFormula}
		>
	</div>

	<div class="grid-wrap">
		<table class="grid">
			<thead>
				<tr>
					<th class="corner"></th>
					{#each COL_LETTERS as L}<th class="col-h">{L}</th>{/each}
				</tr>
			</thead>
			<tbody>
				{#each Array(ROWS) as _, r}
					<tr>
						<th class="row-h">{r + 1}</th>
						{#each Array(COLS) as _, c}
							{@const isSel = selected.row === r && selected.col === c}
							{@const cell = activeSheet.cells[ref(r, c)]}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<td
								class="cell"
								class:selected={isSel}
								onclick={() => selectCell(r, c)}
								ondblclick={startEdit}
								style:font-weight={cell?.style?.fontWeight}
								style:font-style={cell?.style?.fontStyle}
								style:text-decoration={cell?.style?.textDecoration}
							>
								{#if isSel && editing}
									<input
										class="cell-edit"
										bind:value={editValue}
										onblur={commitEdit}
										autofocus
									>
								{:else}
									{displayValue(r, c)}
								{/if}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<div class="sheet-tabs">
		{#each sheets as sheet, i (i)}
			<button class="sheet-tab" class:active={i === activeSheetIdx} onclick={() => activeSheetIdx = i}>{sheet.name}</button>
		{/each}
		<button class="sheet-tab" onclick={addSheet}>+</button>
	</div>
</div>

<style>
	.excel-app { display: flex; flex-direction: column; height: 100%; background: #f3f3f3; font-family: 'Segoe UI', system-ui; font-size: 12px; }
	.ribbon { display: flex; align-items: center; gap: 4px; padding: 6px 12px; background: rgba(255,255,255,0.7); border-bottom: 1px solid rgba(0,0,0,0.08); }
	.ribbon button { min-width: 30px; height: 28px; padding: 0 8px; border: none; background: transparent; border-radius: 4px; cursor: pointer; }
	.ribbon button:hover { background: rgba(0,0,0,0.05); }
	.ribbon button.primary { background: #107c41; color: white; font-weight: 500; padding: 0 12px; }
	.sep { width: 1px; height: 20px; background: rgba(0,0,0,0.1); margin: 0 4px; }
	.formula-bar { display: flex; align-items: center; padding: 4px 8px; background: white; border-bottom: 1px solid rgba(0,0,0,0.08); }
	.cell-ref { width: 70px; padding: 2px 6px; font-family: monospace; border-right: 1px solid #ccc; }
	.formula-input { flex: 1; padding: 2px 8px; border: none; outline: none; font-family: 'Segoe UI', system-ui; font-size: 13px; }
	.grid-wrap { flex: 1; overflow: auto; background: white; }
	.grid { border-collapse: collapse; }
	.grid th, .grid td { border: 1px solid #d6d6d6; padding: 0; }
	.corner { background: #f0f0f0; width: 40px; position: sticky; top: 0; left: 0; z-index: 3; }
	.col-h { background: #f0f0f0; min-width: 80px; font-weight: 500; position: sticky; top: 0; z-index: 2; padding: 2px 0; }
	.row-h { background: #f0f0f0; width: 40px; font-weight: 500; position: sticky; left: 0; z-index: 1; padding: 2px 0; }
	.cell { min-width: 80px; height: 22px; padding: 2px 6px; cursor: cell; }
	.cell.selected { outline: 2px solid #107c41; outline-offset: -2px; background: rgba(16,124,65,0.04); }
	.cell-edit { width: 100%; height: 100%; border: none; outline: none; padding: 0; font: inherit; background: transparent; }
	.sheet-tabs { display: flex; gap: 2px; padding: 4px 8px; background: #f3f3f3; border-top: 1px solid rgba(0,0,0,0.08); }
	.sheet-tab { padding: 4px 12px; border: 1px solid transparent; background: transparent; border-radius: 4px 4px 0 0; cursor: pointer; font-size: 12px; }
	.sheet-tab.active { background: white; border-color: #d6d6d6; border-bottom-color: transparent; }
	.sheet-tab:hover:not(.active) { background: rgba(0,0,0,0.04); }
</style>

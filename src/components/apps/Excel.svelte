<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { consumePendingFile } from '../../state/file-opener.svelte';
	import { writeFile } from '../../state/vfs.svelte';

	// ── Types ──────────────────────────────────────────────────────────

	type NumberFormat = 'general' | 'number' | 'currency' | 'percent' | 'date';
	type Align = 'left' | 'center' | 'right';

	interface CellBorder {
		top?: boolean;
		right?: boolean;
		bottom?: boolean;
		left?: boolean;
	}

	interface CellStyle {
		bold?: boolean;
		italic?: boolean;
		underline?: boolean;
		format?: NumberFormat;
		align?: Align;
		color?: string;
		bg?: string;
		border?: CellBorder;
	}

	interface Cell {
		raw: string;
		style?: CellStyle;
	}

	interface Sheet {
		name: string;
		cells: Record<string, Cell>;
		cols: Record<number, number>; // colIndex -> width px
		rows: Record<number, number>; // rowIndex -> height px
	}

	interface Workbook {
		version: number;
		activeSheet: number;
		sheets: Sheet[];
	}

	interface Selection {
		anchor: { row: number; col: number };
		focus: { row: number; col: number };
	}

	// ── Constants ──────────────────────────────────────────────────────

	const N_ROWS = 100;
	const N_COLS = 26;
	const DEFAULT_COL_W = 90;
	const DEFAULT_ROW_H = 22;
	const HEADER_COL_W = 42; // row header width
	const HEADER_ROW_H = 22; // col header height

	// ── State ──────────────────────────────────────────────────────────

	function newSheet(name = 'Sheet1'): Sheet {
		return { name, cells: {}, cols: {}, rows: {} };
	}

	let workbook = $state<Workbook>({
		version: 1,
		activeSheet: 0,
		sheets: [newSheet('Sheet1')],
	});

	let currentFilePath = $state<string | null>(null);
	let dirty = $state(false);

	let selection = $state<Selection>({
		anchor: { row: 0, col: 0 },
		focus: { row: 0, col: 0 },
	});

	let editing = $state<{ row: number; col: number; value: string } | null>(null);
	let formulaBarValue = $state('');
	let formulaBarFocused = $state(false);

	// Ribbon UI
	let activeMenu = $state<'file' | 'edit' | 'format' | null>(null);
	let borderMenuOpen = $state(false);
	let formatMenuOpen = $state(false);
	let alignMenuOpen = $state(false);

	// Find & Replace
	let findOpen = $state(false);
	let replaceOpen = $state(false);
	let findText = $state('');
	let replaceText = $state('');
	let findMatches = $state<{ sheet: number; row: number; col: number }[]>([]);
	let findMatchIndex = $state(0);

	// Drag selection
	let dragSelecting = $state(false);

	// Resizing
	let resizingCol = $state<{ col: number; startX: number; startW: number } | null>(null);
	let resizingRow = $state<{ row: number; startY: number; startH: number } | null>(null);

	// Sheet rename
	let renamingSheet = $state<number | null>(null);
	let renamingSheetValue = $state('');

	// Grid ref for keyboard scroll
	let gridScrollEl: HTMLDivElement | null = $state(null);
	let editInputEl: HTMLInputElement | null = $state(null);
	let formulaBarInputEl: HTMLInputElement | null = $state(null);

	// ── Derived ────────────────────────────────────────────────────────

	let sheet = $derived(workbook.sheets[workbook.activeSheet]);
	let activeCellRef = $derived(toCellRef(selection.anchor.row, selection.anchor.col));
	let activeCellRaw = $derived(sheet?.cells[activeCellRef]?.raw ?? '');
	let activeCellStyle = $derived(sheet?.cells[activeCellRef]?.style ?? {});

	let selectionRect = $derived(rectFromSelection(selection));

	// ── Cell ref / range helpers ───────────────────────────────────────

	function colLetter(idx: number): string {
		// 0 -> A, 25 -> Z
		let s = '';
		let n = idx;
		do {
			s = String.fromCharCode(65 + (n % 26)) + s;
			n = Math.floor(n / 26) - 1;
		} while (n >= 0);
		return s;
	}

	function colIndexFromLetter(letters: string): number {
		let n = 0;
		const up = letters.toUpperCase();
		for (let i = 0; i < up.length; i++) {
			n = n * 26 + (up.charCodeAt(i) - 64);
		}
		return n - 1;
	}

	function toCellRef(row: number, col: number): string {
		return colLetter(col) + (row + 1);
	}

	function parseCellRef(ref: string): { row: number; col: number } | null {
		const m = /^([A-Za-z]+)(\d+)$/.exec(ref.trim());
		if (!m) return null;
		const col = colIndexFromLetter(m[1]);
		const row = parseInt(m[2], 10) - 1;
		if (col < 0 || row < 0) return null;
		return { row, col };
	}

	function rectFromSelection(s: Selection): { r0: number; c0: number; r1: number; c1: number } {
		return {
			r0: Math.min(s.anchor.row, s.focus.row),
			c0: Math.min(s.anchor.col, s.focus.col),
			r1: Math.max(s.anchor.row, s.focus.row),
			c1: Math.max(s.anchor.col, s.focus.col),
		};
	}

	function isInSelection(row: number, col: number): boolean {
		const r = selectionRect;
		return row >= r.r0 && row <= r.r1 && col >= r.c0 && col <= r.c1;
	}

	// ── Cell access ────────────────────────────────────────────────────

	function getCell(row: number, col: number): Cell | undefined {
		return sheet.cells[toCellRef(row, col)];
	}

	function ensureCell(row: number, col: number): Cell {
		const ref = toCellRef(row, col);
		if (!sheet.cells[ref]) sheet.cells[ref] = { raw: '' };
		return sheet.cells[ref];
	}

	function setCellRaw(row: number, col: number, raw: string) {
		const ref = toCellRef(row, col);
		if (raw === '' && !sheet.cells[ref]?.style) {
			delete sheet.cells[ref];
		} else {
			const existing = sheet.cells[ref];
			sheet.cells[ref] = { ...existing, raw };
		}
		dirty = true;
		invalidateComputeCache();
	}

	function mergeStyleOnRange(style: Partial<CellStyle>) {
		const r = selectionRect;
		for (let row = r.r0; row <= r.r1; row++) {
			for (let col = r.c0; col <= r.c1; col++) {
				const ref = toCellRef(row, col);
				const existing = sheet.cells[ref] ?? { raw: '' };
				const merged: CellStyle = { ...(existing.style ?? {}), ...style };
				// Strip undefined values
				for (const k of Object.keys(merged) as (keyof CellStyle)[]) {
					if (merged[k] === undefined) delete merged[k];
				}
				sheet.cells[ref] = { ...existing, style: merged };
			}
		}
		dirty = true;
	}

	function setBordersOnRange(spec: 'none' | 'all' | 'outer' | 'top' | 'bottom' | 'left' | 'right') {
		const r = selectionRect;
		for (let row = r.r0; row <= r.r1; row++) {
			for (let col = r.c0; col <= r.c1; col++) {
				const ref = toCellRef(row, col);
				const existing = sheet.cells[ref] ?? { raw: '' };
				const style: CellStyle = { ...(existing.style ?? {}) };
				let b: CellBorder = { ...(style.border ?? {}) };
				switch (spec) {
					case 'none':
						b = {};
						break;
					case 'all':
						b = { top: true, right: true, bottom: true, left: true };
						break;
					case 'outer':
						b.top = row === r.r0;
						b.bottom = row === r.r1;
						b.left = col === r.c0;
						b.right = col === r.c1;
						break;
					case 'top':
						b.top = row === r.r0 ? true : b.top;
						break;
					case 'bottom':
						b.bottom = row === r.r1 ? true : b.bottom;
						break;
					case 'left':
						b.left = col === r.c0 ? true : b.left;
						break;
					case 'right':
						b.right = col === r.c1 ? true : b.right;
						break;
				}
				const empty = !b.top && !b.right && !b.bottom && !b.left;
				if (empty) delete style.border;
				else style.border = b;
				sheet.cells[ref] = { ...existing, style };
			}
		}
		dirty = true;
	}

	function clearRangeContents() {
		const r = selectionRect;
		for (let row = r.r0; row <= r.r1; row++) {
			for (let col = r.c0; col <= r.c1; col++) {
				const ref = toCellRef(row, col);
				if (sheet.cells[ref]) {
					if (sheet.cells[ref].style) {
						sheet.cells[ref] = { raw: '', style: sheet.cells[ref].style };
					} else {
						delete sheet.cells[ref];
					}
				}
			}
		}
		dirty = true;
		invalidateComputeCache();
	}

	// ── Formula evaluator ──────────────────────────────────────────────
	//
	// Tokenizer + recursive-descent parser. Pure functions, no eval().
	// Supports: numbers, strings ("..."), refs (A1), ranges (A1:B3),
	// + - * / ^ unary minus, parentheses, comma, ;, and named functions.

	type Token =
		| { t: 'num'; v: number }
		| { t: 'str'; v: string }
		| { t: 'ref'; v: string }
		| { t: 'range'; a: string; b: string }
		| { t: 'op'; v: string }
		| { t: 'lparen' }
		| { t: 'rparen' }
		| { t: 'comma' }
		| { t: 'ident'; v: string };

	function tokenize(src: string): Token[] {
		const out: Token[] = [];
		let i = 0;
		const len = src.length;
		while (i < len) {
			const ch = src[i];
			if (ch === ' ' || ch === '\t') {
				i++;
				continue;
			}
			if (ch === '"') {
				i++;
				let s = '';
				while (i < len && src[i] !== '"') {
					if (src[i] === '\\' && i + 1 < len) {
						s += src[i + 1];
						i += 2;
					} else {
						s += src[i];
						i++;
					}
				}
				if (src[i] === '"') i++;
				out.push({ t: 'str', v: s });
				continue;
			}
			if (ch === '(') {
				out.push({ t: 'lparen' });
				i++;
				continue;
			}
			if (ch === ')') {
				out.push({ t: 'rparen' });
				i++;
				continue;
			}
			if (ch === ',' || ch === ';') {
				out.push({ t: 'comma' });
				i++;
				continue;
			}
			if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '^' || ch === '&') {
				out.push({ t: 'op', v: ch });
				i++;
				continue;
			}
			if (ch === '%') {
				out.push({ t: 'op', v: '%' });
				i++;
				continue;
			}
			// number
			if ((ch >= '0' && ch <= '9') || (ch === '.' && i + 1 < len && src[i + 1] >= '0' && src[i + 1] <= '9')) {
				let s = '';
				while (i < len && ((src[i] >= '0' && src[i] <= '9') || src[i] === '.')) {
					s += src[i];
					i++;
				}
				out.push({ t: 'num', v: parseFloat(s) });
				continue;
			}
			// identifier / ref / range
			if ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || ch === '_') {
				let s = '';
				while (
					i < len &&
					((src[i] >= 'A' && src[i] <= 'Z') ||
						(src[i] >= 'a' && src[i] <= 'z') ||
						(src[i] >= '0' && src[i] <= '9') ||
						src[i] === '_')
				) {
					s += src[i];
					i++;
				}
				// Maybe a cell ref or range
				const refMatch = /^([A-Za-z]+)(\d+)$/.exec(s);
				if (refMatch) {
					// Look for range
					if (src[i] === ':') {
						i++;
						let s2 = '';
						while (
							i < len &&
							((src[i] >= 'A' && src[i] <= 'Z') ||
								(src[i] >= 'a' && src[i] <= 'z') ||
								(src[i] >= '0' && src[i] <= '9'))
						) {
							s2 += src[i];
							i++;
						}
						out.push({ t: 'range', a: s.toUpperCase(), b: s2.toUpperCase() });
					} else {
						out.push({ t: 'ref', v: s.toUpperCase() });
					}
				} else {
					// Look ahead: skip whitespace and check for lparen
					let j = i;
					while (j < len && (src[j] === ' ' || src[j] === '\t')) j++;
					if (src[j] === '(') {
						out.push({ t: 'ident', v: s.toUpperCase() });
					} else {
						// Treat as named constant like TRUE/FALSE handled in identifier path
						out.push({ t: 'ident', v: s.toUpperCase() });
					}
				}
				continue;
			}
			// Unknown char — skip
			i++;
		}
		return out;
	}

	type Value = number | string | boolean | null;

	class EvalError extends Error {
		code: string;
		constructor(code: string, msg: string) {
			super(msg);
			this.code = code;
		}
	}

	const CYCLE = '#CYCLE!';
	const REF_ERR = '#REF!';
	const NAME_ERR = '#NAME?';
	const VAL_ERR = '#VALUE!';
	const DIV_ERR = '#DIV/0!';
	const NUM_ERR = '#NUM!';

	// Memoized per-evaluation-pass cache keyed by cell ref. Cleared on edit.
	let computeCache = new Map<string, Value>();
	let computeStack = new Set<string>();

	function invalidateComputeCache() {
		computeCache = new Map();
	}

	function rangeRefs(a: string, b: string): { row: number; col: number }[] {
		const A = parseCellRef(a);
		const B = parseCellRef(b);
		if (!A || !B) return [];
		const r0 = Math.min(A.row, B.row);
		const r1 = Math.max(A.row, B.row);
		const c0 = Math.min(A.col, B.col);
		const c1 = Math.max(A.col, B.col);
		const out: { row: number; col: number }[] = [];
		for (let r = r0; r <= r1; r++) {
			for (let c = c0; c <= c1; c++) {
				out.push({ row: r, col: c });
			}
		}
		return out;
	}

	function getCellValue(row: number, col: number): Value {
		const ref = toCellRef(row, col);
		if (computeCache.has(ref)) return computeCache.get(ref) ?? null;
		if (computeStack.has(ref)) return CYCLE;
		const cell = sheet.cells[ref];
		if (!cell || cell.raw === '' || cell.raw == null) {
			computeCache.set(ref, null);
			return null;
		}
		const raw = cell.raw;
		if (raw.startsWith('=')) {
			computeStack.add(ref);
			let val: Value;
			try {
				val = evalFormula(raw.slice(1));
			} catch (e) {
				val = e instanceof EvalError ? e.code : VAL_ERR;
			}
			computeStack.delete(ref);
			computeCache.set(ref, val);
			return val;
		}
		// raw text — coerce to number if it parses as a number, else leave as string
		const n = parseFloat(raw);
		if (!isNaN(n) && isFinite(n) && /^-?\d+(\.\d+)?$/.test(raw.trim())) {
			computeCache.set(ref, n);
			return n;
		}
		computeCache.set(ref, raw);
		return raw;
	}

	function getValuesForRange(a: string, b: string): Value[] {
		const refs = rangeRefs(a, b);
		return refs.map((r) => getCellValue(r.row, r.col));
	}

	function toNumber(v: Value): number {
		if (v === null) return 0;
		if (typeof v === 'number') return v;
		if (typeof v === 'boolean') return v ? 1 : 0;
		if (typeof v === 'string') {
			if (v.startsWith('#')) throw new EvalError(v, v);
			const n = parseFloat(v);
			if (isNaN(n)) throw new EvalError(VAL_ERR, 'Not a number');
			return n;
		}
		return 0;
	}

	function toBool(v: Value): boolean {
		if (typeof v === 'boolean') return v;
		if (typeof v === 'number') return v !== 0;
		if (typeof v === 'string') {
			if (v.toUpperCase() === 'TRUE') return true;
			if (v.toUpperCase() === 'FALSE') return false;
			return v.length > 0;
		}
		return false;
	}

	function toStr(v: Value): string {
		if (v === null) return '';
		if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
		return String(v);
	}

	// ── Recursive descent parser ────────────────────────────────────────

	class Parser {
		tokens: Token[];
		pos: number;
		constructor(tokens: Token[]) {
			this.tokens = tokens;
			this.pos = 0;
		}
		peek(): Token | undefined {
			return this.tokens[this.pos];
		}
		next(): Token | undefined {
			return this.tokens[this.pos++];
		}
		expect(t: Token['t']): Token {
			const tok = this.next();
			if (!tok || tok.t !== t) throw new EvalError(VAL_ERR, 'Parse error');
			return tok;
		}

		// expr   -> concat
		// concat -> compare (& compare)*
		// compare -> add  (no compare ops for now)
		// add    -> mul ((+|-) mul)*
		// mul    -> pow ((*|/) pow)*
		// pow    -> unary (^ unary)*
		// unary  -> (-|+) unary | postfix
		// postfix-> primary (%)*
		// primary-> num | str | ref | range | ident(args) | (expr)

		parseExpr(): Value {
			return this.parseConcat();
		}

		parseConcat(): Value {
			let left = this.parseAdd();
			while (this.peek()?.t === 'op' && (this.peek() as any).v === '&') {
				this.next();
				const right = this.parseAdd();
				left = toStr(left) + toStr(right);
			}
			return left;
		}

		parseAdd(): Value {
			let left = this.parseMul();
			while (this.peek()?.t === 'op' && ((this.peek() as any).v === '+' || (this.peek() as any).v === '-')) {
				const op = (this.next() as any).v;
				const right = this.parseMul();
				if (op === '+') left = toNumber(left) + toNumber(right);
				else left = toNumber(left) - toNumber(right);
			}
			return left;
		}

		parseMul(): Value {
			let left = this.parsePow();
			while (this.peek()?.t === 'op' && ((this.peek() as any).v === '*' || (this.peek() as any).v === '/')) {
				const op = (this.next() as any).v;
				const right = this.parsePow();
				if (op === '*') left = toNumber(left) * toNumber(right);
				else {
					const r = toNumber(right);
					if (r === 0) throw new EvalError(DIV_ERR, 'div by zero');
					left = toNumber(left) / r;
				}
			}
			return left;
		}

		parsePow(): Value {
			let left = this.parseUnary();
			while (this.peek()?.t === 'op' && (this.peek() as any).v === '^') {
				this.next();
				const right = this.parseUnary();
				left = Math.pow(toNumber(left), toNumber(right));
			}
			return left;
		}

		parseUnary(): Value {
			const p = this.peek();
			if (p?.t === 'op' && ((p as any).v === '-' || (p as any).v === '+')) {
				const op = (this.next() as any).v;
				const v = this.parseUnary();
				return op === '-' ? -toNumber(v) : toNumber(v);
			}
			return this.parsePostfix();
		}

		parsePostfix(): Value {
			let v = this.parsePrimary();
			while (this.peek()?.t === 'op' && (this.peek() as any).v === '%') {
				this.next();
				v = toNumber(v) / 100;
			}
			return v;
		}

		parsePrimary(): Value {
			const tok = this.next();
			if (!tok) throw new EvalError(VAL_ERR, 'Unexpected end');
			switch (tok.t) {
				case 'num':
					return tok.v;
				case 'str':
					return tok.v;
				case 'ref': {
					const r = parseCellRef(tok.v);
					if (!r) throw new EvalError(REF_ERR, 'Bad ref');
					return getCellValue(r.row, r.col);
				}
				case 'range': {
					// Bare range used outside a function — return first cell value
					const A = parseCellRef(tok.a);
					if (!A) throw new EvalError(REF_ERR, 'Bad ref');
					return getCellValue(A.row, A.col);
				}
				case 'lparen': {
					const v = this.parseExpr();
					this.expect('rparen');
					return v;
				}
				case 'ident': {
					// function call
					if (this.peek()?.t === 'lparen') {
						this.next(); // (
						const args: ArgGroup[] = [];
						if (this.peek()?.t !== 'rparen') {
							args.push(this.parseArg());
							while (this.peek()?.t === 'comma') {
								this.next();
								args.push(this.parseArg());
							}
						}
						this.expect('rparen');
						return callFunc(tok.v, args);
					}
					// bare identifier: TRUE/FALSE constants
					if (tok.v === 'TRUE') return true;
					if (tok.v === 'FALSE') return false;
					if (tok.v === 'PI') return Math.PI;
					throw new EvalError(NAME_ERR, 'Unknown: ' + tok.v);
				}
			}
			throw new EvalError(VAL_ERR, 'Unexpected token');
		}

		parseArg(): ArgGroup {
			// An argument may be a range (e.g. A1:B3) OR an expression.
			// If the next token is a range followed by comma/rparen, return it as a range arg.
			const tok = this.peek();
			if (tok?.t === 'range') {
				this.next();
				return { kind: 'range', a: (tok as any).a, b: (tok as any).b };
			}
			const v = this.parseExpr();
			return { kind: 'value', v };
		}
	}

	type ArgGroup = { kind: 'value'; v: Value } | { kind: 'range'; a: string; b: string };

	function flattenArgs(args: ArgGroup[]): Value[] {
		const out: Value[] = [];
		for (const a of args) {
			if (a.kind === 'value') out.push(a.v);
			else out.push(...getValuesForRange(a.a, a.b));
		}
		return out;
	}

	function flattenNumbers(args: ArgGroup[]): number[] {
		const out: number[] = [];
		for (const v of flattenArgs(args)) {
			if (v === null || v === '') continue;
			if (typeof v === 'string' && v.startsWith('#')) throw new EvalError(v, v);
			if (typeof v === 'number') out.push(v);
			else if (typeof v === 'boolean') out.push(v ? 1 : 0);
			else if (typeof v === 'string') {
				const n = parseFloat(v);
				if (!isNaN(n)) out.push(n);
			}
		}
		return out;
	}

	function callFunc(name: string, args: ArgGroup[]): Value {
		switch (name) {
			case 'SUM': {
				const nums = flattenNumbers(args);
				return nums.reduce((a, b) => a + b, 0);
			}
			case 'AVERAGE':
			case 'AVG': {
				const nums = flattenNumbers(args);
				if (nums.length === 0) throw new EvalError(DIV_ERR, 'No values');
				return nums.reduce((a, b) => a + b, 0) / nums.length;
			}
			case 'MIN': {
				const nums = flattenNumbers(args);
				if (nums.length === 0) return 0;
				return Math.min(...nums);
			}
			case 'MAX': {
				const nums = flattenNumbers(args);
				if (nums.length === 0) return 0;
				return Math.max(...nums);
			}
			case 'COUNT': {
				const all = flattenArgs(args);
				let n = 0;
				for (const v of all) {
					if (v === null || v === '') continue;
					if (typeof v === 'number') n++;
					else if (typeof v === 'string' && !isNaN(parseFloat(v))) n++;
				}
				return n;
			}
			case 'COUNTA': {
				const all = flattenArgs(args);
				let n = 0;
				for (const v of all) {
					if (v !== null && v !== '') n++;
				}
				return n;
			}
			case 'IF': {
				if (args.length < 2) throw new EvalError(VAL_ERR, 'IF needs args');
				const cond = args[0].kind === 'value' ? args[0].v : null;
				if (toBool(cond)) {
					return args[1].kind === 'value' ? args[1].v : null;
				}
				if (args.length >= 3) {
					return args[2].kind === 'value' ? args[2].v : null;
				}
				return false;
			}
			case 'CONCAT':
			case 'CONCATENATE': {
				return flattenArgs(args).map(toStr).join('');
			}
			case 'ABS': {
				const v = args[0]?.kind === 'value' ? args[0].v : null;
				return Math.abs(toNumber(v));
			}
			case 'ROUND': {
				const v = args[0]?.kind === 'value' ? args[0].v : null;
				const d = args[1]?.kind === 'value' ? toNumber(args[1].v) : 0;
				const m = Math.pow(10, d);
				return Math.round(toNumber(v) * m) / m;
			}
			case 'POWER': {
				const a = args[0]?.kind === 'value' ? toNumber(args[0].v) : 0;
				const b = args[1]?.kind === 'value' ? toNumber(args[1].v) : 0;
				return Math.pow(a, b);
			}
			case 'SQRT': {
				const v = toNumber(args[0]?.kind === 'value' ? args[0].v : null);
				if (v < 0) throw new EvalError(NUM_ERR, 'sqrt neg');
				return Math.sqrt(v);
			}
			case 'MOD': {
				const a = toNumber(args[0]?.kind === 'value' ? args[0].v : null);
				const b = toNumber(args[1]?.kind === 'value' ? args[1].v : null);
				if (b === 0) throw new EvalError(DIV_ERR, 'mod by 0');
				return a - Math.floor(a / b) * b;
			}
			case 'LEN': {
				const s = toStr(args[0]?.kind === 'value' ? args[0].v : null);
				return s.length;
			}
			case 'UPPER':
				return toStr(args[0]?.kind === 'value' ? args[0].v : null).toUpperCase();
			case 'LOWER':
				return toStr(args[0]?.kind === 'value' ? args[0].v : null).toLowerCase();
			case 'TRIM':
				return toStr(args[0]?.kind === 'value' ? args[0].v : null).trim();
			case 'LEFT': {
				const s = toStr(args[0]?.kind === 'value' ? args[0].v : null);
				const n = args[1]?.kind === 'value' ? toNumber(args[1].v) : 1;
				return s.slice(0, Math.max(0, n));
			}
			case 'RIGHT': {
				const s = toStr(args[0]?.kind === 'value' ? args[0].v : null);
				const n = args[1]?.kind === 'value' ? toNumber(args[1].v) : 1;
				return n <= 0 ? '' : s.slice(-n);
			}
			case 'MID': {
				const s = toStr(args[0]?.kind === 'value' ? args[0].v : null);
				const start = args[1]?.kind === 'value' ? toNumber(args[1].v) : 1;
				const len = args[2]?.kind === 'value' ? toNumber(args[2].v) : 0;
				return s.slice(Math.max(0, start - 1), Math.max(0, start - 1) + Math.max(0, len));
			}
			case 'NOW':
				return Date.now() / 86400000; // days since unix epoch
			case 'TODAY':
				return Math.floor(Date.now() / 86400000);
			case 'AND': {
				const vals = flattenArgs(args);
				return vals.every(toBool);
			}
			case 'OR': {
				const vals = flattenArgs(args);
				return vals.some(toBool);
			}
			case 'NOT': {
				const v = args[0]?.kind === 'value' ? args[0].v : null;
				return !toBool(v);
			}
			case 'ROW':
				return selection.anchor.row + 1;
			case 'COLUMN':
				return selection.anchor.col + 1;
			case 'PI':
				return Math.PI;
			default:
				throw new EvalError(NAME_ERR, 'Unknown function: ' + name);
		}
	}

	function evalFormula(src: string): Value {
		const tokens = tokenize(src);
		const p = new Parser(tokens);
		const v = p.parseExpr();
		return v;
	}

	// ── Display formatting ─────────────────────────────────────────────

	function pad2(n: number): string {
		return n < 10 ? '0' + n : String(n);
	}

	function formatValue(v: Value, fmt: NumberFormat | undefined): string {
		if (v === null) return '';
		if (typeof v === 'string') return v;
		if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
		// number
		const n = v;
		switch (fmt) {
			case 'currency':
				return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString(undefined, {
					minimumFractionDigits: 2,
					maximumFractionDigits: 2,
				});
			case 'percent':
				return (n * 100).toLocaleString(undefined, { maximumFractionDigits: 2 }) + '%';
			case 'number':
				return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
			case 'date': {
				const ms = n * 86400000;
				const d = new Date(ms);
				if (isNaN(d.getTime())) return String(n);
				return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}/${d.getFullYear()}`;
			}
			case 'general':
			default: {
				// Strip trailing zeros sensibly
				if (Number.isInteger(n)) return String(n);
				// limit to ~10 significant digits
				return String(parseFloat(n.toPrecision(12)));
			}
		}
	}

	function displayOf(row: number, col: number): string {
		const cell = getCell(row, col);
		if (!cell) return '';
		if (cell.raw === '' || cell.raw == null) return '';
		const v = getCellValue(row, col);
		if (typeof v === 'string' && v.startsWith('#')) return v;
		return formatValue(v, cell.style?.format);
	}

	function alignOf(row: number, col: number): Align {
		const cell = getCell(row, col);
		if (cell?.style?.align) return cell.style.align;
		const v = getCellValue(row, col);
		if (typeof v === 'number' || typeof v === 'boolean') return 'right';
		return 'left';
	}

	// ── Selection / Navigation ──────────────────────────────────────────

	function setAnchor(row: number, col: number) {
		row = Math.max(0, Math.min(N_ROWS - 1, row));
		col = Math.max(0, Math.min(N_COLS - 1, col));
		selection = { anchor: { row, col }, focus: { row, col } };
		formulaBarValue = sheet.cells[toCellRef(row, col)]?.raw ?? '';
	}

	function setFocus(row: number, col: number) {
		row = Math.max(0, Math.min(N_ROWS - 1, row));
		col = Math.max(0, Math.min(N_COLS - 1, col));
		selection = { ...selection, focus: { row, col } };
	}

	function moveAnchor(dr: number, dc: number) {
		commitEdit();
		setAnchor(selection.anchor.row + dr, selection.anchor.col + dc);
	}

	function startEdit(row: number, col: number, initial?: string) {
		setAnchor(row, col);
		const existing = initial !== undefined ? initial : sheet.cells[toCellRef(row, col)]?.raw ?? '';
		editing = { row, col, value: existing };
		tick().then(() => {
			editInputEl?.focus();
			if (initial === undefined) editInputEl?.select();
		});
	}

	function commitEdit() {
		if (!editing) return;
		setCellRaw(editing.row, editing.col, editing.value);
		editing = null;
	}

	function cancelEdit() {
		editing = null;
	}

	// ── Keyboard ───────────────────────────────────────────────────────

	function onKeyDown(e: KeyboardEvent) {
		// If user is in an input field other than grid, skip
		const tgt = e.target as HTMLElement;
		const inFormulaBar = tgt === formulaBarInputEl;
		const inEdit = tgt === editInputEl;
		const inOtherInput = tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA';

		// Global shortcuts
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
			e.preventDefault();
			findOpen = true;
			replaceOpen = false;
			return;
		}
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'h') {
			e.preventDefault();
			findOpen = true;
			replaceOpen = true;
			return;
		}
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
			e.preventDefault();
			doSave();
			return;
		}
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b' && !inOtherInput) {
			e.preventDefault();
			toggleStyle('bold');
			return;
		}
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i' && !inOtherInput) {
			e.preventDefault();
			toggleStyle('italic');
			return;
		}
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u' && !inOtherInput) {
			e.preventDefault();
			toggleStyle('underline');
			return;
		}

		if (editing) {
			if (e.key === 'Enter') {
				e.preventDefault();
				commitEdit();
				moveAnchor(1, 0);
			} else if (e.key === 'Tab') {
				e.preventDefault();
				commitEdit();
				moveAnchor(0, e.shiftKey ? -1 : 1);
			} else if (e.key === 'Escape') {
				e.preventDefault();
				cancelEdit();
			}
			return;
		}

		if (inFormulaBar) {
			if (e.key === 'Enter') {
				e.preventDefault();
				setCellRaw(selection.anchor.row, selection.anchor.col, formulaBarValue);
				moveAnchor(1, 0);
				formulaBarInputEl?.blur();
			} else if (e.key === 'Escape') {
				e.preventDefault();
				formulaBarValue = activeCellRaw;
				formulaBarInputEl?.blur();
			}
			return;
		}

		if (inOtherInput) return;

		// Grid keyboard
		if (e.key === 'ArrowUp') {
			e.preventDefault();
			if (e.shiftKey) setFocus(selection.focus.row - 1, selection.focus.col);
			else moveAnchor(-1, 0);
			scrollSelectionIntoView();
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			if (e.shiftKey) setFocus(selection.focus.row + 1, selection.focus.col);
			else moveAnchor(1, 0);
			scrollSelectionIntoView();
		} else if (e.key === 'ArrowLeft') {
			e.preventDefault();
			if (e.shiftKey) setFocus(selection.focus.row, selection.focus.col - 1);
			else moveAnchor(0, -1);
			scrollSelectionIntoView();
		} else if (e.key === 'ArrowRight') {
			e.preventDefault();
			if (e.shiftKey) setFocus(selection.focus.row, selection.focus.col + 1);
			else moveAnchor(0, 1);
			scrollSelectionIntoView();
		} else if (e.key === 'Enter') {
			e.preventDefault();
			startEdit(selection.anchor.row, selection.anchor.col);
		} else if (e.key === 'Tab') {
			e.preventDefault();
			moveAnchor(0, e.shiftKey ? -1 : 1);
			scrollSelectionIntoView();
		} else if (e.key === 'F2') {
			e.preventDefault();
			startEdit(selection.anchor.row, selection.anchor.col);
		} else if (e.key === 'Delete' || e.key === 'Backspace') {
			e.preventDefault();
			clearRangeContents();
			formulaBarValue = '';
		} else if (e.key === 'Escape') {
			activeMenu = null;
			borderMenuOpen = false;
			formatMenuOpen = false;
			alignMenuOpen = false;
			findOpen = false;
		} else if (
			!e.ctrlKey &&
			!e.metaKey &&
			!e.altKey &&
			e.key.length === 1
		) {
			// Start typing
			startEdit(selection.anchor.row, selection.anchor.col, e.key);
			e.preventDefault();
		}
	}

	function scrollSelectionIntoView() {
		if (!gridScrollEl) return;
		const x = colOffset(selection.anchor.col);
		const y = rowOffset(selection.anchor.row);
		const w = colWidth(selection.anchor.col);
		const h = rowHeight(selection.anchor.row);
		const scLeft = gridScrollEl.scrollLeft;
		const scTop = gridScrollEl.scrollTop;
		const viewW = gridScrollEl.clientWidth - HEADER_COL_W;
		const viewH = gridScrollEl.clientHeight - HEADER_ROW_H;
		if (x < scLeft) gridScrollEl.scrollLeft = x;
		else if (x + w > scLeft + viewW) gridScrollEl.scrollLeft = x + w - viewW;
		if (y < scTop) gridScrollEl.scrollTop = y;
		else if (y + h > scTop + viewH) gridScrollEl.scrollTop = y + h - viewH;
	}

	// ── Styling actions ────────────────────────────────────────────────

	function toggleStyle(key: 'bold' | 'italic' | 'underline') {
		const cur = activeCellStyle[key];
		mergeStyleOnRange({ [key]: !cur } as Partial<CellStyle>);
	}

	function setFormat(fmt: NumberFormat) {
		mergeStyleOnRange({ format: fmt });
		formatMenuOpen = false;
	}

	function setAlign(a: Align) {
		mergeStyleOnRange({ align: a });
		alignMenuOpen = false;
	}

	function setColor(c: string) {
		mergeStyleOnRange({ color: c });
	}

	function setBg(c: string) {
		mergeStyleOnRange({ bg: c });
	}

	function clearColor() {
		mergeStyleOnRange({ color: undefined });
	}

	function clearBg() {
		mergeStyleOnRange({ bg: undefined });
	}

	// ── Column / Row sizing ────────────────────────────────────────────

	function colWidth(c: number): number {
		return sheet.cols[c] ?? DEFAULT_COL_W;
	}
	function rowHeight(r: number): number {
		return sheet.rows[r] ?? DEFAULT_ROW_H;
	}

	function colOffset(c: number): number {
		let x = 0;
		for (let i = 0; i < c; i++) x += colWidth(i);
		return x;
	}
	function rowOffset(r: number): number {
		let y = 0;
		for (let i = 0; i < r; i++) y += rowHeight(i);
		return y;
	}

	let totalWidth = $derived(() => {
		let w = 0;
		for (let i = 0; i < N_COLS; i++) w += colWidth(i);
		return w;
	});
	let totalHeight = $derived(() => {
		let h = 0;
		for (let i = 0; i < N_ROWS; i++) h += rowHeight(i);
		return h;
	});

	function startColResize(e: MouseEvent, col: number) {
		e.preventDefault();
		e.stopPropagation();
		resizingCol = { col, startX: e.clientX, startW: colWidth(col) };
		window.addEventListener('mousemove', onColResize);
		window.addEventListener('mouseup', endColResize);
	}
	function onColResize(e: MouseEvent) {
		if (!resizingCol) return;
		const dx = e.clientX - resizingCol.startX;
		const w = Math.max(24, resizingCol.startW + dx);
		sheet.cols[resizingCol.col] = w;
		dirty = true;
	}
	function endColResize() {
		resizingCol = null;
		window.removeEventListener('mousemove', onColResize);
		window.removeEventListener('mouseup', endColResize);
	}

	function startRowResize(e: MouseEvent, row: number) {
		e.preventDefault();
		e.stopPropagation();
		resizingRow = { row, startY: e.clientY, startH: rowHeight(row) };
		window.addEventListener('mousemove', onRowResize);
		window.addEventListener('mouseup', endRowResize);
	}
	function onRowResize(e: MouseEvent) {
		if (!resizingRow) return;
		const dy = e.clientY - resizingRow.startY;
		const h = Math.max(14, resizingRow.startH + dy);
		sheet.rows[resizingRow.row] = h;
		dirty = true;
	}
	function endRowResize() {
		resizingRow = null;
		window.removeEventListener('mousemove', onRowResize);
		window.removeEventListener('mouseup', endRowResize);
	}

	// ── Mouse selection ────────────────────────────────────────────────

	function onCellMouseDown(e: MouseEvent, row: number, col: number) {
		if (e.button !== 0) return;
		if (editing) commitEdit();
		if (e.shiftKey) {
			selection = { ...selection, focus: { row, col } };
		} else {
			setAnchor(row, col);
			dragSelecting = true;
			window.addEventListener('mouseup', endDragSelect);
		}
	}

	function onCellMouseEnter(row: number, col: number) {
		if (dragSelecting) setFocus(row, col);
	}

	function endDragSelect() {
		dragSelecting = false;
		window.removeEventListener('mouseup', endDragSelect);
	}

	function onCellDblClick(row: number, col: number) {
		startEdit(row, col);
	}

	function onRowHeaderClick(row: number) {
		selection = { anchor: { row, col: 0 }, focus: { row, col: N_COLS - 1 } };
		formulaBarValue = sheet.cells[toCellRef(row, 0)]?.raw ?? '';
	}

	function onColHeaderClick(col: number) {
		selection = { anchor: { row: 0, col }, focus: { row: N_ROWS - 1, col } };
		formulaBarValue = sheet.cells[toCellRef(0, col)]?.raw ?? '';
	}

	// ── Sheets ─────────────────────────────────────────────────────────

	function addSheet() {
		const n = workbook.sheets.length + 1;
		workbook.sheets = [...workbook.sheets, newSheet('Sheet' + n)];
		workbook.activeSheet = workbook.sheets.length - 1;
		setAnchor(0, 0);
		invalidateComputeCache();
		dirty = true;
	}

	function switchSheet(idx: number) {
		commitEdit();
		workbook.activeSheet = idx;
		setAnchor(0, 0);
		invalidateComputeCache();
	}

	function deleteSheet(idx: number) {
		if (workbook.sheets.length <= 1) return;
		workbook.sheets = workbook.sheets.filter((_, i) => i !== idx);
		if (workbook.activeSheet >= workbook.sheets.length) {
			workbook.activeSheet = workbook.sheets.length - 1;
		}
		invalidateComputeCache();
		dirty = true;
	}

	function startRenameSheet(idx: number) {
		renamingSheet = idx;
		renamingSheetValue = workbook.sheets[idx].name;
	}

	function commitRenameSheet() {
		if (renamingSheet == null) return;
		const v = renamingSheetValue.trim();
		if (v) {
			workbook.sheets[renamingSheet].name = v;
			dirty = true;
		}
		renamingSheet = null;
	}

	// ── File ops ───────────────────────────────────────────────────────

	function serializeWorkbook(): string {
		return JSON.stringify(workbook);
	}

	function loadWorkbookJson(text: string): boolean {
		try {
			const parsed = JSON.parse(text);
			if (!parsed || !Array.isArray(parsed.sheets)) return false;
			workbook = {
				version: parsed.version ?? 1,
				activeSheet: Math.max(0, Math.min(parsed.activeSheet ?? 0, parsed.sheets.length - 1)),
				sheets: parsed.sheets.map((s: any) => ({
					name: s.name ?? 'Sheet',
					cells: s.cells ?? {},
					cols: s.cols ?? {},
					rows: s.rows ?? {},
				})),
			};
			setAnchor(0, 0);
			invalidateComputeCache();
			dirty = false;
			return true;
		} catch {
			return false;
		}
	}

	function loadCsv(text: string): boolean {
		try {
			const sh = newSheet('Imported');
			const lines = text.split(/\r?\n/);
			lines.forEach((line, r) => {
				if (r >= N_ROWS) return;
				const cells = parseCsvLine(line);
				cells.forEach((v, c) => {
					if (c >= N_COLS) return;
					if (v !== '') {
						sh.cells[toCellRef(r, c)] = { raw: v };
					}
				});
			});
			workbook = { version: 1, activeSheet: 0, sheets: [sh] };
			setAnchor(0, 0);
			invalidateComputeCache();
			dirty = false;
			return true;
		} catch {
			return false;
		}
	}

	function parseCsvLine(line: string): string[] {
		const out: string[] = [];
		let cur = '';
		let inQuotes = false;
		for (let i = 0; i < line.length; i++) {
			const ch = line[i];
			if (inQuotes) {
				if (ch === '"') {
					if (line[i + 1] === '"') {
						cur += '"';
						i++;
					} else {
						inQuotes = false;
					}
				} else cur += ch;
			} else {
				if (ch === ',') {
					out.push(cur);
					cur = '';
				} else if (ch === '"') {
					inQuotes = true;
				} else cur += ch;
			}
		}
		out.push(cur);
		return out;
	}

	function escapeCsv(v: string): string {
		if (/[",\n\r]/.test(v)) {
			return '"' + v.replace(/"/g, '""') + '"';
		}
		return v;
	}

	function exportCsv() {
		const lines: string[] = [];
		// Find used bounds for current sheet
		let maxRow = 0;
		let maxCol = 0;
		for (const key of Object.keys(sheet.cells)) {
			const r = parseCellRef(key);
			if (!r) continue;
			if (r.row > maxRow) maxRow = r.row;
			if (r.col > maxCol) maxCol = r.col;
		}
		for (let r = 0; r <= maxRow; r++) {
			const cells: string[] = [];
			for (let c = 0; c <= maxCol; c++) {
				cells.push(escapeCsv(displayOf(r, c)));
			}
			lines.push(cells.join(','));
		}
		const csv = lines.join('\n');
		downloadBlob(csv, (sheet.name || 'sheet') + '.csv', 'text/csv');
		activeMenu = null;
	}

	function downloadBlob(text: string, filename: string, mime: string) {
		const blob = new Blob([text], { type: mime });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		setTimeout(() => URL.revokeObjectURL(url), 100);
	}

	function doSave() {
		const text = serializeWorkbook();
		if (currentFilePath) {
			writeFile(currentFilePath, text);
			dirty = false;
		} else {
			doSaveAs();
		}
		activeMenu = null;
	}

	function doSaveAs() {
		const name = currentFilePath ? currentFilePath.split('/').pop()! : 'Workbook.xlsx';
		downloadBlob(serializeWorkbook(), name, 'application/json');
		dirty = false;
		activeMenu = null;
	}

	function doOpen() {
		const inp = document.createElement('input');
		inp.type = 'file';
		inp.accept = '.xlsx,.json,.csv';
		inp.onchange = () => {
			const f = inp.files?.[0];
			if (!f) return;
			const reader = new FileReader();
			reader.onload = () => {
				const text = String(reader.result ?? '');
				if (!loadWorkbookJson(text)) loadCsv(text);
			};
			reader.readAsText(f);
		};
		inp.click();
		activeMenu = null;
	}

	function doNew() {
		workbook = { version: 1, activeSheet: 0, sheets: [newSheet('Sheet1')] };
		currentFilePath = null;
		setAnchor(0, 0);
		invalidateComputeCache();
		dirty = false;
		activeMenu = null;
	}

	// ── Find & Replace ─────────────────────────────────────────────────

	function runFind() {
		findMatches = [];
		if (!findText) {
			findMatchIndex = 0;
			return;
		}
		const needle = findText.toLowerCase();
		for (let si = 0; si < workbook.sheets.length; si++) {
			const sh = workbook.sheets[si];
			for (const key of Object.keys(sh.cells)) {
				const r = parseCellRef(key);
				if (!r) continue;
				const raw = sh.cells[key].raw ?? '';
				if (raw.toLowerCase().includes(needle)) {
					findMatches.push({ sheet: si, row: r.row, col: r.col });
				}
			}
		}
		findMatchIndex = 0;
		gotoCurrentMatch();
	}

	function gotoCurrentMatch() {
		if (findMatches.length === 0) return;
		const m = findMatches[findMatchIndex];
		if (m.sheet !== workbook.activeSheet) {
			workbook.activeSheet = m.sheet;
			invalidateComputeCache();
		}
		setAnchor(m.row, m.col);
		tick().then(scrollSelectionIntoView);
	}

	function findNext() {
		if (findMatches.length === 0) {
			runFind();
			return;
		}
		findMatchIndex = (findMatchIndex + 1) % findMatches.length;
		gotoCurrentMatch();
	}

	function findPrev() {
		if (findMatches.length === 0) {
			runFind();
			return;
		}
		findMatchIndex = (findMatchIndex - 1 + findMatches.length) % findMatches.length;
		gotoCurrentMatch();
	}

	function replaceOne() {
		if (findMatches.length === 0) return;
		const m = findMatches[findMatchIndex];
		const sh = workbook.sheets[m.sheet];
		const ref = toCellRef(m.row, m.col);
		const raw = sh.cells[ref]?.raw ?? '';
		const replaced = raw.split(findText).join(replaceText);
		sh.cells[ref] = { ...sh.cells[ref], raw: replaced };
		dirty = true;
		invalidateComputeCache();
		runFind();
	}

	function replaceAll() {
		if (!findText) return;
		let n = 0;
		for (let si = 0; si < workbook.sheets.length; si++) {
			const sh = workbook.sheets[si];
			for (const key of Object.keys(sh.cells)) {
				const raw = sh.cells[key].raw ?? '';
				if (raw.includes(findText)) {
					sh.cells[key] = { ...sh.cells[key], raw: raw.split(findText).join(replaceText) };
					n++;
				}
			}
		}
		dirty = true;
		invalidateComputeCache();
		runFind();
	}

	// ── Mount / file open ──────────────────────────────────────────────

	onMount(() => {
		// Pending file from openFile()
		const pending = consumePendingFile();
		if (pending) {
			currentFilePath = pending.path;
			const text = pending.content ?? '';
			if (text) {
				if (!loadWorkbookJson(text)) loadCsv(text);
			}
		} else {
			// Check localStorage launch args
			try {
				const raw = localStorage.getItem('wm.appLaunchArgs');
				if (raw) {
					const args = JSON.parse(raw);
					if (args?.excel?.path) {
						currentFilePath = args.excel.path;
					}
				}
			} catch {
				// ignore
			}
		}
		setAnchor(0, 0);
	});

	onDestroy(() => {
		window.removeEventListener('mousemove', onColResize);
		window.removeEventListener('mouseup', endColResize);
		window.removeEventListener('mousemove', onRowResize);
		window.removeEventListener('mouseup', endRowResize);
		window.removeEventListener('mouseup', endDragSelect);
	});

	// ── Border-style helpers per cell ──────────────────────────────────

	function borderStyleStr(b: CellBorder | undefined): string {
		if (!b) return '';
		const c = '1px solid #888';
		const parts: string[] = [];
		if (b.top) parts.push('border-top:' + c + ';');
		if (b.right) parts.push('border-right:' + c + ';');
		if (b.bottom) parts.push('border-bottom:' + c + ';');
		if (b.left) parts.push('border-left:' + c + ';');
		return parts.join('');
	}

	function cellStyleStr(row: number, col: number): string {
		const cell = getCell(row, col);
		const st = cell?.style;
		const a = alignOf(row, col);
		const parts: string[] = [`text-align:${a};`];
		if (st?.bold) parts.push('font-weight:600;');
		if (st?.italic) parts.push('font-style:italic;');
		if (st?.underline) parts.push('text-decoration:underline;');
		if (st?.color) parts.push('color:' + st.color + ';');
		if (st?.bg) parts.push('background:' + st.bg + ';');
		if (st?.border) parts.push(borderStyleStr(st.border));
		return parts.join('');
	}

	function ribbonClick() {
		// Clicking ribbon shouldn't lose grid focus completely — but close menus on any outside click handled separately.
	}

	function closeMenusOnClick(e: MouseEvent) {
		const tgt = e.target as HTMLElement;
		if (!tgt.closest('.ribbon') && !tgt.closest('.menu-dropdown') && !tgt.closest('.find-panel')) {
			activeMenu = null;
			borderMenuOpen = false;
			formatMenuOpen = false;
			alignMenuOpen = false;
		}
	}
</script>

<svelte:window onclick={closeMenusOnClick} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="excel-app" onkeydown={onKeyDown} tabindex="-1">
	<!-- Top bar: File menu + sheet name -->
	<div class="title-bar">
		<button
			class="file-btn"
			class:active={activeMenu === 'file'}
			onclick={(e) => { e.stopPropagation(); activeMenu = activeMenu === 'file' ? null : 'file'; }}
		>File</button>
		<div class="doc-title">
			{currentFilePath ? currentFilePath.split('/').pop() : 'Book1'}{dirty ? ' *' : ''}
		</div>
		{#if activeMenu === 'file'}
			<div class="menu-dropdown file-menu">
				<button class="dropdown-item" onclick={doNew}>New <span class="shortcut">Ctrl+N</span></button>
				<button class="dropdown-item" onclick={doOpen}>Open... <span class="shortcut">Ctrl+O</span></button>
				<button class="dropdown-item" onclick={doSave}>Save <span class="shortcut">Ctrl+S</span></button>
				<button class="dropdown-item" onclick={doSaveAs}>Save As...</button>
				<div class="dropdown-separator"></div>
				<button class="dropdown-item" onclick={exportCsv}>Export as CSV</button>
			</div>
		{/if}
	</div>

	<!-- Ribbon -->
	<div class="ribbon">
		<!-- Clipboard group -->
		<div class="ribbon-group">
			<div class="ribbon-row">
				<button class="rb-btn lg" title="Copy" onclick={() => navigator.clipboard?.writeText(displayOf(selection.anchor.row, selection.anchor.col)).catch(() => {})}>
					<span class="ic">📋</span>
					<span class="lbl-sm">Copy</span>
				</button>
				<button class="rb-btn lg" title="Paste" onclick={async () => {
					try {
						const t = await navigator.clipboard.readText();
						setCellRaw(selection.anchor.row, selection.anchor.col, t);
						formulaBarValue = t;
					} catch {
						// clipboard read may be denied
					}
				}}>
					<span class="ic">📌</span>
					<span class="lbl-sm">Paste</span>
				</button>
			</div>
			<div class="group-label">Clipboard</div>
		</div>

		<div class="ribbon-sep"></div>

		<!-- Font group -->
		<div class="ribbon-group">
			<div class="ribbon-row">
				<button class="rb-btn" class:on={!!activeCellStyle.bold} title="Bold (Ctrl+B)" onclick={() => toggleStyle('bold')}><b>B</b></button>
				<button class="rb-btn" class:on={!!activeCellStyle.italic} title="Italic (Ctrl+I)" onclick={() => toggleStyle('italic')}><i>I</i></button>
				<button class="rb-btn" class:on={!!activeCellStyle.underline} title="Underline (Ctrl+U)" onclick={() => toggleStyle('underline')}><u>U</u></button>
				<label class="rb-btn color-btn" title="Text color">
					<span class="ic" style:color={activeCellStyle.color ?? '#000'}>A</span>
					<input type="color" value={activeCellStyle.color ?? '#000000'} onchange={(e) => setColor((e.currentTarget as HTMLInputElement).value)} />
				</label>
				<button class="rb-btn" title="Clear text color" onclick={clearColor}>×A</button>
				<label class="rb-btn color-btn" title="Fill color">
					<span class="ic">🎨</span>
					<input type="color" value={activeCellStyle.bg ?? '#ffffff'} onchange={(e) => setBg((e.currentTarget as HTMLInputElement).value)} />
				</label>
				<button class="rb-btn" title="Clear fill" onclick={clearBg}>×🎨</button>
				<div class="border-group">
					<button class="rb-btn" title="Borders" onclick={(e) => { e.stopPropagation(); borderMenuOpen = !borderMenuOpen; formatMenuOpen = false; alignMenuOpen = false; }}>▦ ▾</button>
					{#if borderMenuOpen}
						<div class="menu-dropdown border-menu">
							<button class="dropdown-item" onclick={() => { setBordersOnRange('none'); borderMenuOpen = false; }}>None</button>
							<button class="dropdown-item" onclick={() => { setBordersOnRange('all'); borderMenuOpen = false; }}>All Borders</button>
							<button class="dropdown-item" onclick={() => { setBordersOnRange('outer'); borderMenuOpen = false; }}>Outer Border</button>
							<div class="dropdown-separator"></div>
							<button class="dropdown-item" onclick={() => { setBordersOnRange('top'); borderMenuOpen = false; }}>Top Border</button>
							<button class="dropdown-item" onclick={() => { setBordersOnRange('bottom'); borderMenuOpen = false; }}>Bottom Border</button>
							<button class="dropdown-item" onclick={() => { setBordersOnRange('left'); borderMenuOpen = false; }}>Left Border</button>
							<button class="dropdown-item" onclick={() => { setBordersOnRange('right'); borderMenuOpen = false; }}>Right Border</button>
						</div>
					{/if}
				</div>
			</div>
			<div class="group-label">Font</div>
		</div>

		<div class="ribbon-sep"></div>

		<!-- Alignment group -->
		<div class="ribbon-group">
			<div class="ribbon-row">
				<button class="rb-btn" class:on={activeCellStyle.align === 'left'} title="Align Left" onclick={() => setAlign('left')}>⬅</button>
				<button class="rb-btn" class:on={activeCellStyle.align === 'center'} title="Center" onclick={() => setAlign('center')}>↔</button>
				<button class="rb-btn" class:on={activeCellStyle.align === 'right'} title="Align Right" onclick={() => setAlign('right')}>➡</button>
			</div>
			<div class="group-label">Alignment</div>
		</div>

		<div class="ribbon-sep"></div>

		<!-- Number group -->
		<div class="ribbon-group">
			<div class="ribbon-row">
				<select
					class="fmt-select"
					title="Number format"
					value={activeCellStyle.format ?? 'general'}
					onchange={(e) => setFormat((e.currentTarget as HTMLSelectElement).value as NumberFormat)}
				>
					<option value="general">General</option>
					<option value="number">Number</option>
					<option value="currency">Currency</option>
					<option value="percent">Percent</option>
					<option value="date">Date</option>
				</select>
				<button class="rb-btn" title="Currency" onclick={() => setFormat('currency')}>$</button>
				<button class="rb-btn" title="Percent" onclick={() => setFormat('percent')}>%</button>
			</div>
			<div class="group-label">Number</div>
		</div>

		<div class="ribbon-sep"></div>

		<!-- Cells group -->
		<div class="ribbon-group">
			<div class="ribbon-row">
				<button class="rb-btn" title="Clear contents (Delete)" onclick={() => clearRangeContents()}>⌫</button>
				<button class="rb-btn" title="Find (Ctrl+F)" onclick={() => { findOpen = true; replaceOpen = false; }}>🔍</button>
				<button class="rb-btn" title="Replace (Ctrl+H)" onclick={() => { findOpen = true; replaceOpen = true; }}>↔</button>
			</div>
			<div class="group-label">Cells</div>
		</div>
	</div>

	<!-- Name box + Formula bar -->
	<div class="formula-bar">
		<div class="name-box">{toCellRef(selection.anchor.row, selection.anchor.col)}</div>
		<div class="fx-label">fx</div>
		<input
			bind:this={formulaBarInputEl}
			class="fx-input"
			type="text"
			bind:value={formulaBarValue}
			onfocus={() => { formulaBarFocused = true; }}
			onblur={() => {
				formulaBarFocused = false;
				if (formulaBarValue !== (sheet.cells[activeCellRef]?.raw ?? '')) {
					setCellRaw(selection.anchor.row, selection.anchor.col, formulaBarValue);
				}
			}}
		/>
	</div>

	<!-- Find / Replace panel -->
	{#if findOpen}
		<div class="find-panel" onclick={(e) => e.stopPropagation()}>
			<div class="find-row">
				<label>Find:</label>
				<input
					type="text"
					bind:value={findText}
					oninput={runFind}
					onkeydown={(e) => { if (e.key === 'Enter') findNext(); if (e.key === 'Escape') findOpen = false; }}
				/>
				<button onclick={findPrev}>◀</button>
				<button onclick={findNext}>▶</button>
				<span class="find-count">{findMatches.length === 0 ? '0' : (findMatchIndex + 1) + '/' + findMatches.length}</span>
				<button onclick={() => { replaceOpen = !replaceOpen; }}>{replaceOpen ? '−' : 'Replace'}</button>
				<button onclick={() => { findOpen = false; }}>✕</button>
			</div>
			{#if replaceOpen}
				<div class="find-row">
					<label>Replace:</label>
					<input
						type="text"
						bind:value={replaceText}
						onkeydown={(e) => { if (e.key === 'Enter') replaceOne(); if (e.key === 'Escape') findOpen = false; }}
					/>
					<button onclick={replaceOne}>Replace</button>
					<button onclick={replaceAll}>Replace All</button>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Grid -->
	<div class="grid-scroll" bind:this={gridScrollEl}>
		<div
			class="grid"
			style:width="{HEADER_COL_W + totalWidth()}px"
			style:height="{HEADER_ROW_H + totalHeight()}px"
		>
			<!-- Top-left corner -->
			<div
				class="corner-cell"
				style:width="{HEADER_COL_W}px"
				style:height="{HEADER_ROW_H}px"
				onclick={() => {
					selection = { anchor: { row: 0, col: 0 }, focus: { row: N_ROWS - 1, col: N_COLS - 1 } };
				}}
			></div>

			<!-- Column headers -->
			<div class="col-headers" style:left="{HEADER_COL_W}px" style:height="{HEADER_ROW_H}px">
				{#each Array(N_COLS) as _, c}
					{@const isSel = c >= selectionRect.c0 && c <= selectionRect.c1}
					<div
						class="col-header"
						class:selected={isSel}
						style:left="{colOffset(c)}px"
						style:width="{colWidth(c)}px"
						style:height="{HEADER_ROW_H}px"
						onclick={() => onColHeaderClick(c)}
					>
						{colLetter(c)}
						<div
							class="col-resizer"
							onmousedown={(e) => startColResize(e, c)}
						></div>
					</div>
				{/each}
			</div>

			<!-- Row headers -->
			<div class="row-headers" style:top="{HEADER_ROW_H}px" style:width="{HEADER_COL_W}px">
				{#each Array(N_ROWS) as _, r}
					{@const isSel = r >= selectionRect.r0 && r <= selectionRect.r1}
					<div
						class="row-header"
						class:selected={isSel}
						style:top="{rowOffset(r)}px"
						style:height="{rowHeight(r)}px"
						style:width="{HEADER_COL_W}px"
						onclick={() => onRowHeaderClick(r)}
					>
						{r + 1}
						<div
							class="row-resizer"
							onmousedown={(e) => startRowResize(e, r)}
						></div>
					</div>
				{/each}
			</div>

			<!-- Cells -->
			<div class="cells" style:left="{HEADER_COL_W}px" style:top="{HEADER_ROW_H}px">
				{#each Array(N_ROWS) as _, r}
					<div class="row" style:top="{rowOffset(r)}px" style:height="{rowHeight(r)}px">
						{#each Array(N_COLS) as __, c}
							{@const isAnchor = selection.anchor.row === r && selection.anchor.col === c}
							{@const inSel = isInSelection(r, c)}
							{@const isEditing = editing?.row === r && editing?.col === c}
							{@const isFindHit = findOpen && findMatches.some((m) => m.sheet === workbook.activeSheet && m.row === r && m.col === c)}
							<div
								class="cell"
								class:anchor={isAnchor}
								class:in-sel={inSel && !isAnchor}
								class:find-hit={isFindHit}
								style:left="{colOffset(c)}px"
								style:width="{colWidth(c)}px"
								style:height="{rowHeight(r)}px"
								style={cellStyleStr(r, c)}
								onmousedown={(e) => onCellMouseDown(e, r, c)}
								onmouseenter={() => onCellMouseEnter(r, c)}
								ondblclick={() => onCellDblClick(r, c)}
							>
								{#if isEditing}
									<input
										bind:this={editInputEl}
										class="cell-edit"
										type="text"
										bind:value={editing!.value}
										onblur={commitEdit}
									/>
								{:else}
									<span class="cell-display">{displayOf(r, c)}</span>
								{/if}
							</div>
						{/each}
					</div>
				{/each}
			</div>
		</div>
	</div>

	<!-- Sheet tabs -->
	<div class="sheet-tabs">
		<button class="tab-add" title="Add sheet" onclick={addSheet}>+</button>
		{#each workbook.sheets as s, i}
			<div
				class="sheet-tab"
				class:active={i === workbook.activeSheet}
				onclick={() => switchSheet(i)}
				ondblclick={() => startRenameSheet(i)}
				oncontextmenu={(e) => { e.preventDefault(); if (workbook.sheets.length > 1) deleteSheet(i); }}
			>
				{#if renamingSheet === i}
					<input
						class="rename-input"
						bind:value={renamingSheetValue}
						onblur={commitRenameSheet}
						onkeydown={(e) => { if (e.key === 'Enter') commitRenameSheet(); if (e.key === 'Escape') { renamingSheet = null; } }}
						autofocus
					/>
				{:else}
					{s.name}
				{/if}
			</div>
		{/each}
		<div class="status-spacer"></div>
		<div class="status">
			{#if selectionRect.r0 !== selectionRect.r1 || selectionRect.c0 !== selectionRect.c1}
				{@const refs = []}
				{@const cnt = (selectionRect.r1 - selectionRect.r0 + 1) * (selectionRect.c1 - selectionRect.c0 + 1)}
				{cnt} cells selected
			{/if}
		</div>
	</div>
</div>

<style>
	.excel-app {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
		background: #f3f3f3;
		color: #1a1a1a;
		font-family: 'Segoe UI', sans-serif;
		font-size: 12px;
		outline: none;
		position: relative;
	}

	/* Title bar */
	.title-bar {
		display: flex;
		align-items: center;
		gap: 12px;
		height: 30px;
		background: #217346;
		color: #fff;
		padding: 0 8px;
		flex-shrink: 0;
		position: relative;
	}
	.file-btn {
		background: transparent;
		border: none;
		color: #fff;
		font-size: 12px;
		padding: 4px 12px;
		cursor: pointer;
		border-radius: 3px;
	}
	.file-btn:hover, .file-btn.active {
		background: #1a5a37;
	}
	.doc-title {
		flex: 1;
		text-align: center;
		font-size: 12px;
		opacity: 0.95;
	}

	/* Ribbon */
	.ribbon {
		display: flex;
		align-items: stretch;
		gap: 4px;
		background: #fff;
		border-bottom: 1px solid #e0e0e0;
		padding: 4px 8px;
		flex-shrink: 0;
		min-height: 64px;
		position: relative;
	}
	.ribbon-group {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		justify-content: space-between;
		padding: 2px 6px;
	}
	.ribbon-row {
		display: flex;
		align-items: center;
		gap: 2px;
		flex: 1;
	}
	.group-label {
		font-size: 10px;
		text-align: center;
		color: #666;
		padding-top: 2px;
		margin-top: 2px;
		border-top: 1px solid #eee;
	}
	.ribbon-sep {
		width: 1px;
		background: #e0e0e0;
		margin: 4px 2px;
	}
	.rb-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 26px;
		height: 24px;
		padding: 0 6px;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 3px;
		cursor: pointer;
		font-size: 12px;
		color: #333;
		gap: 4px;
		flex-direction: row;
	}
	.rb-btn:hover {
		background: #e8e8e8;
		border-color: #d0d0d0;
	}
	.rb-btn.on {
		background: #d4e7d4;
		border-color: #98c598;
	}
	.rb-btn.lg {
		flex-direction: column;
		height: 48px;
		min-width: 40px;
		font-size: 10px;
		padding: 2px 4px;
	}
	.rb-btn.lg .ic {
		font-size: 18px;
	}
	.rb-btn.lg .lbl-sm {
		font-size: 10px;
	}
	.color-btn {
		position: relative;
		overflow: hidden;
	}
	.color-btn input[type="color"] {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		cursor: pointer;
	}
	.border-group {
		position: relative;
	}
	.fmt-select {
		height: 24px;
		min-width: 90px;
		font-size: 12px;
		border: 1px solid #ccc;
		border-radius: 3px;
		background: #fff;
	}

	/* Dropdowns */
	.menu-dropdown {
		position: absolute;
		top: 100%;
		left: 0;
		background: #fff;
		border: 1px solid #d0d0d0;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		min-width: 180px;
		padding: 4px 0;
		z-index: 1000;
		border-radius: 3px;
	}
	.file-menu {
		top: 30px;
		left: 0;
	}
	.border-menu {
		top: calc(100% + 2px);
		left: 0;
	}
	.dropdown-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 6px 14px;
		background: transparent;
		border: none;
		text-align: left;
		font-size: 12px;
		cursor: pointer;
		color: #222;
	}
	.dropdown-item:hover {
		background: #f0f0f0;
	}
	.dropdown-separator {
		height: 1px;
		background: #e0e0e0;
		margin: 4px 0;
	}
	.shortcut {
		color: #888;
		font-size: 11px;
		margin-left: 16px;
	}

	/* Formula bar */
	.formula-bar {
		display: flex;
		align-items: center;
		gap: 4px;
		background: #fff;
		border-bottom: 1px solid #d0d0d0;
		padding: 2px 4px;
		flex-shrink: 0;
	}
	.name-box {
		min-width: 80px;
		height: 22px;
		padding: 0 6px;
		display: flex;
		align-items: center;
		border: 1px solid #d0d0d0;
		border-radius: 2px;
		font-size: 12px;
		background: #fff;
	}
	.fx-label {
		padding: 0 6px;
		font-style: italic;
		color: #666;
		border-left: 1px solid #e0e0e0;
		border-right: 1px solid #e0e0e0;
		font-size: 12px;
	}
	.fx-input {
		flex: 1;
		height: 22px;
		border: 1px solid transparent;
		padding: 0 6px;
		font-size: 12px;
		background: transparent;
		outline: none;
	}
	.fx-input:focus {
		border-color: #217346;
		background: #fff;
	}

	/* Find panel */
	.find-panel {
		position: absolute;
		top: 130px;
		right: 16px;
		background: #fff;
		border: 1px solid #ccc;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
		padding: 8px;
		z-index: 1000;
		border-radius: 4px;
		min-width: 340px;
	}
	.find-row {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-bottom: 4px;
	}
	.find-row:last-child { margin-bottom: 0; }
	.find-row label {
		min-width: 60px;
		font-size: 12px;
	}
	.find-row input {
		flex: 1;
		height: 22px;
		border: 1px solid #ccc;
		border-radius: 2px;
		padding: 0 4px;
		font-size: 12px;
	}
	.find-row button {
		height: 22px;
		padding: 0 8px;
		background: #f5f5f5;
		border: 1px solid #ccc;
		border-radius: 2px;
		cursor: pointer;
		font-size: 11px;
	}
	.find-row button:hover {
		background: #e8e8e8;
	}
	.find-count {
		font-size: 11px;
		color: #666;
		min-width: 40px;
		text-align: center;
	}

	/* Grid */
	.grid-scroll {
		flex: 1;
		overflow: auto;
		background: #fff;
		position: relative;
	}
	.grid {
		position: relative;
	}
	.corner-cell {
		position: sticky;
		top: 0;
		left: 0;
		z-index: 3;
		background: #f3f3f3;
		border-right: 1px solid #d0d0d0;
		border-bottom: 1px solid #d0d0d0;
	}
	.col-headers {
		position: sticky;
		top: 0;
		z-index: 2;
		background: #f3f3f3;
	}
	.col-header {
		position: absolute;
		top: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 11px;
		color: #444;
		border-right: 1px solid #d0d0d0;
		border-bottom: 1px solid #d0d0d0;
		background: #f3f3f3;
		cursor: pointer;
		user-select: none;
	}
	.col-header.selected {
		background: #c5e0c5;
		color: #1a5a37;
		font-weight: 600;
	}
	.col-resizer {
		position: absolute;
		right: -2px;
		top: 0;
		width: 5px;
		height: 100%;
		cursor: col-resize;
		z-index: 4;
	}
	.row-headers {
		position: sticky;
		left: 0;
		z-index: 2;
		background: #f3f3f3;
	}
	.row-header {
		position: absolute;
		left: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 11px;
		color: #444;
		border-right: 1px solid #d0d0d0;
		border-bottom: 1px solid #d0d0d0;
		background: #f3f3f3;
		cursor: pointer;
		user-select: none;
	}
	.row-header.selected {
		background: #c5e0c5;
		color: #1a5a37;
		font-weight: 600;
	}
	.row-resizer {
		position: absolute;
		left: 0;
		bottom: -2px;
		height: 5px;
		width: 100%;
		cursor: row-resize;
		z-index: 4;
	}
	.cells {
		position: absolute;
	}
	.row {
		position: absolute;
		left: 0;
		display: block;
	}
	.cell {
		position: absolute;
		top: 0;
		display: flex;
		align-items: center;
		padding: 0 4px;
		border-right: 1px solid #e0e0e0;
		border-bottom: 1px solid #e0e0e0;
		font-size: 12px;
		overflow: hidden;
		white-space: nowrap;
		background: #fff;
		cursor: cell;
		user-select: none;
		box-sizing: border-box;
	}
	.cell-display {
		display: inline-block;
		width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		text-align: inherit;
	}
	.cell.in-sel {
		background: rgba(33, 115, 70, 0.15);
	}
	.cell.anchor {
		outline: 2px solid #217346;
		outline-offset: -2px;
		z-index: 5;
	}
	.cell.find-hit {
		box-shadow: inset 0 0 0 2px #ffb800;
	}
	.cell-edit {
		width: 100%;
		height: 100%;
		border: none;
		outline: none;
		padding: 0;
		margin: 0;
		font: inherit;
		background: #fff;
		color: inherit;
	}

	/* Sheet tabs */
	.sheet-tabs {
		display: flex;
		align-items: center;
		gap: 2px;
		height: 28px;
		background: #f3f3f3;
		border-top: 1px solid #d0d0d0;
		padding: 0 4px;
		flex-shrink: 0;
	}
	.tab-add {
		width: 24px;
		height: 22px;
		border: none;
		background: transparent;
		cursor: pointer;
		font-size: 16px;
		color: #555;
		border-radius: 3px;
	}
	.tab-add:hover {
		background: #e0e0e0;
	}
	.sheet-tab {
		display: flex;
		align-items: center;
		padding: 4px 12px;
		height: 22px;
		background: #e8e8e8;
		border: 1px solid #d0d0d0;
		border-radius: 3px 3px 0 0;
		font-size: 12px;
		cursor: pointer;
		user-select: none;
	}
	.sheet-tab.active {
		background: #fff;
		border-bottom-color: #fff;
		font-weight: 600;
		color: #217346;
	}
	.sheet-tab:hover:not(.active) {
		background: #efefef;
	}
	.rename-input {
		width: 80px;
		height: 18px;
		border: 1px solid #217346;
		font-size: 12px;
		padding: 0 2px;
	}
	.status-spacer { flex: 1; }
	.status {
		font-size: 11px;
		color: #666;
		padding: 0 8px;
	}
</style>

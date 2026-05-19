<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { copyText, pasteText } from '../../state/clipboard.svelte';
	import { wm } from '../../state/windows.svelte';

	// ───────────────────────────────────────────────────────────────
	// Types & persistence keys
	// ───────────────────────────────────────────────────────────────

	type Mode = 'standard' | 'scientific' | 'programmer' | 'converter';
	type ConverterKind =
		| 'currency'
		| 'length'
		| 'weight'
		| 'temperature'
		| 'volume'
		| 'time';
	type ProgBase = 'HEX' | 'DEC' | 'OCT' | 'BIN';
	type BitWidth = 'BYTE' | 'WORD' | 'DWORD' | 'QWORD';
	type AngleUnit = 'DEG' | 'RAD' | 'GRAD';

	interface HistoryEntry {
		expr: string;
		result: string;
	}

	interface MemoryEntry {
		id: number;
		value: number;
	}

	const HISTORY_KEY = 'windows-web:calc:history';
	const MEMORY_KEY = 'windows-web:calc:memory';
	const HISTORY_CAP = 100;

	// ───────────────────────────────────────────────────────────────
	// Formatting helpers (pure)
	// ───────────────────────────────────────────────────────────────

	/** Format a number for display: comma group ints, trim trailing zeros, scientific past 12 sig digits. */
	function formatNumber(value: number): string {
		if (!isFinite(value) || isNaN(value)) return 'Error';
		if (value === 0) return '0';
		const abs = Math.abs(value);
		// Very small/large → scientific
		if (abs >= 1e12 || (abs < 1e-6 && abs !== 0)) {
			return value.toExponential(6).replace(/\.?0+e/, 'e');
		}
		// Use precision then trim
		const precise = parseFloat(value.toPrecision(12));
		const str = String(precise);
		if (str.includes('e') || str.includes('E')) {
			return precise.toExponential(6).replace(/\.?0+e/, 'e');
		}
		const isNeg = str.startsWith('-');
		const abs2 = isNeg ? str.slice(1) : str;
		if (abs2.includes('.')) {
			const [intPart, decPart] = abs2.split('.');
			const formatted = Number(intPart).toLocaleString('en-US');
			return (isNeg ? '-' : '') + formatted + '.' + decPart;
		}
		const formatted = Number(abs2).toLocaleString('en-US');
		return isNeg ? '-' + formatted : formatted;
	}

	/** Format a "live entry" string (user is typing) — keeps commas on integer part. */
	function formatLiveEntry(raw: string): string {
		if (raw === '' || raw === '-') return raw || '0';
		if (raw === 'Error' || raw === 'Cannot divide by zero' || raw === 'Invalid input' || raw === 'Overflow') return raw;
		const isNeg = raw.startsWith('-');
		const abs = isNeg ? raw.slice(1) : raw;
		if (abs.includes('.')) {
			const [intPart, decPart] = abs.split('.');
			const formatted = intPart === '' ? '0' : Number(intPart).toLocaleString('en-US');
			return (isNeg ? '-' : '') + formatted + '.' + decPart;
		}
		const formatted = Number(abs).toLocaleString('en-US');
		return isNeg ? '-' + formatted : formatted;
	}

	// ───────────────────────────────────────────────────────────────
	// Standard mode state (immediate execution)
	// ───────────────────────────────────────────────────────────────

	let displayValue = $state('0');
	let firstOperand = $state<number | null>(null);
	let pendingOp = $state<string | null>(null);
	let waitingForSecond = $state(false);
	let activeOperator = $state<string | null>(null);
	let stdExpression = $state(''); // shown above display

	let displayFontSize = $derived.by(() => {
		const len = displayValue.length;
		if (len <= 9) return '40px';
		if (len <= 13) return '32px';
		if (len <= 17) return '24px';
		return '20px';
	});

	let formattedDisplay = $derived(formatLiveEntry(displayValue));

	function isErrorDisplay(v: string): boolean {
		return v === 'Error' || v === 'Cannot divide by zero' || v === 'Invalid input' || v === 'Overflow';
	}

	function calcBinary(op: string, a: number, b: number): number {
		switch (op) {
			case '+': return a + b;
			case '-': return a - b;
			case '*': return a * b;
			case '/': return b === 0 ? NaN : a / b;
			default: return b;
		}
	}

	function inputDigit(digit: string) {
		if (isErrorDisplay(displayValue)) {
			displayValue = digit;
			stdExpression = '';
			firstOperand = null;
			pendingOp = null;
			activeOperator = null;
			waitingForSecond = false;
			return;
		}
		if (waitingForSecond) {
			displayValue = digit;
			waitingForSecond = false;
			activeOperator = pendingOp;
			return;
		}
		const raw = displayValue.replace(/,/g, '');
		if (raw === '0' && digit !== '0') {
			displayValue = digit;
		} else if (raw === '0' && digit === '0') {
			// noop
		} else if (raw.replace('.', '').replace('-', '').length >= 16) {
			// max digits
		} else {
			displayValue = raw + digit;
		}
	}

	function inputDecimal() {
		if (isErrorDisplay(displayValue)) {
			displayValue = '0.';
			return;
		}
		if (waitingForSecond) {
			displayValue = '0.';
			waitingForSecond = false;
			activeOperator = pendingOp;
			return;
		}
		const raw = displayValue.replace(/,/g, '');
		if (!raw.includes('.')) displayValue = raw + '.';
	}

	function opSymbol(op: string): string {
		return op === '*' ? '×' : op === '/' ? '÷' : op;
	}

	function stdHandleOperator(nextOp: string) {
		if (isErrorDisplay(displayValue)) {
			clearAll();
			return;
		}
		const current = parseFloat(displayValue.replace(/,/g, ''));
		if (firstOperand === null) {
			firstOperand = current;
			stdExpression = `${formatNumber(current)} ${opSymbol(nextOp)}`;
		} else if (pendingOp && !waitingForSecond) {
			const result = calcBinary(pendingOp, firstOperand, current);
			if (!isFinite(result) || isNaN(result)) {
				displayValue = pendingOp === '/' && current === 0 ? 'Cannot divide by zero' : 'Error';
				stdExpression = '';
				pendingOp = null;
				activeOperator = null;
				firstOperand = null;
				return;
			}
			firstOperand = result;
			displayValue = formatNumber(result);
			stdExpression = `${formatNumber(result)} ${opSymbol(nextOp)}`;
		} else if (waitingForSecond) {
			// User changed their mind on the operator
			stdExpression = `${formatNumber(firstOperand)} ${opSymbol(nextOp)}`;
		}
		pendingOp = nextOp;
		activeOperator = nextOp;
		waitingForSecond = true;
	}

	function stdHandleEquals() {
		if (isErrorDisplay(displayValue)) {
			clearAll();
			return;
		}
		if (pendingOp === null || firstOperand === null) {
			activeOperator = null;
			return;
		}
		const current = parseFloat(displayValue.replace(/,/g, ''));
		const result = calcBinary(pendingOp, firstOperand, current);
		const isDivZero = pendingOp === '/' && current === 0;
		const formatted = isDivZero ? 'Cannot divide by zero' : formatNumber(result);
		const fullExpr = `${formatNumber(firstOperand)} ${opSymbol(pendingOp)} ${formatNumber(current)} =`;
		if (!isDivZero && isFinite(result) && !isNaN(result)) {
			pushHistory({ expr: fullExpr, result: formatted });
		}
		displayValue = formatted;
		stdExpression = '';
		firstOperand = null;
		pendingOp = null;
		activeOperator = null;
		waitingForSecond = false;
	}

	function clearAll() {
		displayValue = '0';
		firstOperand = null;
		pendingOp = null;
		waitingForSecond = false;
		activeOperator = null;
		stdExpression = '';
		sciExpression = '';
	}

	function clearEntry() {
		displayValue = '0';
	}

	function handleClearButton() {
		clearEntry();
	}

	function toggleSign() {
		if (isErrorDisplay(displayValue)) return;
		const raw = displayValue.replace(/,/g, '');
		if (raw === '0') return;
		displayValue = raw.startsWith('-') ? raw.slice(1) : '-' + raw;
	}

	function handlePercent() {
		if (isErrorDisplay(displayValue)) return;
		const current = parseFloat(displayValue.replace(/,/g, ''));
		if (firstOperand !== null && pendingOp) {
			displayValue = formatNumber(firstOperand * (current / 100));
		} else {
			displayValue = formatNumber(current / 100);
		}
	}

	function handleReciprocal() {
		if (isErrorDisplay(displayValue)) return;
		const v = parseFloat(displayValue.replace(/,/g, ''));
		if (v === 0) {
			displayValue = 'Cannot divide by zero';
			return;
		}
		displayValue = formatNumber(1 / v);
	}

	function handleSquare() {
		if (isErrorDisplay(displayValue)) return;
		const v = parseFloat(displayValue.replace(/,/g, ''));
		displayValue = formatNumber(v * v);
	}

	function handleSqrt() {
		if (isErrorDisplay(displayValue)) return;
		const v = parseFloat(displayValue.replace(/,/g, ''));
		if (v < 0) {
			displayValue = 'Invalid input';
			return;
		}
		displayValue = formatNumber(Math.sqrt(v));
	}

	function backspace() {
		if (isErrorDisplay(displayValue)) {
			displayValue = '0';
			return;
		}
		if (waitingForSecond) return;
		const raw = displayValue.replace(/,/g, '');
		if (raw.length <= 1 || (raw.length === 2 && raw.startsWith('-'))) {
			displayValue = '0';
		} else {
			displayValue = raw.slice(0, -1);
		}
	}

	// ───────────────────────────────────────────────────────────────
	// Memory (persisted)
	// ───────────────────────────────────────────────────────────────

	let memoryEntries = $state<MemoryEntry[]>([]);
	let nextMemoryId = $state(1);

	function memValue(): number {
		const raw = displayValue.replace(/,/g, '');
		const v = parseFloat(raw);
		return isFinite(v) ? v : 0;
	}

	function memClear() {
		memoryEntries = [];
		saveMemory();
	}
	function memRecall() {
		if (memoryEntries.length === 0) return;
		displayValue = formatNumber(memoryEntries[0].value);
		waitingForSecond = false;
	}
	function memStore() {
		const v = memValue();
		memoryEntries = [{ id: nextMemoryId++, value: v }, ...memoryEntries];
		saveMemory();
	}
	function memAdd() {
		const v = memValue();
		if (memoryEntries.length === 0) {
			memoryEntries = [{ id: nextMemoryId++, value: v }];
		} else {
			memoryEntries = memoryEntries.map((e, i) => i === 0 ? { ...e, value: e.value + v } : e);
		}
		saveMemory();
	}
	function memSubtract() {
		const v = memValue();
		if (memoryEntries.length === 0) {
			memoryEntries = [{ id: nextMemoryId++, value: -v }];
		} else {
			memoryEntries = memoryEntries.map((e, i) => i === 0 ? { ...e, value: e.value - v } : e);
		}
		saveMemory();
	}
	function memEntryRecall(id: number) {
		const entry = memoryEntries.find((e) => e.id === id);
		if (!entry) return;
		displayValue = formatNumber(entry.value);
		waitingForSecond = false;
	}
	function memEntryAdd(id: number) {
		const v = memValue();
		memoryEntries = memoryEntries.map((e) => e.id === id ? { ...e, value: e.value + v } : e);
		saveMemory();
	}
	function memEntrySubtract(id: number) {
		const v = memValue();
		memoryEntries = memoryEntries.map((e) => e.id === id ? { ...e, value: e.value - v } : e);
		saveMemory();
	}
	function memEntryClear(id: number) {
		memoryEntries = memoryEntries.filter((e) => e.id !== id);
		saveMemory();
	}

	function saveMemory() {
		try {
			localStorage.setItem(MEMORY_KEY, JSON.stringify(memoryEntries));
		} catch {
			// ignore
		}
	}

	function loadMemory() {
		try {
			const raw = localStorage.getItem(MEMORY_KEY);
			if (!raw) return;
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) {
				memoryEntries = parsed.filter(
					(e: unknown) =>
						typeof e === 'object' && e !== null &&
						typeof (e as MemoryEntry).id === 'number' &&
						typeof (e as MemoryEntry).value === 'number'
				) as MemoryEntry[];
				nextMemoryId = memoryEntries.reduce((m, e) => Math.max(m, e.id), 0) + 1;
			}
		} catch {
			// ignore
		}
	}

	// ───────────────────────────────────────────────────────────────
	// History (persisted)
	// ───────────────────────────────────────────────────────────────

	let history = $state<HistoryEntry[]>([]);

	function pushHistory(entry: HistoryEntry) {
		const next = [...history, entry];
		history = next.length > HISTORY_CAP ? next.slice(next.length - HISTORY_CAP) : next;
		saveHistory();
	}

	function saveHistory() {
		try {
			localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
		} catch {
			// ignore
		}
	}

	function loadHistory() {
		try {
			const raw = localStorage.getItem(HISTORY_KEY);
			if (!raw) return;
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) {
				history = parsed.filter(
					(e: unknown) =>
						typeof e === 'object' && e !== null &&
						typeof (e as HistoryEntry).expr === 'string' &&
						typeof (e as HistoryEntry).result === 'string'
				) as HistoryEntry[];
			}
		} catch {
			// ignore
		}
	}

	function clearHistory() {
		history = [];
		saveHistory();
	}

	function recallHistory(entry: HistoryEntry) {
		// Re-load the result into the display
		const cleaned = entry.result.replace(/,/g, '');
		const num = parseFloat(cleaned);
		if (!isNaN(num)) {
			displayValue = formatNumber(num);
			waitingForSecond = false;
			firstOperand = null;
			pendingOp = null;
			activeOperator = null;
			stdExpression = '';
		}
	}

	// ───────────────────────────────────────────────────────────────
	// Mode switching / nav
	// ───────────────────────────────────────────────────────────────

	let mode = $state<Mode>('standard');
	let showNav = $state(false);
	let sidePanel = $state<'history' | 'memory' | null>('history');

	const modeTitles: Record<Mode, string> = {
		standard: 'Standard',
		scientific: 'Scientific',
		programmer: 'Programmer',
		converter: 'Converter',
	};

	function selectMode(m: Mode) {
		mode = m;
		showNav = false;
		clearAll();
	}

	// ───────────────────────────────────────────────────────────────
	// Scientific mode — shunting-yard expression evaluator
	// ───────────────────────────────────────────────────────────────

	let sciExpression = $state(''); // displayed above the result (live editing)
	let angleUnit = $state<AngleUnit>('DEG');
	let hypMode = $state(false);
	let secondMode = $state(false); // toggles inverse trig (sin↔asin)

	type TokenKind = 'num' | 'op' | 'lparen' | 'rparen' | 'func' | 'const';
	interface Token {
		kind: TokenKind;
		value: string;
	}

	const OP_PRECEDENCE: Record<string, number> = {
		'+': 1, '-': 1, '*': 2, '/': 2, 'mod': 2, '^': 4,
	};
	const OP_RIGHT_ASSOC: Record<string, boolean> = { '^': true };

	const FUNCTIONS = new Set([
		'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
		'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
		'log', 'ln', 'log2', 'sqrt', 'cbrt', 'exp', 'fact',
		'sq', 'cube', 'neg', 'recip', 'tenpow', 'twopow',
	]);

	const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

	/** Tokenize an infix expression string into tokens. */
	function tokenize(input: string): Token[] {
		const tokens: Token[] = [];
		let i = 0;
		const s = input.replace(/\s+/g, '').toLowerCase();
		while (i < s.length) {
			const c = s[i];
			// Number
			if ((c >= '0' && c <= '9') || c === '.') {
				let j = i;
				let sawDot = false;
				while (j < s.length && ((s[j] >= '0' && s[j] <= '9') || (s[j] === '.' && !sawDot))) {
					if (s[j] === '.') sawDot = true;
					j++;
				}
				// scientific: 1e5 / 1e-5
				if (j < s.length && (s[j] === 'e' || s[j] === 'E')) {
					j++;
					if (j < s.length && (s[j] === '+' || s[j] === '-')) j++;
					while (j < s.length && s[j] >= '0' && s[j] <= '9') j++;
				}
				tokens.push({ kind: 'num', value: s.slice(i, j) });
				i = j;
				continue;
			}
			if (c === '(') { tokens.push({ kind: 'lparen', value: '(' }); i++; continue; }
			if (c === ')') { tokens.push({ kind: 'rparen', value: ')' }); i++; continue; }
			if (c === '!') {
				// Postfix factorial — emit as "fact" function via shunting yard trick:
				// We'll handle it specially in toRPN by detecting it.
				tokens.push({ kind: 'op', value: '!' });
				i++;
				continue;
			}
			if (c === '+' || c === '*' || c === '/' || c === '^') {
				tokens.push({ kind: 'op', value: c });
				i++;
				continue;
			}
			if (c === '-') {
				// Unary minus if at start, after op, or after lparen
				const prev = tokens[tokens.length - 1];
				if (!prev || prev.kind === 'op' || prev.kind === 'lparen' || prev.kind === 'func') {
					tokens.push({ kind: 'func', value: 'neg' });
				} else {
					tokens.push({ kind: 'op', value: '-' });
				}
				i++;
				continue;
			}
			// Identifier (function or constant or "mod")
			if ((c >= 'a' && c <= 'z')) {
				let j = i;
				while (j < s.length && ((s[j] >= 'a' && s[j] <= 'z') || (s[j] >= '0' && s[j] <= '9'))) j++;
				const ident = s.slice(i, j);
				if (ident === 'mod') {
					tokens.push({ kind: 'op', value: 'mod' });
				} else if (FUNCTIONS.has(ident)) {
					tokens.push({ kind: 'func', value: ident });
				} else if (ident in CONSTANTS) {
					tokens.push({ kind: 'const', value: ident });
				} else {
					throw new Error(`Unknown identifier: ${ident}`);
				}
				i = j;
				continue;
			}
			// Unicode operators we sometimes inject
			if (c === '×') { tokens.push({ kind: 'op', value: '*' }); i++; continue; }
			if (c === '÷') { tokens.push({ kind: 'op', value: '/' }); i++; continue; }
			if (c === '−') { tokens.push({ kind: 'op', value: '-' }); i++; continue; }
			if (c === 'π') { tokens.push({ kind: 'const', value: 'pi' }); i++; continue; }
			throw new Error(`Unexpected character: ${c}`);
		}
		return tokens;
	}

	/** Convert infix tokens to RPN via shunting-yard. */
	function toRPN(tokens: Token[]): Token[] {
		const out: Token[] = [];
		const stack: Token[] = [];
		for (const tok of tokens) {
			if (tok.kind === 'num' || tok.kind === 'const') {
				out.push(tok);
			} else if (tok.kind === 'func') {
				stack.push(tok);
			} else if (tok.kind === 'op' && tok.value === '!') {
				// Postfix factorial — immediately push onto output as a function call.
				out.push({ kind: 'func', value: 'fact' });
			} else if (tok.kind === 'op') {
				while (stack.length) {
					const top = stack[stack.length - 1];
					if (top.kind === 'func') {
						out.push(stack.pop()!);
					} else if (top.kind === 'op') {
						const o1p = OP_PRECEDENCE[tok.value] ?? 0;
						const o2p = OP_PRECEDENCE[top.value] ?? 0;
						const rightAssoc = OP_RIGHT_ASSOC[tok.value];
						if (o2p > o1p || (o2p === o1p && !rightAssoc)) {
							out.push(stack.pop()!);
						} else {
							break;
						}
					} else {
						break;
					}
				}
				stack.push(tok);
			} else if (tok.kind === 'lparen') {
				stack.push(tok);
			} else if (tok.kind === 'rparen') {
				while (stack.length && stack[stack.length - 1].kind !== 'lparen') {
					out.push(stack.pop()!);
				}
				if (!stack.length) throw new Error('Mismatched parentheses');
				stack.pop(); // pop lparen
				if (stack.length && stack[stack.length - 1].kind === 'func') {
					out.push(stack.pop()!);
				}
			}
		}
		while (stack.length) {
			const top = stack.pop()!;
			if (top.kind === 'lparen' || top.kind === 'rparen') throw new Error('Mismatched parentheses');
			out.push(top);
		}
		return out;
	}

	function toRad(v: number): number {
		if (angleUnit === 'DEG') return v * Math.PI / 180;
		if (angleUnit === 'GRAD') return v * Math.PI / 200;
		return v;
	}
	function fromRad(v: number): number {
		if (angleUnit === 'DEG') return v * 180 / Math.PI;
		if (angleUnit === 'GRAD') return v * 200 / Math.PI;
		return v;
	}

	function factorial(n: number): number {
		if (n < 0 || !Number.isFinite(n) || Math.floor(n) !== n) return NaN;
		if (n > 170) return Infinity;
		let r = 1;
		for (let i = 2; i <= n; i++) r *= i;
		return r;
	}

	/** Evaluate RPN tokens. */
	function evalRPN(rpn: Token[]): number {
		const stack: number[] = [];
		for (const tok of rpn) {
			if (tok.kind === 'num') {
				stack.push(parseFloat(tok.value));
			} else if (tok.kind === 'const') {
				stack.push(CONSTANTS[tok.value]);
			} else if (tok.kind === 'op') {
				const b = stack.pop();
				const a = stack.pop();
				if (a === undefined || b === undefined) throw new Error('Bad expression');
				let r: number;
				switch (tok.value) {
					case '+': r = a + b; break;
					case '-': r = a - b; break;
					case '*': r = a * b; break;
					case '/': if (b === 0) throw new Error('div0'); r = a / b; break;
					case '^': r = Math.pow(a, b); break;
					case 'mod': r = a % b; break;
					default: throw new Error(`Unknown op: ${tok.value}`);
				}
				stack.push(r);
			} else if (tok.kind === 'func') {
				const a = stack.pop();
				if (a === undefined) throw new Error('Bad expression');
				let r: number;
				switch (tok.value) {
					case 'neg': r = -a; break;
					case 'sin': r = Math.sin(toRad(a)); break;
					case 'cos': r = Math.cos(toRad(a)); break;
					case 'tan': r = Math.tan(toRad(a)); break;
					case 'asin': r = fromRad(Math.asin(a)); break;
					case 'acos': r = fromRad(Math.acos(a)); break;
					case 'atan': r = fromRad(Math.atan(a)); break;
					case 'sinh': r = Math.sinh(a); break;
					case 'cosh': r = Math.cosh(a); break;
					case 'tanh': r = Math.tanh(a); break;
					case 'asinh': r = Math.asinh(a); break;
					case 'acosh': r = Math.acosh(a); break;
					case 'atanh': r = Math.atanh(a); break;
					case 'log': r = Math.log10(a); break;
					case 'ln': r = Math.log(a); break;
					case 'log2': r = Math.log2(a); break;
					case 'sqrt': if (a < 0) throw new Error('invalid'); r = Math.sqrt(a); break;
					case 'cbrt': r = Math.cbrt(a); break;
					case 'exp': r = Math.exp(a); break;
					case 'fact': r = factorial(a); if (!isFinite(r) || isNaN(r)) throw new Error('invalid'); break;
					case 'sq': r = a * a; break;
					case 'cube': r = a * a * a; break;
					case 'recip': if (a === 0) throw new Error('div0'); r = 1 / a; break;
					case 'tenpow': r = Math.pow(10, a); break;
					case 'twopow': r = Math.pow(2, a); break;
					default: throw new Error(`Unknown function: ${tok.value}`);
				}
				stack.push(r);
			}
		}
		if (stack.length !== 1) throw new Error('Bad expression');
		return stack[0];
	}

	function evaluateScientific(expr: string): number {
		const tokens = tokenize(expr);
		const rpn = toRPN(tokens);
		return evalRPN(rpn);
	}

	function sciAppend(s: string) {
		if (isErrorDisplay(displayValue)) {
			sciExpression = '';
			displayValue = '0';
		}
		sciExpression += s;
	}

	function sciAppendDigit(d: string) {
		if (isErrorDisplay(displayValue)) {
			sciExpression = '';
			displayValue = '0';
		}
		sciExpression += d;
	}

	function sciClear() {
		sciExpression = '';
		displayValue = '0';
	}

	function sciBackspace() {
		if (isErrorDisplay(displayValue)) {
			sciExpression = '';
			displayValue = '0';
			return;
		}
		if (sciExpression.length > 0) {
			// Remove possibly a function name
			const fnMatch = sciExpression.match(/(asin|acos|atan|asinh|acosh|atanh|sinh|cosh|tanh|sin|cos|tan|log2|log|ln|sqrt|cbrt|exp|fact|sq|cube|recip|tenpow|twopow|mod|pi)\($/i);
			if (fnMatch) {
				sciExpression = sciExpression.slice(0, -fnMatch[0].length);
			} else {
				sciExpression = sciExpression.slice(0, -1);
			}
		}
	}

	function sciEquals() {
		if (sciExpression.trim() === '') return;
		try {
			const result = evaluateScientific(sciExpression);
			if (!isFinite(result) || isNaN(result)) {
				displayValue = 'Invalid input';
				sciExpression = '';
				return;
			}
			const formatted = formatNumber(result);
			pushHistory({ expr: sciExpression + ' =', result: formatted });
			displayValue = formatted;
			sciExpression = '';
		} catch (err) {
			const msg = (err as Error).message;
			if (msg === 'div0') displayValue = 'Cannot divide by zero';
			else if (msg === 'invalid') displayValue = 'Invalid input';
			else displayValue = 'Invalid input';
			sciExpression = '';
		}
	}

	function sciFunc(fnName: string) {
		sciAppend(fnName + '(');
	}

	function sciConst(name: string, symbol: string) {
		void name;
		sciAppend(symbol);
	}

	function sciOp(opCh: string) {
		sciAppend(opCh);
	}

	function sciSign() {
		// Wrap last number in neg() or strip
		// Simplest: append "neg(" if not currently entering, or wrap last token
		if (sciExpression.endsWith('neg(')) {
			sciExpression = sciExpression.slice(0, -4);
		} else {
			sciExpression = 'neg(' + sciExpression + ')';
		}
	}

	/** Wrap the entire current expression like `10^(expr)`. Used by 10ˣ, 2ˣ. */
	function sciWrapPow(base: string) {
		if (sciExpression.trim() === '') {
			sciExpression = `${base}^`;
		} else {
			sciExpression = `${base}^(${sciExpression})`;
		}
	}

	/** Apply a postfix exponent like ^2 or ^3 to the current expression. */
	function sciWrapPostfixPow(exp: string) {
		if (sciExpression.trim() === '') return;
		sciExpression = `(${sciExpression})^${exp}`;
	}

	// Scientific live preview: try evaluating expression silently
	let sciPreview = $derived.by(() => {
		if (mode !== 'scientific' || !sciExpression.trim()) return '';
		try {
			const result = evaluateScientific(sciExpression);
			if (!isFinite(result) || isNaN(result)) return '';
			return formatNumber(result);
		} catch {
			return '';
		}
	});

	let sciDisplayValue = $derived(sciExpression || displayValue);
	let sciDisplayFontSize = $derived.by(() => {
		const len = sciDisplayValue.length;
		if (len <= 9) return '36px';
		if (len <= 16) return '26px';
		if (len <= 24) return '20px';
		return '16px';
	});

	// ───────────────────────────────────────────────────────────────
	// Programmer mode
	// ───────────────────────────────────────────────────────────────

	let progBase = $state<ProgBase>('DEC');
	let bitWidth = $state<BitWidth>('QWORD');
	// We use BigInt internally so we can handle 64-bit cleanly
	let progValue = $state<bigint>(0n);
	let progPendingOp = $state<string | null>(null);
	let progPrev = $state<bigint | null>(null);
	let progWaiting = $state(false);
	let progExpression = $state('');
	let progEntering = $state(false); // true when user has started typing a new value

	function bitWidthBits(w: BitWidth): number {
		return w === 'BYTE' ? 8 : w === 'WORD' ? 16 : w === 'DWORD' ? 32 : 64;
	}

	function maskBig(v: bigint, w: BitWidth): bigint {
		const bits = bitWidthBits(w);
		const mask = (1n << BigInt(bits)) - 1n;
		return v & mask;
	}

	/** Get signed representation in current bit width for display. */
	function asSigned(v: bigint, w: BitWidth): bigint {
		const bits = bitWidthBits(w);
		const masked = maskBig(v, w);
		const signBit = 1n << BigInt(bits - 1);
		if (masked & signBit) {
			return masked - (1n << BigInt(bits));
		}
		return masked;
	}

	function progDigitOk(d: string): boolean {
		const dl = d.toLowerCase();
		if (progBase === 'BIN') return dl === '0' || dl === '1';
		if (progBase === 'OCT') return dl >= '0' && dl <= '7';
		if (progBase === 'DEC') return dl >= '0' && dl <= '9';
		// HEX
		return (dl >= '0' && dl <= '9') || (dl >= 'a' && dl <= 'f');
	}

	function parseInBase(s: string, base: ProgBase): bigint {
		if (s === '' || s === '-') return 0n;
		try {
			let radix = base === 'HEX' ? 16 : base === 'OCT' ? 8 : base === 'BIN' ? 2 : 10;
			let str = s.toLowerCase();
			let neg = false;
			if (str.startsWith('-')) { neg = true; str = str.slice(1); }
			if (str === '') return 0n;
			// BigInt parsing
			let prefix = '';
			if (radix === 16) prefix = '0x';
			else if (radix === 8) prefix = '0o';
			else if (radix === 2) prefix = '0b';
			const v = BigInt(prefix + str);
			return neg ? -v : v;
		} catch {
			return 0n;
		}
	}

	function formatInBase(v: bigint, base: ProgBase, w: BitWidth): string {
		// Display unsigned bit pattern in non-DEC; in DEC show signed value
		if (base === 'DEC') {
			return asSigned(v, w).toString(10);
		}
		const masked = maskBig(v, w);
		const radix = base === 'HEX' ? 16 : base === 'OCT' ? 8 : 2;
		return masked.toString(radix).toUpperCase();
	}

	function groupBaseStr(s: string, base: ProgBase): string {
		const isNeg = s.startsWith('-');
		const abs = isNeg ? s.slice(1) : s;
		let groupSize = 3;
		let separator = ',';
		if (base === 'HEX') { groupSize = 4; separator = ' '; }
		else if (base === 'OCT') { groupSize = 3; separator = ' '; }
		else if (base === 'BIN') { groupSize = 4; separator = ' '; }
		if (base === 'DEC') {
			// comma group with toLocaleString
			try {
				return (isNeg ? '-' : '') + BigInt(abs).toLocaleString('en-US');
			} catch {
				return s;
			}
		}
		// Reverse, chunk, reverse
		const out: string[] = [];
		for (let i = abs.length; i > 0; i -= groupSize) {
			out.unshift(abs.slice(Math.max(0, i - groupSize), i));
		}
		return (isNeg ? '-' : '') + out.join(separator);
	}

	let progDisplayDec = $derived(groupBaseStr(formatInBase(progValue, 'DEC', bitWidth), 'DEC'));
	let progDisplayHex = $derived(groupBaseStr(formatInBase(progValue, 'HEX', bitWidth), 'HEX'));
	let progDisplayOct = $derived(groupBaseStr(formatInBase(progValue, 'OCT', bitWidth), 'OCT'));
	let progDisplayBin = $derived(groupBaseStr(formatInBase(progValue, 'BIN', bitWidth), 'BIN'));

	let progMainDisplay = $derived.by(() => {
		switch (progBase) {
			case 'HEX': return progDisplayHex;
			case 'DEC': return progDisplayDec;
			case 'OCT': return progDisplayOct;
			case 'BIN': return progDisplayBin;
		}
	});

	function progInputDigit(d: string) {
		if (!progDigitOk(d)) return;
		// Build a string in current base
		const current = formatInBase(progValue, progBase, bitWidth);
		let nextStr: string;
		if (!progEntering || current === '0') {
			nextStr = d.toUpperCase();
		} else {
			nextStr = current + d.toUpperCase();
		}
		const parsed = parseInBase(nextStr, progBase);
		progValue = maskBig(parsed, bitWidth);
		progEntering = true;
	}

	function progClear() {
		progValue = 0n;
		progPendingOp = null;
		progPrev = null;
		progWaiting = false;
		progExpression = '';
		progEntering = false;
	}

	function progBackspace() {
		const current = formatInBase(progValue, progBase, bitWidth);
		const isNeg = current.startsWith('-');
		const abs = isNeg ? current.slice(1) : current;
		if (abs.length <= 1) {
			progValue = 0n;
			progEntering = false;
		} else {
			const next = (isNeg ? '-' : '') + abs.slice(0, -1);
			progValue = maskBig(parseInBase(next, progBase), bitWidth);
		}
	}

	function progApplyPending() {
		if (progPendingOp === null || progPrev === null) return progValue;
		const a = asSigned(progPrev, bitWidth);
		const b = asSigned(progValue, bitWidth);
		let r: bigint;
		switch (progPendingOp) {
			case '+': r = a + b; break;
			case '-': r = a - b; break;
			case '*': r = a * b; break;
			case '/': if (b === 0n) { displayProgOverflow('Cannot divide by zero'); return progValue; } r = a / b; break;
			case 'mod': if (b === 0n) { displayProgOverflow('Cannot divide by zero'); return progValue; } r = a % b; break;
			case 'and': r = a & b; break;
			case 'or': r = a | b; break;
			case 'xor': r = a ^ b; break;
			case 'lsh': r = a << b; break;
			case 'rsh': r = a >> b; break;
			default: r = b;
		}
		return maskBig(r, bitWidth);
	}

	let progError = $state<string | null>(null);

	function displayProgOverflow(msg: string) {
		progError = msg;
	}

	function progOp(op: string) {
		if (progError) progError = null;
		if (progPendingOp !== null && progPrev !== null && progEntering) {
			const r = progApplyPending();
			progValue = r;
			progPrev = r;
		} else {
			progPrev = progValue;
		}
		progPendingOp = op;
		progEntering = false;
		progExpression = `${formatInBase(progPrev ?? 0n, progBase, bitWidth)} ${opName(op)}`;
	}

	function opName(op: string): string {
		switch (op) {
			case '*': return '×';
			case '/': return '÷';
			case 'and': return 'AND';
			case 'or': return 'OR';
			case 'xor': return 'XOR';
			case 'lsh': return 'Lsh';
			case 'rsh': return 'Rsh';
			case 'mod': return 'Mod';
			default: return op;
		}
	}

	function progEquals() {
		if (progPendingOp === null || progPrev === null) return;
		const expr = `${formatInBase(progPrev, progBase, bitWidth)} ${opName(progPendingOp)} ${formatInBase(progValue, progBase, bitWidth)} =`;
		const r = progApplyPending();
		if (progError) {
			pushHistory({ expr, result: progError });
		} else {
			progValue = r;
			pushHistory({ expr, result: formatInBase(r, progBase, bitWidth) });
		}
		progPendingOp = null;
		progPrev = null;
		progExpression = '';
		progEntering = false;
	}

	function progNot() {
		if (progError) progError = null;
		progValue = maskBig(~progValue, bitWidth);
		progEntering = false;
	}

	function progToggleSign() {
		if (progError) progError = null;
		const signed = asSigned(progValue, bitWidth);
		progValue = maskBig(-signed, bitWidth);
	}

	function progFlipBit(bitIdx: number) {
		if (progError) progError = null;
		const bits = bitWidthBits(bitWidth);
		if (bitIdx >= bits) return;
		progValue = maskBig(progValue ^ (1n << BigInt(bitIdx)), bitWidth);
		progEntering = true;
	}

	// Bit-flip grid: 64 bits, MSB first
	let bitArray = $derived.by(() => {
		const bits = bitWidthBits(bitWidth);
		const masked = maskBig(progValue, bitWidth);
		const arr: { idx: number; on: boolean; active: boolean }[] = [];
		for (let i = 63; i >= 0; i--) {
			const active = i < bits;
			const on = active ? ((masked >> BigInt(i)) & 1n) === 1n : false;
			arr.push({ idx: i, on, active });
		}
		return arr;
	});

	// ───────────────────────────────────────────────────────────────
	// Converter mode
	// ───────────────────────────────────────────────────────────────

	let converterKind = $state<ConverterKind>('length');
	let convFromUnit = $state('m');
	let convToUnit = $state('ft');
	let convFromValue = $state('1');
	let convToValue = $state('');

	interface UnitDef {
		label: string;
		/** Conversion factor to canonical (multiply input by this to get canonical). */
		toCanonical: (v: number) => number;
		fromCanonical: (v: number) => number;
	}

	function linearUnit(label: string, factor: number): UnitDef {
		return {
			label,
			toCanonical: (v) => v * factor,
			fromCanonical: (v) => v / factor,
		};
	}

	const UNITS: Record<ConverterKind, Record<string, UnitDef>> = {
		// Canonical: meters
		length: {
			m: linearUnit('Meters', 1),
			cm: linearUnit('Centimeters', 0.01),
			mm: linearUnit('Millimeters', 0.001),
			km: linearUnit('Kilometers', 1000),
			in: linearUnit('Inches', 0.0254),
			ft: linearUnit('Feet', 0.3048),
			yd: linearUnit('Yards', 0.9144),
			mile: linearUnit('Miles', 1609.344),
		},
		// Canonical: grams
		weight: {
			g: linearUnit('Grams', 1),
			kg: linearUnit('Kilograms', 1000),
			lb: linearUnit('Pounds', 453.59237),
			oz: linearUnit('Ounces', 28.349523125),
			ton: linearUnit('Metric tons', 1_000_000),
		},
		// Canonical: Celsius
		temperature: {
			C: { label: 'Celsius', toCanonical: (v) => v, fromCanonical: (v) => v },
			F: { label: 'Fahrenheit', toCanonical: (v) => (v - 32) * 5 / 9, fromCanonical: (v) => v * 9 / 5 + 32 },
			K: { label: 'Kelvin', toCanonical: (v) => v - 273.15, fromCanonical: (v) => v + 273.15 },
		},
		// Canonical: milliliters
		volume: {
			ml: linearUnit('Milliliters', 1),
			L: linearUnit('Liters', 1000),
			gal: linearUnit('US gallons', 3785.411784),
			qt: linearUnit('US quarts', 946.352946),
			pt: linearUnit('US pints', 473.176473),
			cup: linearUnit('US cups', 236.5882365),
			'fl oz': linearUnit('US fluid ounces', 29.5735295625),
		},
		// Canonical: seconds
		time: {
			sec: linearUnit('Seconds', 1),
			min: linearUnit('Minutes', 60),
			hr: linearUnit('Hours', 3600),
			day: linearUnit('Days', 86400),
			week: linearUnit('Weeks', 604800),
		},
		// Canonical: USD (static rates)
		currency: {
			USD: linearUnit('US Dollar', 1),
			EUR: linearUnit('Euro', 1 / 0.92),
			GBP: linearUnit('British Pound', 1 / 0.79),
			JPY: linearUnit('Japanese Yen', 1 / 149),
			CNY: linearUnit('Chinese Yuan', 1 / 7.24),
			INR: linearUnit('Indian Rupee', 1 / 83.4),
			CAD: linearUnit('Canadian Dollar', 1 / 1.36),
			AUD: linearUnit('Australian Dollar', 1 / 1.52),
		},
	};

	const CONVERTER_LABELS: Record<ConverterKind, string> = {
		length: 'Length',
		weight: 'Weight',
		temperature: 'Temperature',
		volume: 'Volume',
		time: 'Time',
		currency: 'Currency',
	};

	function convert(value: number, kind: ConverterKind, from: string, to: string): number {
		const units = UNITS[kind];
		const fromU = units[from];
		const toU = units[to];
		if (!fromU || !toU) return value;
		const canon = fromU.toCanonical(value);
		return toU.fromCanonical(canon);
	}

	function formatConvOutput(n: number): string {
		if (!isFinite(n) || isNaN(n)) return '';
		// Use up to 8 significant digits, trim trailing zeros
		const abs = Math.abs(n);
		let str: string;
		if (abs !== 0 && (abs >= 1e10 || abs < 1e-4)) {
			str = n.toExponential(6).replace(/\.?0+e/, 'e');
		} else {
			str = String(parseFloat(n.toPrecision(10)));
		}
		return str;
	}

	function selectConverterKind(k: ConverterKind) {
		converterKind = k;
		// Reset units to first two in this kind
		const keys = Object.keys(UNITS[k]);
		convFromUnit = keys[0];
		convToUnit = keys[1] ?? keys[0];
		convFromValue = '1';
		const n = parseFloat(convFromValue);
		convToValue = formatConvOutput(convert(n, converterKind, convFromUnit, convToUnit));
	}

	function recalcConv(direction: 'from' | 'to') {
		if (direction === 'from') {
			const n = parseFloat(convFromValue);
			if (isNaN(n)) {
				convToValue = '';
				return;
			}
			convToValue = formatConvOutput(convert(n, converterKind, convFromUnit, convToUnit));
		} else {
			const n = parseFloat(convToValue);
			if (isNaN(n)) {
				convFromValue = '';
				return;
			}
			convFromValue = formatConvOutput(convert(n, converterKind, convToUnit, convFromUnit));
		}
	}

	function onConvFromInput(e: Event) {
		const target = e.target as HTMLInputElement;
		convFromValue = target.value;
		recalcConv('from');
	}
	function onConvToInput(e: Event) {
		const target = e.target as HTMLInputElement;
		convToValue = target.value;
		recalcConv('to');
	}
	function onConvFromUnitChange(e: Event) {
		const target = e.target as HTMLSelectElement;
		convFromUnit = target.value;
		recalcConv('from');
	}
	function onConvToUnitChange(e: Event) {
		const target = e.target as HTMLSelectElement;
		convToUnit = target.value;
		recalcConv('from');
	}

	// ───────────────────────────────────────────────────────────────
	// Copy / paste
	// ───────────────────────────────────────────────────────────────

	function handleCopy() {
		let text = '';
		if (mode === 'programmer') {
			text = formatInBase(progValue, progBase, bitWidth);
		} else if (mode === 'scientific') {
			text = displayValue.replace(/,/g, '');
		} else {
			text = displayValue.replace(/,/g, '');
		}
		copyText(text);
	}

	function handlePaste() {
		const text = pasteText();
		if (text === null) return;
		const cleaned = text.trim().replace(/,/g, '');
		if (cleaned === '' || isNaN(Number(cleaned))) return;
		if (mode === 'programmer') {
			try {
				const n = BigInt(Math.trunc(Number(cleaned)));
				progValue = maskBig(n, bitWidth);
				progEntering = true;
			} catch {
				// ignore
			}
			return;
		}
		const num = parseFloat(cleaned);
		displayValue = formatNumber(num);
		waitingForSecond = false;
	}

	// ───────────────────────────────────────────────────────────────
	// Keyboard handling (global)
	// ───────────────────────────────────────────────────────────────

	function handleGlobalKeydown(e: KeyboardEvent) {
		if (wm.activeApp !== 'calculator') return;
		// Don't intercept when the user is in a text input/textarea/contenteditable
		const ae = document.activeElement as HTMLElement | null;
		if (ae) {
			const tag = ae.tagName;
			if (tag === 'INPUT' || tag === 'TEXTAREA' || ae.isContentEditable) {
				// Allow if it's our own calc input that we want to handle? — converter inputs handle their own.
				return;
			}
		}

		// Copy/paste
		if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
			e.preventDefault();
			handleCopy();
			return;
		}
		if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
			e.preventDefault();
			handlePaste();
			return;
		}

		if (mode === 'converter') {
			// Converter has its own inputs
			return;
		}

		if (mode === 'programmer') {
			handleProgKey(e);
			return;
		}

		if (mode === 'scientific') {
			handleSciKey(e);
			return;
		}

		// Standard mode
		if (e.key >= '0' && e.key <= '9') { e.preventDefault(); inputDigit(e.key); }
		else if (e.key === '.') { e.preventDefault(); inputDecimal(); }
		else if (e.key === '+') { e.preventDefault(); stdHandleOperator('+'); }
		else if (e.key === '-') { e.preventDefault(); stdHandleOperator('-'); }
		else if (e.key === '*') { e.preventDefault(); stdHandleOperator('*'); }
		else if (e.key === '/') { e.preventDefault(); stdHandleOperator('/'); }
		else if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); stdHandleEquals(); }
		else if (e.key === 'Escape') { e.preventDefault(); clearAll(); }
		else if (e.key === 'Backspace') { e.preventDefault(); backspace(); }
		else if (e.key === '%') { e.preventDefault(); handlePercent(); }
		else if (e.key === 'Delete') { e.preventDefault(); clearEntry(); }
	}

	function handleSciKey(e: KeyboardEvent) {
		if (e.key >= '0' && e.key <= '9') { e.preventDefault(); sciAppendDigit(e.key); }
		else if (e.key === '.') { e.preventDefault(); sciAppend('.'); }
		else if (e.key === '+') { e.preventDefault(); sciOp('+'); }
		else if (e.key === '-') { e.preventDefault(); sciOp('-'); }
		else if (e.key === '*') { e.preventDefault(); sciOp('*'); }
		else if (e.key === '/') { e.preventDefault(); sciOp('/'); }
		else if (e.key === '(') { e.preventDefault(); sciAppend('('); }
		else if (e.key === ')') { e.preventDefault(); sciAppend(')'); }
		else if (e.key === '^') { e.preventDefault(); sciAppend('^'); }
		else if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); sciEquals(); }
		else if (e.key === 'Escape') { e.preventDefault(); sciClear(); }
		else if (e.key === 'Backspace') { e.preventDefault(); sciBackspace(); }
	}

	function handleProgKey(e: KeyboardEvent) {
		if (progBase === 'HEX' && e.key.length === 1) {
			const k = e.key.toLowerCase();
			if ((k >= 'a' && k <= 'f') || (k >= '0' && k <= '9')) {
				e.preventDefault();
				progInputDigit(k.toUpperCase());
				return;
			}
		}
		if (e.key >= '0' && e.key <= '9') {
			if (progDigitOk(e.key)) {
				e.preventDefault();
				progInputDigit(e.key);
			}
			return;
		}
		if (e.key === '+') { e.preventDefault(); progOp('+'); }
		else if (e.key === '-') { e.preventDefault(); progOp('-'); }
		else if (e.key === '*') { e.preventDefault(); progOp('*'); }
		else if (e.key === '/') { e.preventDefault(); progOp('/'); }
		else if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); progEquals(); }
		else if (e.key === 'Escape') { e.preventDefault(); progClear(); }
		else if (e.key === 'Backspace') { e.preventDefault(); progBackspace(); }
	}

	// ───────────────────────────────────────────────────────────────
	// Lifecycle
	// ───────────────────────────────────────────────────────────────

	onMount(() => {
		loadHistory();
		loadMemory();
		window.addEventListener('keydown', handleGlobalKeydown);
	});

	onDestroy(() => {
		window.removeEventListener('keydown', handleGlobalKeydown);
	});

	// Title (in header)
	let titleText = $derived(modeTitles[mode]);

	// Disabled state for HEX A-F buttons
	let hexDigitsEnabled = $derived(mode === 'programmer' && progBase === 'HEX');
	let decDigitsEnabled = $derived(mode === 'programmer' ? progBase !== 'BIN' || true : true);
	function progDigitDisabled(d: string): boolean {
		if (mode !== 'programmer') return false;
		return !progDigitOk(d);
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="calculator-app" class:has-side-panel={sidePanel !== null}>
	<!-- Header -->
	<div class="calc-header">
		<button class="hamburger-btn" onclick={() => (showNav = !showNav)} title="Open Navigation" aria-label="Open Navigation">
			<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="3" width="12" height="1.5"/><rect x="2" y="7.25" width="12" height="1.5"/><rect x="2" y="11.5" width="12" height="1.5"/></svg>
		</button>
		<span class="calc-title">{titleText}</span>
		<div class="header-right">
			<button class="history-btn" class:active={sidePanel === 'history'} onclick={() => (sidePanel = sidePanel === 'history' ? null : 'history')} title="History">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M13 3a9 9 0 00-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0013 21a9 9 0 000-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>
			</button>
			<button class="history-btn" class:active={sidePanel === 'memory'} onclick={() => (sidePanel = sidePanel === 'memory' ? null : 'memory')} title="Memory">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M14 7h-4v3H7v4h3v3h4v-3h3v-4h-3V7zm5-4H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/></svg>
			</button>
		</div>
	</div>

	<!-- Nav drawer -->
	{#if showNav}
		<div class="nav-backdrop" onclick={() => (showNav = false)} role="presentation"></div>
		<div class="nav-drawer">
			<div class="nav-section">Calculator</div>
			<button class="nav-item" class:nav-active={mode === 'standard'} onclick={() => selectMode('standard')}>Standard</button>
			<button class="nav-item" class:nav-active={mode === 'scientific'} onclick={() => selectMode('scientific')}>Scientific</button>
			<button class="nav-item" class:nav-active={mode === 'programmer'} onclick={() => selectMode('programmer')}>Programmer</button>
			<div class="nav-section">Converter</div>
			<button class="nav-item" class:nav-active={mode === 'converter'} onclick={() => { selectMode('converter'); }}>Converter</button>
		</div>
	{/if}

	<!-- Body -->
	<div class="calc-main-wrapper">
		<div class="calc-main">
			{#if mode === 'standard'}
				<!-- Standard mode -->
				<div class="display-area">
					<div class="expression-line">{stdExpression}</div>
					<div class="display" style:font-size={displayFontSize}>{formattedDisplay}</div>
				</div>
				<div class="memory-row">
					<button class="mem-btn" onclick={memClear} disabled={memoryEntries.length === 0}>MC</button>
					<button class="mem-btn" onclick={memRecall} disabled={memoryEntries.length === 0}>MR</button>
					<button class="mem-btn" onclick={memAdd}>M+</button>
					<button class="mem-btn" onclick={memSubtract}>M−</button>
					<button class="mem-btn" onclick={memStore}>MS</button>
				</div>
				<div class="buttons-grid std-grid">
					<button class="btn func" onclick={handlePercent}>%</button>
					<button class="btn func" onclick={clearEntry}>CE</button>
					<button class="btn func" onclick={clearAll}>C</button>
					<button class="btn func" onclick={backspace} aria-label="Backspace">
						<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M22 3H7c-.69 0-1.23.35-1.59.88L0 12l5.41 8.11c.36.53.9.89 1.59.89h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-3 12.59L17.59 17 14 13.41 10.41 17 9 15.59 12.59 12 9 8.41 10.41 7 14 10.59 17.59 7 19 8.41 15.41 12 19 15.59z"/></svg>
					</button>
					<button class="btn func" onclick={handleReciprocal}>1/x</button>
					<button class="btn func" onclick={handleSquare}>x²</button>
					<button class="btn func" onclick={handleSqrt}>√x</button>
					<button class="btn op" class:active-op={activeOperator === '/'} onclick={() => stdHandleOperator('/')}>÷</button>
					<button class="btn num" onclick={() => inputDigit('7')}>7</button>
					<button class="btn num" onclick={() => inputDigit('8')}>8</button>
					<button class="btn num" onclick={() => inputDigit('9')}>9</button>
					<button class="btn op" class:active-op={activeOperator === '*'} onclick={() => stdHandleOperator('*')}>×</button>
					<button class="btn num" onclick={() => inputDigit('4')}>4</button>
					<button class="btn num" onclick={() => inputDigit('5')}>5</button>
					<button class="btn num" onclick={() => inputDigit('6')}>6</button>
					<button class="btn op" class:active-op={activeOperator === '-'} onclick={() => stdHandleOperator('-')}>−</button>
					<button class="btn num" onclick={() => inputDigit('1')}>1</button>
					<button class="btn num" onclick={() => inputDigit('2')}>2</button>
					<button class="btn num" onclick={() => inputDigit('3')}>3</button>
					<button class="btn op" class:active-op={activeOperator === '+'} onclick={() => stdHandleOperator('+')}>+</button>
					<button class="btn num" onclick={toggleSign}>+/−</button>
					<button class="btn num" onclick={() => inputDigit('0')}>0</button>
					<button class="btn num" onclick={inputDecimal}>.</button>
					<button class="btn equals" onclick={stdHandleEquals}>=</button>
				</div>
			{:else if mode === 'scientific'}
				<!-- Scientific mode -->
				<div class="display-area">
					<div class="expression-line">{sciPreview ? '= ' + sciPreview : ''}</div>
					<div class="display" style:font-size={sciDisplayFontSize}>{sciDisplayValue}</div>
				</div>
				<div class="sci-modes-row">
					<div class="seg">
						<button class="seg-btn" class:seg-active={angleUnit === 'DEG'} onclick={() => (angleUnit = 'DEG')}>DEG</button>
						<button class="seg-btn" class:seg-active={angleUnit === 'RAD'} onclick={() => (angleUnit = 'RAD')}>RAD</button>
						<button class="seg-btn" class:seg-active={angleUnit === 'GRAD'} onclick={() => (angleUnit = 'GRAD')}>GRAD</button>
					</div>
					<div class="seg">
						<button class="seg-btn" class:seg-active={secondMode} onclick={() => (secondMode = !secondMode)}>2nd</button>
						<button class="seg-btn" class:seg-active={hypMode} onclick={() => (hypMode = !hypMode)}>HYP</button>
					</div>
				</div>
				<div class="memory-row">
					<button class="mem-btn" onclick={memClear} disabled={memoryEntries.length === 0}>MC</button>
					<button class="mem-btn" onclick={memRecall} disabled={memoryEntries.length === 0}>MR</button>
					<button class="mem-btn" onclick={memAdd}>M+</button>
					<button class="mem-btn" onclick={memSubtract}>M−</button>
					<button class="mem-btn" onclick={memStore}>MS</button>
				</div>
				<div class="buttons-grid sci-grid">
					<button class="btn func" onclick={() => sciAppend('(')}>(</button>
					<button class="btn func" onclick={() => sciAppend(')')}>)</button>
					<button class="btn func" onclick={() => sciConst('pi', 'pi')}>π</button>
					<button class="btn func" onclick={() => sciConst('e', 'e')}>e</button>
					<button class="btn func" onclick={sciClear}>C</button>
					<button class="btn func" onclick={sciBackspace} aria-label="Backspace">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M22 3H7c-.69 0-1.23.35-1.59.88L0 12l5.41 8.11c.36.53.9.89 1.59.89h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-3 12.59L17.59 17 14 13.41 10.41 17 9 15.59 12.59 12 9 8.41 10.41 7 14 10.59 17.59 7 19 8.41 15.41 12 19 15.59z"/></svg>
					</button>

					<button class="btn func" onclick={() => sciAppend('^2')}>x²</button>
					<button class="btn func" onclick={() => sciAppend('^3')}>x³</button>
					<button class="btn func" onclick={() => sciAppend('^')}>xʸ</button>
					<button class="btn func" onclick={() => sciAppend('10^')}>10ˣ</button>
					<button class="btn func" onclick={() => sciAppend('2^')}>2ˣ</button>
					<button class="btn func" onclick={() => sciFunc('exp')}>eˣ</button>

					<button class="btn func" onclick={() => sciFunc('sqrt')}>√x</button>
					<button class="btn func" onclick={() => sciFunc('cbrt')}>³√x</button>
					<button class="btn func" onclick={() => sciFunc('log')}>log</button>
					<button class="btn func" onclick={() => sciFunc('ln')}>ln</button>
					<button class="btn func" onclick={() => sciFunc('log2')}>log₂</button>
					<button class="btn func" onclick={() => sciAppend('!')}>n!</button>

					<button class="btn func" onclick={() => sciFunc(hypMode ? (secondMode ? 'asinh' : 'sinh') : (secondMode ? 'asin' : 'sin'))}>{secondMode ? (hypMode ? 'asinh' : 'sin⁻¹') : (hypMode ? 'sinh' : 'sin')}</button>
					<button class="btn func" onclick={() => sciFunc(hypMode ? (secondMode ? 'acosh' : 'cosh') : (secondMode ? 'acos' : 'cos'))}>{secondMode ? (hypMode ? 'acosh' : 'cos⁻¹') : (hypMode ? 'cosh' : 'cos')}</button>
					<button class="btn func" onclick={() => sciFunc(hypMode ? (secondMode ? 'atanh' : 'tanh') : (secondMode ? 'atan' : 'tan'))}>{secondMode ? (hypMode ? 'atanh' : 'tan⁻¹') : (hypMode ? 'tanh' : 'tan')}</button>
					<button class="btn func" onclick={() => sciAppend(' mod ')}>mod</button>
					<button class="btn func" onclick={sciSign}>±</button>
					<button class="btn op" onclick={() => sciOp('/')}>÷</button>

					<button class="btn num" onclick={() => sciAppendDigit('7')}>7</button>
					<button class="btn num" onclick={() => sciAppendDigit('8')}>8</button>
					<button class="btn num" onclick={() => sciAppendDigit('9')}>9</button>
					<button class="btn op" onclick={() => sciOp('*')}>×</button>

					<button class="btn num" onclick={() => sciAppendDigit('4')}>4</button>
					<button class="btn num" onclick={() => sciAppendDigit('5')}>5</button>
					<button class="btn num" onclick={() => sciAppendDigit('6')}>6</button>
					<button class="btn op" onclick={() => sciOp('-')}>−</button>

					<button class="btn num" onclick={() => sciAppendDigit('1')}>1</button>
					<button class="btn num" onclick={() => sciAppendDigit('2')}>2</button>
					<button class="btn num" onclick={() => sciAppendDigit('3')}>3</button>
					<button class="btn op" onclick={() => sciOp('+')}>+</button>

					<button class="btn num" onclick={() => sciAppend('-')}>(−)</button>
					<button class="btn num" onclick={() => sciAppendDigit('0')}>0</button>
					<button class="btn num" onclick={() => sciAppend('.')}>.</button>
					<button class="btn equals" onclick={sciEquals}>=</button>
				</div>
			{:else if mode === 'programmer'}
				<!-- Programmer mode -->
				<div class="display-area">
					<div class="expression-line">{progExpression}</div>
					{#if progError}
						<div class="display" style:font-size="24px">{progError}</div>
					{:else}
						<div class="display" style:font-size="32px">{progMainDisplay}</div>
					{/if}
				</div>
				<div class="base-list">
					<button class="base-row" class:base-active={progBase === 'HEX'} onclick={() => (progBase = 'HEX')}>
						<span class="base-label">HEX</span><span class="base-value">{progDisplayHex}</span>
					</button>
					<button class="base-row" class:base-active={progBase === 'DEC'} onclick={() => (progBase = 'DEC')}>
						<span class="base-label">DEC</span><span class="base-value">{progDisplayDec}</span>
					</button>
					<button class="base-row" class:base-active={progBase === 'OCT'} onclick={() => (progBase = 'OCT')}>
						<span class="base-label">OCT</span><span class="base-value">{progDisplayOct}</span>
					</button>
					<button class="base-row" class:base-active={progBase === 'BIN'} onclick={() => (progBase = 'BIN')}>
						<span class="base-label">BIN</span><span class="base-value">{progDisplayBin}</span>
					</button>
				</div>
				<div class="width-row">
					<div class="seg">
						<button class="seg-btn" class:seg-active={bitWidth === 'QWORD'} onclick={() => (bitWidth = 'QWORD')}>QWORD</button>
						<button class="seg-btn" class:seg-active={bitWidth === 'DWORD'} onclick={() => (bitWidth = 'DWORD')}>DWORD</button>
						<button class="seg-btn" class:seg-active={bitWidth === 'WORD'} onclick={() => (bitWidth = 'WORD')}>WORD</button>
						<button class="seg-btn" class:seg-active={bitWidth === 'BYTE'} onclick={() => (bitWidth = 'BYTE')}>BYTE</button>
					</div>
				</div>
				<div class="bit-grid">
					{#each bitArray as bit (bit.idx)}
						<button
							class="bit"
							class:bit-on={bit.on}
							class:bit-inactive={!bit.active}
							onclick={() => bit.active && progFlipBit(bit.idx)}
							disabled={!bit.active}
							title={`bit ${bit.idx}`}
						>{bit.on ? '1' : '0'}</button>
					{/each}
				</div>
				<div class="buttons-grid prog-grid">
					<button class="btn func" onclick={() => progOp('lsh')}>Lsh</button>
					<button class="btn func" onclick={() => progOp('rsh')}>Rsh</button>
					<button class="btn func" onclick={() => progOp('or')}>OR</button>
					<button class="btn func" onclick={() => progOp('xor')}>XOR</button>
					<button class="btn func" onclick={progClear}>C</button>
					<button class="btn func" onclick={progBackspace} aria-label="Backspace">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M22 3H7c-.69 0-1.23.35-1.59.88L0 12l5.41 8.11c.36.53.9.89 1.59.89h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/></svg>
					</button>

					<button class="btn func" onclick={() => progOp('mod')}>Mod</button>
					<button class="btn func" onclick={() => progOp('and')}>AND</button>
					<button class="btn func" onclick={progNot}>NOT</button>
					<button class="btn num" disabled={progDigitDisabled('A')} onclick={() => progInputDigit('A')}>A</button>
					<button class="btn num" disabled={progDigitDisabled('B')} onclick={() => progInputDigit('B')}>B</button>
					<button class="btn op" onclick={() => progOp('/')}>÷</button>

					<button class="btn num" disabled={progDigitDisabled('7')} onclick={() => progInputDigit('7')}>7</button>
					<button class="btn num" disabled={progDigitDisabled('8')} onclick={() => progInputDigit('8')}>8</button>
					<button class="btn num" disabled={progDigitDisabled('9')} onclick={() => progInputDigit('9')}>9</button>
					<button class="btn num" disabled={progDigitDisabled('C')} onclick={() => progInputDigit('C')}>C</button>
					<button class="btn num" disabled={progDigitDisabled('D')} onclick={() => progInputDigit('D')}>D</button>
					<button class="btn op" onclick={() => progOp('*')}>×</button>

					<button class="btn num" disabled={progDigitDisabled('4')} onclick={() => progInputDigit('4')}>4</button>
					<button class="btn num" disabled={progDigitDisabled('5')} onclick={() => progInputDigit('5')}>5</button>
					<button class="btn num" disabled={progDigitDisabled('6')} onclick={() => progInputDigit('6')}>6</button>
					<button class="btn num" disabled={progDigitDisabled('E')} onclick={() => progInputDigit('E')}>E</button>
					<button class="btn num" disabled={progDigitDisabled('F')} onclick={() => progInputDigit('F')}>F</button>
					<button class="btn op" onclick={() => progOp('-')}>−</button>

					<button class="btn num" disabled={progDigitDisabled('1')} onclick={() => progInputDigit('1')}>1</button>
					<button class="btn num" disabled={progDigitDisabled('2')} onclick={() => progInputDigit('2')}>2</button>
					<button class="btn num" disabled={progDigitDisabled('3')} onclick={() => progInputDigit('3')}>3</button>
					<button class="btn func" onclick={progToggleSign}>+/−</button>
					<button class="btn func" disabled>—</button>
					<button class="btn op" onclick={() => progOp('+')}>+</button>

					<button class="btn func" disabled>—</button>
					<button class="btn num" disabled={progDigitDisabled('0')} onclick={() => progInputDigit('0')}>0</button>
					<button class="btn func" disabled>.</button>
					<button class="btn func" disabled>—</button>
					<button class="btn func" disabled>—</button>
					<button class="btn equals" onclick={progEquals}>=</button>
				</div>
			{:else}
				<!-- Converter mode -->
				<div class="conv-kind-row">
					{#each Object.keys(CONVERTER_LABELS) as k}
						<button class="conv-kind-btn" class:conv-kind-active={converterKind === k} onclick={() => selectConverterKind(k as ConverterKind)}>{CONVERTER_LABELS[k as ConverterKind]}</button>
					{/each}
				</div>
				<div class="conv-body">
					<div class="conv-field">
						<input class="conv-input" type="text" inputmode="decimal" value={convFromValue} oninput={onConvFromInput} />
						<select class="conv-select" value={convFromUnit} onchange={onConvFromUnitChange}>
							{#each Object.entries(UNITS[converterKind]) as [key, def]}
								<option value={key}>{def.label} ({key})</option>
							{/each}
						</select>
					</div>
					<div class="conv-arrow">↓</div>
					<div class="conv-field">
						<input class="conv-input" type="text" inputmode="decimal" value={convToValue} oninput={onConvToInput} />
						<select class="conv-select" value={convToUnit} onchange={onConvToUnitChange}>
							{#each Object.entries(UNITS[converterKind]) as [key, def]}
								<option value={key}>{def.label} ({key})</option>
							{/each}
						</select>
					</div>
					{#if converterKind === 'currency'}
						<div class="conv-note">Note: rates are static (illustrative only)</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Side panel: history or memory -->
		{#if sidePanel === 'history'}
			<div class="side-panel">
				<div class="side-header">
					<span>History</span>
					<button class="side-clear" onclick={clearHistory} title="Clear history" disabled={history.length === 0}>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
					</button>
				</div>
				<div class="side-list">
					{#if history.length === 0}
						<span class="side-empty">There's no history yet</span>
					{:else}
						{#each history as item, idx (idx)}
							<button class="history-item" onclick={() => recallHistory(item)}>
								<div class="hi-expr">{item.expr}</div>
								<div class="hi-result">{item.result}</div>
							</button>
						{/each}
					{/if}
				</div>
			</div>
		{:else if sidePanel === 'memory'}
			<div class="side-panel">
				<div class="side-header">
					<span>Memory</span>
					<button class="side-clear" onclick={memClear} title="Clear memory" disabled={memoryEntries.length === 0}>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
					</button>
				</div>
				<div class="side-list">
					{#if memoryEntries.length === 0}
						<span class="side-empty">There's nothing saved in memory</span>
					{:else}
						{#each memoryEntries as entry (entry.id)}
							<div class="mem-item">
								<button class="mem-value" onclick={() => memEntryRecall(entry.id)}>{formatNumber(entry.value)}</button>
								<div class="mem-actions">
									<button class="mem-action" onclick={() => memEntryClear(entry.id)} title="Clear">MC</button>
									<button class="mem-action" onclick={() => memEntryAdd(entry.id)} title="Add">M+</button>
									<button class="mem-action" onclick={() => memEntrySubtract(entry.id)} title="Subtract">M−</button>
								</div>
							</div>
						{/each}
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.calculator-app {
		height: 100%;
		display: flex;
		flex-direction: column;
		background: var(--win-surface);
		position: relative;
		outline: none;
		overflow: hidden;
	}

	.calc-header {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		flex-shrink: 0;
	}

	.calc-title {
		font-size: 13px;
		font-weight: 600;
		color: var(--win-text-primary);
		flex: 1;
	}

	.header-right {
		display: flex;
		gap: 2px;
	}

	.hamburger-btn,
	.history-btn {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--win-radius-sm, 4px);
		color: var(--win-text-primary);
		transition: background-color 0.08s ease;
	}

	.hamburger-btn:hover,
	.history-btn:hover {
		background: rgba(0, 0, 0, 0.04);
	}

	.history-btn.active {
		background: rgba(0, 0, 0, 0.06);
	}

	/* Nav drawer */
	.nav-backdrop {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.1);
		z-index: 5;
	}
	.nav-drawer {
		position: absolute;
		top: 0;
		left: 0;
		bottom: 0;
		width: 220px;
		background: var(--win-surface-flyout, rgba(243, 243, 243, 0.96));
		backdrop-filter: blur(20px);
		box-shadow: 2px 0 12px rgba(0, 0, 0, 0.16);
		z-index: 6;
		padding: 8px 4px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		overflow-y: auto;
	}

	.nav-section {
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		color: var(--win-text-secondary);
		padding: 8px 12px 4px;
		letter-spacing: 0.5px;
	}

	.nav-item {
		text-align: left;
		padding: 8px 12px;
		font-size: 13px;
		color: var(--win-text-primary);
		border-radius: var(--win-radius-sm, 4px);
		transition: background-color 0.08s ease;
	}

	.nav-item:hover {
		background: rgba(0, 0, 0, 0.05);
	}

	.nav-item.nav-active {
		background: rgba(0, 120, 212, 0.12);
		color: var(--win-accent);
		font-weight: 600;
	}

	.calc-main-wrapper {
		flex: 1;
		display: flex;
		overflow: hidden;
		min-height: 0;
	}

	.calc-main {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
		overflow: hidden;
	}

	.display-area {
		padding: 4px 16px 8px;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		flex-shrink: 0;
	}

	.expression-line {
		font-size: 12px;
		color: var(--win-text-secondary);
		min-height: 16px;
		word-break: break-all;
		text-align: right;
		width: 100%;
	}

	.display {
		text-align: right;
		font-weight: 300;
		color: var(--win-text-primary);
		min-height: 50px;
		display: flex;
		align-items: flex-end;
		justify-content: flex-end;
		overflow: hidden;
		word-break: break-all;
		width: 100%;
	}

	.memory-row {
		display: flex;
		gap: 2px;
		padding: 2px 8px 6px;
		flex-shrink: 0;
	}

	.mem-btn {
		flex: 1;
		padding: 4px;
		font-size: 12px;
		color: var(--win-text-primary);
		border-radius: var(--win-radius-sm, 4px);
		transition: background-color 0.08s ease;
	}

	.mem-btn:not(:disabled):hover {
		background: rgba(0, 0, 0, 0.04);
	}

	.mem-btn:disabled {
		color: var(--win-text-disabled);
	}

	/* Segmented toggles */
	.sci-modes-row,
	.width-row {
		padding: 2px 8px 6px;
		display: flex;
		gap: 6px;
		flex-shrink: 0;
	}

	.seg {
		display: flex;
		gap: 1px;
		background: rgba(0, 0, 0, 0.04);
		border-radius: var(--win-radius-sm, 4px);
		padding: 2px;
		flex: 1;
	}

	.seg-btn {
		flex: 1;
		padding: 4px 6px;
		font-size: 11px;
		font-weight: 500;
		color: var(--win-text-primary);
		border-radius: 3px;
		transition: background-color 0.08s ease;
	}

	.seg-btn:hover {
		background: rgba(0, 0, 0, 0.05);
	}

	.seg-btn.seg-active {
		background: var(--win-accent);
		color: white;
	}

	.buttons-grid {
		flex: 1;
		display: grid;
		gap: 2px;
		padding: 2px 8px 8px;
		min-height: 0;
	}

	.std-grid {
		grid-template-columns: repeat(4, 1fr);
	}

	.sci-grid {
		grid-template-columns: repeat(6, 1fr);
	}

	.prog-grid {
		grid-template-columns: repeat(6, 1fr);
	}

	.btn {
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 14px;
		border-radius: var(--win-radius-sm, 4px);
		transition: background-color 0.08s ease;
		min-height: 36px;
		cursor: default;
		padding: 4px;
	}

	.btn:disabled {
		opacity: 0.4;
	}

	.btn.num {
		background: rgba(255, 255, 255, 0.7);
		color: var(--win-text-primary);
		font-weight: 500;
		border: 1px solid rgba(0, 0, 0, 0.04);
	}

	.btn.num:not(:disabled):hover {
		background: rgba(255, 255, 255, 0.9);
	}

	.btn.num:not(:disabled):active {
		background: rgba(255, 255, 255, 0.5);
	}

	.btn.func {
		background: rgba(249, 249, 249, 0.6);
		color: var(--win-text-primary);
		border: 1px solid rgba(0, 0, 0, 0.03);
		font-size: 13px;
	}

	.btn.func:not(:disabled):hover {
		background: rgba(249, 249, 249, 0.9);
	}

	.btn.op {
		background: rgba(249, 249, 249, 0.6);
		color: var(--win-text-primary);
		border: 1px solid rgba(0, 0, 0, 0.03);
		font-size: 16px;
	}

	.btn.op:not(:disabled):hover {
		background: rgba(249, 249, 249, 0.9);
	}

	.btn.op.active-op {
		background: var(--win-accent);
		color: white;
	}

	.btn.op.active-op:hover {
		background: var(--win-accent-hover, #1a86d8);
	}

	.btn.equals {
		background: var(--win-accent);
		color: white;
		font-weight: 600;
		font-size: 18px;
		border: 1px solid var(--win-accent);
	}

	.btn.equals:hover {
		background: var(--win-accent-hover, #1a86d8);
	}

	/* Programmer base list */
	.base-list {
		display: flex;
		flex-direction: column;
		padding: 2px 8px;
		gap: 1px;
		flex-shrink: 0;
	}

	.base-row {
		display: flex;
		align-items: center;
		padding: 4px 8px;
		text-align: left;
		gap: 10px;
		border-radius: var(--win-radius-sm, 4px);
		font-size: 12px;
		color: var(--win-text-primary);
		transition: background-color 0.08s ease;
	}

	.base-row:hover {
		background: rgba(0, 0, 0, 0.04);
	}

	.base-row.base-active {
		background: rgba(0, 120, 212, 0.12);
		font-weight: 600;
	}

	.base-label {
		width: 32px;
		font-weight: 600;
		color: var(--win-text-secondary);
	}

	.base-row.base-active .base-label {
		color: var(--win-accent);
	}

	.base-value {
		flex: 1;
		text-align: right;
		font-family: 'Consolas', 'Cascadia Code', monospace;
		word-break: break-all;
	}

	.bit-grid {
		display: grid;
		grid-template-columns: repeat(16, 1fr);
		gap: 1px;
		padding: 4px 8px;
		flex-shrink: 0;
		max-height: 90px;
		overflow-y: auto;
	}

	.bit {
		font-size: 9px;
		font-family: 'Consolas', 'Cascadia Code', monospace;
		padding: 2px;
		min-height: 18px;
		border-radius: 2px;
		color: var(--win-text-secondary);
		background: rgba(0, 0, 0, 0.03);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.bit:not(:disabled):hover {
		background: rgba(0, 0, 0, 0.08);
	}

	.bit.bit-on {
		background: var(--win-accent);
		color: white;
	}

	.bit.bit-inactive {
		opacity: 0.25;
	}

	/* Converter */
	.conv-kind-row {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 4px;
		padding: 4px 8px;
		flex-shrink: 0;
	}

	.conv-kind-btn {
		padding: 8px 4px;
		border-radius: var(--win-radius-sm, 4px);
		font-size: 12px;
		font-weight: 500;
		color: var(--win-text-primary);
		background: rgba(255, 255, 255, 0.5);
		border: 1px solid rgba(0, 0, 0, 0.03);
	}

	.conv-kind-btn:hover {
		background: rgba(255, 255, 255, 0.85);
	}

	.conv-kind-btn.conv-kind-active {
		background: var(--win-accent);
		color: white;
		border-color: var(--win-accent);
	}

	.conv-body {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 16px;
		flex: 1;
		overflow-y: auto;
	}

	.conv-field {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.conv-input {
		font-size: 24px;
		padding: 8px 12px;
		background: rgba(255, 255, 255, 0.7);
		border: 1px solid rgba(0, 0, 0, 0.1);
		border-radius: var(--win-radius-sm, 4px);
		color: var(--win-text-primary);
		text-align: right;
	}

	.conv-input:focus {
		border-color: var(--win-accent);
	}

	.conv-select {
		padding: 6px 10px;
		background: rgba(255, 255, 255, 0.7);
		border: 1px solid rgba(0, 0, 0, 0.1);
		border-radius: var(--win-radius-sm, 4px);
		font-size: 13px;
		color: var(--win-text-primary);
	}

	.conv-arrow {
		text-align: center;
		font-size: 20px;
		color: var(--win-text-secondary);
	}

	.conv-note {
		font-size: 11px;
		color: var(--win-text-secondary);
		text-align: center;
		font-style: italic;
		margin-top: 4px;
	}

	/* Side panel (history / memory) */
	.side-panel {
		width: 220px;
		background: rgba(252, 252, 252, 0.96);
		backdrop-filter: blur(20px);
		border-left: 1px solid rgba(0, 0, 0, 0.06);
		box-shadow: -2px 0 8px rgba(0, 0, 0, 0.08);
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
	}

	.side-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 12px;
		font-size: 14px;
		font-weight: 600;
		color: var(--win-text-primary);
		border-bottom: 1px solid rgba(0, 0, 0, 0.04);
		flex-shrink: 0;
	}

	.side-clear {
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--win-radius-sm, 4px);
		color: var(--win-text-secondary);
		transition: background-color 0.08s ease;
	}

	.side-clear:not(:disabled):hover {
		background: rgba(0, 0, 0, 0.04);
	}

	.side-clear:disabled {
		opacity: 0.4;
	}

	.side-list {
		flex: 1;
		overflow-y: auto;
		padding: 8px 12px;
	}

	.side-empty {
		font-size: 13px;
		color: var(--win-text-secondary);
		text-align: center;
		display: block;
		margin-top: 20px;
	}

	.history-item {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		width: 100%;
		padding: 8px 0;
		border-bottom: 1px solid rgba(0, 0, 0, 0.04);
		text-align: right;
		transition: background-color 0.08s ease;
		border-radius: 2px;
	}

	.history-item:hover {
		background: rgba(0, 0, 0, 0.03);
	}

	.hi-expr {
		font-size: 11px;
		color: var(--win-text-secondary);
	}

	.hi-result {
		font-size: 14px;
		font-weight: 500;
		color: var(--win-text-primary);
	}

	.mem-item {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 8px 0;
		border-bottom: 1px solid rgba(0, 0, 0, 0.04);
	}

	.mem-value {
		text-align: right;
		font-size: 16px;
		color: var(--win-text-primary);
		font-weight: 500;
		padding: 4px 6px;
		border-radius: var(--win-radius-sm, 4px);
		transition: background-color 0.08s ease;
	}

	.mem-value:hover {
		background: rgba(0, 0, 0, 0.04);
	}

	.mem-actions {
		display: flex;
		gap: 4px;
		justify-content: flex-end;
	}

	.mem-action {
		font-size: 11px;
		padding: 3px 8px;
		color: var(--win-text-primary);
		border-radius: var(--win-radius-sm, 4px);
		transition: background-color 0.08s ease;
	}

	.mem-action:hover {
		background: rgba(0, 0, 0, 0.06);
	}
</style>

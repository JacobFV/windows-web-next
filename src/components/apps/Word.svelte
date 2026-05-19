<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { writeFile, readFile, mkdir, stat, ls, vfs_store } from '../../state/vfs.svelte';
	import type { FSNode } from '../../state/vfs.svelte';
	import { consumePendingFile } from '../../state/file-opener.svelte';
	import { notify } from '../../state/notifications.svelte';

	// ── Constants ──────────────────────────────────────────────────────
	const PAGE_WIDTH_PX = 816;
	const PAGE_HEIGHT_PX = 1056;
	const DEFAULT_PATH = 'C:/Users/User/Documents/Untitled.docx';
	const AUTOSAVE_INTERVAL_MS = 5000;

	const FONTS = [
		'Calibri', 'Cambria', 'Arial', 'Times New Roman', 'Georgia',
		'Verdana', 'Tahoma', 'Trebuchet MS', 'Courier New', 'Consolas',
		'Comic Sans MS', 'Segoe UI', 'Garamond', 'Palatino',
	];

	const SIZES = ['8', '9', '10', '11', '12', '14', '16', '18', '20', '24', '28', '32', '36', '48', '72'];

	const SWATCH_COLORS = [
		'#000000', '#444444', '#888888', '#cccccc', '#ffffff',
		'#c00000', '#ff0000', '#ffc000', '#ffff00', '#92d050',
		'#00b050', '#00b0f0', '#0070c0', '#002060', '#7030a0',
	];

	const HIGHLIGHT_COLORS = [
		'transparent', '#ffff00', '#00ff00', '#00ffff', '#ff00ff',
		'#0070ff', '#ff8000', '#ffc0cb', '#c0c0c0', '#a0e8a0',
	];

	const LINE_SPACINGS = [
		{ label: '1.0', value: '1.0' },
		{ label: '1.15', value: '1.15' },
		{ label: '1.5', value: '1.5' },
		{ label: '2.0', value: '2.0' },
		{ label: '2.5', value: '2.5' },
		{ label: '3.0', value: '3.0' },
	];

	type RibbonTab = 'home' | 'insert' | 'layout' | 'references' | 'view';
	type ViewMode = 'print' | 'web' | 'read';
	type Orientation = 'portrait' | 'landscape';
	type ColumnsCount = 1 | 2 | 3;

	interface CapturedStyle {
		fontFamily: string;
		fontSize: string;
		color: string;
		fontWeight: string;
		fontStyle: string;
		textDecoration: string;
	}

	interface OutlineHeading {
		id: string;
		level: 1 | 2 | 3;
		text: string;
	}

	// ── Reactive state ─────────────────────────────────────────────────
	let editorEl = $state<HTMLDivElement | null>(null);
	let headerEditorEl = $state<HTMLDivElement | null>(null);
	let footerEditorEl = $state<HTMLDivElement | null>(null);
	let findInputRef = $state<HTMLInputElement | null>(null);
	let replaceInputRef = $state<HTMLInputElement | null>(null);
	let saveAsNameRef = $state<HTMLInputElement | null>(null);
	let imageInputRef = $state<HTMLInputElement | null>(null);

	let docContent = $state(
		`<h1>Untitled Document</h1><p>Start typing here. Use the ribbon above to format your text — apply <strong>bold</strong>, <em>italic</em>, or <u>underline</u>, change fonts, add lists, insert tables, and more.</p><p>Press <kbd>Ctrl+S</kbd> to save, <kbd>Ctrl+F</kbd> to find text, or <kbd>Ctrl+H</kbd> to find and replace.</p>`,
	);
	let headerContent = $state('');
	let footerContent = $state('');
	let docPath = $state<string | null>(null);
	let docTitle = $state('Untitled');
	let lastSavedContent = $state('');
	let lastAutosavedContent = $state('');
	let isDirty = $state(false);
	let savedFlashUntil = $state(0);

	let activeTab = $state<RibbonTab>('home');
	let fontFamily = $state('Calibri');
	let fontSize = $state('11');
	let textColor = $state('#000000');
	let highlightColor = $state('#ffff00');
	let lineSpacing = $state('1.15');
	let zoom = $state(100);
	let viewMode = $state<ViewMode>('print');
	let isReadMode = $derived(viewMode === 'read');
	let orientation = $state<Orientation>('portrait');
	let columns = $state<ColumnsCount>(1);
	let showRuler = $state(true);
	let showOutline = $state(true);
	let darkMode = $state(false);
	let marginPreset = $state<'narrow' | 'normal' | 'wide'>('normal');

	// Header/footer toggles
	let headerVisible = $state(false);
	let footerVisible = $state(false);

	// Find/replace
	let showFindPane = $state(false);
	let showReplacePane = $state(false);
	let findQuery = $state('');
	let replaceQuery = $state('');
	let findMatchCount = $state(0);
	let findMatchIndex = $state(0);
	let findCaseSensitive = $state(false);
	let findWholeWord = $state(false);

	// Page count
	let pageCount = $state(1);

	// Format painter
	let formatPainterStyle = $state<CapturedStyle | null>(null);
	let formatPainterActive = $derived(formatPainterStyle !== null);

	// Active table (for floating table tab)
	let activeTableEl = $state<HTMLTableElement | null>(null);

	// Dropdown / menu state
	let openMenu = $state<string | null>(null);

	// Tables popup
	let tableGridHover = $state<{ rows: number; cols: number }>({ rows: 0, cols: 0 });

	// Save As dialog
	let showSaveAsDialog = $state(false);
	let saveAsName = $state('Untitled.docx');
	let saveAsDir = $state('C:/Users/User/Documents');

	// File picker dialog
	let showOpenDialog = $state(false);
	let openDialogPath = $state('C:/Users/User/Documents');

	// Word counts
	let wordCount = $state(0);
	let charCount = $state(0);
	let charNoSpaceCount = $state(0);
	let paragraphCount = $state(0);

	// Outline
	let outline = $state<OutlineHeading[]>([]);

	// Selection-aware ribbon states
	let activeBold = $state(false);
	let activeItalic = $state(false);
	let activeUnderline = $state(false);
	let activeStrike = $state(false);
	let activeSubscript = $state(false);
	let activeSuperscript = $state(false);
	let activeAlign = $state<'left' | 'center' | 'right' | 'justify'>('left');
	let activeHeading = $state<'p' | 'h1' | 'h2' | 'h3'>('p');

	// References
	let footnoteCounter = $state(1);
	let citationCounter = $state(1);
	let captionCounter = $state(1);

	// Autosave timer
	let autosaveTimer: number | null = null;

	// Internal flag to suppress re-entrant updates
	let suppressInput = false;

	// ── Helpers ────────────────────────────────────────────────────────

	function selectionBelongsToEditor(selection: Selection | null): boolean {
		if (!editorEl || !selection || selection.rangeCount === 0) return false;
		const node = selection.getRangeAt(0).commonAncestorContainer;
		return editorEl.contains(node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
	}

	function ensureEditorSelection() {
		if (!editorEl) return;
		const selection = window.getSelection();
		const hasEditorSelection = selectionBelongsToEditor(selection);
		editorEl.focus();
		if (hasEditorSelection) return;
		const range = document.createRange();
		range.selectNodeContents(editorEl);
		range.collapse(false);
		selection?.removeAllRanges();
		selection?.addRange(range);
	}

	function exec(cmd: string, value?: string) {
		ensureEditorSelection();
		document.execCommand(cmd, false, value);
		refreshAll();
	}

	function refreshAll() {
		updateCounts();
		updateOutline();
		updatePageCount();
		updateActiveStates();
		isDirty = (editorEl?.innerHTML ?? docContent) !== lastSavedContent;
	}

	function getEditorText(): string {
		if (!editorEl) return '';
		return editorEl.innerText || '';
	}

	function escapeHtml(value: string): string {
		return value
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&#39;');
	}

	function updateCounts() {
		const text = getEditorText();
		const trimmed = text.replace(/\s+/g, ' ').trim();
		wordCount = trimmed ? trimmed.split(' ').length : 0;
		charCount = text.length;
		charNoSpaceCount = text.replace(/\s+/g, '').length;
		paragraphCount = text.split(/\n+/).filter((p) => p.trim().length > 0).length;
	}

	function updateOutline() {
		if (!editorEl) {
			outline = [];
			return;
		}
		const headings: OutlineHeading[] = [];
		const nodes = editorEl.querySelectorAll('h1, h2, h3');
		nodes.forEach((node, idx) => {
			const tag = node.tagName.toLowerCase();
			const level = (tag === 'h1' ? 1 : tag === 'h2' ? 2 : 3) as 1 | 2 | 3;
			let id = node.id;
			if (!id) {
				id = `word-h-${idx}-${Date.now() % 100000}`;
				(node as HTMLElement).id = id;
			}
			headings.push({ id, level, text: (node.textContent || '').trim() || '(empty heading)' });
		});
		outline = headings;
	}

	function updatePageCount() {
		if (!editorEl) {
			pageCount = 1;
			return;
		}
		const h = editorEl.scrollHeight;
		const pageH = orientation === 'landscape' ? PAGE_WIDTH_PX : PAGE_HEIGHT_PX;
		pageCount = Math.max(1, Math.ceil(h / pageH));
	}

	function updateActiveStates() {
		try {
			activeBold = document.queryCommandState('bold');
			activeItalic = document.queryCommandState('italic');
			activeUnderline = document.queryCommandState('underline');
			activeStrike = document.queryCommandState('strikethrough');
			activeSubscript = document.queryCommandState('subscript');
			activeSuperscript = document.queryCommandState('superscript');
			if (document.queryCommandState('justifyCenter')) activeAlign = 'center';
			else if (document.queryCommandState('justifyRight')) activeAlign = 'right';
			else if (document.queryCommandState('justifyFull')) activeAlign = 'justify';
			else activeAlign = 'left';
			const block = (document.queryCommandValue('formatBlock') || '').toString().toLowerCase().replace(/[<>]/g, '');
			if (block === 'h1' || block === 'h2' || block === 'h3') activeHeading = block;
			else activeHeading = 'p';
		} catch {
			// queryCommandState may throw in some browsers; ignore.
		}
	}

	// ── Selection helpers ──────────────────────────────────────────────

	function isSelectionInsideEditor(): boolean {
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0 || !editorEl) return false;
		const node = sel.anchorNode;
		return node !== null && editorEl.contains(node);
	}

	function getSelectionTable(): HTMLTableElement | null {
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0 || !editorEl) return null;
		let node: Node | null = sel.anchorNode;
		while (node && node !== editorEl) {
			if ((node as HTMLElement).tagName === 'TABLE') return node as HTMLTableElement;
			node = node.parentNode;
		}
		return null;
	}

	function getSelectionCell(): HTMLTableCellElement | null {
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0 || !editorEl) return null;
		let node: Node | null = sel.anchorNode;
		while (node && node !== editorEl) {
			const tag = (node as HTMLElement).tagName;
			if (tag === 'TD' || tag === 'TH') return node as HTMLTableCellElement;
			node = node.parentNode;
		}
		return null;
	}

	function captureCurrentStyle(): CapturedStyle | null {
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) return null;
		let node: Node | null = sel.anchorNode;
		if (node && node.nodeType === Node.TEXT_NODE) node = node.parentNode;
		if (!node || node.nodeType !== Node.ELEMENT_NODE) return null;
		const cs = window.getComputedStyle(node as Element);
		return {
			fontFamily: cs.fontFamily,
			fontSize: cs.fontSize,
			color: cs.color,
			fontWeight: cs.fontWeight,
			fontStyle: cs.fontStyle,
			textDecoration: cs.textDecorationLine,
		};
	}

	function applyCapturedStyle(s: CapturedStyle) {
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) return;
		const range = sel.getRangeAt(0);
		if (range.collapsed) return;
		const span = document.createElement('span');
		span.style.fontFamily = s.fontFamily;
		span.style.fontSize = s.fontSize;
		span.style.color = s.color;
		span.style.fontWeight = s.fontWeight;
		span.style.fontStyle = s.fontStyle;
		if (s.textDecoration && s.textDecoration !== 'none') {
			span.style.textDecoration = s.textDecoration;
		}
		try {
			const frag = range.extractContents();
			span.appendChild(frag);
			range.insertNode(span);
			sel.removeAllRanges();
			const newRange = document.createRange();
			newRange.selectNodeContents(span);
			sel.addRange(newRange);
		} catch {
			// no-op
		}
	}

	// ── Ribbon command handlers ────────────────────────────────────────

	function doBold() { exec('bold'); }
	function doItalic() { exec('italic'); }
	function doUnderline() { exec('underline'); }
	function doStrike() { exec('strikethrough'); }
	function doSub() { exec('subscript'); }
	function doSuper() { exec('superscript'); }
	function doAlignLeft() { exec('justifyLeft'); }
	function doAlignCenter() { exec('justifyCenter'); }
	function doAlignRight() { exec('justifyRight'); }
	function doAlignJustify() { exec('justifyFull'); }
	function doBulletList() { exec('insertUnorderedList'); }
	function doNumberList() { exec('insertOrderedList'); }
	function doIndent() { exec('indent'); }
	function doOutdent() { exec('outdent'); }
	function doUndo() { exec('undo'); }
	function doRedo() { exec('redo'); }
	function doRemoveFormat() { exec('removeFormat'); }

	function changeFontFamily() { exec('fontName', fontFamily); }

	function changeFontSize() {
		// Apply a span-based size so we keep precise pt values.
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0 || !editorEl) return;
		const range = sel.getRangeAt(0);
		if (range.collapsed) {
			// Set for next typed character via a styled span
			document.execCommand('fontSize', false, '4');
			// Walk and replace font tags
			const fonts = editorEl.querySelectorAll('font[size="4"]');
			fonts.forEach((f) => {
				const span = document.createElement('span');
				span.style.fontSize = `${fontSize}pt`;
				span.innerHTML = f.innerHTML;
				f.replaceWith(span);
			});
		} else {
			document.execCommand('fontSize', false, '4');
			const fonts = editorEl.querySelectorAll('font[size="4"]');
			fonts.forEach((f) => {
				const span = document.createElement('span');
				span.style.fontSize = `${fontSize}pt`;
				span.innerHTML = f.innerHTML;
				f.replaceWith(span);
			});
		}
		editorEl?.focus();
		refreshAll();
	}

	function changeTextColor(c: string) {
		textColor = c;
		exec('foreColor', c);
		openMenu = null;
	}

	function changeHighlight(c: string) {
		highlightColor = c;
		if (c === 'transparent') {
			exec('hiliteColor', 'transparent');
		} else {
			exec('hiliteColor', c);
		}
		openMenu = null;
	}

	function changeHeading(level: 'p' | 'h1' | 'h2' | 'h3') {
		exec('formatBlock', level === 'p' ? 'p' : level);
	}

	function changeLineSpacing(v: string) {
		lineSpacing = v;
		// Apply to current paragraph block
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0 || !editorEl) return;
		let node: Node | null = sel.anchorNode;
		while (node && node !== editorEl) {
			const el = node as HTMLElement;
			if (el.nodeType === Node.ELEMENT_NODE && ['P', 'H1', 'H2', 'H3', 'LI', 'DIV'].includes(el.tagName)) {
				el.style.lineHeight = v;
				break;
			}
			node = node.parentNode;
		}
		editorEl?.focus();
		refreshAll();
		openMenu = null;
	}

	// ── Format painter ─────────────────────────────────────────────────

	function toggleFormatPainter() {
		if (formatPainterStyle) {
			formatPainterStyle = null;
			return;
		}
		const s = captureCurrentStyle();
		if (s) {
			formatPainterStyle = s;
		}
	}

	function maybeApplyFormatPainter() {
		if (!formatPainterStyle) return;
		applyCapturedStyle(formatPainterStyle);
		formatPainterStyle = null;
		refreshAll();
	}

	// ── Table insertion ────────────────────────────────────────────────

	function insertTable(rows: number, cols: number) {
		if (rows < 1 || cols < 1) return;
		let html = '<table class="word-table"><tbody>';
		for (let r = 0; r < rows; r++) {
			html += '<tr>';
			for (let c = 0; c < cols; c++) {
				html += '<td>&nbsp;</td>';
			}
			html += '</tr>';
		}
		html += '</tbody></table><p>&nbsp;</p>';
		exec('insertHTML', html);
		openMenu = null;
	}

	function addRowAbove() {
		const cell = getSelectionCell();
		if (!cell) return;
		const row = cell.parentElement as HTMLTableRowElement | null;
		const table = getSelectionTable();
		if (!row || !table) return;
		const newRow = row.cloneNode(false) as HTMLTableRowElement;
		const colCount = row.cells.length;
		for (let i = 0; i < colCount; i++) {
			const td = document.createElement('td');
			td.innerHTML = '&nbsp;';
			newRow.appendChild(td);
		}
		row.parentElement?.insertBefore(newRow, row);
		refreshAll();
	}

	function addRowBelow() {
		const cell = getSelectionCell();
		if (!cell) return;
		const row = cell.parentElement as HTMLTableRowElement | null;
		if (!row) return;
		const newRow = row.cloneNode(false) as HTMLTableRowElement;
		const colCount = row.cells.length;
		for (let i = 0; i < colCount; i++) {
			const td = document.createElement('td');
			td.innerHTML = '&nbsp;';
			newRow.appendChild(td);
		}
		row.parentElement?.insertBefore(newRow, row.nextSibling);
		refreshAll();
	}

	function addColLeft() {
		const cell = getSelectionCell();
		const table = getSelectionTable();
		if (!cell || !table) return;
		const colIdx = cell.cellIndex;
		Array.from(table.rows).forEach((r) => {
			const td = document.createElement('td');
			td.innerHTML = '&nbsp;';
			r.insertBefore(td, r.cells[colIdx] ?? null);
		});
		refreshAll();
	}

	function addColRight() {
		const cell = getSelectionCell();
		const table = getSelectionTable();
		if (!cell || !table) return;
		const colIdx = cell.cellIndex;
		Array.from(table.rows).forEach((r) => {
			const td = document.createElement('td');
			td.innerHTML = '&nbsp;';
			const ref = r.cells[colIdx + 1] ?? null;
			r.insertBefore(td, ref);
		});
		refreshAll();
	}

	function deleteRow() {
		const cell = getSelectionCell();
		if (!cell) return;
		const row = cell.parentElement as HTMLTableRowElement | null;
		const table = getSelectionTable();
		if (!row || !table) return;
		if (table.rows.length <= 1) {
			deleteTable();
			return;
		}
		row.remove();
		activeTableEl = null;
		refreshAll();
	}

	function deleteColumn() {
		const cell = getSelectionCell();
		const table = getSelectionTable();
		if (!cell || !table) return;
		const colIdx = cell.cellIndex;
		if (table.rows[0] && table.rows[0].cells.length <= 1) {
			deleteTable();
			return;
		}
		Array.from(table.rows).forEach((r) => {
			if (r.cells[colIdx]) r.deleteCell(colIdx);
		});
		activeTableEl = null;
		refreshAll();
	}

	function deleteTable() {
		const table = getSelectionTable();
		if (!table) return;
		table.remove();
		activeTableEl = null;
		refreshAll();
	}

	// ── Image / horizontal rule ────────────────────────────────────────

	function triggerImageUpload() {
		imageInputRef?.click();
		openMenu = null;
	}

	function handleImageSelected(e: Event) {
		const input = e.target as HTMLInputElement;
		const f = input.files?.[0];
		if (!f) return;
		const reader = new FileReader();
		reader.onload = () => {
			const data = reader.result as string;
			exec('insertHTML', `<img src="${data}" alt="${f.name}" class="word-image" />`);
		};
		reader.readAsDataURL(f);
		input.value = '';
	}

	function insertHr() {
		exec('insertHorizontalRule');
		openMenu = null;
	}

	function insertPageBreak() {
		exec('insertHTML', '<div class="word-page-break" contenteditable="false">— Page Break —</div><p>&nbsp;</p>');
		openMenu = null;
	}

	function insertSymbol(sym: string) {
		exec('insertText', sym);
	}

	// ── References ─────────────────────────────────────────────────────

	function getDocumentHeadings() {
		if (!editorEl) return [];
		return Array.from(editorEl.querySelectorAll('h1, h2, h3'))
			.map((el) => ({
				level: Number(el.tagName.slice(1)),
				text: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
			}))
			.filter((heading) => heading.text.length > 0);
	}

	function insertTableOfContents() {
		const headings = getDocumentHeadings();
		const items = headings.length
			? headings
			: [
					{ level: 1, text: 'Introduction' },
					{ level: 2, text: 'Key points' },
					{ level: 2, text: 'Conclusion' },
				];
		const tocItems = items
			.map((heading, index) => {
				const indent = Math.max(0, heading.level - 1) * 18;
				return `<div class="word-toc-row" style="padding-left:${indent}px"><span>${escapeHtml(heading.text)}</span><span class="word-toc-dots"></span><span>${index + 1}</span></div>`;
			})
			.join('');
		exec('insertHTML', `<div class="word-toc"><strong>Table of Contents</strong>${tocItems}</div><p>&nbsp;</p>`);
	}

	function insertFootnote() {
		const n = footnoteCounter++;
		exec(
			'insertHTML',
			`<sup class="word-footnote-ref">[${n}]</sup><p class="word-footnote"><sup>${n}</sup> Footnote text.</p>`,
		);
	}

	function insertCitation() {
		const n = citationCounter++;
		exec('insertHTML', `<span class="word-citation">(Author ${n}, 2026)</span>`);
	}

	function insertBibliography() {
		exec(
			'insertHTML',
			`<h2>Bibliography</h2><p class="word-bibliography-entry">Author. (2026). <em>Title of source</em>. Publisher.</p>`,
		);
	}

	function insertCaption() {
		const n = captionCounter++;
		exec('insertHTML', `<p class="word-caption"><strong>Figure ${n}.</strong> Caption text.</p>`);
	}

	// ── Headers / footers ──────────────────────────────────────────────

	function toggleHeader() {
		headerVisible = !headerVisible;
		if (headerVisible && !headerContent) {
			headerContent = 'Header';
		}
		openMenu = null;
	}

	function toggleFooter() {
		footerVisible = !footerVisible;
		if (footerVisible && !footerContent) {
			footerContent = 'Footer';
		}
		openMenu = null;
	}

	// ── Find & replace ─────────────────────────────────────────────────

	const HIGHLIGHT_CLASS = 'word-find-hit';
	const ACTIVE_HIGHLIGHT_CLASS = 'word-find-hit-active';

	function clearFindHighlights() {
		if (!editorEl) return;
		const hits = editorEl.querySelectorAll(`.${HIGHLIGHT_CLASS}, .${ACTIVE_HIGHLIGHT_CLASS}`);
		hits.forEach((hit) => {
			const parent = hit.parentNode;
			if (!parent) return;
			while (hit.firstChild) parent.insertBefore(hit.firstChild, hit);
			parent.removeChild(hit);
			parent.normalize();
		});
	}

	function highlightFindMatches(): number {
		clearFindHighlights();
		if (!editorEl || !findQuery) {
			findMatchCount = 0;
			findMatchIndex = 0;
			return 0;
		}
		const queryStr = findCaseSensitive ? findQuery : findQuery.toLowerCase();
		const escaped = queryStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const pattern = findWholeWord ? `\\b${escaped}\\b` : escaped;
		let re: RegExp;
		try {
			re = new RegExp(pattern, findCaseSensitive ? 'g' : 'gi');
		} catch {
			return 0;
		}
		const walker = document.createTreeWalker(editorEl, NodeFilter.SHOW_TEXT);
		const textNodes: Text[] = [];
		let n: Node | null;
		while ((n = walker.nextNode())) {
			const parent = n.parentElement;
			if (!parent) continue;
			// Skip inside our own highlight nodes or non-editable page-break markers
			if (parent.classList?.contains(HIGHLIGHT_CLASS) || parent.classList?.contains(ACTIVE_HIGHLIGHT_CLASS)) continue;
			if (parent.closest?.('.word-page-break')) continue;
			textNodes.push(n as Text);
		}
		let count = 0;
		for (const node of textNodes) {
			const text = node.nodeValue ?? '';
			if (!text) continue;
			re.lastIndex = 0;
			let m: RegExpExecArray | null;
			const matches: { start: number; end: number }[] = [];
			while ((m = re.exec(text)) !== null) {
				matches.push({ start: m.index, end: m.index + m[0].length });
				if (m[0].length === 0) re.lastIndex++;
			}
			if (matches.length === 0) continue;
			const frag = document.createDocumentFragment();
			let lastIdx = 0;
			for (const { start, end } of matches) {
				if (start > lastIdx) {
					frag.appendChild(document.createTextNode(text.slice(lastIdx, start)));
				}
				const mark = document.createElement('span');
				mark.className = HIGHLIGHT_CLASS;
				mark.textContent = text.slice(start, end);
				frag.appendChild(mark);
				lastIdx = end;
				count++;
			}
			if (lastIdx < text.length) {
				frag.appendChild(document.createTextNode(text.slice(lastIdx)));
			}
			node.parentNode?.replaceChild(frag, node);
		}
		findMatchCount = count;
		if (count === 0) findMatchIndex = 0;
		else if (findMatchIndex >= count) findMatchIndex = 0;
		markActiveHit();
		return count;
	}

	function markActiveHit() {
		if (!editorEl) return;
		const hits = editorEl.querySelectorAll(`.${HIGHLIGHT_CLASS}, .${ACTIVE_HIGHLIGHT_CLASS}`);
		hits.forEach((h, i) => {
			if (i === findMatchIndex) {
				h.className = ACTIVE_HIGHLIGHT_CLASS;
				(h as HTMLElement).scrollIntoView({ block: 'center', behavior: 'smooth' });
			} else {
				h.className = HIGHLIGHT_CLASS;
			}
		});
	}

	function findNext() {
		if (findMatchCount === 0) {
			highlightFindMatches();
			if (findMatchCount === 0) return;
		}
		findMatchIndex = (findMatchIndex + 1) % findMatchCount;
		markActiveHit();
	}

	function findPrev() {
		if (findMatchCount === 0) {
			highlightFindMatches();
			if (findMatchCount === 0) return;
		}
		findMatchIndex = (findMatchIndex - 1 + findMatchCount) % findMatchCount;
		markActiveHit();
	}

	function replaceCurrent() {
		if (!editorEl || findMatchCount === 0) return;
		const hits = Array.from(editorEl.querySelectorAll(`.${ACTIVE_HIGHLIGHT_CLASS}`));
		const target = hits[0] as HTMLElement | undefined;
		if (!target) return;
		const replacement = document.createTextNode(replaceQuery);
		target.parentNode?.replaceChild(replacement, target);
		highlightFindMatches();
		if (findMatchCount > 0) {
			markActiveHit();
		}
		refreshAll();
	}

	function replaceAll() {
		if (!editorEl) return;
		highlightFindMatches();
		const hits = Array.from(editorEl.querySelectorAll(`.${HIGHLIGHT_CLASS}, .${ACTIVE_HIGHLIGHT_CLASS}`));
		hits.forEach((hit) => {
			const txt = document.createTextNode(replaceQuery);
			hit.parentNode?.replaceChild(txt, hit);
		});
		clearFindHighlights();
		highlightFindMatches();
		refreshAll();
	}

	function toggleFindPane() {
		showFindPane = !showFindPane;
		if (!showFindPane) {
			showReplacePane = false;
			clearFindHighlights();
			findMatchCount = 0;
		} else {
			tick().then(() => findInputRef?.focus());
		}
	}

	function toggleReplacePane() {
		showFindPane = true;
		showReplacePane = !showReplacePane;
		if (showReplacePane) {
			tick().then(() => findInputRef?.focus());
		}
	}

	function closeFindReplace() {
		showFindPane = false;
		showReplacePane = false;
		clearFindHighlights();
		findMatchCount = 0;
	}

	$effect(() => {
		// Re-highlight when query / flags change
		void findQuery;
		void findCaseSensitive;
		void findWholeWord;
		if (showFindPane) {
			highlightFindMatches();
		}
	});

	// ── Outline navigation ─────────────────────────────────────────────

	function jumpToHeading(id: string) {
		if (!editorEl) return;
		const el = editorEl.querySelector(`#${CSS.escape(id)}`) as HTMLElement | null;
		if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	// ── Save / Open / Autosave ────────────────────────────────────────

	function getFullContent(): string {
		// Strip find-highlights so they don't get persisted
		if (!editorEl) return docContent;
		const tmp = editorEl.cloneNode(true) as HTMLElement;
		tmp.querySelectorAll(`.${HIGHLIGHT_CLASS}, .${ACTIVE_HIGHLIGHT_CLASS}`).forEach((h) => {
			const parent = h.parentNode;
			if (!parent) return;
			while (h.firstChild) parent.insertBefore(h.firstChild, h);
			parent.removeChild(h);
		});
		return tmp.innerHTML;
	}

	function doSave() {
		const content = getFullContent();
		if (docPath) {
			writeFile(docPath, content);
			lastSavedContent = content;
			lastAutosavedContent = content;
			isDirty = false;
			savedFlashUntil = Date.now() + 1500;
			notify({ appName: 'Word', appIcon: '📝', title: 'Saved', body: `Saved to ${docPath}` });
		} else {
			showSaveAsDialog = true;
			saveAsName = docTitle.endsWith('.docx') ? docTitle : `${docTitle}.docx`;
			tick().then(() => saveAsNameRef?.focus());
		}
		openMenu = null;
	}

	function doSaveAs() {
		showSaveAsDialog = true;
		saveAsName = docTitle.endsWith('.docx') ? docTitle : `${docTitle || 'Untitled'}.docx`;
		if (!docPath) saveAsDir = 'C:/Users/User/Documents';
		else saveAsDir = docPath.substring(0, docPath.lastIndexOf('/'));
		openMenu = null;
		tick().then(() => saveAsNameRef?.focus());
	}

	function confirmSaveAs() {
		const name = saveAsName.trim();
		if (!name) return;
		const dir = saveAsDir.trim() || 'C:/Users/User/Documents';
		mkdir(dir);
		const full = `${dir}/${name}`;
		const content = getFullContent();
		writeFile(full, content);
		docPath = full;
		docTitle = name;
		lastSavedContent = content;
		lastAutosavedContent = content;
		isDirty = false;
		savedFlashUntil = Date.now() + 1500;
		showSaveAsDialog = false;
		notify({ appName: 'Word', appIcon: '📝', title: 'Saved', body: `Saved to ${full}` });
	}

	function cancelSaveAs() {
		showSaveAsDialog = false;
	}

	function doOpen() {
		openDialogPath = 'C:/Users/User/Documents';
		showOpenDialog = true;
		openMenu = null;
	}

	function pickOpenEntry(entry: FSNode) {
		if (entry.type === 'dir') {
			openDialogPath = `${openDialogPath}/${entry.name}`;
			return;
		}
		const fullPath = `${openDialogPath}/${entry.name}`;
		loadDocument(fullPath);
		showOpenDialog = false;
	}

	function openDialogUp() {
		const parts = openDialogPath.split('/').filter(Boolean);
		if (parts.length <= 1) return;
		parts.pop();
		openDialogPath = parts.join('/');
	}

	let openDialogEntries = $derived.by((): FSNode[] => {
		void vfs_store.version;
		const items = ls(openDialogPath);
		const dirs = items.filter((e) => e.type === 'dir').sort((a, b) => a.name.localeCompare(b.name));
		const files = items
			.filter((e) => e.type === 'file' && /\.(docx?|rtf|txt|md)$/i.test(e.name))
			.sort((a, b) => a.name.localeCompare(b.name));
		return [...dirs, ...files];
	});

	function loadDocument(path: string) {
		const node = stat(path);
		if (!node || node.type !== 'file') return;
		const content = readFile(path) ?? '';
		const looksHtml = /<\w+[^>]*>/.test(content);
		docContent = looksHtml ? content : escapeToHtml(content);
		docPath = path;
		docTitle = node.name;
		lastSavedContent = docContent;
		lastAutosavedContent = docContent;
		isDirty = false;
		tick().then(() => {
			if (editorEl) editorEl.innerHTML = docContent;
			refreshAll();
		});
	}

	function escapeToHtml(text: string): string {
		const escaped = text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
		return escaped
			.split(/\n\n+/)
			.map((para) => `<p>${para.replace(/\n/g, '<br>')}</p>`)
			.join('');
	}

	function doNewDocument() {
		if (isDirty) {
			const ok = window.confirm('Discard unsaved changes?');
			if (!ok) {
				openMenu = null;
				return;
			}
		}
		docContent = '<h1>Untitled Document</h1><p>Start typing here…</p>';
		docPath = null;
		docTitle = 'Untitled';
		lastSavedContent = '';
		lastAutosavedContent = '';
		isDirty = false;
		headerContent = '';
		footerContent = '';
		headerVisible = false;
		footerVisible = false;
		tick().then(() => {
			if (editorEl) editorEl.innerHTML = docContent;
			refreshAll();
		});
		openMenu = null;
	}

	function maybeAutosave() {
		if (!docPath) return;
		const content = getFullContent();
		if (content === lastAutosavedContent) return;
		writeFile(docPath, content);
		lastAutosavedContent = content;
		lastSavedContent = content;
		isDirty = false;
	}

	// ── Input handlers ─────────────────────────────────────────────────

	function onEditorInput() {
		if (suppressInput) return;
		isDirty = true;
		refreshAll();
	}

	function onEditorKeyDown(e: KeyboardEvent) {
		if (e.ctrlKey || e.metaKey) {
			if (e.key === 's' || e.key === 'S') {
				e.preventDefault();
				doSave();
				return;
			}
			if (e.key === 'f' || e.key === 'F') {
				e.preventDefault();
				showFindPane = true;
				showReplacePane = false;
				tick().then(() => findInputRef?.focus());
				return;
			}
			if (e.key === 'h' || e.key === 'H') {
				e.preventDefault();
				showFindPane = true;
				showReplacePane = true;
				tick().then(() => findInputRef?.focus());
				return;
			}
			if (e.key === 'p' || e.key === 'P') {
				e.preventDefault();
				window.print?.();
				return;
			}
			if (e.key === 'b' || e.key === 'B') { e.preventDefault(); doBold(); return; }
			if (e.key === 'i' || e.key === 'I') { e.preventDefault(); doItalic(); return; }
			if (e.key === 'u' || e.key === 'U') { e.preventDefault(); doUnderline(); return; }
			if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); doUndo(); return; }
			if (e.key === 'y' || e.key === 'Y') { e.preventDefault(); doRedo(); return; }
		}
		if (e.key === 'Escape') {
			if (showFindPane || showReplacePane) {
				e.preventDefault();
				closeFindReplace();
			}
			if (formatPainterStyle) {
				formatPainterStyle = null;
			}
		}
		if (e.key === 'F3' && showFindPane) {
			e.preventDefault();
			e.shiftKey ? findPrev() : findNext();
		}
	}

	function onEditorClick() {
		// Capture format painter source if active was true at moment of click? No — handled by mouseup.
	}

	function onEditorMouseUp() {
		updateActiveStates();
		activeTableEl = getSelectionTable();
		if (formatPainterStyle) {
			maybeApplyFormatPainter();
		}
	}

	function onEditorSelectionChange() {
		if (!isSelectionInsideEditor()) return;
		updateActiveStates();
		activeTableEl = getSelectionTable();
	}

	// Paste handler — keep some HTML but strip script/style and most attributes
	function onEditorPaste(e: ClipboardEvent) {
		const html = e.clipboardData?.getData('text/html');
		const text = e.clipboardData?.getData('text/plain') ?? '';
		if (html) {
			e.preventDefault();
			const cleaned = cleanPastedHtml(html);
			document.execCommand('insertHTML', false, cleaned);
			refreshAll();
		} else if (text) {
			e.preventDefault();
			document.execCommand('insertText', false, text);
			refreshAll();
		}
	}

	function cleanPastedHtml(html: string): string {
		const div = document.createElement('div');
		div.innerHTML = html;
		// Drop scripts, styles, comments
		div.querySelectorAll('script, style, meta, link, head').forEach((n) => n.remove());
		// Strip dangerous attributes
		const allowAttrs = new Set(['href', 'src', 'alt', 'colspan', 'rowspan', 'class']);
		const walk = (el: Element) => {
			Array.from(el.attributes).forEach((a) => {
				if (a.name.startsWith('on')) {
					el.removeAttribute(a.name);
					return;
				}
				if (!allowAttrs.has(a.name) && a.name !== 'style') {
					el.removeAttribute(a.name);
				}
			});
			Array.from(el.children).forEach((c) => walk(c));
		};
		Array.from(div.children).forEach((c) => walk(c));
		return div.innerHTML;
	}

	// ── Header / footer input ──────────────────────────────────────────

	function onHeaderInput() {
		if (headerEditorEl) headerContent = headerEditorEl.innerHTML;
		isDirty = true;
	}

	function onFooterInput() {
		if (footerEditorEl) footerContent = footerEditorEl.innerHTML;
		isDirty = true;
	}

	// ── Margins ────────────────────────────────────────────────────────

	function setMargin(p: 'narrow' | 'normal' | 'wide') {
		marginPreset = p;
		openMenu = null;
	}

	let marginValues = $derived.by(() => {
		switch (marginPreset) {
			case 'narrow': return { top: 40, right: 40, bottom: 40, left: 40 };
			case 'wide': return { top: 120, right: 120, bottom: 120, left: 120 };
			default: return { top: 80, right: 80, bottom: 80, left: 80 };
		}
	});

	function setOrientation(o: Orientation) {
		orientation = o;
		openMenu = null;
		tick().then(() => updatePageCount());
	}

	function setColumns(c: ColumnsCount) {
		columns = c;
		openMenu = null;
	}

	// ── View mode ──────────────────────────────────────────────────────

	function setViewMode(v: ViewMode) {
		viewMode = v;
		openMenu = null;
	}

	function toggleRuler() {
		showRuler = !showRuler;
	}

	function toggleOutline() {
		showOutline = !showOutline;
	}

	function toggleDarkMode() {
		darkMode = !darkMode;
	}

	function zoomIn() { zoom = Math.min(200, zoom + 10); }
	function zoomOut() { zoom = Math.max(50, zoom - 10); }

	// ── Lifecycle ──────────────────────────────────────────────────────

	let docSelectionHandler: ((e: Event) => void) | null = null;
	let docClickHandler: ((e: MouseEvent) => void) | null = null;

	onMount(() => {
		// Pending file from launcher?
		const pending = consumePendingFile();
		if (pending?.path) {
			loadDocument(pending.path);
		} else {
			if (editorEl) editorEl.innerHTML = docContent;
			lastSavedContent = docContent;
			lastAutosavedContent = docContent;
		}
		refreshAll();

		// Listen for selection changes globally (only act when inside editor)
		docSelectionHandler = () => onEditorSelectionChange();
		document.addEventListener('selectionchange', docSelectionHandler);

		// Close open menus when clicking outside
		docClickHandler = (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			if (!target.closest('.word-menu') && !target.closest('.word-menu-trigger')) {
				openMenu = null;
			}
		};
		document.addEventListener('mousedown', docClickHandler);

		// Autosave
		autosaveTimer = window.setInterval(() => {
			maybeAutosave();
		}, AUTOSAVE_INTERVAL_MS);
	});

	onDestroy(() => {
		if (autosaveTimer !== null) {
			window.clearInterval(autosaveTimer);
			autosaveTimer = null;
		}
		if (docSelectionHandler) {
			document.removeEventListener('selectionchange', docSelectionHandler);
		}
		if (docClickHandler) {
			document.removeEventListener('mousedown', docClickHandler);
		}
	});

	// ── Derived UI ─────────────────────────────────────────────────────

	let pageWidth = $derived(orientation === 'landscape' ? PAGE_HEIGHT_PX : PAGE_WIDTH_PX);
	let pageHeight = $derived(orientation === 'landscape' ? PAGE_WIDTH_PX : PAGE_HEIGHT_PX);
	let pageBgStyle = $derived.by(() => {
		// Faint page-break line every pageHeight px
		const c = darkMode ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';
		return `background-image: repeating-linear-gradient(to bottom, transparent 0, transparent ${pageHeight - 1}px, ${c} ${pageHeight - 1}px, ${c} ${pageHeight}px);`;
	});
	let editorStyle = $derived.by(() => {
		const m = marginValues;
		let style = `padding: ${m.top}px ${m.right}px ${m.bottom}px ${m.left}px;`;
		style += ` min-height: ${pageHeight}px;`;
		style += ` width: ${pageWidth}px;`;
		style += ` ${pageBgStyle}`;
		if (columns > 1) {
			style += ` column-count: ${columns}; column-gap: 32px;`;
		}
		return style;
	});

	let savedFlashActive = $derived(savedFlashUntil > Date.now());

	// Periodic tick to clear savedFlashActive (cheap)
	$effect(() => {
		if (savedFlashUntil > 0) {
			const ms = Math.max(0, savedFlashUntil - Date.now());
			const t = window.setTimeout(() => { savedFlashUntil = 0; }, ms + 50);
			return () => window.clearTimeout(t);
		}
	});

	let tableTabVisible = $derived(activeTableEl !== null);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="word-app" class:dark={darkMode} class:read-mode={isReadMode}>
	<input
		bind:this={imageInputRef}
		type="file"
		accept="image/*"
		style="display:none"
		onchange={handleImageSelected}
	/>

	{#if !isReadMode}
	<!-- ── Title bar ──────────────────────────────────────────────── -->
	<div class="word-titlebar">
		<div class="title-left">
			<span class="title-icon">📝</span>
			<span class="title-text">{docTitle}{isDirty ? ' •' : ''} — Word</span>
		</div>
		<div class="title-right">
			{#if savedFlashActive}
				<span class="saved-flash">✓ Saved</span>
			{/if}
			<button class="title-btn" onclick={doSave} title="Save (Ctrl+S)">💾 Save</button>
		</div>
	</div>

	<!-- ── Ribbon tabs ────────────────────────────────────────────── -->
	<div class="word-ribbon-tabs">
		<button class="ribbon-tab" class:active={activeTab === 'home'} onclick={() => activeTab = 'home'}>Home</button>
		<button class="ribbon-tab" class:active={activeTab === 'insert'} onclick={() => activeTab = 'insert'}>Insert</button>
		<button class="ribbon-tab" class:active={activeTab === 'layout'} onclick={() => activeTab = 'layout'}>Layout</button>
		<button class="ribbon-tab" class:active={activeTab === 'references'} onclick={() => activeTab = 'references'}>References</button>
		<button class="ribbon-tab" class:active={activeTab === 'view'} onclick={() => activeTab = 'view'}>View</button>
		{#if tableTabVisible}
			<button class="ribbon-tab table-tab" class:active={activeTab === 'home'} onclick={() => activeTab = 'home'}>Table Tools</button>
		{/if}
		<div class="tabs-spacer"></div>
		<button class="ribbon-tab" onclick={doNewDocument} title="New document">＋ New</button>
		<button class="ribbon-tab" onclick={doOpen} title="Open">📂 Open</button>
		<button class="ribbon-tab" onclick={doSaveAs} title="Save As">💾 Save As</button>
	</div>

	<!-- ── Ribbon body ────────────────────────────────────────────── -->
	<div class="word-ribbon">
		{#if activeTab === 'home'}
			<div class="ribbon-group">
				<button class="ico-btn" onclick={doUndo} title="Undo (Ctrl+Z)">↶</button>
				<button class="ico-btn" onclick={doRedo} title="Redo (Ctrl+Y)">↷</button>
				<button class="ico-btn fmt-painter" class:active={formatPainterActive} onclick={toggleFormatPainter} title="Format Painter">🖌</button>
				<div class="group-label">Clipboard</div>
			</div>

			<div class="ribbon-sep"></div>

			<div class="ribbon-group">
				<div class="font-row">
					<select class="font-select" bind:value={fontFamily} onchange={changeFontFamily}>
						{#each FONTS as f (f)}
							<option value={f} style:font-family={f}>{f}</option>
						{/each}
					</select>
					<select class="size-select" bind:value={fontSize} onchange={changeFontSize}>
						{#each SIZES as s (s)}
							<option value={s}>{s}</option>
						{/each}
					</select>
				</div>
				<div class="format-row">
					<button class="ico-btn" class:active={activeBold} onclick={doBold} title="Bold (Ctrl+B)"><strong>B</strong></button>
					<button class="ico-btn" class:active={activeItalic} onclick={doItalic} title="Italic (Ctrl+I)"><em>I</em></button>
					<button class="ico-btn" class:active={activeUnderline} onclick={doUnderline} title="Underline (Ctrl+U)"><u>U</u></button>
					<button class="ico-btn" class:active={activeStrike} onclick={doStrike} title="Strikethrough"><s>S</s></button>
					<button class="ico-btn" class:active={activeSubscript} onclick={doSub} title="Subscript">x₂</button>
					<button class="ico-btn" class:active={activeSuperscript} onclick={doSuper} title="Superscript">x²</button>
					<div class="swatch-trigger-wrapper">
						<button class="ico-btn swatch-trigger" onclick={() => openMenu = openMenu === 'fcolor' ? null : 'fcolor'} title="Font color">
							<span>A</span>
							<span class="swatch-indicator" style:background={textColor}></span>
						</button>
						{#if openMenu === 'fcolor'}
							<div class="word-menu swatch-menu">
								<div class="swatch-grid">
									{#each SWATCH_COLORS as c (c)}
										<button class="swatch-cell" style:background={c} onclick={() => changeTextColor(c)} title={c} aria-label={`Text color ${c}`}></button>
									{/each}
								</div>
								<label class="swatch-custom">
									Custom:
									<input type="color" bind:value={textColor} onchange={() => changeTextColor(textColor)} />
								</label>
							</div>
						{/if}
					</div>
					<div class="swatch-trigger-wrapper">
						<button class="ico-btn swatch-trigger" onclick={() => openMenu = openMenu === 'hcolor' ? null : 'hcolor'} title="Highlight color">
							<span>🖍</span>
							<span class="swatch-indicator" style:background={highlightColor}></span>
						</button>
						{#if openMenu === 'hcolor'}
							<div class="word-menu swatch-menu">
								<div class="swatch-grid">
									{#each HIGHLIGHT_COLORS as c (c)}
										<button class="swatch-cell" style:background={c === 'transparent' ? 'white' : c} class:transparent={c === 'transparent'} onclick={() => changeHighlight(c)} title={c} aria-label={`Highlight ${c}`}></button>
									{/each}
								</div>
							</div>
						{/if}
					</div>
					<button class="ico-btn" onclick={doRemoveFormat} title="Clear formatting">⌫</button>
				</div>
				<div class="group-label">Font</div>
			</div>

			<div class="ribbon-sep"></div>

			<div class="ribbon-group">
				<div class="format-row">
					<button class="ico-btn" onclick={doBulletList} title="Bullet list">• ≡</button>
					<button class="ico-btn" onclick={doNumberList} title="Numbered list">1. ≡</button>
					<button class="ico-btn" onclick={doOutdent} title="Decrease indent">⇤</button>
					<button class="ico-btn" onclick={doIndent} title="Increase indent">⇥</button>
					<div class="swatch-trigger-wrapper">
						<button class="ico-btn swatch-trigger" onclick={() => openMenu = openMenu === 'spacing' ? null : 'spacing'} title="Line spacing">↕ {lineSpacing}</button>
						{#if openMenu === 'spacing'}
							<div class="word-menu spacing-menu">
								{#each LINE_SPACINGS as s (s.value)}
									<button class="menu-item" class:active={s.value === lineSpacing} onclick={() => changeLineSpacing(s.value)}>{s.label}</button>
								{/each}
							</div>
						{/if}
					</div>
				</div>
				<div class="format-row">
					<button class="ico-btn" class:active={activeAlign === 'left'} onclick={doAlignLeft} title="Align left">⫷</button>
					<button class="ico-btn" class:active={activeAlign === 'center'} onclick={doAlignCenter} title="Align center">⫸</button>
					<button class="ico-btn" class:active={activeAlign === 'right'} onclick={doAlignRight} title="Align right">⫹</button>
					<button class="ico-btn" class:active={activeAlign === 'justify'} onclick={doAlignJustify} title="Justify">≣</button>
				</div>
				<div class="group-label">Paragraph</div>
			</div>

			<div class="ribbon-sep"></div>

			<div class="ribbon-group">
				<div class="heading-grid">
					<button class="style-card" class:active={activeHeading === 'p'} onclick={() => changeHeading('p')}>Normal</button>
					<button class="style-card h1" class:active={activeHeading === 'h1'} onclick={() => changeHeading('h1')}>Heading 1</button>
					<button class="style-card h2" class:active={activeHeading === 'h2'} onclick={() => changeHeading('h2')}>Heading 2</button>
					<button class="style-card h3" class:active={activeHeading === 'h3'} onclick={() => changeHeading('h3')}>Heading 3</button>
				</div>
				<div class="group-label">Styles</div>
			</div>

			<div class="ribbon-sep"></div>

			<div class="ribbon-group">
				<button class="ico-btn wide" onclick={() => { showFindPane = true; showReplacePane = false; tick().then(() => findInputRef?.focus()); }} title="Find (Ctrl+F)">🔍 Find</button>
				<button class="ico-btn wide" onclick={() => { showFindPane = true; showReplacePane = true; tick().then(() => findInputRef?.focus()); }} title="Replace (Ctrl+H)">🔁 Replace</button>
				<div class="group-label">Editing</div>
			</div>

			{#if tableTabVisible}
			<div class="ribbon-sep"></div>
			<div class="ribbon-group">
				<div class="format-row">
					<button class="ico-btn wide" onclick={addRowAbove} title="Insert row above">⤴ Row</button>
					<button class="ico-btn wide" onclick={addRowBelow} title="Insert row below">⤵ Row</button>
				</div>
				<div class="format-row">
					<button class="ico-btn wide" onclick={addColLeft} title="Insert column left">⬅ Col</button>
					<button class="ico-btn wide" onclick={addColRight} title="Insert column right">➡ Col</button>
				</div>
				<div class="format-row">
					<button class="ico-btn wide danger" onclick={deleteRow} title="Delete row">🗑 Row</button>
					<button class="ico-btn wide danger" onclick={deleteColumn} title="Delete column">🗑 Col</button>
					<button class="ico-btn wide danger" onclick={deleteTable} title="Delete table">🗑 Table</button>
				</div>
				<div class="group-label">Table</div>
			</div>
			{/if}
		{:else if activeTab === 'insert'}
			<div class="ribbon-group">
				<div class="swatch-trigger-wrapper">
					<button class="big-btn" onclick={() => openMenu = openMenu === 'table' ? null : 'table'}>
						<span class="big-btn-icon">▦</span>
						<span class="big-btn-label">Table</span>
					</button>
					{#if openMenu === 'table'}
						<div class="word-menu table-menu">
							<div class="table-grid">
								{#each Array(5) as _, r (r)}
									{#each Array(5) as _, c (c)}
										<div
											class="grid-cell"
											class:hovered={r < tableGridHover.rows && c < tableGridHover.cols}
											onmouseenter={() => tableGridHover = { rows: r + 1, cols: c + 1 }}
											onclick={() => insertTable(r + 1, c + 1)}
											role="button"
											tabindex="0"
											aria-label={`Insert ${r + 1} by ${c + 1} table`}
										></div>
									{/each}
								{/each}
							</div>
							<div class="table-grid-label">
								{tableGridHover.rows} × {tableGridHover.cols} table
							</div>
						</div>
					{/if}
				</div>
				<div class="group-label">Tables</div>
			</div>

			<div class="ribbon-sep"></div>

			<div class="ribbon-group">
				<button class="big-btn" onclick={triggerImageUpload}>
					<span class="big-btn-icon">🖼</span>
					<span class="big-btn-label">Image</span>
				</button>
				<button class="big-btn" onclick={insertHr}>
					<span class="big-btn-icon">―</span>
					<span class="big-btn-label">H. Line</span>
				</button>
				<button class="big-btn" onclick={insertPageBreak}>
					<span class="big-btn-icon">⤓</span>
					<span class="big-btn-label">Page Break</span>
				</button>
				<div class="group-label">Illustrations</div>
			</div>

			<div class="ribbon-sep"></div>

			<div class="ribbon-group">
				<button class="big-btn" class:active={headerVisible} onclick={toggleHeader}>
					<span class="big-btn-icon">⌐</span>
					<span class="big-btn-label">Header</span>
				</button>
				<button class="big-btn" class:active={footerVisible} onclick={toggleFooter}>
					<span class="big-btn-icon">¬</span>
					<span class="big-btn-label">Footer</span>
				</button>
				<div class="group-label">Header &amp; Footer</div>
			</div>

			<div class="ribbon-sep"></div>

			<div class="ribbon-group">
				<div class="swatch-trigger-wrapper">
					<button class="big-btn" onclick={() => openMenu = openMenu === 'symbol' ? null : 'symbol'}>
						<span class="big-btn-icon">Ω</span>
						<span class="big-btn-label">Symbol</span>
					</button>
					{#if openMenu === 'symbol'}
						<div class="word-menu symbol-menu">
							{#each ['©', '®', '™', '§', '¶', '†', '‡', '•', '°', '±', '×', '÷', '≠', '≤', '≥', '∞', '←', '→', '↑', '↓', 'α', 'β', 'γ', 'δ', 'π', 'Σ', 'Ω', '€', '£', '¥'] as s (s)}
								<button class="symbol-cell" onclick={() => insertSymbol(s)}>{s}</button>
							{/each}
						</div>
					{/if}
				</div>
				<div class="group-label">Symbols</div>
			</div>
		{:else if activeTab === 'layout'}
			<div class="ribbon-group">
				<div class="swatch-trigger-wrapper">
					<button class="big-btn" onclick={() => openMenu = openMenu === 'margins' ? null : 'margins'}>
						<span class="big-btn-icon">▢</span>
						<span class="big-btn-label">Margins</span>
					</button>
					{#if openMenu === 'margins'}
						<div class="word-menu margins-menu">
							<button class="menu-item" class:active={marginPreset === 'narrow'} onclick={() => setMargin('narrow')}>
								<strong>Narrow</strong>
								<span class="sub">Top/Bottom: 0.5"  ·  Left/Right: 0.5"</span>
							</button>
							<button class="menu-item" class:active={marginPreset === 'normal'} onclick={() => setMargin('normal')}>
								<strong>Normal</strong>
								<span class="sub">Top/Bottom: 1"  ·  Left/Right: 1"</span>
							</button>
							<button class="menu-item" class:active={marginPreset === 'wide'} onclick={() => setMargin('wide')}>
								<strong>Wide</strong>
								<span class="sub">Top/Bottom: 1.5"  ·  Left/Right: 1.5"</span>
							</button>
						</div>
					{/if}
				</div>
				<div class="swatch-trigger-wrapper">
					<button class="big-btn" onclick={() => openMenu = openMenu === 'orient' ? null : 'orient'}>
						<span class="big-btn-icon">{orientation === 'portrait' ? '▯' : '▭'}</span>
						<span class="big-btn-label">Orientation</span>
					</button>
					{#if openMenu === 'orient'}
						<div class="word-menu margins-menu">
							<button class="menu-item" class:active={orientation === 'portrait'} onclick={() => setOrientation('portrait')}>
								<strong>▯ Portrait</strong>
							</button>
							<button class="menu-item" class:active={orientation === 'landscape'} onclick={() => setOrientation('landscape')}>
								<strong>▭ Landscape</strong>
							</button>
						</div>
					{/if}
				</div>
				<div class="swatch-trigger-wrapper">
					<button class="big-btn" onclick={() => openMenu = openMenu === 'cols' ? null : 'cols'}>
						<span class="big-btn-icon">▦</span>
						<span class="big-btn-label">Columns</span>
					</button>
					{#if openMenu === 'cols'}
						<div class="word-menu margins-menu">
							<button class="menu-item" class:active={columns === 1} onclick={() => setColumns(1)}>
								<strong>One</strong>
								<span class="sub">▮</span>
							</button>
							<button class="menu-item" class:active={columns === 2} onclick={() => setColumns(2)}>
								<strong>Two</strong>
								<span class="sub">▮ ▮</span>
							</button>
							<button class="menu-item" class:active={columns === 3} onclick={() => setColumns(3)}>
								<strong>Three</strong>
								<span class="sub">▮ ▮ ▮</span>
							</button>
						</div>
					{/if}
				</div>
				<div class="group-label">Page Setup</div>
			</div>

			<div class="ribbon-sep"></div>

			<div class="ribbon-group">
				<button class="big-btn" onclick={insertPageBreak}>
					<span class="big-btn-icon">⤓</span>
					<span class="big-btn-label">Breaks</span>
				</button>
				<div class="group-label">Page Setup</div>
			</div>
		{:else if activeTab === 'references'}
			<div class="ribbon-group">
				<button class="big-btn" onclick={insertTableOfContents}>
					<span class="big-btn-icon">≡</span>
					<span class="big-btn-label">Table of Contents</span>
				</button>
				<button class="big-btn" onclick={insertFootnote}>
					<span class="big-btn-icon">⓭</span>
					<span class="big-btn-label">Footnote</span>
				</button>
				<button class="big-btn" onclick={insertCitation}>
					<span class="big-btn-icon">📑</span>
					<span class="big-btn-label">Citation</span>
				</button>
				<button class="big-btn" onclick={insertBibliography}>
					<span class="big-btn-icon">📚</span>
					<span class="big-btn-label">Bibliography</span>
				</button>
				<button class="big-btn" onclick={insertCaption}>
					<span class="big-btn-icon">🔖</span>
					<span class="big-btn-label">Caption</span>
				</button>
				<div class="group-label">References</div>
			</div>
		{:else if activeTab === 'view'}
			<div class="ribbon-group">
				<button class="big-btn" class:active={viewMode === 'print'} onclick={() => setViewMode('print')}>
					<span class="big-btn-icon">🗐</span>
					<span class="big-btn-label">Print Layout</span>
				</button>
				<button class="big-btn" class:active={viewMode === 'web'} onclick={() => setViewMode('web')}>
					<span class="big-btn-icon">🌐</span>
					<span class="big-btn-label">Web Layout</span>
				</button>
				<button class="big-btn" class:active={isReadMode} onclick={() => setViewMode('read')}>
					<span class="big-btn-icon">📖</span>
					<span class="big-btn-label">Read Mode</span>
				</button>
				<div class="group-label">Views</div>
			</div>

			<div class="ribbon-sep"></div>

			<div class="ribbon-group">
				<button class="big-btn" class:active={showRuler} onclick={toggleRuler}>
					<span class="big-btn-icon">⊢</span>
					<span class="big-btn-label">Ruler</span>
				</button>
				<button class="big-btn" class:active={showOutline} onclick={toggleOutline}>
					<span class="big-btn-icon">⊟</span>
					<span class="big-btn-label">Navigation</span>
				</button>
				<button class="big-btn" class:active={darkMode} onclick={toggleDarkMode}>
					<span class="big-btn-icon">{darkMode ? '☀' : '☾'}</span>
					<span class="big-btn-label">{darkMode ? 'Light' : 'Dark'} Mode</span>
				</button>
				<div class="group-label">Show</div>
			</div>

			<div class="ribbon-sep"></div>

			<div class="ribbon-group">
				<div class="zoom-row">
					<button class="ico-btn" onclick={zoomOut}>−</button>
					<input type="range" min="50" max="200" step="10" bind:value={zoom} class="zoom-slider" />
					<button class="ico-btn" onclick={zoomIn}>+</button>
					<span class="zoom-label">{zoom}%</span>
				</div>
				<div class="group-label">Zoom</div>
			</div>
		{/if}
	</div>

	<!-- ── Find/Replace pane ───────────────────────────────────────── -->
	{#if showFindPane}
		<div class="find-pane">
			<div class="find-row">
				<input
					bind:this={findInputRef}
					type="text"
					placeholder="Find"
					bind:value={findQuery}
					class="find-input"
					onkeydown={(e) => { if (e.key === 'Enter') { e.shiftKey ? findPrev() : findNext(); } }}
				/>
				<button class="ico-btn" onclick={findPrev} title="Previous (Shift+Enter)">↑</button>
				<button class="ico-btn" onclick={findNext} title="Next (Enter)">↓</button>
				<span class="find-count">
					{findMatchCount > 0 ? `${findMatchIndex + 1} / ${findMatchCount}` : '0 results'}
				</span>
				<label class="find-toggle">
					<input type="checkbox" bind:checked={findCaseSensitive} />Aa
				</label>
				<label class="find-toggle">
					<input type="checkbox" bind:checked={findWholeWord} />Word
				</label>
				<button class="ico-btn close-btn" onclick={closeFindReplace} title="Close">✕</button>
			</div>
			{#if showReplacePane}
				<div class="find-row">
					<input
						bind:this={replaceInputRef}
						type="text"
						placeholder="Replace with"
						bind:value={replaceQuery}
						class="find-input"
						onkeydown={(e) => { if (e.key === 'Enter') replaceCurrent(); }}
					/>
					<button class="ico-btn wide" onclick={replaceCurrent}>Replace</button>
					<button class="ico-btn wide" onclick={replaceAll}>Replace All</button>
				</div>
			{:else}
				<div class="find-row">
					<button class="ico-btn wide" onclick={toggleReplacePane}>Show Replace</button>
				</div>
			{/if}
		</div>
	{/if}

	<!-- ── Ruler ──────────────────────────────────────────────────── -->
	{#if showRuler && !isReadMode}
		<div class="ruler" style:width="{pageWidth * (zoom / 100)}px">
			{#each Array(Math.floor(pageWidth / 96)) as _, i (i)}
				<div class="ruler-tick">{i + 1}</div>
			{/each}
		</div>
	{/if}
	{/if}

	<!-- ── Main area (outline | doc) ───────────────────────────────── -->
	<div class="word-body">
		{#if showOutline && !isReadMode}
			<aside class="outline-pane">
				<div class="outline-header">
					Navigation
					<button class="ico-btn" onclick={toggleOutline} title="Close">✕</button>
				</div>
				<div class="outline-list">
					{#if outline.length === 0}
						<div class="outline-empty">No headings yet. Apply Heading 1–3 styles to start building an outline.</div>
					{:else}
						{#each outline as h (h.id)}
							<button class="outline-item lvl-{h.level}" onclick={() => jumpToHeading(h.id)}>
								{h.text}
							</button>
						{/each}
					{/if}
				</div>
			</aside>
		{/if}

		<div class="document-scroll" class:webmode={viewMode === 'web'}>
			<div class="document-stage" style:transform="scale({zoom / 100})" style:transform-origin="top center">
				<div class="document-shell" class:webmode={viewMode === 'web'} class:readmode={isReadMode}>
					{#if headerVisible && !isReadMode}
						<div class="word-header-area" style:width="{pageWidth}px">
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<div
								bind:this={headerEditorEl}
								class="word-header-edit"
								contenteditable="true"
								oninput={onHeaderInput}
								bind:innerHTML={headerContent}
							></div>
						</div>
					{/if}

					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<div
						bind:this={editorEl}
						class="word-page"
						class:webmode={viewMode === 'web'}
						class:readmode={isReadMode}
						style={editorStyle}
						contenteditable="true"
						oninput={onEditorInput}
						onkeydown={onEditorKeyDown}
						onmouseup={onEditorMouseUp}
						onclick={onEditorClick}
						onpaste={onEditorPaste}
					></div>

					{#if footerVisible && !isReadMode}
						<div class="word-footer-area" style:width="{pageWidth}px">
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<div
								bind:this={footerEditorEl}
								class="word-footer-edit"
								contenteditable="true"
								oninput={onFooterInput}
								bind:innerHTML={footerContent}
							></div>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>

	{#if !isReadMode}
	<!-- ── Status bar ─────────────────────────────────────────────── -->
	<div class="word-status">
		<span class="status-cell">Page {Math.min(findMatchCount === 0 ? 1 : 1, pageCount)} of {pageCount}</span>
		<span class="status-cell">{wordCount} words</span>
		<span class="status-cell">{charCount} chars</span>
		<span class="status-cell">{charNoSpaceCount} no spaces</span>
		<span class="status-cell">{paragraphCount} paragraphs</span>
		<span class="status-cell">{isDirty ? 'Modified' : 'Saved'}</span>
		<div class="status-spacer"></div>
		<div class="status-zoom">
			<button class="ico-btn small" onclick={zoomOut}>−</button>
			<input type="range" min="50" max="200" step="10" bind:value={zoom} class="zoom-slider" />
			<button class="ico-btn small" onclick={zoomIn}>+</button>
			<span class="zoom-label">{zoom}%</span>
		</div>
	</div>
	{/if}

	<!-- ── Read-mode floating exit ────────────────────────────────── -->
	{#if isReadMode}
		<button class="read-exit" onclick={() => setViewMode('print')}>← Exit Read Mode</button>
	{/if}

	<!-- ── Save As dialog ─────────────────────────────────────────── -->
	{#if showSaveAsDialog}
		<div class="modal-backdrop" onclick={cancelSaveAs}>
			<div class="modal" onclick={(e) => e.stopPropagation()}>
				<h3>Save As</h3>
				<label>
					Filename:
					<input bind:this={saveAsNameRef} bind:value={saveAsName} type="text" />
				</label>
				<label>
					Save in:
					<input bind:value={saveAsDir} type="text" />
				</label>
				<div class="modal-actions">
					<button onclick={cancelSaveAs}>Cancel</button>
					<button class="primary" onclick={confirmSaveAs}>Save</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- ── Open dialog ────────────────────────────────────────────── -->
	{#if showOpenDialog}
		<div class="modal-backdrop" onclick={() => showOpenDialog = false}>
			<div class="modal wide" onclick={(e) => e.stopPropagation()}>
				<h3>Open Document</h3>
				<div class="picker-toolbar">
					<button onclick={openDialogUp}>↑ Up</button>
					<input class="picker-path" bind:value={openDialogPath} type="text" />
				</div>
				<div class="picker-list">
					{#each openDialogEntries as entry (entry.name)}
						<button class="picker-item" ondblclick={() => pickOpenEntry(entry)} onclick={() => pickOpenEntry(entry)}>
							<span class="picker-icon">{entry.type === 'dir' ? '📁' : '📝'}</span>
							<span>{entry.name}</span>
						</button>
					{:else}
						<div class="picker-empty">No documents in this folder.</div>
					{/each}
				</div>
				<div class="modal-actions">
					<button onclick={() => showOpenDialog = false}>Cancel</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.word-app {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: #f3f2f1;
		color: #1c1c1c;
		font-family: 'Segoe UI', system-ui, sans-serif;
		font-size: 13px;
		position: relative;
		overflow: hidden;
	}

	.word-app.dark {
		background: #1c1c1c;
		color: #f1f1f1;
	}

	.word-app.read-mode {
		background: #1c1c1c;
	}

	/* ── Title bar ─────────────────────────────────────────────────── */
	.word-titlebar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 4px 12px;
		background: #2b579a;
		color: #fff;
		font-size: 12px;
		flex-shrink: 0;
		border-bottom: 1px solid rgba(0, 0, 0, 0.1);
	}
	.title-left { display: flex; align-items: center; gap: 8px; }
	.title-icon { font-size: 14px; }
	.title-text { font-weight: 500; }
	.title-right { display: flex; align-items: center; gap: 8px; }
	.title-btn {
		padding: 3px 10px;
		background: rgba(255, 255, 255, 0.12);
		border: 1px solid rgba(255, 255, 255, 0.15);
		color: #fff;
		border-radius: 3px;
		cursor: pointer;
		font-size: 12px;
	}
	.title-btn:hover { background: rgba(255, 255, 255, 0.22); }
	.saved-flash {
		color: #b8efb8;
		font-size: 11px;
		animation: fade 1.5s ease-out;
	}
	@keyframes fade {
		0% { opacity: 0; }
		20% { opacity: 1; }
		100% { opacity: 0; }
	}

	/* ── Ribbon tabs ───────────────────────────────────────────────── */
	.word-ribbon-tabs {
		display: flex;
		align-items: center;
		background: #f3f2f1;
		border-bottom: 1px solid #e1dfdd;
		padding: 0 8px;
		flex-shrink: 0;
	}
	.word-app.dark .word-ribbon-tabs {
		background: #252525;
		border-bottom-color: #383838;
	}
	.ribbon-tab {
		padding: 6px 14px;
		font-size: 12px;
		background: transparent;
		border: none;
		color: inherit;
		cursor: pointer;
		border-bottom: 2px solid transparent;
	}
	.ribbon-tab:hover { background: rgba(0, 0, 0, 0.04); }
	.word-app.dark .ribbon-tab:hover { background: rgba(255, 255, 255, 0.06); }
	.ribbon-tab.active {
		border-bottom-color: #2b579a;
		font-weight: 600;
	}
	.ribbon-tab.table-tab {
		background: linear-gradient(180deg, #fff7e0, #ffeec0);
		color: #663c00;
		border: 1px solid #f0d080;
		border-radius: 3px 3px 0 0;
		margin-left: 4px;
	}
	.tabs-spacer { flex: 1; }

	/* ── Ribbon body ───────────────────────────────────────────────── */
	.word-ribbon {
		display: flex;
		gap: 4px;
		padding: 8px 12px;
		background: #fff;
		border-bottom: 1px solid #e1dfdd;
		flex-shrink: 0;
		min-height: 90px;
		overflow-x: auto;
	}
	.word-app.dark .word-ribbon {
		background: #1f1f1f;
		border-bottom-color: #383838;
	}
	.ribbon-group {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: 4px;
		padding: 0 6px;
	}
	.ribbon-sep {
		width: 1px;
		background: #e1dfdd;
		margin: 0 4px;
	}
	.word-app.dark .ribbon-sep { background: #383838; }
	.group-label {
		font-size: 10px;
		color: #797775;
		text-align: center;
		padding-top: 2px;
	}
	.word-app.dark .group-label { color: #aaa; }

	.format-row, .font-row, .zoom-row {
		display: flex;
		align-items: center;
		gap: 2px;
	}
	.font-row { gap: 6px; }
	.font-select {
		min-width: 130px;
		padding: 3px 6px;
		font-size: 12px;
		border: 1px solid #c8c6c4;
		border-radius: 2px;
		background: #fff;
		color: inherit;
	}
	.size-select {
		width: 56px;
		padding: 3px 6px;
		font-size: 12px;
		border: 1px solid #c8c6c4;
		border-radius: 2px;
		background: #fff;
		color: inherit;
	}
	.word-app.dark .font-select,
	.word-app.dark .size-select {
		background: #2a2a2a;
		border-color: #444;
		color: #f1f1f1;
	}

	.ico-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 26px;
		height: 26px;
		padding: 0 6px;
		border: 1px solid transparent;
		background: transparent;
		color: inherit;
		cursor: pointer;
		border-radius: 2px;
		font-size: 12px;
		line-height: 1;
	}
	.ico-btn:hover { background: rgba(0, 0, 0, 0.05); border-color: #c8c6c4; }
	.word-app.dark .ico-btn:hover { background: rgba(255, 255, 255, 0.08); border-color: #555; }
	.ico-btn.active { background: #d4e3f4; border-color: #2b579a; }
	.word-app.dark .ico-btn.active { background: #314970; border-color: #6a9adf; color: #fff; }
	.ico-btn.wide { padding: 0 10px; gap: 4px; }
	.ico-btn.small { min-width: 22px; height: 22px; }
	.ico-btn.danger:hover { background: #fde7e9; border-color: #d13438; color: #d13438; }
	.ico-btn.fmt-painter.active { background: #fff4ce; border-color: #f1a500; color: #604400; }

	.swatch-trigger-wrapper { position: relative; }
	.swatch-trigger {
		flex-direction: column;
		min-width: 28px;
		gap: 1px;
	}
	.swatch-indicator {
		width: 16px;
		height: 3px;
		border: 1px solid rgba(0, 0, 0, 0.1);
	}

	.word-menu {
		position: absolute;
		top: 100%;
		left: 0;
		margin-top: 4px;
		background: #fff;
		border: 1px solid #c8c6c4;
		border-radius: 3px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
		z-index: 1000;
		padding: 6px;
		min-width: 160px;
	}
	.word-app.dark .word-menu {
		background: #2a2a2a;
		border-color: #444;
		color: #f1f1f1;
	}

	.swatch-menu .swatch-grid {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 3px;
	}
	.swatch-cell {
		width: 20px;
		height: 20px;
		border: 1px solid rgba(0, 0, 0, 0.15);
		cursor: pointer;
		border-radius: 2px;
	}
	.swatch-cell.transparent {
		background: repeating-conic-gradient(#ccc 0% 25%, white 0% 50%) 50% / 8px 8px !important;
	}
	.swatch-cell:hover { transform: scale(1.15); }
	.swatch-custom {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-top: 6px;
		font-size: 11px;
	}
	.swatch-custom input[type="color"] {
		width: 28px;
		height: 22px;
		border: 1px solid #c8c6c4;
		cursor: pointer;
		padding: 0;
	}

	.spacing-menu { min-width: 80px; }
	.menu-item {
		display: flex;
		flex-direction: column;
		gap: 1px;
		padding: 6px 10px;
		text-align: left;
		background: transparent;
		border: none;
		cursor: pointer;
		color: inherit;
		border-radius: 2px;
		width: 100%;
	}
	.menu-item .sub { font-size: 10px; color: #797775; }
	.word-app.dark .menu-item .sub { color: #aaa; }
	.menu-item:hover { background: #f3f2f1; }
	.word-app.dark .menu-item:hover { background: #353535; }
	.menu-item.active { background: #d4e3f4; }
	.word-app.dark .menu-item.active { background: #314970; }

	.heading-grid {
		display: grid;
		grid-template-columns: repeat(4, auto);
		gap: 4px;
	}
	.style-card {
		padding: 4px 8px;
		border: 1px solid #c8c6c4;
		background: #fff;
		font-size: 11px;
		cursor: pointer;
		border-radius: 2px;
		color: inherit;
	}
	.word-app.dark .style-card {
		background: #2a2a2a;
		border-color: #444;
	}
	.style-card.h1 { font-size: 14px; font-weight: 700; }
	.style-card.h2 { font-size: 13px; font-weight: 600; }
	.style-card.h3 { font-size: 12px; font-weight: 600; color: #2b579a; }
	.style-card:hover { background: #f3f2f1; }
	.word-app.dark .style-card:hover { background: #353535; }
	.style-card.active { border-color: #2b579a; background: #d4e3f4; }
	.word-app.dark .style-card.active { background: #314970; }

	.big-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
		min-width: 62px;
		padding: 6px 8px;
		background: transparent;
		border: 1px solid transparent;
		color: inherit;
		cursor: pointer;
		border-radius: 3px;
	}
	.big-btn:disabled { opacity: 0.4; cursor: not-allowed; }
	.big-btn-icon { font-size: 22px; line-height: 1; }
	.big-btn-label { font-size: 11px; line-height: 1.2; text-align: center; }
	.big-btn:hover:not(:disabled) { background: rgba(0, 0, 0, 0.04); border-color: #c8c6c4; }
	.word-app.dark .big-btn:hover:not(:disabled) { background: rgba(255, 255, 255, 0.06); border-color: #555; }
	.big-btn.active { background: #d4e3f4; border-color: #2b579a; }
	.word-app.dark .big-btn.active { background: #314970; border-color: #6a9adf; }

	.table-menu .table-grid {
		display: grid;
		grid-template-columns: repeat(5, 22px);
		grid-template-rows: repeat(5, 22px);
		gap: 2px;
		padding: 4px;
	}
	.grid-cell {
		width: 22px;
		height: 22px;
		border: 1px solid #c8c6c4;
		background: #fff;
		cursor: pointer;
	}
	.grid-cell.hovered { background: #d4e3f4; border-color: #2b579a; }
	.table-grid-label {
		text-align: center;
		font-size: 11px;
		padding: 4px;
		color: #797775;
	}

	.symbol-menu {
		display: grid;
		grid-template-columns: repeat(10, 24px);
		gap: 2px;
	}
	.symbol-cell {
		width: 24px;
		height: 24px;
		border: 1px solid transparent;
		background: transparent;
		cursor: pointer;
		font-size: 14px;
		color: inherit;
	}
	.symbol-cell:hover { background: #f3f2f1; border-color: #c8c6c4; }
	.word-app.dark .symbol-cell:hover { background: #353535; }

	.muted-note {
		padding: 16px;
		font-size: 12px;
		color: #797775;
		font-style: italic;
	}

	/* ── Find pane ─────────────────────────────────────────────────── */
	.find-pane {
		background: #fffbe6;
		border-bottom: 1px solid #e0d090;
		padding: 6px 10px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		flex-shrink: 0;
	}
	.word-app.dark .find-pane {
		background: #2c281e;
		border-bottom-color: #4a4030;
	}
	.find-row {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.find-input {
		flex: 1;
		max-width: 280px;
		padding: 4px 8px;
		font-size: 12px;
		border: 1px solid #c8c6c4;
		border-radius: 2px;
		background: #fff;
		color: inherit;
	}
	.word-app.dark .find-input {
		background: #2a2a2a;
		border-color: #444;
		color: #f1f1f1;
	}
	.find-count {
		font-size: 11px;
		color: #797775;
		min-width: 70px;
	}
	.find-toggle {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		font-size: 11px;
		cursor: pointer;
	}
	.close-btn { margin-left: auto; }

	/* ── Ruler ─────────────────────────────────────────────────────── */
	.ruler {
		height: 18px;
		background: #fafafa;
		border-bottom: 1px solid #e1dfdd;
		display: flex;
		font-size: 10px;
		color: #797775;
		margin: 0 auto;
		flex-shrink: 0;
		overflow: hidden;
	}
	.word-app.dark .ruler {
		background: #252525;
		border-bottom-color: #383838;
		color: #aaa;
	}
	.ruler-tick {
		width: 96px;
		border-right: 1px dashed #d2d0ce;
		padding-left: 4px;
		flex-shrink: 0;
	}

	/* ── Body / outline ────────────────────────────────────────────── */
	.word-body {
		flex: 1;
		display: flex;
		overflow: hidden;
		min-height: 0;
	}
	.outline-pane {
		width: 240px;
		background: #fafafa;
		border-right: 1px solid #e1dfdd;
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
	}
	.word-app.dark .outline-pane {
		background: #252525;
		border-right-color: #383838;
	}
	.outline-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 12px;
		font-weight: 600;
		font-size: 12px;
		border-bottom: 1px solid #e1dfdd;
	}
	.word-app.dark .outline-header { border-bottom-color: #383838; }
	.outline-list { flex: 1; overflow-y: auto; padding: 4px 0; }
	.outline-empty {
		padding: 16px;
		font-size: 12px;
		color: #797775;
		font-style: italic;
	}
	.outline-item {
		display: block;
		width: 100%;
		text-align: left;
		padding: 4px 12px;
		background: transparent;
		border: none;
		cursor: pointer;
		font-size: 12px;
		color: inherit;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.outline-item:hover { background: rgba(43, 87, 154, 0.08); }
	.outline-item.lvl-1 { font-weight: 600; }
	.outline-item.lvl-2 { padding-left: 24px; }
	.outline-item.lvl-3 { padding-left: 36px; font-size: 11px; color: #797775; }
	.word-app.dark .outline-item.lvl-3 { color: #aaa; }

	.document-scroll {
		flex: 1;
		overflow: auto;
		background: #ebe9e8;
		padding: 24px 0;
	}
	.word-app.dark .document-scroll { background: #2a2a2a; }
	.document-scroll.webmode { background: #fff; padding: 12px; }
	.word-app.dark .document-scroll.webmode { background: #1c1c1c; }

	.document-stage {
		display: flex;
		justify-content: center;
		padding: 0 24px;
	}
	.document-shell {
		display: flex;
		flex-direction: column;
		gap: 8px;
		align-items: center;
	}
	.document-shell.webmode {
		width: 100%;
		max-width: 1100px;
	}
	.document-shell.readmode {
		max-width: 720px;
	}

	/* ── Page ──────────────────────────────────────────────────────── */
	.word-page {
		background: #fff;
		box-shadow: 0 2px 16px rgba(0, 0, 0, 0.12);
		outline: none;
		font-family: 'Calibri', 'Segoe UI', sans-serif;
		font-size: 11pt;
		color: #1c1c1c;
		line-height: 1.5;
		box-sizing: border-box;
		word-wrap: break-word;
	}
	.word-page.webmode {
		max-width: 1100px;
		width: 100% !important;
		min-height: 200px !important;
		background-image: none !important;
		box-shadow: none;
	}
	.word-page.readmode {
		background: #fafafa;
		font-size: 14pt;
		max-width: 720px;
		width: 100% !important;
		background-image: none !important;
		padding: 60px !important;
		box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
	}
	.word-app.dark .word-page {
		background: #2a2a2a;
		color: #f1f1f1;
	}
	.word-app.dark .word-page.readmode {
		background: #1f1f1f;
	}

	.word-page :global(h1) { font-size: 22pt; font-weight: 600; margin: 18px 0 10px; color: #2b579a; }
	.word-page :global(h2) { font-size: 16pt; font-weight: 600; margin: 14px 0 8px; color: #2b579a; }
	.word-page :global(h3) { font-size: 13pt; font-weight: 600; margin: 12px 0 6px; color: #1f4f8c; }
	.word-page :global(p) { margin: 0 0 10px; }
	.word-page :global(ul), .word-page :global(ol) { margin: 0 0 10px 24px; padding-left: 12px; }
	.word-page :global(li) { margin-bottom: 4px; }
	.word-page :global(blockquote) {
		border-left: 4px solid #c8c6c4;
		padding-left: 12px;
		margin: 10px 0;
		color: #555;
	}
	.word-page :global(hr) {
		border: none;
		border-top: 1px solid #c8c6c4;
		margin: 14px 0;
	}
	.word-page :global(.word-table) {
		border-collapse: collapse;
		margin: 12px 0;
		min-width: 60%;
	}
	.word-page :global(.word-table td),
	.word-page :global(.word-table th) {
		border: 1px solid #b0b0b0;
		padding: 6px 10px;
		vertical-align: top;
		min-width: 40px;
	}
	.word-page :global(.word-table th) {
		background: #f3f2f1;
		font-weight: 600;
	}
	.word-page :global(.word-toc) {
		border: 1px solid #d0d0d0;
		background: #faf9f8;
		padding: 12px 14px;
		margin: 12px 0;
	}
	.word-page :global(.word-toc strong) {
		display: block;
		margin-bottom: 8px;
		color: #2b579a;
	}
	.word-page :global(.word-toc-row) {
		display: flex;
		align-items: baseline;
		gap: 8px;
		line-height: 1.5;
	}
	.word-page :global(.word-toc-dots) {
		flex: 1;
		border-bottom: 1px dotted #8a8886;
		transform: translateY(-3px);
	}
	.word-page :global(.word-footnote-ref) {
		color: #2b579a;
		font-size: 0.75em;
	}
	.word-page :global(.word-footnote) {
		border-top: 1px solid #c8c6c4;
		color: #605e5c;
		font-size: 10pt;
		padding-top: 6px;
		margin-top: 12px;
	}
	.word-page :global(.word-citation) {
		background: #eff6fc;
		color: #1f4f8c;
		border-radius: 2px;
		padding: 0 3px;
	}
	.word-page :global(.word-bibliography-entry) {
		padding-left: 24px;
		text-indent: -24px;
	}
	.word-page :global(.word-caption) {
		color: #605e5c;
		font-size: 10pt;
		text-align: center;
	}
	.word-page :global(.word-image) {
		max-width: 100%;
		display: block;
		margin: 8px 0;
	}
	.word-page :global(.word-page-break) {
		text-align: center;
		color: #999;
		font-size: 10px;
		border-top: 1px dashed #c8c6c4;
		border-bottom: 1px dashed #c8c6c4;
		padding: 6px 0;
		margin: 14px 0;
		user-select: none;
	}
	.word-page :global(.word-find-hit) {
		background: #ffe680;
		color: #1c1c1c;
	}
	.word-page :global(.word-find-hit-active) {
		background: #ff8c00;
		color: #fff;
	}
	.word-page :global(kbd) {
		background: #f3f2f1;
		border: 1px solid #c8c6c4;
		border-radius: 3px;
		padding: 1px 5px;
		font-family: 'Consolas', monospace;
		font-size: 11px;
	}

	.word-header-area, .word-footer-area {
		background: #fff;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
		box-sizing: border-box;
		padding: 12px 80px;
	}
	.word-app.dark .word-header-area,
	.word-app.dark .word-footer-area {
		background: #2a2a2a;
	}
	.word-header-edit, .word-footer-edit {
		outline: none;
		min-height: 24px;
		font-size: 10pt;
		color: #555;
	}
	.word-app.dark .word-header-edit,
	.word-app.dark .word-footer-edit { color: #aaa; }

	/* ── Status bar ────────────────────────────────────────────────── */
	.word-status {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 4px 14px;
		font-size: 11px;
		color: #555;
		background: #f3f2f1;
		border-top: 1px solid #e1dfdd;
		flex-shrink: 0;
	}
	.word-app.dark .word-status {
		background: #252525;
		color: #ccc;
		border-top-color: #383838;
	}
	.status-cell { white-space: nowrap; }
	.status-spacer { flex: 1; }
	.status-zoom {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.zoom-slider {
		width: 120px;
	}
	.zoom-label {
		min-width: 38px;
		text-align: right;
	}

	/* ── Read-mode exit ────────────────────────────────────────────── */
	.read-exit {
		position: absolute;
		top: 12px;
		left: 12px;
		padding: 6px 14px;
		background: rgba(43, 87, 154, 0.92);
		color: #fff;
		border: none;
		border-radius: 3px;
		cursor: pointer;
		font-size: 12px;
		z-index: 100;
	}
	.read-exit:hover { background: rgba(43, 87, 154, 1); }

	/* ── Modals ────────────────────────────────────────────────────── */
	.modal-backdrop {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.35);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2000;
	}
	.modal {
		background: #fff;
		border-radius: 6px;
		padding: 20px;
		min-width: 360px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
	}
	.modal.wide { min-width: 520px; min-height: 400px; }
	.word-app.dark .modal {
		background: #2a2a2a;
		color: #f1f1f1;
	}
	.modal h3 { margin: 0; font-size: 16px; }
	.modal label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 12px;
	}
	.modal input[type="text"] {
		padding: 6px 8px;
		border: 1px solid #c8c6c4;
		border-radius: 3px;
		font-size: 13px;
		background: #fff;
		color: inherit;
	}
	.word-app.dark .modal input[type="text"] {
		background: #1f1f1f;
		border-color: #444;
		color: #f1f1f1;
	}
	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}
	.modal-actions button {
		padding: 6px 16px;
		border: 1px solid #c8c6c4;
		background: #fff;
		border-radius: 3px;
		cursor: pointer;
		font-size: 12px;
	}
	.word-app.dark .modal-actions button {
		background: #1f1f1f;
		border-color: #444;
		color: #f1f1f1;
	}
	.modal-actions button.primary {
		background: #2b579a;
		color: #fff;
		border-color: #2b579a;
	}
	.modal-actions button.primary:hover { background: #1e3e75; }

	.picker-toolbar {
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.picker-path {
		flex: 1;
		padding: 4px 8px;
		border: 1px solid #c8c6c4;
		border-radius: 3px;
		font-size: 12px;
	}
	.picker-list {
		flex: 1;
		min-height: 240px;
		max-height: 320px;
		overflow-y: auto;
		border: 1px solid #e1dfdd;
		border-radius: 3px;
		padding: 4px;
	}
	.word-app.dark .picker-list { border-color: #444; }
	.picker-item {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 4px 8px;
		background: transparent;
		border: none;
		text-align: left;
		cursor: pointer;
		font-size: 12px;
		color: inherit;
		border-radius: 2px;
	}
	.picker-item:hover { background: #f3f2f1; }
	.word-app.dark .picker-item:hover { background: #353535; }
	.picker-icon { font-size: 16px; }
	.picker-empty {
		padding: 32px;
		text-align: center;
		color: #797775;
		font-style: italic;
		font-size: 12px;
	}
</style>

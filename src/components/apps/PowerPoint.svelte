<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import html2canvas from 'html2canvas';
	import { wm } from '../../state/windows.svelte';
	import { readFile, writeFile, exists } from '../../state/vfs.svelte';

	// ── Model types ─────────────────────────────────────────────────

	type ElementType = 'text' | 'rect' | 'ellipse' | 'image' | 'triangle' | 'line' | 'arrow' | 'star' | 'callout';
	type LayoutKind = 'blank' | 'title' | 'title-content' | 'two-content';
	type TransitionKind = 'none' | 'fade' | 'slide' | 'push';
	type AnimationKind = 'none' | 'appear' | 'fade-in' | 'fly-in' | 'zoom';

	interface SlideElement {
		id: string;
		type: ElementType;
		x: number;
		y: number;
		w: number;
		h: number;
		content: string;
		animation?: AnimationKind;
		style: {
			fill?: string;
			stroke?: string;
			strokeWidth?: number;
			fontFamily?: string;
			fontSize?: number;
			fontWeight?: number | string;
			fontStyle?: string;
			textDecoration?: string;
			color?: string;
			textAlign?: 'left' | 'center' | 'right';
		};
	}

	interface Slide {
		id: string;
		layout: LayoutKind;
		background: string;
		transition: TransitionKind;
		elements: SlideElement[];
	}

	interface ThemeDef {
		name: string;
		font: string;
		colors: string[];
		titleColor: string;
		bodyColor: string;
		defaultBg: string;
	}

	interface Presentation {
		version: 1;
		title: string;
		theme: string;
		slides: Slide[];
		notes: Record<number, string>;
	}

	// ── Themes ─────────────────────────────────────────────────────

	const themes: Record<string, ThemeDef> = {
		Office: {
			name: 'Office',
			font: 'Calibri, Segoe UI, sans-serif',
			colors: ['#ffffff', '#0078d4', '#107c10', '#e74856', '#ff8c00', '#6c5ce7'],
			titleColor: '#1f2937',
			bodyColor: '#374151',
			defaultBg: '#ffffff',
		},
		Berlin: {
			name: 'Berlin',
			font: '"Trebuchet MS", sans-serif',
			colors: ['#1a1a1a', '#d4af37', '#8b0000', '#2c5f2d', '#97badc', '#f4a460'],
			titleColor: '#d4af37',
			bodyColor: '#e6e6e6',
			defaultBg: '#1a1a1a',
		},
		Facet: {
			name: 'Facet',
			font: 'Georgia, "Times New Roman", serif',
			colors: ['#f3f3e8', '#7a9e3c', '#a0522d', '#4682b4', '#daa520', '#8b4789'],
			titleColor: '#3d4a2a',
			bodyColor: '#4a4a3a',
			defaultBg: '#f3f3e8',
		},
		Ion: {
			name: 'Ion',
			font: '"Century Gothic", "Avant Garde", sans-serif',
			colors: ['#0e2a47', '#2bb8e6', '#52e3a0', '#fcd34d', '#ff6b6b', '#a78bfa'],
			titleColor: '#2bb8e6',
			bodyColor: '#cfe9ff',
			defaultBg: '#0e2a47',
		},
		Wisp: {
			name: 'Wisp',
			font: '"Book Antiqua", "Palatino Linotype", serif',
			colors: ['#fff8f0', '#c45a3a', '#e08e45', '#8a7a5e', '#5b4e3c', '#a8a085'],
			titleColor: '#c45a3a',
			bodyColor: '#5b4e3c',
			defaultBg: '#fff8f0',
		},
	};

	// ── Slide canonical size ────────────────────────────────────────

	const SLIDE_W = 960;
	const SLIDE_H = 540;

	// ── Sample / default seed ──────────────────────────────────────

	function uid(prefix: string = 'el'): string {
		return prefix + '-' + Math.random().toString(36).slice(2, 10);
	}

	function createSampleSlides(): Slide[] {
		const t = themes.Office;
		return [
			{
				id: uid('slide'),
				layout: 'title',
				background: t.defaultBg,
				transition: 'fade',
				elements: [
					{
						id: uid(), type: 'text', x: 80, y: 180, w: 800, h: 100, content: 'Quarterly Review',
						style: { fontFamily: t.font, fontSize: 60, fontWeight: 700, color: t.titleColor, textAlign: 'center' },
					},
					{
						id: uid(), type: 'text', x: 80, y: 300, w: 800, h: 60, content: 'Q1 2026 — Results & Outlook',
						style: { fontFamily: t.font, fontSize: 28, color: t.bodyColor, textAlign: 'center' },
					},
				],
			},
			{
				id: uid('slide'),
				layout: 'title-content',
				background: t.defaultBg,
				transition: 'slide',
				elements: [
					{
						id: uid(), type: 'text', x: 60, y: 40, w: 840, h: 70, content: 'Agenda',
						style: { fontFamily: t.font, fontSize: 44, fontWeight: 700, color: t.titleColor, textAlign: 'left' },
					},
					{
						id: uid(), type: 'text', x: 80, y: 140, w: 800, h: 360,
						content: '• Revenue overview\n• Customer growth\n• Product roadmap\n• Hiring plan\n• Q&A',
						style: { fontFamily: t.font, fontSize: 26, color: t.bodyColor, textAlign: 'left' },
					},
				],
			},
			{
				id: uid('slide'),
				layout: 'title-content',
				background: t.defaultBg,
				transition: 'push',
				elements: [
					{
						id: uid(), type: 'text', x: 60, y: 40, w: 840, h: 70, content: 'Revenue Up 24% YoY',
						style: { fontFamily: t.font, fontSize: 44, fontWeight: 700, color: t.titleColor, textAlign: 'left' },
					},
					{
						id: uid(), type: 'rect', x: 100, y: 160, w: 380, h: 300, content: '',
						style: { fill: '#0078d4', stroke: '#005a9e', strokeWidth: 2 },
					},
					{
						id: uid(), type: 'ellipse', x: 520, y: 200, w: 320, h: 220, content: '',
						style: { fill: '#107c10', stroke: '#0b5e0b', strokeWidth: 2 },
					},
					{
						id: uid(), type: 'text', x: 100, y: 280, w: 380, h: 80, content: 'Q1',
						style: { fontFamily: t.font, fontSize: 72, fontWeight: 700, color: '#ffffff', textAlign: 'center' },
					},
					{
						id: uid(), type: 'text', x: 520, y: 280, w: 320, h: 80, content: '+24%',
						style: { fontFamily: t.font, fontSize: 72, fontWeight: 700, color: '#ffffff', textAlign: 'center' },
					},
				],
			},
		];
	}

	function createBlankPres(): Presentation {
		return {
			version: 1,
			title: 'Untitled Presentation',
			theme: 'Office',
			slides: createSampleSlides(),
			notes: { 0: 'Welcome the audience. Set context for the quarter.' },
		};
	}

	// ── Reactive state ─────────────────────────────────────────────

	let pres = $state<Presentation>(createBlankPres());
	let currentIdx = $state(0);
	let selectedElId = $state<string | null>(null);
	let filePath = $state<string | null>(null);
	let dirty = $state(false);
	let lastSaved = $state<Date | null>(null);

	let activeTab = $state<'home' | 'insert' | 'design' | 'transitions' | 'animations' | 'slideshow'>('home');
	let zoom = $state(1);
	let presenting = $state(false);
	let presentIdx = $state(0);
	let transitioning = $state(false);
	let transitionFrom = $state(0);
	let editingElId = $state<string | null>(null);
	let editingText = $state('');

	// Thumbnail reorder
	let dragSlideFrom = $state<number | null>(null);
	let dragSlideOver = $state<number | null>(null);
	let dragSlideBefore = $state(true);

	// Element drag/resize ephemera
	let elDragging = $state(false);
	let elResizing = $state<{ handle: string } | null>(null);

	// Refs
	let stageContainerRef: HTMLDivElement | null = null;
	let stageRef: HTMLDivElement | null = null;
	let notesRef: HTMLTextAreaElement | null = null;

	// Theme helpers
	let currentTheme = $derived(themes[pres.theme] ?? themes.Office);
	let currentSlide = $derived(pres.slides[currentIdx]);
	let selectedEl = $derived.by(() => {
		const s = currentSlide;
		if (!s || !selectedElId) return null;
		return s.elements.find((e) => e.id === selectedElId) ?? null;
	});
	let notesValue = $derived(pres.notes[currentIdx] ?? '');
	let hasNotes = $derived((pres.notes[currentIdx] ?? '').trim().length > 0);

	// ── Lifecycle: file load + autosave ────────────────────────────

	let autosaveTimer: number | null = null;

	onMount(() => {
		const args = wm.appLaunchArgs?.powerpoint as { path?: string } | undefined;
		if (args?.path) {
			filePath = args.path;
			tryLoadFromVFS(args.path);
			// Consume the arg
			const next = { ...wm.appLaunchArgs };
			delete next.powerpoint;
			wm.appLaunchArgs = next;
		}
		// Autosave loop
		autosaveTimer = window.setInterval(() => {
			if (filePath && dirty) savePres(true);
		}, 5000);
		window.addEventListener('keydown', onGlobalKey);
	});

	onDestroy(() => {
		if (autosaveTimer != null) clearInterval(autosaveTimer);
		window.removeEventListener('keydown', onGlobalKey);
	});

	function tryLoadFromVFS(path: string) {
		const raw = readFile(path);
		if (raw && raw.trim()) {
			try {
				const parsed = JSON.parse(raw);
				if (parsed && Array.isArray(parsed.slides)) {
					pres = normalizePres(parsed);
					currentIdx = 0;
					selectedElId = null;
					dirty = false;
					return;
				}
			} catch {
				// Fall through to fresh sample
			}
		}
		// Empty / unparseable: keep the default sample and treat as fresh
		dirty = false;
	}

	function normalizePres(p: any): Presentation {
		return {
			version: 1,
			title: typeof p.title === 'string' ? p.title : 'Untitled Presentation',
			theme: typeof p.theme === 'string' && themes[p.theme] ? p.theme : 'Office',
			slides: (p.slides as any[]).map((s) => ({
				id: s.id ?? uid('slide'),
				layout: s.layout ?? 'blank',
				background: s.background ?? '#ffffff',
				transition: s.transition ?? 'none',
				elements: (s.elements ?? []).map((e: any) => ({
					id: e.id ?? uid(),
					type: e.type ?? 'rect',
					x: e.x ?? 0, y: e.y ?? 0, w: e.w ?? 100, h: e.h ?? 100,
					content: e.content ?? '',
					animation: e.animation,
					style: e.style ?? {},
				})),
			})),
			notes: p.notes ?? {},
		};
	}

	function savePres(silent: boolean = false): boolean {
		if (!filePath) {
			// Prompt for a path
			const defaultName = pres.title.replace(/[^A-Za-z0-9_\- ]/g, '') + '.pptx';
			const p = window.prompt('Save as (VFS path):', 'C:/Users/User/Documents/' + defaultName);
			if (!p) return false;
			filePath = p;
		}
		const ok = writeFile(filePath, JSON.stringify(pres, null, 2));
		if (ok) {
			dirty = false;
			lastSaved = new Date();
		} else if (!silent) {
			window.alert('Could not save to ' + filePath);
		}
		return ok;
	}

	function openPres() {
		const p = window.prompt('Open VFS path:', 'C:/Users/User/Documents/Quarterly Review.pptx');
		if (!p) return;
		if (!exists(p)) {
			window.alert('Not found: ' + p);
			return;
		}
		filePath = p;
		tryLoadFromVFS(p);
	}

	function newPres() {
		if (dirty && !window.confirm('Discard unsaved changes?')) return;
		pres = createBlankPres();
		filePath = null;
		dirty = false;
		currentIdx = 0;
		selectedElId = null;
	}

	function markDirty() { dirty = true; }

	// ── Slide CRUD ─────────────────────────────────────────────────

	function addSlide(layout: LayoutKind = 'title-content') {
		const s = makeSlideForLayout(layout);
		pres.slides = [...pres.slides.slice(0, currentIdx + 1), s, ...pres.slides.slice(currentIdx + 1)];
		currentIdx = currentIdx + 1;
		selectedElId = null;
		markDirty();
	}

	function deleteSlide(idx: number) {
		if (pres.slides.length <= 1) {
			// Replace with a fresh blank instead of deleting last
			pres.slides = [makeSlideForLayout('blank')];
			currentIdx = 0;
			selectedElId = null;
			markDirty();
			return;
		}
		const newSlides = pres.slides.filter((_, i) => i !== idx);
		// Reindex notes
		const newNotes: Record<number, string> = {};
		Object.entries(pres.notes).forEach(([k, v]) => {
			const ki = parseInt(k, 10);
			if (ki < idx) newNotes[ki] = v;
			else if (ki > idx) newNotes[ki - 1] = v;
		});
		pres.slides = newSlides;
		pres.notes = newNotes;
		if (currentIdx >= newSlides.length) currentIdx = newSlides.length - 1;
		selectedElId = null;
		markDirty();
	}

	function duplicateSlide(idx: number) {
		const orig = pres.slides[idx];
		const dup: Slide = {
			...orig,
			id: uid('slide'),
			elements: orig.elements.map((e) => ({ ...e, id: uid(), style: { ...e.style } })),
		};
		pres.slides = [...pres.slides.slice(0, idx + 1), dup, ...pres.slides.slice(idx + 1)];
		currentIdx = idx + 1;
		markDirty();
	}

	function makeSlideForLayout(layout: LayoutKind): Slide {
		const t = currentTheme;
		const base: Slide = {
			id: uid('slide'),
			layout,
			background: t.defaultBg,
			transition: 'none',
			elements: [],
		};
		applyLayoutElements(base, layout);
		return base;
	}

	function applyLayoutElements(slide: Slide, layout: LayoutKind) {
		const t = currentTheme;
		slide.layout = layout;
		if (layout === 'blank') {
			slide.elements = [];
			return;
		}
		if (layout === 'title') {
			slide.elements = [
				{ id: uid(), type: 'text', x: 80, y: 200, w: 800, h: 100, content: 'Click to add title',
					style: { fontFamily: t.font, fontSize: 56, fontWeight: 700, color: t.titleColor, textAlign: 'center' } },
				{ id: uid(), type: 'text', x: 80, y: 320, w: 800, h: 60, content: 'Click to add subtitle',
					style: { fontFamily: t.font, fontSize: 26, color: t.bodyColor, textAlign: 'center' } },
			];
			return;
		}
		if (layout === 'title-content') {
			slide.elements = [
				{ id: uid(), type: 'text', x: 60, y: 40, w: 840, h: 70, content: 'Click to add title',
					style: { fontFamily: t.font, fontSize: 44, fontWeight: 700, color: t.titleColor, textAlign: 'left' } },
				{ id: uid(), type: 'text', x: 80, y: 140, w: 800, h: 360, content: 'Click to add content',
					style: { fontFamily: t.font, fontSize: 24, color: t.bodyColor, textAlign: 'left' } },
			];
			return;
		}
		if (layout === 'two-content') {
			slide.elements = [
				{ id: uid(), type: 'text', x: 60, y: 40, w: 840, h: 70, content: 'Click to add title',
					style: { fontFamily: t.font, fontSize: 44, fontWeight: 700, color: t.titleColor, textAlign: 'left' } },
				{ id: uid(), type: 'text', x: 60, y: 140, w: 410, h: 360, content: 'Click to add content',
					style: { fontFamily: t.font, fontSize: 22, color: t.bodyColor, textAlign: 'left' } },
				{ id: uid(), type: 'text', x: 490, y: 140, w: 410, h: 360, content: 'Click to add content',
					style: { fontFamily: t.font, fontSize: 22, color: t.bodyColor, textAlign: 'left' } },
			];
			return;
		}
	}

	function applyLayout(layout: LayoutKind) {
		if (!currentSlide) return;
		applyLayoutElements(currentSlide, layout);
		selectedElId = null;
		markDirty();
	}

	// ── Element insertion ─────────────────────────────────────────

	function addElement(type: ElementType) {
		if (!currentSlide) return;
		const t = currentTheme;
		const el: SlideElement = {
			id: uid(),
			type,
			x: SLIDE_W / 2 - 100,
			y: SLIDE_H / 2 - 60,
			w: 200,
			h: 120,
			content: type === 'text' ? 'Text' : type === 'image' ? '🖼️' : type === 'callout' ? 'Callout' : '',
			style: defaultStyleFor(type, t),
		};
		if (type === 'line' || type === 'arrow') {
			el.h = 4;
			el.w = 240;
		}
		currentSlide.elements = [...currentSlide.elements, el];
		selectedElId = el.id;
		markDirty();
	}

	function defaultStyleFor(type: ElementType, t: ThemeDef): SlideElement['style'] {
		if (type === 'text') {
			return { fontFamily: t.font, fontSize: 24, color: t.bodyColor, textAlign: 'left' };
		}
		if (type === 'line' || type === 'arrow') {
			return { stroke: t.colors[1], strokeWidth: 4 };
		}
		if (type === 'image') {
			return { fill: '#e5e7eb', stroke: '#9ca3af', strokeWidth: 1 };
		}
		return { fill: t.colors[1], stroke: '#00000022', strokeWidth: 1 };
	}

	function deleteElement() {
		if (!currentSlide || !selectedElId) return;
		currentSlide.elements = currentSlide.elements.filter((e) => e.id !== selectedElId);
		selectedElId = null;
		markDirty();
	}

	// ── Layering ──────────────────────────────────────────────────

	function moveLayer(dir: 'front' | 'back' | 'forward' | 'backward') {
		if (!currentSlide || !selectedElId) return;
		const els = currentSlide.elements;
		const i = els.findIndex((e) => e.id === selectedElId);
		if (i < 0) return;
		const newEls = [...els];
		const [item] = newEls.splice(i, 1);
		if (dir === 'front') newEls.push(item);
		else if (dir === 'back') newEls.unshift(item);
		else if (dir === 'forward') newEls.splice(Math.min(i + 1, newEls.length), 0, item);
		else newEls.splice(Math.max(i - 1, 0), 0, item);
		currentSlide.elements = newEls;
		markDirty();
	}

	// ── Drag (move) ───────────────────────────────────────────────

	function startElementDrag(e: PointerEvent, el: SlideElement) {
		if (presenting) return;
		if (editingElId) return;
		if (e.button !== 0) return;
		selectedElId = el.id;
		const startX = e.clientX;
		const startY = e.clientY;
		const origX = el.x;
		const origY = el.y;
		elDragging = true;
		(e.target as HTMLElement).setPointerCapture?.(e.pointerId);

		function onMove(ev: PointerEvent) {
			const dx = (ev.clientX - startX) / zoom;
			const dy = (ev.clientY - startY) / zoom;
			el.x = Math.round(origX + dx);
			el.y = Math.round(origY + dy);
		}
		function onUp(ev: PointerEvent) {
			(e.target as HTMLElement).releasePointerCapture?.(ev.pointerId);
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
			elDragging = false;
			markDirty();
		}
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		e.stopPropagation();
	}

	// ── Resize handles ────────────────────────────────────────────

	type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
	const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

	function handleCursor(h: Handle): string {
		switch (h) {
			case 'n': case 's': return 'ns-resize';
			case 'e': case 'w': return 'ew-resize';
			case 'ne': case 'sw': return 'nesw-resize';
			case 'nw': case 'se': return 'nwse-resize';
		}
	}

	function startResize(e: PointerEvent, el: SlideElement, h: Handle) {
		if (presenting || editingElId) return;
		if (e.button !== 0) return;
		e.stopPropagation();
		e.preventDefault();
		selectedElId = el.id;
		elResizing = { handle: h };
		const startX = e.clientX;
		const startY = e.clientY;
		const ox = el.x, oy = el.y, ow = el.w, oh = el.h;
		const aspect = ow / Math.max(oh, 1);
		(e.target as HTMLElement).setPointerCapture?.(e.pointerId);

		function onMove(ev: PointerEvent) {
			const dx = (ev.clientX - startX) / zoom;
			const dy = (ev.clientY - startY) / zoom;
			let nx = ox, ny = oy, nw = ow, nh = oh;
			if (h.includes('e')) nw = Math.max(20, ow + dx);
			if (h.includes('s')) nh = Math.max(20, oh + dy);
			if (h.includes('w')) { nw = Math.max(20, ow - dx); nx = ox + (ow - nw); }
			if (h.includes('n')) { nh = Math.max(20, oh - dy); ny = oy + (oh - nh); }
			if (ev.shiftKey && (h === 'nw' || h === 'ne' || h === 'sw' || h === 'se')) {
				// Maintain aspect ratio
				const candH = nw / aspect;
				if (h.includes('n')) ny = oy + (oh - candH);
				nh = candH;
			}
			el.x = Math.round(nx);
			el.y = Math.round(ny);
			el.w = Math.round(nw);
			el.h = Math.round(nh);
		}
		function onUp(ev: PointerEvent) {
			(e.target as HTMLElement).releasePointerCapture?.(ev.pointerId);
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
			elResizing = null;
			markDirty();
		}
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
	}

	// ── Inline text edit ──────────────────────────────────────────

	function beginInlineEdit(el: SlideElement) {
		if (el.type !== 'text' && el.type !== 'callout') return;
		editingElId = el.id;
		editingText = el.content;
		tick().then(() => {
			const node = document.getElementById('inline-edit-' + el.id);
			if (node) {
				node.focus();
				// Place caret at end
				const range = document.createRange();
				range.selectNodeContents(node);
				range.collapse(false);
				const sel = window.getSelection();
				sel?.removeAllRanges();
				sel?.addRange(range);
			}
		});
	}

	function commitInlineEdit() {
		if (!editingElId || !currentSlide) return;
		const el = currentSlide.elements.find((e) => e.id === editingElId);
		const node = document.getElementById('inline-edit-' + editingElId);
		if (el && node) {
			el.content = node.innerText;
			markDirty();
		}
		editingElId = null;
	}

	function onInlineKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			editingElId = null;
		}
		// Enter is allowed for multi-line text; Shift+Enter same. Ctrl+Enter commits.
		if ((e.key === 'Enter' && e.ctrlKey)) {
			e.preventDefault();
			commitInlineEdit();
		}
	}

	// ── Stage click → deselect, notes typing ──────────────────────

	function onStageBackgroundClick(e: MouseEvent) {
		if (e.target === stageRef || (e.target as HTMLElement).classList.contains('slide-stage-bg')) {
			selectedElId = null;
			if (editingElId) commitInlineEdit();
		}
	}

	function onStageWheel(e: WheelEvent) {
		if (e.ctrlKey) {
			e.preventDefault();
			const delta = -Math.sign(e.deltaY) * 0.1;
			zoom = Math.max(0.5, Math.min(2, +(zoom + delta).toFixed(2)));
		}
	}

	function setZoom(v: number) { zoom = Math.max(0.5, Math.min(2, v)); }

	// ── Notes ─────────────────────────────────────────────────────

	function onNotesInput(e: Event) {
		const v = (e.target as HTMLTextAreaElement).value;
		pres.notes = { ...pres.notes, [currentIdx]: v };
		markDirty();
	}

	// ── Format toggles for text elements ──────────────────────────

	function toggleBold() {
		if (!selectedEl || selectedEl.type !== 'text') return;
		const w = selectedEl.style.fontWeight;
		selectedEl.style.fontWeight = (w === 700 || w === 'bold') ? 400 : 700;
		markDirty();
	}
	function toggleItalic() {
		if (!selectedEl || selectedEl.type !== 'text') return;
		selectedEl.style.fontStyle = selectedEl.style.fontStyle === 'italic' ? 'normal' : 'italic';
		markDirty();
	}
	function toggleUnderline() {
		if (!selectedEl || selectedEl.type !== 'text') return;
		selectedEl.style.textDecoration = selectedEl.style.textDecoration === 'underline' ? 'none' : 'underline';
		markDirty();
	}
	function setAlign(a: 'left' | 'center' | 'right') {
		if (!selectedEl || selectedEl.type !== 'text') return;
		selectedEl.style.textAlign = a;
		markDirty();
	}
	function setFontFamily(f: string) {
		if (!selectedEl) return;
		selectedEl.style.fontFamily = f;
		markDirty();
	}
	function setFontSize(s: number) {
		if (!selectedEl) return;
		selectedEl.style.fontSize = s;
		markDirty();
	}
	function setTextColor(c: string) {
		if (!selectedEl) return;
		selectedEl.style.color = c;
		markDirty();
	}
	function setFill(c: string) {
		if (!selectedEl) return;
		selectedEl.style.fill = c;
		markDirty();
	}
	function setBackground(c: string) {
		if (!currentSlide) return;
		currentSlide.background = c;
		markDirty();
	}

	// ── Themes ────────────────────────────────────────────────────

	function applyTheme(name: string) {
		if (!themes[name]) return;
		pres.theme = name;
		const t = themes[name];
		// Update every slide background + restyle text elements to theme palette
		pres.slides = pres.slides.map((s) => ({
			...s,
			background: t.defaultBg,
			elements: s.elements.map((e) => {
				if (e.type === 'text') {
					const isTitleish = (e.style.fontSize ?? 0) >= 40;
					return {
						...e,
						style: {
							...e.style,
							fontFamily: t.font,
							color: isTitleish ? t.titleColor : t.bodyColor,
						},
					};
				}
				return e;
			}),
		}));
		markDirty();
	}

	// ── Transitions ───────────────────────────────────────────────

	function setTransition(tr: TransitionKind) {
		if (!currentSlide) return;
		currentSlide.transition = tr;
		markDirty();
	}

	// ── Animations ────────────────────────────────────────────────

	function setAnimation(a: AnimationKind) {
		if (!selectedEl) return;
		selectedEl.animation = a === 'none' ? undefined : a;
		markDirty();
	}

	// ── Thumbnail reorder ─────────────────────────────────────────

	function onThumbDragStart(e: DragEvent, idx: number) {
		dragSlideFrom = idx;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', String(idx));
		}
	}
	function onThumbDragOver(e: DragEvent, idx: number) {
		if (dragSlideFrom == null) return;
		e.preventDefault();
		const target = e.currentTarget as HTMLElement;
		const rect = target.getBoundingClientRect();
		const midY = rect.top + rect.height / 2;
		dragSlideOver = idx;
		dragSlideBefore = e.clientY < midY;
	}
	function onThumbDrop(e: DragEvent) {
		e.preventDefault();
		if (dragSlideFrom == null || dragSlideOver == null) {
			dragSlideFrom = null; dragSlideOver = null; return;
		}
		const from = dragSlideFrom;
		let to = dragSlideOver + (dragSlideBefore ? 0 : 1);
		if (to > from) to -= 1;
		if (from === to) {
			dragSlideFrom = null; dragSlideOver = null; return;
		}
		const newSlides = [...pres.slides];
		const [moved] = newSlides.splice(from, 1);
		newSlides.splice(to, 0, moved);
		// Reindex notes
		const oldNotes = pres.notes;
		const oldOrder = pres.slides.map((s, i) => i);
		const reorderedSlideIds = newSlides.map((s) => s.id);
		const idToOldIdx: Record<string, number> = {};
		pres.slides.forEach((s, i) => { idToOldIdx[s.id] = i; });
		const newNotes: Record<number, string> = {};
		reorderedSlideIds.forEach((id, newIdx) => {
			const oldIdx = idToOldIdx[id];
			if (oldNotes[oldIdx] != null) newNotes[newIdx] = oldNotes[oldIdx];
		});
		pres.slides = newSlides;
		pres.notes = newNotes;
		if (currentIdx === from) currentIdx = to;
		else if (from < currentIdx && to >= currentIdx) currentIdx -= 1;
		else if (from > currentIdx && to <= currentIdx) currentIdx += 1;
		dragSlideFrom = null; dragSlideOver = null;
		void oldOrder;
		markDirty();
	}
	function onThumbDragEnd() {
		dragSlideFrom = null; dragSlideOver = null;
	}

	// ── Present mode ──────────────────────────────────────────────

	function startPresent() {
		presentIdx = currentIdx;
		presenting = true;
		// Try to go fullscreen for the overlay
		setTimeout(() => {
			const node = document.getElementById('pp-present-overlay');
			if (node?.requestFullscreen) {
				node.requestFullscreen().catch(() => { /* ignore */ });
			}
		}, 30);
	}
	function exitPresent() {
		presenting = false;
		if (document.fullscreenElement) {
			document.exitFullscreen().catch(() => { /* ignore */ });
		}
	}
	function nextPresent() {
		if (presentIdx < pres.slides.length - 1) {
			triggerTransitionTo(presentIdx + 1);
		}
	}
	function prevPresent() {
		if (presentIdx > 0) {
			triggerTransitionTo(presentIdx - 1);
		}
	}
	function triggerTransitionTo(newIdx: number) {
		if (transitioning) return;
		transitionFrom = presentIdx;
		transitioning = true;
		presentIdx = newIdx;
		setTimeout(() => { transitioning = false; }, 450);
	}

	function onGlobalKey(e: KeyboardEvent) {
		if (presenting) {
			if (e.key === 'Escape') { exitPresent(); }
			else if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
				e.preventDefault(); nextPresent();
			} else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
				e.preventDefault(); prevPresent();
			}
			return;
		}
		// Don't intercept when typing in input/textarea/contenteditable
		const t = e.target as HTMLElement;
		const isEditing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || (t as any).isContentEditable);
		if (isEditing) return;
		// Only act when our app's stage is focused/visible — coarse check using stageRef
		if (!stageRef) return;
		const rect = stageRef.getBoundingClientRect();
		if (rect.width === 0) return;

		if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElId) {
			e.preventDefault(); deleteElement();
		} else if (e.key === 'PageDown' || e.key === 'ArrowDown') {
			if (currentIdx < pres.slides.length - 1) { currentIdx += 1; selectedElId = null; }
		} else if (e.key === 'PageUp' || e.key === 'ArrowUp') {
			if (currentIdx > 0) { currentIdx -= 1; selectedElId = null; }
		} else if (e.key === 'F5') {
			e.preventDefault(); startPresent();
		} else if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
			e.preventDefault(); savePres();
		}
	}

	// ── PNG export ────────────────────────────────────────────────

	async function exportCurrentSlidePNG() {
		if (!stageRef) return;
		try {
			const canvas = await html2canvas(stageRef, {
				backgroundColor: currentSlide?.background ?? '#ffffff',
				scale: 2,
			});
			const link = document.createElement('a');
			link.download = `slide-${currentIdx + 1}.png`;
			link.href = canvas.toDataURL('image/png');
			link.click();
		} catch (err) {
			window.alert('Export failed: ' + (err as Error).message);
		}
	}

	// ── Formatting helpers ────────────────────────────────────────

	function elStyleString(el: SlideElement): string {
		const parts: string[] = [];
		if (el.style.color) parts.push(`color:${el.style.color}`);
		if (el.style.fontFamily) parts.push(`font-family:${el.style.fontFamily}`);
		if (el.style.fontSize) parts.push(`font-size:${el.style.fontSize}px`);
		if (el.style.fontWeight) parts.push(`font-weight:${el.style.fontWeight}`);
		if (el.style.fontStyle) parts.push(`font-style:${el.style.fontStyle}`);
		if (el.style.textDecoration) parts.push(`text-decoration:${el.style.textDecoration}`);
		if (el.style.textAlign) parts.push(`text-align:${el.style.textAlign}`);
		return parts.join(';');
	}

	function rectStyleString(el: SlideElement): string {
		const fill = el.style.fill ?? 'transparent';
		const stroke = el.style.stroke ?? 'transparent';
		const sw = el.style.strokeWidth ?? 0;
		return `background:${fill};border:${sw}px solid ${stroke}`;
	}

	const FONTS = ['Calibri', 'Arial', 'Segoe UI', 'Georgia', 'Times New Roman', 'Verdana', 'Courier New', '"Trebuchet MS"', '"Comic Sans MS"', '"Century Gothic"', '"Book Antiqua"'];
	const FONT_SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 44, 54, 60, 72, 96];
	const COLORS = ['#000000', '#ffffff', '#e74856', '#0078d4', '#107c10', '#ff8c00', '#6c5ce7', '#fdcb6e', '#1a1a1a', '#9ca3af'];
	const ANIMATIONS: AnimationKind[] = ['none', 'appear', 'fade-in', 'fly-in', 'zoom'];
	const TRANSITIONS: TransitionKind[] = ['none', 'fade', 'slide', 'push'];
	const LAYOUTS: { kind: LayoutKind; label: string; icon: string }[] = [
		{ kind: 'title', label: 'Title', icon: '🪪' },
		{ kind: 'title-content', label: 'Title + Content', icon: '📋' },
		{ kind: 'two-content', label: 'Two Content', icon: '📑' },
		{ kind: 'blank', label: 'Blank', icon: '⬜' },
	];

	function isBold(el: SlideElement | null): boolean {
		if (!el) return false;
		const w = el.style.fontWeight;
		return w === 700 || w === 'bold' || (typeof w === 'number' && w >= 600);
	}
	function isItalic(el: SlideElement | null): boolean {
		return el?.style.fontStyle === 'italic';
	}
	function isUnderline(el: SlideElement | null): boolean {
		return el?.style.textDecoration === 'underline';
	}

	function fmtLastSaved(): string {
		if (!lastSaved) return '';
		const now = new Date();
		const diff = Math.floor((now.getTime() - lastSaved.getTime()) / 1000);
		if (diff < 5) return 'Saved just now';
		if (diff < 60) return `Saved ${diff}s ago`;
		if (diff < 3600) return `Saved ${Math.floor(diff / 60)}m ago`;
		return `Saved ${lastSaved.toLocaleTimeString()}`;
	}

	// ── SVG content for "shape" elements ──────────────────────────

	function svgPathFor(type: ElementType, w: number, h: number): string {
		if (type === 'triangle') {
			return `M ${w / 2} 0 L ${w} ${h} L 0 ${h} Z`;
		}
		if (type === 'star') {
			const cx = w / 2, cy = h / 2;
			const ro = Math.min(w, h) / 2;
			const ri = ro * 0.5;
			let path = '';
			for (let i = 0; i < 10; i++) {
				const r = i % 2 === 0 ? ro : ri;
				const a = (Math.PI / 5) * i - Math.PI / 2;
				const x = cx + Math.cos(a) * r;
				const y = cy + Math.sin(a) * r;
				path += (i === 0 ? 'M ' : 'L ') + x.toFixed(2) + ' ' + y.toFixed(2) + ' ';
			}
			return path + 'Z';
		}
		if (type === 'callout') {
			// Rounded rect with a tail
			const r = 16;
			return `M ${r} 0 L ${w - r} 0 Q ${w} 0 ${w} ${r} L ${w} ${h - 30 - r} Q ${w} ${h - 30} ${w - r} ${h - 30} L ${w * 0.35 + 20} ${h - 30} L ${w * 0.3} ${h} L ${w * 0.35} ${h - 30} L ${r} ${h - 30} Q 0 ${h - 30} 0 ${h - 30 - r} L 0 ${r} Q 0 0 ${r} 0 Z`;
		}
		return '';
	}

	// ── A tiny re-evaluate hook so fmtLastSaved updates the status bar
	let now_tick = $state(0);
	setInterval(() => { now_tick++; }, 5000);
	let savedLabel = $derived.by(() => { void now_tick; return fmtLastSaved(); });

	// Derived for present-mode rendering (avoids {@const} placement issues)
	let presentCurSlide = $derived(pres.slides[presentIdx]);
	let presentPrevSlide = $derived(pres.slides[transitionFrom]);
	let presentInCls = $derived.by(() => {
		if (!transitioning || !presentCurSlide) return '';
		return `incoming transition-${presentCurSlide.transition}`;
	});
	let presentOutCls = $derived.by(() => {
		if (!transitioning || !presentPrevSlide) return '';
		return `outgoing transition-${presentPrevSlide.transition}`;
	});

	void notesRef;
	void stageContainerRef;
</script>

<div class="pp-app">
	<!-- ── Title bar / file menu ─────────────────────────────────── -->
	<div class="pp-titlebar">
		<div class="pp-title-left">
			<span class="pp-app-icon">📊</span>
			<input
				class="pp-title-input"
				type="text"
				bind:value={pres.title}
				oninput={markDirty}
				aria-label="Presentation title"
			/>
			{#if dirty}<span class="pp-dirty">●</span>{/if}
			{#if savedLabel}<span class="pp-saved">{savedLabel}</span>{/if}
		</div>
		<div class="pp-title-right">
			<button class="pp-fbtn" onclick={newPres} title="New">New</button>
			<button class="pp-fbtn" onclick={openPres} title="Open">Open</button>
			<button class="pp-fbtn" onclick={() => savePres(false)} title="Save (Ctrl+S)">Save</button>
			<button class="pp-fbtn pp-present" onclick={startPresent} title="Present (F5)">▶ Present</button>
		</div>
	</div>

	<!-- ── Tab strip ─────────────────────────────────────────────── -->
	<div class="pp-tabstrip">
		<button class="pp-tab" class:active={activeTab === 'home'} onclick={() => activeTab = 'home'}>Home</button>
		<button class="pp-tab" class:active={activeTab === 'insert'} onclick={() => activeTab = 'insert'}>Insert</button>
		<button class="pp-tab" class:active={activeTab === 'design'} onclick={() => activeTab = 'design'}>Design</button>
		<button class="pp-tab" class:active={activeTab === 'transitions'} onclick={() => activeTab = 'transitions'}>Transitions</button>
		<button class="pp-tab" class:active={activeTab === 'animations'} onclick={() => activeTab = 'animations'}>Animations</button>
		<button class="pp-tab" class:active={activeTab === 'slideshow'} onclick={() => activeTab = 'slideshow'}>Slide Show</button>
	</div>

	<!-- ── Ribbon ────────────────────────────────────────────────── -->
	<div class="pp-ribbon">
		{#if activeTab === 'home'}
			<div class="rib-group">
				<button class="rib-btn" onclick={() => addSlide('title-content')} title="New slide">
					<span class="rib-glyph">＋</span><span>New slide</span>
				</button>
				<div class="rib-mini">
					<button class="rib-btn-mini" onclick={() => duplicateSlide(currentIdx)} title="Duplicate slide">Duplicate</button>
					<button class="rib-btn-mini" onclick={() => deleteSlide(currentIdx)} title="Delete slide">Delete</button>
				</div>
			</div>
			<div class="rib-sep"></div>

			<div class="rib-group">
				<div class="rib-label">Layout</div>
				<div class="layout-grid">
					{#each LAYOUTS as L (L.kind)}
						<button class="layout-btn" class:active={currentSlide?.layout === L.kind} onclick={() => applyLayout(L.kind)} title={L.label}>
							<span class="layout-icon">{L.icon}</span>
							<span class="layout-name">{L.label}</span>
						</button>
					{/each}
				</div>
			</div>
			<div class="rib-sep"></div>

			<div class="rib-group rib-font" class:dim={!selectedEl || selectedEl.type !== 'text'}>
				<div class="rib-label">Font</div>
				<div class="rib-row">
					<select
						class="font-select"
						value={selectedEl?.style.fontFamily ?? currentTheme.font}
						onchange={(e) => setFontFamily((e.currentTarget as HTMLSelectElement).value)}
						disabled={!selectedEl || selectedEl.type !== 'text'}
					>
						{#each FONTS as f (f)}
							<option value={f} style:font-family={f}>{f.replace(/"/g, '')}</option>
						{/each}
					</select>
					<select
						class="size-select"
						value={selectedEl?.style.fontSize ?? 24}
						onchange={(e) => setFontSize(parseInt((e.currentTarget as HTMLSelectElement).value, 10))}
						disabled={!selectedEl || selectedEl.type !== 'text'}
					>
						{#each FONT_SIZES as s (s)}
							<option value={s}>{s}</option>
						{/each}
					</select>
				</div>
				<div class="rib-row">
					<button class="fmt-btn" class:on={isBold(selectedEl)} onclick={toggleBold} disabled={!selectedEl || selectedEl.type !== 'text'}><b>B</b></button>
					<button class="fmt-btn" class:on={isItalic(selectedEl)} onclick={toggleItalic} disabled={!selectedEl || selectedEl.type !== 'text'}><i>I</i></button>
					<button class="fmt-btn" class:on={isUnderline(selectedEl)} onclick={toggleUnderline} disabled={!selectedEl || selectedEl.type !== 'text'}><u>U</u></button>
					<div class="fmt-color">
						<label class="fmt-btn fmt-color-btn" title="Text color">
							<span style:color={selectedEl?.style.color ?? '#000'}>A</span>
							<input type="color" value={selectedEl?.style.color ?? '#000000'} oninput={(e) => setTextColor((e.currentTarget as HTMLInputElement).value)} disabled={!selectedEl} />
						</label>
					</div>
					<div class="fmt-divider"></div>
					<button class="fmt-btn" class:on={selectedEl?.style.textAlign === 'left'} onclick={() => setAlign('left')} disabled={!selectedEl || selectedEl.type !== 'text'}>⯇</button>
					<button class="fmt-btn" class:on={selectedEl?.style.textAlign === 'center'} onclick={() => setAlign('center')} disabled={!selectedEl || selectedEl.type !== 'text'}>≡</button>
					<button class="fmt-btn" class:on={selectedEl?.style.textAlign === 'right'} onclick={() => setAlign('right')} disabled={!selectedEl || selectedEl.type !== 'text'}>⯈</button>
				</div>
			</div>
			<div class="rib-sep"></div>

			<div class="rib-group">
				<div class="rib-label">Arrange</div>
				<div class="rib-row">
					<button class="rib-btn-mini" onclick={() => moveLayer('front')} disabled={!selectedEl} title="Bring to front">⤴ Front</button>
					<button class="rib-btn-mini" onclick={() => moveLayer('forward')} disabled={!selectedEl} title="Bring forward">↑</button>
					<button class="rib-btn-mini" onclick={() => moveLayer('backward')} disabled={!selectedEl} title="Send backward">↓</button>
					<button class="rib-btn-mini" onclick={() => moveLayer('back')} disabled={!selectedEl} title="Send to back">⤵ Back</button>
				</div>
				<div class="rib-row">
					<button class="rib-btn-mini danger" onclick={deleteElement} disabled={!selectedEl}>🗑 Delete</button>
				</div>
			</div>
		{/if}

		{#if activeTab === 'insert'}
			<div class="rib-group">
				<div class="rib-label">Text</div>
				<button class="rib-btn" onclick={() => addElement('text')}>
					<span class="rib-glyph">T</span><span>Text</span>
				</button>
			</div>
			<div class="rib-sep"></div>
			<div class="rib-group">
				<div class="rib-label">Shapes</div>
				<div class="rib-row shapes-row">
					<button class="shape-btn" onclick={() => addElement('rect')} title="Rectangle">▭</button>
					<button class="shape-btn" onclick={() => addElement('ellipse')} title="Ellipse">⬭</button>
					<button class="shape-btn" onclick={() => addElement('triangle')} title="Triangle">▲</button>
					<button class="shape-btn" onclick={() => addElement('line')} title="Line">━</button>
					<button class="shape-btn" onclick={() => addElement('arrow')} title="Arrow">➜</button>
					<button class="shape-btn" onclick={() => addElement('star')} title="Star">★</button>
					<button class="shape-btn" onclick={() => addElement('callout')} title="Callout">💬</button>
				</div>
			</div>
			<div class="rib-sep"></div>
			<div class="rib-group">
				<div class="rib-label">Media</div>
				<button class="rib-btn" onclick={() => addElement('image')}>
					<span class="rib-glyph">🖼</span><span>Image</span>
				</button>
			</div>
			{#if selectedEl && selectedEl.type !== 'text' && selectedEl.type !== 'line' && selectedEl.type !== 'arrow'}
				<div class="rib-sep"></div>
				<div class="rib-group">
					<div class="rib-label">Fill</div>
					<div class="color-strip">
						{#each COLORS as c (c)}
							<button class="color-swatch" style:background={c} onclick={() => setFill(c)} title={c}></button>
						{/each}
						<label class="color-swatch color-custom" title="Custom color" style:background={selectedEl.style.fill ?? '#999'}>
							<input type="color" value={selectedEl.style.fill ?? '#000000'} oninput={(e) => setFill((e.currentTarget as HTMLInputElement).value)} />
						</label>
					</div>
				</div>
			{/if}
		{/if}

		{#if activeTab === 'design'}
			<div class="rib-group">
				<div class="rib-label">Themes</div>
				<div class="theme-row">
					{#each Object.values(themes) as t (t.name)}
						<button class="theme-card" class:active={pres.theme === t.name} onclick={() => applyTheme(t.name)} title={t.name}>
							<div class="theme-card-preview" style:background={t.defaultBg}>
								<div class="theme-card-title" style:color={t.titleColor} style:font-family={t.font}>Aa</div>
								<div class="theme-card-bars">
									{#each t.colors.slice(0, 4) as c (c)}
										<span style:background={c}></span>
									{/each}
								</div>
							</div>
							<div class="theme-card-name">{t.name}</div>
						</button>
					{/each}
				</div>
			</div>
			<div class="rib-sep"></div>
			<div class="rib-group">
				<div class="rib-label">Slide background</div>
				<div class="color-strip">
					{#each currentTheme.colors as c (c)}
						<button class="color-swatch" style:background={c} onclick={() => setBackground(c)} title={c}></button>
					{/each}
					<label class="color-swatch color-custom" title="Custom color" style:background={currentSlide?.background ?? '#fff'}>
						<input type="color" value={currentSlide?.background ?? '#ffffff'} oninput={(e) => setBackground((e.currentTarget as HTMLInputElement).value)} />
					</label>
				</div>
			</div>
			<div class="rib-sep"></div>
			<div class="rib-group">
				<div class="rib-label">Export</div>
				<button class="rib-btn" onclick={exportCurrentSlidePNG} title="Export current slide as PNG">
					<span class="rib-glyph">📷</span><span>Export PNG</span>
				</button>
			</div>
		{/if}

		{#if activeTab === 'transitions'}
			<div class="rib-group">
				<div class="rib-label">Transition for this slide</div>
				<div class="rib-row">
					{#each TRANSITIONS as tr (tr)}
						<button class="transition-btn" class:active={currentSlide?.transition === tr} onclick={() => setTransition(tr)}>
							<span class="transition-icon">
								{#if tr === 'none'}∅{:else if tr === 'fade'}◐{:else if tr === 'slide'}⇨{:else}↦{/if}
							</span>
							<span>{tr.charAt(0).toUpperCase() + tr.slice(1)}</span>
						</button>
					{/each}
				</div>
				<div class="rib-hint">Transitions play in Present mode (F5).</div>
			</div>
		{/if}

		{#if activeTab === 'animations'}
			<div class="rib-group">
				<div class="rib-label">Entrance animation for selected element</div>
				<div class="rib-row">
					{#each ANIMATIONS as a (a)}
						<button
							class="transition-btn"
							class:active={(selectedEl?.animation ?? 'none') === a}
							onclick={() => setAnimation(a)}
							disabled={!selectedEl}
						>
							<span class="transition-icon">
								{#if a === 'none'}∅{:else if a === 'appear'}◌{:else if a === 'fade-in'}◐{:else if a === 'fly-in'}✈{:else}🔍{/if}
							</span>
							<span>{a === 'none' ? 'None' : a.charAt(0).toUpperCase() + a.slice(1).replace('-', ' ')}</span>
						</button>
					{/each}
				</div>
				<div class="rib-hint">{selectedEl ? 'Animation applied to selected element.' : 'Select an element to apply an animation.'}</div>
			</div>
		{/if}

		{#if activeTab === 'slideshow'}
			<div class="rib-group">
				<button class="rib-btn" onclick={startPresent}>
					<span class="rib-glyph">▶</span><span>From start</span>
				</button>
				<button class="rib-btn" onclick={() => { presentIdx = currentIdx; presenting = true; }}>
					<span class="rib-glyph">▷</span><span>From current slide</span>
				</button>
			</div>
		{/if}
	</div>

	<!-- ── Main work area ───────────────────────────────────────── -->
	<div class="pp-body">
		<!-- Thumbnail strip -->
		<div class="pp-thumbs" ondrop={onThumbDrop} ondragover={(e) => e.preventDefault()}>
			{#each pres.slides as slide, i (slide.id)}
				<div
					class="thumb-row"
					class:active={i === currentIdx}
					class:dragging={dragSlideFrom === i}
				>
					{#if dragSlideOver === i && dragSlideBefore}
						<div class="thumb-drop-line"></div>
					{/if}
					<button
						class="thumb-btn"
						draggable="true"
						ondragstart={(e) => onThumbDragStart(e, i)}
						ondragover={(e) => onThumbDragOver(e, i)}
						ondragend={onThumbDragEnd}
						onclick={() => { currentIdx = i; selectedElId = null; }}
						title={`Slide ${i + 1}`}
					>
						<span class="thumb-num">{i + 1}</span>
						<div class="thumb-canvas" style:background={slide.background}>
							{#each slide.elements as el (el.id)}
								{@const sx = 160 / SLIDE_W}
								{@const sy = 90 / SLIDE_H}
								{#if el.type === 'text'}
									<div class="thumb-text"
										style:left="{el.x * sx}px"
										style:top="{el.y * sy}px"
										style:width="{el.w * sx}px"
										style:height="{el.h * sy}px"
										style:color={el.style.color}
										style:font-family={el.style.fontFamily}
										style:font-size="{Math.max(4, Math.round((el.style.fontSize ?? 14) * sx))}px"
										style:font-weight={el.style.fontWeight}
										style:font-style={el.style.fontStyle}
										style:text-align={el.style.textAlign}
									>{el.content.split('\n')[0]}</div>
								{:else if el.type === 'rect'}
									<div class="thumb-shape"
										style:left="{el.x * sx}px"
										style:top="{el.y * sy}px"
										style:width="{el.w * sx}px"
										style:height="{el.h * sy}px"
										style:background={el.style.fill}
									></div>
								{:else if el.type === 'ellipse'}
									<div class="thumb-shape ellipse"
										style:left="{el.x * sx}px"
										style:top="{el.y * sy}px"
										style:width="{el.w * sx}px"
										style:height="{el.h * sy}px"
										style:background={el.style.fill}
									></div>
								{:else}
									<div class="thumb-shape"
										style:left="{el.x * sx}px"
										style:top="{el.y * sy}px"
										style:width="{el.w * sx}px"
										style:height="{el.h * sy}px"
										style:background={el.style.fill ?? el.style.stroke ?? '#ccc'}
									></div>
								{/if}
							{/each}
						</div>
					</button>
					{#if dragSlideOver === i && !dragSlideBefore}
						<div class="thumb-drop-line"></div>
					{/if}
				</div>
			{/each}
			<button class="thumb-add" onclick={() => addSlide('title-content')} title="Add slide">+ New slide</button>
		</div>

		<!-- Stage + notes column -->
		<div class="pp-mainpane">
			<div
				class="pp-stage-container"
				bind:this={stageContainerRef}
				onwheel={onStageWheel}
			>
				<div
					class="pp-stage-wrap"
					style:transform={`scale(${zoom})`}
				>
					<div
						class="pp-stage slide-stage-bg"
						bind:this={stageRef}
						style:width="{SLIDE_W}px"
						style:height="{SLIDE_H}px"
						style:background={currentSlide?.background}
						onclick={onStageBackgroundClick}
					>
						{#if currentSlide}
							{#each currentSlide.elements as el (el.id)}
								<div
									class="pp-el"
									class:selected={selectedElId === el.id}
									style:left="{el.x}px"
									style:top="{el.y}px"
									style:width="{el.w}px"
									style:height="{el.h}px"
									onpointerdown={(e) => startElementDrag(e, el)}
									onclick={(e) => { e.stopPropagation(); selectedElId = el.id; }}
									ondblclick={(e) => { e.stopPropagation(); beginInlineEdit(el); }}
									role="button"
									tabindex="-1"
								>
									{#if el.type === 'text'}
										{#if editingElId === el.id}
											<!-- svelte-ignore a11y_no_static_element_interactions -->
											<div
												id="inline-edit-{el.id}"
												class="pp-el-text editing"
												contenteditable="true"
												style={elStyleString(el)}
												onkeydown={onInlineKey}
												onblur={commitInlineEdit}
											>{editingText}</div>
										{:else}
											<div class="pp-el-text" style={elStyleString(el)}>{el.content}</div>
										{/if}
									{:else if el.type === 'rect'}
										<div class="pp-el-shape" style={rectStyleString(el)}></div>
									{:else if el.type === 'ellipse'}
										<div class="pp-el-shape ellipse" style={rectStyleString(el)}></div>
									{:else if el.type === 'image'}
										{#if el.content && el.content.startsWith('data:')}
											<img src={el.content} alt="slide" class="pp-el-img" />
										{:else}
											<div class="pp-el-shape pp-el-img-ph" style={rectStyleString(el)}>
												<span class="pp-img-emoji">🖼️</span>
											</div>
										{/if}
									{:else if el.type === 'line'}
										<svg class="pp-el-svg" viewBox="0 0 {el.w} {el.h}" preserveAspectRatio="none">
											<line x1="0" y1={el.h / 2} x2={el.w} y2={el.h / 2}
												stroke={el.style.stroke ?? '#000'}
												stroke-width={el.style.strokeWidth ?? 4}
												stroke-linecap="round" />
										</svg>
									{:else if el.type === 'arrow'}
										<svg class="pp-el-svg" viewBox="0 0 {el.w} {el.h}" preserveAspectRatio="none">
											<defs>
												<marker id="arrowhead-{el.id}" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
													<polygon points="0 0, 6 3, 0 6" fill={el.style.stroke ?? '#000'} />
												</marker>
											</defs>
											<line x1="0" y1={el.h / 2} x2={el.w - 10} y2={el.h / 2}
												stroke={el.style.stroke ?? '#000'}
												stroke-width={el.style.strokeWidth ?? 4}
												marker-end="url(#arrowhead-{el.id})" />
										</svg>
									{:else if el.type === 'triangle' || el.type === 'star'}
										<svg class="pp-el-svg" viewBox="0 0 {el.w} {el.h}" preserveAspectRatio="none">
											<path d={svgPathFor(el.type, el.w, el.h)}
												fill={el.style.fill ?? '#0078d4'}
												stroke={el.style.stroke ?? 'none'}
												stroke-width={el.style.strokeWidth ?? 0} />
										</svg>
									{:else if el.type === 'callout'}
										<svg class="pp-el-svg" viewBox="0 0 {el.w} {el.h}" preserveAspectRatio="none">
											<path d={svgPathFor('callout', el.w, el.h)}
												fill={el.style.fill ?? '#fff8b0'}
												stroke={el.style.stroke ?? '#999'}
												stroke-width={el.style.strokeWidth ?? 1} />
										</svg>
										{#if editingElId === el.id}
											<div
												id="inline-edit-{el.id}"
												class="pp-el-text editing pp-callout-text"
												contenteditable="true"
												style={elStyleString(el)}
												onkeydown={onInlineKey}
												onblur={commitInlineEdit}
											>{editingText}</div>
										{:else}
											<div class="pp-el-text pp-callout-text" style={elStyleString(el)}>{el.content}</div>
										{/if}
									{/if}

									{#if selectedElId === el.id && !editingElId}
										{#each HANDLES as h (h)}
											<div
												class="pp-handle pp-handle-{h}"
												style:cursor={handleCursor(h)}
												onpointerdown={(e) => startResize(e, el, h)}
											></div>
										{/each}
									{/if}
								</div>
							{/each}
						{/if}
					</div>
				</div>
			</div>

			<!-- Notes panel -->
			<div class="pp-notes">
				<div class="pp-notes-header">
					<span>Notes</span>
					<span class="pp-notes-hint">Notes for slide {currentIdx + 1}</span>
				</div>
				<textarea
					class="pp-notes-area"
					bind:this={notesRef}
					value={notesValue}
					oninput={onNotesInput}
					placeholder="Click to add speaker notes…"
				></textarea>
			</div>
		</div>
	</div>

	<!-- ── Status bar ───────────────────────────────────────────── -->
	<div class="pp-status">
		<span class="pp-status-item">Slide {currentIdx + 1} of {pres.slides.length}</span>
		<span class="pp-status-item">Theme: {pres.theme}</span>
		{#if hasNotes}
			<span class="pp-status-item pp-status-ok">Notes ✓</span>
		{/if}
		<span class="pp-status-spacer"></span>
		<button class="pp-status-btn" onclick={() => setZoom(Math.max(0.5, +(zoom - 0.1).toFixed(2)))} title="Zoom out">−</button>
		<input
			class="pp-zoom-slider"
			type="range"
			min="50"
			max="200"
			step="10"
			value={Math.round(zoom * 100)}
			oninput={(e) => setZoom(parseInt((e.currentTarget as HTMLInputElement).value, 10) / 100)}
		/>
		<button class="pp-status-btn" onclick={() => setZoom(Math.min(2, +(zoom + 0.1).toFixed(2)))} title="Zoom in">+</button>
		<span class="pp-status-item pp-zoom-pct">{Math.round(zoom * 100)}%</span>
	</div>
</div>

<!-- ── Present mode overlay ───────────────────────────────────── -->
{#if presenting}
	<div id="pp-present-overlay" class="pp-present-overlay" tabindex="-1">
		{#if transitioning && presentPrevSlide}
			<div class={`pp-present-slide ${presentOutCls}`} style:background={presentPrevSlide.background}>
				{#each presentPrevSlide.elements as el (el.id)}
					<div class="pp-present-el"
						style:left="{(el.x / SLIDE_W) * 100}%"
						style:top="{(el.y / SLIDE_H) * 100}%"
						style:width="{(el.w / SLIDE_W) * 100}%"
						style:height="{(el.h / SLIDE_H) * 100}%"
					>
						{#if el.type === 'text'}
							<div class="pp-present-text" style={elStyleString(el)}>{el.content}</div>
						{:else if el.type === 'rect'}
							<div class="pp-el-shape" style={rectStyleString(el)}></div>
						{:else if el.type === 'ellipse'}
							<div class="pp-el-shape ellipse" style={rectStyleString(el)}></div>
						{:else if el.type === 'image'}
							{#if el.content && el.content.startsWith('data:')}
								<img src={el.content} alt="" class="pp-el-img" />
							{:else}
								<div class="pp-el-shape pp-el-img-ph" style={rectStyleString(el)}><span class="pp-img-emoji">🖼️</span></div>
							{/if}
						{:else if el.type === 'line'}
							<svg class="pp-el-svg" viewBox="0 0 {el.w} {el.h}" preserveAspectRatio="none">
								<line x1="0" y1={el.h / 2} x2={el.w} y2={el.h / 2} stroke={el.style.stroke ?? '#000'} stroke-width={el.style.strokeWidth ?? 4} stroke-linecap="round" />
							</svg>
						{:else if el.type === 'arrow'}
							<svg class="pp-el-svg" viewBox="0 0 {el.w} {el.h}" preserveAspectRatio="none">
								<defs><marker id="arrp-{el.id}" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><polygon points="0 0, 6 3, 0 6" fill={el.style.stroke ?? '#000'} /></marker></defs>
								<line x1="0" y1={el.h / 2} x2={el.w - 10} y2={el.h / 2} stroke={el.style.stroke ?? '#000'} stroke-width={el.style.strokeWidth ?? 4} marker-end="url(#arrp-{el.id})" />
							</svg>
						{:else if el.type === 'triangle' || el.type === 'star'}
							<svg class="pp-el-svg" viewBox="0 0 {el.w} {el.h}" preserveAspectRatio="none">
								<path d={svgPathFor(el.type, el.w, el.h)} fill={el.style.fill ?? '#0078d4'} />
							</svg>
						{:else if el.type === 'callout'}
							<svg class="pp-el-svg" viewBox="0 0 {el.w} {el.h}" preserveAspectRatio="none">
								<path d={svgPathFor('callout', el.w, el.h)} fill={el.style.fill ?? '#fff8b0'} stroke={el.style.stroke ?? '#999'} />
							</svg>
							<div class="pp-present-text pp-callout-text" style={elStyleString(el)}>{el.content}</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
		{#if presentCurSlide}
			<div class={`pp-present-slide ${presentInCls}`} style:background={presentCurSlide.background}>
				{#each presentCurSlide.elements as el, i (el.id)}
					<div
						class={`pp-present-el ${el.animation ? 'anim-' + el.animation : ''}`}
						style:left="{(el.x / SLIDE_W) * 100}%"
						style:top="{(el.y / SLIDE_H) * 100}%"
						style:width="{(el.w / SLIDE_W) * 100}%"
						style:height="{(el.h / SLIDE_H) * 100}%"
						style:animation-delay="{el.animation ? (i * 0.08) + 's' : '0s'}"
					>
						{#if el.type === 'text'}
							<div class="pp-present-text" style={elStyleString(el)}>{el.content}</div>
						{:else if el.type === 'rect'}
							<div class="pp-el-shape" style={rectStyleString(el)}></div>
						{:else if el.type === 'ellipse'}
							<div class="pp-el-shape ellipse" style={rectStyleString(el)}></div>
						{:else if el.type === 'image'}
							{#if el.content && el.content.startsWith('data:')}
								<img src={el.content} alt="" class="pp-el-img" />
							{:else}
								<div class="pp-el-shape pp-el-img-ph" style={rectStyleString(el)}><span class="pp-img-emoji">🖼️</span></div>
							{/if}
						{:else if el.type === 'line'}
							<svg class="pp-el-svg" viewBox="0 0 {el.w} {el.h}" preserveAspectRatio="none">
								<line x1="0" y1={el.h / 2} x2={el.w} y2={el.h / 2} stroke={el.style.stroke ?? '#000'} stroke-width={el.style.strokeWidth ?? 4} stroke-linecap="round" />
							</svg>
						{:else if el.type === 'arrow'}
							<svg class="pp-el-svg" viewBox="0 0 {el.w} {el.h}" preserveAspectRatio="none">
								<defs><marker id="arrp2-{el.id}" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><polygon points="0 0, 6 3, 0 6" fill={el.style.stroke ?? '#000'} /></marker></defs>
								<line x1="0" y1={el.h / 2} x2={el.w - 10} y2={el.h / 2} stroke={el.style.stroke ?? '#000'} stroke-width={el.style.strokeWidth ?? 4} marker-end="url(#arrp2-{el.id})" />
							</svg>
						{:else if el.type === 'triangle' || el.type === 'star'}
							<svg class="pp-el-svg" viewBox="0 0 {el.w} {el.h}" preserveAspectRatio="none">
								<path d={svgPathFor(el.type, el.w, el.h)} fill={el.style.fill ?? '#0078d4'} />
							</svg>
						{:else if el.type === 'callout'}
							<svg class="pp-el-svg" viewBox="0 0 {el.w} {el.h}" preserveAspectRatio="none">
								<path d={svgPathFor('callout', el.w, el.h)} fill={el.style.fill ?? '#fff8b0'} stroke={el.style.stroke ?? '#999'} />
							</svg>
							<div class="pp-present-text pp-callout-text" style={elStyleString(el)}>{el.content}</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}

		<div class="pp-present-controls">
			<button onclick={prevPresent} disabled={presentIdx === 0}>← Prev</button>
			<span class="pp-present-num">{presentIdx + 1} / {pres.slides.length}</span>
			<button onclick={nextPresent} disabled={presentIdx === pres.slides.length - 1}>Next →</button>
			<button onclick={exitPresent}>✕ Exit (Esc)</button>
		</div>
	</div>
{/if}

<style>
	.pp-app {
		height: 100%;
		display: flex;
		flex-direction: column;
		background: #f3f3f3;
		color: #222;
		font-family: 'Segoe UI', system-ui, sans-serif;
		font-size: 13px;
		overflow: hidden;
	}

	/* ── Title bar ───────────────────────────────────────────── */
	.pp-titlebar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 4px 12px;
		background: #b7472a;
		color: #fff;
		flex-shrink: 0;
	}
	.pp-title-left { display: flex; align-items: center; gap: 8px; }
	.pp-app-icon { font-size: 16px; }
	.pp-title-input {
		background: transparent;
		border: none;
		color: white;
		font-size: 13px;
		padding: 2px 6px;
		border-radius: 3px;
		min-width: 180px;
		outline: none;
	}
	.pp-title-input:focus { background: rgba(255,255,255,0.15); }
	.pp-dirty { color: #ffe066; font-size: 16px; line-height: 1; }
	.pp-saved { font-size: 11px; opacity: 0.85; margin-left: 4px; }
	.pp-title-right { display: flex; align-items: center; gap: 4px; }
	.pp-fbtn {
		background: transparent;
		border: 1px solid transparent;
		color: white;
		padding: 4px 10px;
		border-radius: 3px;
		cursor: pointer;
		font-size: 12px;
	}
	.pp-fbtn:hover { background: rgba(255,255,255,0.15); }
	.pp-fbtn.pp-present { background: rgba(255,255,255,0.18); border-color: rgba(255,255,255,0.3); }
	.pp-fbtn.pp-present:hover { background: rgba(255,255,255,0.28); }

	/* ── Tab strip ──────────────────────────────────────────── */
	.pp-tabstrip {
		display: flex;
		gap: 2px;
		padding: 0 12px;
		background: #d6442a;
		flex-shrink: 0;
	}
	.pp-tab {
		background: transparent;
		border: none;
		color: white;
		padding: 6px 14px;
		font-size: 12px;
		cursor: pointer;
		border-radius: 3px 3px 0 0;
	}
	.pp-tab:hover { background: rgba(255,255,255,0.15); }
	.pp-tab.active { background: #f3f3f3; color: #222; }

	/* ── Ribbon ─────────────────────────────────────────────── */
	.pp-ribbon {
		display: flex;
		align-items: stretch;
		gap: 4px;
		padding: 8px 12px;
		background: #f3f3f3;
		border-bottom: 1px solid #e0e0e0;
		flex-shrink: 0;
		min-height: 90px;
		overflow-x: auto;
	}
	.rib-group { display: flex; flex-direction: column; gap: 4px; padding: 0 6px; }
	.rib-group.dim { opacity: 0.5; }
	.rib-label { font-size: 10px; color: #666; text-align: center; order: 99; }
	.rib-sep { width: 1px; background: #ddd; margin: 0 4px; }
	.rib-row { display: flex; gap: 2px; align-items: center; }
	.rib-mini { display: flex; gap: 2px; }
	.rib-hint { font-size: 11px; color: #777; padding-top: 4px; }

	.rib-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		padding: 6px 12px;
		min-width: 64px;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 4px;
		cursor: pointer;
		color: #222;
		font-size: 11px;
	}
	.rib-btn:hover { background: #e5e5e5; }
	.rib-glyph { font-size: 18px; line-height: 1; }
	.rib-btn-mini {
		background: transparent;
		border: 1px solid transparent;
		border-radius: 3px;
		padding: 3px 8px;
		cursor: pointer;
		color: #222;
		font-size: 11px;
	}
	.rib-btn-mini:hover { background: #e5e5e5; }
	.rib-btn-mini:disabled, .rib-btn:disabled { opacity: 0.4; cursor: not-allowed; }
	.rib-btn-mini.danger:hover { background: #fde2e2; color: #b00; }

	.layout-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 2px;
	}
	.layout-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1px;
		padding: 4px 8px;
		background: transparent;
		border: 1px solid #ddd;
		border-radius: 3px;
		cursor: pointer;
		font-size: 10px;
		color: #222;
	}
	.layout-btn:hover { background: #e5e5e5; }
	.layout-btn.active { background: #fde7e0; border-color: #b7472a; }
	.layout-icon { font-size: 14px; }
	.layout-name { font-size: 10px; }

	.font-select { padding: 3px 6px; font-size: 12px; min-width: 130px; border: 1px solid #c8c8c8; border-radius: 2px; background: white; }
	.size-select { padding: 3px 6px; font-size: 12px; width: 50px; border: 1px solid #c8c8c8; border-radius: 2px; background: white; }

	.fmt-btn {
		min-width: 26px;
		height: 26px;
		padding: 0 6px;
		background: white;
		border: 1px solid #c8c8c8;
		border-radius: 2px;
		cursor: pointer;
		font-size: 13px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		color: #222;
	}
	.fmt-btn:hover { background: #f0f0f0; }
	.fmt-btn.on { background: #fde7e0; border-color: #b7472a; }
	.fmt-btn:disabled { opacity: 0.4; cursor: not-allowed; }
	.fmt-divider { width: 1px; height: 22px; background: #ccc; margin: 0 4px; }
	.fmt-color { position: relative; }
	.fmt-color-btn { position: relative; cursor: pointer; }
	.fmt-color-btn input[type=color] {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
		width: 100%;
		height: 100%;
	}

	.shapes-row { flex-wrap: wrap; max-width: 200px; }
	.shape-btn {
		width: 32px;
		height: 32px;
		background: white;
		border: 1px solid #c8c8c8;
		border-radius: 3px;
		cursor: pointer;
		font-size: 16px;
		color: #222;
	}
	.shape-btn:hover { background: #fde7e0; border-color: #b7472a; }

	.color-strip { display: flex; gap: 3px; flex-wrap: wrap; max-width: 220px; }
	.color-swatch {
		width: 22px;
		height: 22px;
		border: 1px solid #aaa;
		border-radius: 2px;
		cursor: pointer;
		padding: 0;
		position: relative;
	}
	.color-swatch:hover { transform: scale(1.1); }
	.color-custom input[type=color] {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
		width: 100%;
		height: 100%;
	}

	.theme-row { display: flex; gap: 6px; }
	.theme-card {
		background: white;
		border: 1px solid #c8c8c8;
		border-radius: 3px;
		padding: 4px;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
		width: 80px;
	}
	.theme-card:hover { border-color: #b7472a; }
	.theme-card.active { border-color: #b7472a; border-width: 2px; padding: 3px; }
	.theme-card-preview {
		width: 70px;
		height: 40px;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		padding: 4px;
		border-radius: 2px;
	}
	.theme-card-title { font-size: 14px; font-weight: 700; line-height: 1; }
	.theme-card-bars { display: flex; gap: 1px; }
	.theme-card-bars span { width: 8px; height: 4px; }
	.theme-card-name { font-size: 10px; color: #444; }

	.transition-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: 6px 10px;
		min-width: 60px;
		background: white;
		border: 1px solid #c8c8c8;
		border-radius: 3px;
		cursor: pointer;
		font-size: 11px;
		color: #222;
	}
	.transition-btn:hover { background: #fde7e0; border-color: #b7472a; }
	.transition-btn.active { background: #fde7e0; border-color: #b7472a; }
	.transition-btn:disabled { opacity: 0.4; cursor: not-allowed; }
	.transition-icon { font-size: 16px; line-height: 1; }

	/* ── Body / panes ───────────────────────────────────────── */
	.pp-body { flex: 1; display: flex; min-height: 0; overflow: hidden; }

	.pp-thumbs {
		width: 180px;
		flex-shrink: 0;
		background: #ebebeb;
		border-right: 1px solid #d4d4d4;
		overflow-y: auto;
		padding: 8px 0;
	}
	.thumb-row {
		position: relative;
		padding: 4px 8px;
	}
	.thumb-row.dragging { opacity: 0.4; }
	.thumb-btn {
		display: flex;
		gap: 6px;
		align-items: center;
		width: 100%;
		padding: 4px;
		background: transparent;
		border: 2px solid transparent;
		border-radius: 4px;
		cursor: pointer;
		text-align: left;
	}
	.thumb-row.active .thumb-btn { border-color: #b7472a; }
	.thumb-btn:hover { background: rgba(0,0,0,0.04); }
	.thumb-num {
		width: 16px;
		font-size: 10px;
		color: #666;
		text-align: right;
	}
	.thumb-canvas {
		width: 160px;
		height: 90px;
		background: white;
		border: 1px solid #c8c8c8;
		position: relative;
		overflow: hidden;
		flex-shrink: 0;
	}
	.thumb-text {
		position: absolute;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		line-height: 1.1;
	}
	.thumb-shape {
		position: absolute;
	}
	.thumb-shape.ellipse { border-radius: 50%; }
	.thumb-drop-line {
		position: absolute;
		left: 8px;
		right: 8px;
		height: 2px;
		background: #b7472a;
		border-radius: 1px;
	}
	.thumb-row .thumb-drop-line:first-child { top: 0; }
	.thumb-row .thumb-drop-line:last-child { bottom: 0; }
	.thumb-add {
		display: block;
		margin: 8px;
		padding: 8px;
		background: transparent;
		border: 1px dashed #999;
		border-radius: 4px;
		color: #555;
		font-size: 11px;
		cursor: pointer;
		width: calc(100% - 16px);
	}
	.thumb-add:hover { background: rgba(0,0,0,0.04); border-color: #b7472a; color: #b7472a; }

	.pp-mainpane {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.pp-stage-container {
		flex: 1;
		min-height: 0;
		overflow: auto;
		background: #d4d4d4;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 20px;
	}
	.pp-stage-wrap {
		transform-origin: center center;
		transition: transform 0.1s ease-out;
	}
	.pp-stage {
		position: relative;
		background: white;
		box-shadow: 0 4px 24px rgba(0,0,0,0.25);
		overflow: hidden;
	}

	.pp-el {
		position: absolute;
		cursor: move;
		user-select: none;
	}
	.pp-el.selected { outline: 2px dashed #b7472a; outline-offset: 2px; }
	.pp-el-text {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		justify-content: flex-start;
		padding: 4px;
		overflow: hidden;
		white-space: pre-wrap;
		word-wrap: break-word;
		line-height: 1.25;
		box-sizing: border-box;
		outline: none;
	}
	.pp-el-text.editing {
		background: rgba(255,255,255,0.6);
		cursor: text;
	}
	.pp-el-shape {
		width: 100%;
		height: 100%;
		box-sizing: border-box;
	}
	.pp-el-shape.ellipse { border-radius: 50%; }
	.pp-el-img { width: 100%; height: 100%; object-fit: contain; pointer-events: none; }
	.pp-el-img-ph {
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.pp-img-emoji { font-size: 48px; opacity: 0.5; }
	.pp-el-svg { width: 100%; height: 100%; overflow: visible; pointer-events: none; }
	.pp-callout-text {
		position: absolute;
		inset: 6px;
		bottom: 36px;
		width: auto;
		height: auto;
	}

	/* Resize handles */
	.pp-handle {
		position: absolute;
		width: 10px;
		height: 10px;
		background: white;
		border: 1px solid #b7472a;
		border-radius: 2px;
		z-index: 10;
	}
	.pp-handle-n  { top: -5px;        left: 50%;        transform: translateX(-50%); }
	.pp-handle-s  { bottom: -5px;     left: 50%;        transform: translateX(-50%); }
	.pp-handle-e  { top: 50%;         right: -5px;      transform: translateY(-50%); }
	.pp-handle-w  { top: 50%;         left: -5px;       transform: translateY(-50%); }
	.pp-handle-ne { top: -5px;        right: -5px; }
	.pp-handle-nw { top: -5px;        left: -5px; }
	.pp-handle-se { bottom: -5px;     right: -5px; }
	.pp-handle-sw { bottom: -5px;     left: -5px; }

	/* Notes pane */
	.pp-notes {
		height: 130px;
		background: #f8f8f8;
		border-top: 1px solid #d4d4d4;
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
	}
	.pp-notes-header {
		display: flex;
		justify-content: space-between;
		padding: 4px 12px;
		font-size: 11px;
		color: #666;
		border-bottom: 1px solid #e0e0e0;
		background: #efefef;
	}
	.pp-notes-area {
		flex: 1;
		border: none;
		outline: none;
		padding: 8px 12px;
		font-family: 'Segoe UI', sans-serif;
		font-size: 13px;
		resize: none;
		background: #f8f8f8;
		color: #222;
	}

	/* Status bar */
	.pp-status {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 4px 12px;
		background: #b7472a;
		color: white;
		font-size: 11px;
		flex-shrink: 0;
	}
	.pp-status-item { white-space: nowrap; }
	.pp-status-ok { color: #b6f7c0; font-weight: 600; }
	.pp-status-spacer { flex: 1; }
	.pp-status-btn {
		background: transparent;
		border: 1px solid rgba(255,255,255,0.3);
		color: white;
		width: 22px;
		height: 18px;
		border-radius: 2px;
		cursor: pointer;
		font-size: 12px;
		line-height: 1;
		padding: 0;
	}
	.pp-status-btn:hover { background: rgba(255,255,255,0.15); }
	.pp-zoom-slider {
		width: 110px;
		height: 16px;
		accent-color: white;
	}
	.pp-zoom-pct { min-width: 36px; text-align: right; }

	/* ── Present mode ───────────────────────────────────────── */
	.pp-present-overlay {
		position: fixed;
		inset: 0;
		background: #000;
		z-index: 100000;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.pp-present-slide {
		position: relative;
		width: min(100vw, calc(100vh * 16 / 9));
		height: min(100vh, calc(100vw * 9 / 16));
		background: white;
		overflow: hidden;
	}
	.pp-present-slide.outgoing { position: absolute; z-index: 1; }
	.pp-present-slide.incoming { position: absolute; z-index: 2; }

	.pp-present-el {
		position: absolute;
		animation-duration: 0.5s;
		animation-fill-mode: both;
	}
	.pp-present-text {
		width: 100%; height: 100%;
		padding: 4px;
		white-space: pre-wrap;
		line-height: 1.25;
		box-sizing: border-box;
	}

	/* Transitions */
	@keyframes pp-fade-out { from { opacity: 1; } to { opacity: 0; } }
	@keyframes pp-fade-in  { from { opacity: 0; } to { opacity: 1; } }
	@keyframes pp-slide-out { from { transform: translateX(0); } to { transform: translateX(-100%); } }
	@keyframes pp-slide-in  { from { transform: translateX(100%); } to { transform: translateX(0); } }
	@keyframes pp-push-out { from { transform: translateX(0); opacity: 1; } to { transform: translateX(-50%); opacity: 0; } }
	@keyframes pp-push-in  { from { transform: translateX(100%); } to { transform: translateX(0); } }

	.outgoing.transition-fade  { animation: pp-fade-out 0.4s ease both; }
	.incoming.transition-fade  { animation: pp-fade-in  0.4s ease both; }
	.outgoing.transition-slide { animation: pp-slide-out 0.4s ease both; }
	.incoming.transition-slide { animation: pp-slide-in  0.4s ease both; }
	.outgoing.transition-push  { animation: pp-push-out 0.4s ease both; }
	.incoming.transition-push  { animation: pp-push-in  0.4s ease both; }
	.outgoing.transition-none, .incoming.transition-none { animation: none; }

	/* Element entrance animations */
	@keyframes pp-anim-fade-in { from { opacity: 0; } to { opacity: 1; } }
	@keyframes pp-anim-fly-in  { from { transform: translateX(-80px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
	@keyframes pp-anim-zoom    { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
	@keyframes pp-anim-appear  { from { visibility: hidden; } to { visibility: visible; } }
	.anim-fade-in { animation-name: pp-anim-fade-in; }
	.anim-fly-in  { animation-name: pp-anim-fly-in; }
	.anim-zoom    { animation-name: pp-anim-zoom; }
	.anim-appear  { animation-name: pp-anim-appear; animation-duration: 0.01s; }

	.pp-present-controls {
		position: fixed;
		bottom: 20px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		gap: 8px;
		align-items: center;
		background: rgba(0,0,0,0.6);
		border: 1px solid rgba(255,255,255,0.2);
		border-radius: 6px;
		padding: 6px 12px;
		opacity: 0.25;
		transition: opacity 0.2s ease;
		z-index: 100001;
	}
	.pp-present-controls:hover { opacity: 1; }
	.pp-present-controls button {
		background: transparent;
		border: 1px solid rgba(255,255,255,0.3);
		color: white;
		padding: 4px 10px;
		border-radius: 4px;
		cursor: pointer;
		font-size: 12px;
	}
	.pp-present-controls button:hover { background: rgba(255,255,255,0.15); }
	.pp-present-controls button:disabled { opacity: 0.4; cursor: not-allowed; }
	.pp-present-num { color: white; font-size: 12px; min-width: 60px; text-align: center; }
</style>

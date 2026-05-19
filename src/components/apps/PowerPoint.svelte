<script lang="ts">
	import { wm } from '../../state/windows.svelte.ts';
	import { readFile, writeFile, exists } from '../../state/vfs.svelte';
	import { notify } from '../../state/notifications.svelte';

	interface SlideElement {
		id: number;
		type: 'text' | 'rect' | 'ellipse' | 'image';
		x: number;
		y: number;
		w: number;
		h: number;
		content: string;
		style: Record<string, string | number>;
	}

	interface Slide {
		id: number;
		layout: 'title' | 'content' | 'blank';
		background: string;
		elements: SlideElement[];
	}

	const SLIDE_W = 960;
	const SLIDE_H = 540;
	let nextElId = 1;
	let nextSlideId = 1;

	function blankSlide(): Slide {
		return { id: nextSlideId++, layout: 'blank', background: '#ffffff', elements: [] };
	}

	let slides = $state<Slide[]>([blankSlide()]);
	let activeIndex = $state(0);
	let activeSlide = $derived(slides[activeIndex]);
	let selectedElId = $state<number | null>(null);
	let notes = $state<Record<number, string>>({});
	let presenting = $state(false);
	let filePath = $state<string | null>(null);
	let docTitle = $state('Presentation1');

	$effect(() => {
		const args = (wm as any).appLaunchArgs?.powerpoint;
		if (args?.path && !filePath) {
			filePath = args.path;
			docTitle = args.path.split('/').pop() || 'Presentation1';
			if (exists(args.path)) {
				try {
					const content = readFile(args.path);
					if (content) {
						const data = JSON.parse(content);
						if (data.slides) {
							slides = data.slides;
							nextSlideId = Math.max(...slides.map(s => s.id), 0) + 1;
							nextElId = Math.max(...slides.flatMap(s => s.elements.map(e => e.id)), 0) + 1;
						}
					}
				} catch (e) { console.warn('Failed to load .pptx:', e); }
			}
		}
	});

	function selectSlide(i: number) {
		activeIndex = i;
		selectedElId = null;
	}

	function newSlide() {
		slides = [...slides, blankSlide()];
		activeIndex = slides.length - 1;
	}

	function deleteSlide(i: number) {
		if (slides.length <= 1) return;
		slides = slides.filter((_, idx) => idx !== i);
		if (activeIndex >= slides.length) activeIndex = slides.length - 1;
	}

	function addElement(type: SlideElement['type'], content = '') {
		if (!activeSlide) return;
		const el: SlideElement = {
			id: nextElId++,
			type,
			x: 100, y: 100, w: type === 'text' ? 400 : 200, h: type === 'text' ? 60 : 150,
			content: content || (type === 'text' ? 'Click to edit' : ''),
			style: { color: '#000', fontSize: 24, background: type === 'rect' ? '#0078d4' : type === 'ellipse' ? '#107c10' : 'transparent' },
		};
		activeSlide.elements.push(el);
		selectedElId = el.id;
	}

	function deleteElement() {
		if (!activeSlide || selectedElId === null) return;
		activeSlide.elements = activeSlide.elements.filter(e => e.id !== selectedElId);
		selectedElId = null;
	}

	function insertImage() {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'image/*';
		input.onchange = () => {
			const file = input.files?.[0];
			if (!file) return;
			const reader = new FileReader();
			reader.onload = () => addElement('image', String(reader.result));
			reader.readAsDataURL(file);
		};
		input.click();
	}

	let dragging = $state<{ id: number; startX: number; startY: number; origX: number; origY: number } | null>(null);

	function startDrag(e: PointerEvent, el: SlideElement, slideEl: HTMLElement) {
		if (e.button !== 0) return;
		e.stopPropagation();
		selectedElId = el.id;
		const rect = slideEl.getBoundingClientRect();
		const scale = rect.width / SLIDE_W;
		dragging = { id: el.id, startX: e.clientX, startY: e.clientY, origX: el.x, origY: el.y };
		const onMove = (ev: PointerEvent) => {
			if (!dragging || !activeSlide) return;
			const dx = (ev.clientX - dragging.startX) / scale;
			const dy = (ev.clientY - dragging.startY) / scale;
			const target = activeSlide.elements.find(x => x.id === dragging!.id);
			if (target) { target.x = dragging.origX + dx; target.y = dragging.origY + dy; }
		};
		const onUp = () => {
			dragging = null;
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
		};
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
	}

	function editText(el: SlideElement) {
		if (el.type !== 'text') return;
		const txt = prompt('Edit text:', el.content);
		if (txt !== null) el.content = txt;
	}

	function setBg(color: string) {
		if (activeSlide) activeSlide.background = color;
	}

	function savePres() {
		const path = filePath ?? `C:/Users/User/Documents/${docTitle}`;
		writeFile(path, JSON.stringify({ slides, notes }));
		filePath = path;
		notify({ title: 'PowerPoint', body: `Saved ${docTitle}`, icon: '📽️' });
	}

	function present() {
		presenting = true;
	}

	function handleKey(e: KeyboardEvent) {
		if (presenting) {
			if (e.key === 'Escape') presenting = false;
			else if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') {
				if (activeIndex < slides.length - 1) activeIndex++;
				e.preventDefault();
			} else if (e.key === 'ArrowLeft' || e.key === 'Backspace') {
				if (activeIndex > 0) activeIndex--;
				e.preventDefault();
			}
			return;
		}
		if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); savePres(); }
		if (e.key === 'Delete' && selectedElId !== null) deleteElement();
	}

	const themes = ['#ffffff', '#fff4ce', '#dff6dd', '#dde6f5', '#f5dde5', '#1f1f1f'];
</script>

<svelte:window onkeydown={handleKey} />

<div class="pp-app">
	<div class="ribbon">
		<button class="primary" onclick={savePres}>💾 Save</button>
		<div class="sep"></div>
		<button onclick={newSlide}>+ New slide</button>
		<button onclick={() => deleteSlide(activeIndex)} disabled={slides.length <= 1}>🗑 Delete</button>
		<div class="sep"></div>
		<button onclick={() => addElement('text')}>T Text</button>
		<button onclick={() => addElement('rect')}>▭ Rect</button>
		<button onclick={() => addElement('ellipse')}>● Ellipse</button>
		<button onclick={insertImage}>🖼 Image</button>
		<div class="sep"></div>
		<span class="label">Theme:</span>
		{#each themes as t}
			<button class="theme-swatch" style:background={t} onclick={() => setBg(t)} title={t}></button>
		{/each}
		<div class="sep"></div>
		<button class="present-btn" onclick={present}>▶ Present</button>
	</div>

	<div class="workspace">
		<aside class="thumbs">
			{#each slides as slide, i (slide.id)}
				<button
					class="thumb"
					class:active={i === activeIndex}
					onclick={() => selectSlide(i)}
				>
					<span class="thumb-num">{i + 1}</span>
					<div class="thumb-slide" style:background={slide.background}>
						{#each slide.elements as el (el.id)}
							<div class="thumb-el {el.type}" style:left="{el.x / SLIDE_W * 100}%" style:top="{el.y / SLIDE_H * 100}%" style:width="{el.w / SLIDE_W * 100}%" style:height="{el.h / SLIDE_H * 100}%" style:background={el.type === 'text' ? 'transparent' : String(el.style.background)}>
								{#if el.type === 'text'}<span style:color={String(el.style.color)} style:font-size="6px">{el.content.slice(0, 20)}</span>{/if}
							</div>
						{/each}
					</div>
				</button>
			{/each}
		</aside>

		<main class="stage">
			{#if activeSlide}
				<div class="slide-wrap">
					<div
						class="slide"
						style:background={activeSlide.background}
						style:width="{SLIDE_W}px"
						style:height="{SLIDE_H}px"
						role="presentation"
						onclick={() => selectedElId = null}
					>
						{#each activeSlide.elements as el (el.id)}
							{@const slideEl = (e: PointerEvent) => startDrag(e, el, (e.currentTarget as HTMLElement).parentElement!)}
							<div
								class="el"
								class:selected={selectedElId === el.id}
								class:rect={el.type === 'rect'}
								class:ellipse={el.type === 'ellipse'}
								style:left="{el.x}px" style:top="{el.y}px" style:width="{el.w}px" style:height="{el.h}px"
								style:background={el.type === 'text' ? 'transparent' : String(el.style.background)}
								style:color={String(el.style.color)}
								style:font-size="{el.style.fontSize}px"
								onpointerdown={slideEl}
								ondblclick={() => editText(el)}
								role="button"
								tabindex="0"
							>
								{#if el.type === 'text'}{el.content}{/if}
								{#if el.type === 'image'}<img src={el.content} alt="" style="width:100%;height:100%;object-fit:contain">{/if}
							</div>
						{/each}
					</div>
				</div>
			{/if}
			<div class="notes">
				<label>Notes</label>
				<textarea bind:value={notes[activeSlide?.id ?? 0]} placeholder="Speaker notes..."></textarea>
			</div>
		</main>
	</div>

	<div class="status">
		<span>Slide {activeIndex + 1} of {slides.length}</span>
		<span>{docTitle}</span>
	</div>

	{#if presenting && activeSlide}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="present-overlay" onclick={() => activeIndex < slides.length - 1 && activeIndex++}>
			<div class="present-slide" style:background={activeSlide.background}>
				{#each activeSlide.elements as el (el.id)}
					<div class="el" class:rect={el.type === 'rect'} class:ellipse={el.type === 'ellipse'}
						style:left="{el.x}px" style:top="{el.y}px" style:width="{el.w}px" style:height="{el.h}px"
						style:background={el.type === 'text' ? 'transparent' : String(el.style.background)}
						style:color={String(el.style.color)} style:font-size="{el.style.fontSize}px">
						{#if el.type === 'text'}{el.content}{/if}
						{#if el.type === 'image'}<img src={el.content} alt="" style="width:100%;height:100%;object-fit:contain">{/if}
					</div>
				{/each}
			</div>
			<div class="present-hint">Esc to exit · ← / → to navigate · Slide {activeIndex + 1} / {slides.length}</div>
		</div>
	{/if}
</div>

<style>
	.pp-app { display: flex; flex-direction: column; height: 100%; background: #f3f3f3; font-family: 'Segoe UI', system-ui; font-size: 13px; }
	.ribbon { display: flex; align-items: center; gap: 4px; padding: 8px 12px; background: rgba(255,255,255,0.7); border-bottom: 1px solid rgba(0,0,0,0.08); flex-wrap: wrap; }
	.ribbon button { min-height: 30px; padding: 0 10px; background: transparent; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; }
	.ribbon button:hover { background: rgba(0,0,0,0.05); }
	.ribbon button.primary { background: #b7472a; color: white; font-weight: 500; padding: 0 12px; }
	.ribbon button.primary:hover { background: #c95830; }
	.ribbon button.present-btn { background: #107c10; color: white; padding: 0 14px; }
	.ribbon button:disabled { opacity: 0.4; cursor: not-allowed; }
	.sep { width: 1px; height: 24px; background: rgba(0,0,0,0.1); margin: 0 4px; }
	.label { font-size: 12px; color: #666; }
	.theme-swatch { width: 24px; height: 24px; border-radius: 4px; border: 1px solid rgba(0,0,0,0.15); cursor: pointer; padding: 0; }
	.workspace { flex: 1; display: grid; grid-template-columns: 180px 1fr; min-height: 0; }
	.thumbs { background: #2b2b2b; padding: 8px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
	.thumb { display: flex; gap: 6px; padding: 4px; background: transparent; border: 2px solid transparent; border-radius: 4px; cursor: pointer; align-items: center; }
	.thumb.active { border-color: #f49342; }
	.thumb-num { color: #999; font-size: 11px; width: 14px; text-align: right; }
	.thumb-slide { width: 140px; height: 78px; background: white; position: relative; overflow: hidden; }
	.thumb-el { position: absolute; }
	.thumb-el.rect, .thumb-el.ellipse { border-radius: 0; }
	.thumb-el.ellipse { border-radius: 50%; }
	.stage { display: flex; flex-direction: column; padding: 16px; min-height: 0; background: linear-gradient(180deg, #404040, #2b2b2b); }
	.slide-wrap { flex: 1; display: flex; justify-content: center; align-items: center; min-height: 0; overflow: auto; }
	.slide { position: relative; box-shadow: 0 4px 20px rgba(0,0,0,0.4); transform-origin: center; }
	.slide { transform: scale(min(calc((100% - 40px) / 960), 1)); }
	.el { position: absolute; cursor: move; padding: 8px; box-sizing: border-box; user-select: none; }
	.el.ellipse { border-radius: 50%; }
	.el.selected { outline: 2px solid #f49342; outline-offset: 2px; }
	.notes { padding: 8px 16px; background: #1f1f1f; color: white; height: 100px; display: flex; flex-direction: column; gap: 4px; }
	.notes label { font-size: 11px; color: #999; }
	.notes textarea { flex: 1; background: #2b2b2b; color: white; border: 1px solid #444; border-radius: 4px; padding: 6px; resize: none; font-family: inherit; }
	.status { display: flex; justify-content: space-between; padding: 4px 12px; background: #b7472a; color: white; font-size: 12px; height: 24px; align-items: center; }
	.present-overlay { position: fixed; inset: 0; background: #000; z-index: 99999; display: flex; align-items: center; justify-content: center; cursor: pointer; }
	.present-slide { position: relative; width: 1920px; height: 1080px; transform: scale(min(calc(100vw / 1920), calc(100vh / 1080))); transform-origin: center; }
	.present-hint { position: fixed; bottom: 12px; left: 50%; transform: translateX(-50%); color: #888; font-size: 12px; }
</style>

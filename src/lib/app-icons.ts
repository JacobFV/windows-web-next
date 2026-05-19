/**
 * App icon definitions — hand-written inline SVGs in Microsoft Fluent System Icons style.
 *
 * Each icon is a complete <svg viewBox="0 0 24 24"> string designed to render as a small
 * monochrome glyph on top of an optional colored tile background. Colors mirror the official
 * Microsoft brand palette where applicable (Word #2b579a, Excel #217346, Edge #0078d4, etc.).
 *
 * Style guide:
 *  - 24x24 viewBox
 *  - Stroke weight ~1.5px, currentColor for stroke/fill
 *  - Simple geometric shapes that read clearly at 16px
 *  - The wrapping <AppIcon> component sets `color: white` so currentColor renders white on the tile
 */

import type { AppID } from '../configs/apps.ts';

export interface IconSpec {
	/** Optional tile background color (any valid CSS color). When omitted, tile is transparent. */
	color?: string;
	/** Complete inline SVG markup. */
	svg: string;
}

// Common shared attributes that every icon string uses.
const SVG_ATTRS = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';

export const APP_ICONS: Partial<Record<AppID, IconSpec>> = {
	'file-explorer': {
		color: '#FFC107',
		svg: `<svg ${SVG_ATTRS}>
			<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" fill="currentColor" stroke="none" opacity="0.95"/>
			<path d="M3 9h18" stroke="rgba(0,0,0,0.18)" stroke-width="1"/>
		</svg>`,
	},
	edge: {
		color: '#0078D4',
		svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
			<circle cx="12" cy="12" r="9.5" fill="currentColor" stroke="none" opacity="0.0"/>
			<path d="M4 13c0-4.5 3.6-8 8-8 3.4 0 6.3 2.1 7.5 5-1.2-1.2-3-2-5-2-3.6 0-6.5 2.7-6.5 6 0 .7.1 1.4.3 2H4.3a8 8 0 0 1-.3-3z" fill="#ffffff" stroke="none"/>
			<path d="M20 15.5a8 8 0 0 1-13.5 3c.8.3 1.7.5 2.5.5 3 0 5.5-1.4 7-3.5l4 0z" fill="#ffffff" stroke="none" opacity="0.85"/>
		</svg>`,
	},
	settings: {
		color: '#555555',
		svg: `<svg ${SVG_ATTRS}>
			<circle cx="12" cy="12" r="3"/>
			<path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>
		</svg>`,
	},
	notepad: {
		color: '#2B7CD3',
		svg: `<svg ${SVG_ATTRS}>
			<path d="M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/>
			<path d="M15 3v4h4"/>
			<line x1="8" y1="12" x2="16" y2="12"/>
			<line x1="8" y1="15" x2="16" y2="15"/>
			<line x1="8" y1="18" x2="13" y2="18"/>
		</svg>`,
	},
	terminal: {
		color: '#0C0C0C',
		svg: `<svg ${SVG_ATTRS}>
			<rect x="3" y="4" width="18" height="16" rx="2"/>
			<polyline points="7 9 10 12 7 15"/>
			<line x1="12" y1="16" x2="17" y2="16"/>
		</svg>`,
	},
	calculator: {
		color: '#525252',
		svg: `<svg ${SVG_ATTRS}>
			<rect x="4" y="3" width="16" height="18" rx="2"/>
			<rect x="7" y="6" width="10" height="3" rx="0.5"/>
			<circle cx="8.5" cy="13" r="0.8" fill="currentColor"/>
			<circle cx="12" cy="13" r="0.8" fill="currentColor"/>
			<circle cx="15.5" cy="13" r="0.8" fill="currentColor"/>
			<circle cx="8.5" cy="17" r="0.8" fill="currentColor"/>
			<circle cx="12" cy="17" r="0.8" fill="currentColor"/>
			<circle cx="15.5" cy="17" r="0.8" fill="currentColor"/>
		</svg>`,
	},
	'task-manager': {
		color: '#418C38',
		svg: `<svg ${SVG_ATTRS}>
			<line x1="4" y1="20" x2="20" y2="20"/>
			<rect x="5" y="13" width="3" height="7" fill="currentColor"/>
			<rect x="10.5" y="9" width="3" height="11" fill="currentColor"/>
			<rect x="16" y="5" width="3" height="15" fill="currentColor"/>
		</svg>`,
	},
	photos: {
		color: '#CE82C6',
		svg: `<svg ${SVG_ATTRS}>
			<rect x="3" y="5" width="18" height="14" rx="2"/>
			<circle cx="8" cy="10" r="1.5" fill="currentColor"/>
			<path d="M3 17l5-5 4 4 3-3 6 6"/>
		</svg>`,
	},
	paint: {
		color: '#FF6F00',
		svg: `<svg ${SVG_ATTRS}>
			<path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.6-1.4-.4-.4-.6-.9-.6-1.4 0-1.1.9-2 2-2H17a4 4 0 0 0 4-4c0-4-4-7-9-7z"/>
			<circle cx="7" cy="11" r="1" fill="currentColor"/>
			<circle cx="10" cy="7" r="1" fill="currentColor"/>
			<circle cx="15" cy="7" r="1" fill="currentColor"/>
			<circle cx="18" cy="11" r="1" fill="currentColor"/>
		</svg>`,
	},
	clock: {
		color: '#4A90E2',
		svg: `<svg ${SVG_ATTRS}>
			<circle cx="12" cy="12" r="9"/>
			<polyline points="12 7 12 12 15.5 14"/>
		</svg>`,
	},
	weather: {
		color: '#5A5A5A',
		svg: `<svg ${SVG_ATTRS}>
			<circle cx="16" cy="8" r="3"/>
			<path d="M16 3v1.5"/>
			<path d="M20.5 5.5l-1 1"/>
			<path d="M21.5 9.5h-1.5"/>
			<path d="M11.5 5.5l1 1"/>
			<path d="M7 18a4 4 0 0 1 .5-7.97A5 5 0 0 1 17 11a3.5 3.5 0 0 1-.5 7H7z" fill="currentColor" stroke="currentColor"/>
		</svg>`,
	},
	mail: {
		color: '#0078D4',
		svg: `<svg ${SVG_ATTRS}>
			<rect x="3" y="5" width="18" height="14" rx="2"/>
			<polyline points="3 7 12 13 21 7"/>
		</svg>`,
	},
	calendar: {
		color: '#CA5010',
		svg: `<svg ${SVG_ATTRS}>
			<rect x="3" y="5" width="18" height="16" rx="2"/>
			<line x1="3" y1="10" x2="21" y2="10"/>
			<line x1="8" y1="3" x2="8" y2="7"/>
			<line x1="16" y1="3" x2="16" y2="7"/>
			<text x="12" y="17.5" font-family="Segoe UI, sans-serif" font-size="6" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none">15</text>
		</svg>`,
	},
	maps: {
		color: '#45A565',
		svg: `<svg ${SVG_ATTRS}>
			<path d="M9 3 3 5v16l6-2 6 2 6-2V3l-6 2-6-2z"/>
			<line x1="9" y1="3" x2="9" y2="19"/>
			<line x1="15" y1="5" x2="15" y2="21"/>
		</svg>`,
	},
	music: {
		color: '#D83B01',
		svg: `<svg ${SVG_ATTRS}>
			<path d="M9 18V5l11-2v13"/>
			<circle cx="6" cy="18" r="3" fill="currentColor"/>
			<circle cx="17" cy="16" r="3" fill="currentColor"/>
		</svg>`,
	},
	videos: {
		color: '#B146C2',
		svg: `<svg ${SVG_ATTRS}>
			<rect x="3" y="5" width="18" height="14" rx="2"/>
			<polygon points="10 9 16 12 10 15" fill="currentColor"/>
		</svg>`,
	},
	store: {
		color: '#00689D',
		svg: `<svg ${SVG_ATTRS}>
			<path d="M5 7h14l-1 13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 7z"/>
			<path d="M9 7V5a3 3 0 0 1 6 0v2"/>
		</svg>`,
	},
	'snipping-tool': {
		color: '#C4254A',
		svg: `<svg ${SVG_ATTRS}>
			<circle cx="6" cy="7" r="2.5"/>
			<circle cx="6" cy="17" r="2.5"/>
			<line x1="8" y1="8.5" x2="20" y2="16"/>
			<line x1="8" y1="15.5" x2="20" y2="8"/>
		</svg>`,
	},
	wordpad: {
		color: '#2B579A',
		svg: `<svg ${SVG_ATTRS}>
			<path d="M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/>
			<path d="M15 3v4h4"/>
			<text x="12" y="17" font-family="Segoe UI, sans-serif" font-size="7" font-weight="800" text-anchor="middle" fill="currentColor" stroke="none">W</text>
		</svg>`,
	},
	'disk-cleanup': {
		color: '#5A5A5A',
		svg: `<svg ${SVG_ATTRS}>
			<path d="M14 4l4 4-9 9-5 1 1-5 9-9z"/>
			<line x1="13" y1="5" x2="17" y2="9"/>
			<path d="M5 19l-1 2"/>
			<path d="M18 14l1 2"/>
			<path d="M20 8l1 1"/>
		</svg>`,
	},
};

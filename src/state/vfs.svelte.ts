/**
 * Virtual File System for the Windows 11 simulation.
 *
 * Provides a reactive, in-memory filesystem with Windows-style paths (C:\, D:\).
 * Paths are normalised internally to forward slashes. Both `\` and `/` are accepted
 * as separators. `~` expands to `C:/Users/User`.
 *
 * All mutation helpers increment `vfsVersion` so consumers can subscribe to
 * coarse-grained changes via Svelte 5 reactivity.
 */

// ── Types ──────────────────────────────────────────────────────────

export interface FSNode {
	type: 'file' | 'dir';
	name: string;
	size: number;
	modified: Date;
	content?: string;
	children?: Map<string, FSNode>;
}

// ── Factories ──────────────────────────────────────────────────────

export function dir(
	name: string,
	children: Map<string, FSNode> = new Map(),
	modified?: Date,
): FSNode {
	return {
		type: 'dir',
		name,
		size: 0,
		modified: modified ?? new Date(2025, 0, 15, 10, 0),
		children,
	};
}

export function file(
	name: string,
	content: string = '',
	size?: number,
	modified?: Date,
): FSNode {
	return {
		type: 'file',
		name,
		size: size ?? content.length,
		modified: modified ?? new Date(2025, 0, 15, 10, 0),
		content,
	};
}

// ── Path helpers (internal) ────────────────────────────────────────

const HOME = 'C:/Users/User';

/** Normalise any path to forward-slash form without a trailing slash. */
function normalizePath(p: string): string {
	return p.replace(/\\/g, '/').replace(/\/+$/, '');
}

/**
 * Given a `cwd` and a `target` (which may be relative, absolute, or use ~),
 * return the absolute, normalised path.
 */
function toAbsolute(cwd: string, target: string): string {
	let t = normalizePath(target);

	if (t === '~' || t.startsWith('~/')) {
		t = HOME + t.slice(1);
	} else if (/^[A-Za-z]:/.test(t)) {
		// Already absolute (e.g. C:/foo or D:)
	} else if (t.startsWith('/')) {
		// Relative to current drive
		const drive = cwd.match(/^[A-Za-z]:/)?.[0] ?? 'C:';
		t = drive + t;
	} else {
		t = cwd + '/' + t;
	}

	// Resolve `.` and `..`
	const driveMatch = t.match(/^([A-Za-z]:)(\/.*)?$/);
	const drive = driveMatch?.[1] ?? 'C:';
	const rest = driveMatch?.[2] ?? '';

	const parts = rest.split('/').filter(Boolean);
	const resolved: string[] = [];
	for (const part of parts) {
		if (part === '.') continue;
		if (part === '..') {
			resolved.pop();
		} else {
			resolved.push(part);
		}
	}

	return resolved.length > 0
		? drive + '/' + resolved.join('/')
		: drive;
}

/**
 * Split an absolute normalised path into [driveKey, ...segments].
 * Example: "C:/Users/User" -> ["C:", "Users", "User"]
 */
function splitPath(abs: string): string[] {
	const m = abs.match(/^([A-Za-z]:)(\/(.*))?$/);
	if (!m) return [];
	const drive = m[1];
	const rest = m[3] ?? '';
	const parts = rest.split('/').filter(Boolean);
	return [drive, ...parts];
}

// ── Default filesystem ─────────────────────────────────────────────

function createDefaultFS(): Map<string, FSNode> {
	const root = new Map<string, FSNode>();

	// ---- C: drive ----

	const cDrive = dir('C:', new Map([
		['Users', dir('Users', new Map([
			['User', dir('User', new Map([
				['Desktop', dir('Desktop', new Map([
					['Notes.txt', file(
						'Notes.txt',
						'Meeting notes from last week.\nRemember to follow up on the project timeline.\nNext meeting: Friday 2pm.',
						undefined,
						new Date(2025, 1, 6, 8, 0),
					)],
					['Project Files', dir('Project Files', new Map([
						['index.html', file(
							'index.html',
							'<!DOCTYPE html>\n<html>\n<head><title>My App</title></head>\n<body>\n<h1>Hello World</h1>\n</body>\n</html>',
							undefined,
							new Date(2025, 0, 28, 16, 22),
						)],
						['styles.css', file(
							'styles.css',
							"body {\n  font-family: 'Segoe UI', sans-serif;\n  margin: 0;\n  padding: 20px;\n}",
							undefined,
							new Date(2025, 0, 28, 16, 30),
						)],
						['app.js', file(
							'app.js',
							"// Main application\nconsole.log('Hello World');\n\nfunction init() {\n  document.title = 'My App';\n}\n\ninit();",
							undefined,
							new Date(2025, 0, 29, 10, 0),
						)],
					]), new Date(2025, 0, 29, 10, 0))],
					['Screenshots', dir('Screenshots', new Map([
						['screenshot-01.png', file('screenshot-01.png', '', 1258291, new Date(2025, 1, 4, 17, 12))],
						['screenshot-02.png', file('screenshot-02.png', '', 1003520, new Date(2025, 1, 5, 9, 30))],
					]), new Date(2025, 1, 5, 9, 30))],
				]), new Date(2025, 1, 6, 8, 0))],

				['Documents', dir('Documents', new Map([
					['Meeting Notes.docx', file('Meeting Notes.docx', '', 250880, new Date(2025, 0, 28, 16, 22))],
					['Resume.docx', file(
						'Resume.docx',
						'<h1>John Doe</h1><p>Software Engineer</p><h2>Experience</h2><p>Acme Corp 2020&ndash;Present</p>',
						undefined,
						new Date(2025, 0, 20, 9, 0),
					)],
					['Quarterly Review.pptx', file(
						'Quarterly Review.pptx',
						'{"slides":[{"id":1,"layout":"title","elements":[{"id":1,"type":"text","x":100,"y":200,"w":760,"h":80,"content":"Q4 Review","style":{"fontSize":48,"fontWeight":"bold"}}]}, {"id":2,"layout":"content","elements":[{"id":1,"type":"text","x":80,"y":80,"w":820,"h":50,"content":"Highlights","style":{"fontSize":32,"fontWeight":"bold"}}]}]}',
						undefined,
						new Date(2025, 1, 1, 14, 0),
					)],
					['Budget 2025.xlsx', file('Budget 2025.xlsx', '', 159744, new Date(2025, 1, 2, 11, 30))],
					['Report.pdf', file('Report.pdf', '', 2411724, new Date(2025, 0, 30, 13, 45))],
					['readme.txt', file(
						'readme.txt',
						'This is a readme file.\n\nWelcome to the project!\nPlease read the documentation before getting started.',
						undefined,
						new Date(2025, 0, 15, 10, 0),
					)],
					['notes.txt', file(
						'notes.txt',
						'Meeting Notes - January 2025\n\n- Discuss project timeline\n- Review budget\n- Assign tasks to team members\n- Follow up next week',
						undefined,
						new Date(2025, 0, 15, 10, 0),
					)],
					['todo.txt', file(
						'todo.txt',
						'TODO List:\n\n[x] Set up development environment\n[x] Write initial code\n[ ] Add unit tests\n[ ] Deploy to production\n[ ] Write documentation',
						undefined,
						new Date(2025, 0, 15, 10, 0),
					)],
				]), new Date(2025, 1, 2, 11, 30))],

				['Downloads', dir('Downloads', new Map([
					['setup.exe', file('setup.exe', '', 47829606, new Date(2025, 1, 5, 15, 15))],
					['photo.jpg', file('photo.jpg', '', 3984588, new Date(2024, 11, 25, 15, 30))],
					['archive.zip', file('archive.zip', '', 13002342, new Date(2025, 0, 10, 9, 0))],
				]), new Date(2025, 1, 5, 15, 15))],

				['Pictures', dir('Pictures', new Map([
					['wallpaper.jpg', file('wallpaper.jpg', '', 5452595, new Date(2024, 10, 15, 14, 0))],
					['Vacation', dir('Vacation', new Map([
						['beach.jpg', file('beach.jpg', '', 4299161, new Date(2024, 7, 15, 10, 30))],
						['mountain.jpg', file('mountain.jpg', '', 3879731, new Date(2024, 7, 16, 15, 0))],
					]), new Date(2024, 7, 16, 15, 0))],
					['Screenshots', dir('Screenshots', new Map([
						['capture-01.png', file('capture-01.png', '', 1572864, new Date(2025, 0, 20, 10, 45))],
					]), new Date(2025, 0, 20, 10, 45))],
				]), new Date(2025, 0, 20, 10, 45))],

				['Music', dir('Music', new Map([
					['playlist.m3u', file('playlist.m3u', '', 2048, new Date(2025, 0, 5, 20, 0))],
				]), new Date(2025, 0, 5, 20, 0))],

				['Videos', dir('Videos', new Map([
					['tutorial.mp4', file('tutorial.mp4', '', 157286400, new Date(2024, 11, 20, 16, 0))],
				]), new Date(2024, 11, 20, 16, 0))],

				['Code', dir('Code', new Map([
					['index.ts', file(
						'index.ts',
						`import { createApp } from './app';\nimport type { Config } from './types';\n\nconst config: Config = {\n\tname: 'my-app',\n\tversion: '1.0.0',\n\tdebug: false,\n};\n\nconst app = createApp(config);\napp.start().then(() => {\n\tconsole.log('App started');\n}).catch((err) => {\n\tconsole.error('Failed to start app:', err);\n\tprocess.exit(1);\n});\n`,
						undefined,
						new Date(2025, 2, 12, 14, 30),
					)],
					['package.json', file(
						'package.json',
						`{\n\t"name": "my-app",\n\t"version": "1.0.0",\n\t"description": "A small example project",\n\t"type": "module",\n\t"scripts": {\n\t\t"dev": "vite",\n\t\t"build": "vite build",\n\t\t"test": "vitest"\n\t},\n\t"dependencies": {\n\t\t"svelte": "^5.0.0"\n\t},\n\t"devDependencies": {\n\t\t"typescript": "^5.6.0",\n\t\t"vite": "^5.4.0"\n\t}\n}\n`,
						undefined,
						new Date(2025, 2, 12, 14, 25),
					)],
					['README.md', file(
						'README.md',
						`# My App\n\nA small example project that demonstrates the basics.\n\n## Getting Started\n\nInstall dependencies and run the dev server:\n\n\`\`\`sh\npnpm install\npnpm dev\n\`\`\`\n\n## Scripts\n\n- \`dev\` — start the local dev server\n- \`build\` — produce a production build\n- \`test\` — run the test suite\n\n## License\n\nMIT\n`,
						undefined,
						new Date(2025, 2, 12, 14, 0),
					)],
					['src', dir('src', new Map([
						['main.rs', file(
							'main.rs',
							`use std::io::{self, Write};\n\nfn main() {\n\tprintln!("Hello, world!");\n\n\tprint!("What is your name? ");\n\tio::stdout().flush().unwrap();\n\n\tlet mut name = String::new();\n\tio::stdin().read_line(&mut name).expect("Failed to read input");\n\tlet name = name.trim();\n\n\tif name.is_empty() {\n\t\tprintln!("No name provided.");\n\t} else {\n\t\tprintln!("Nice to meet you, {}!", name);\n\t}\n}\n`,
							undefined,
							new Date(2025, 2, 12, 14, 28),
						)],
					]), new Date(2025, 2, 12, 14, 28))],
				]), new Date(2025, 2, 12, 14, 30))],

				// Files from Terminal defaults placed directly in User home
				['config.json', file(
					'config.json',
					'{\n  "name": "my-app",\n  "version": "1.0.0",\n  "debug": false\n}',
					undefined,
					new Date(2025, 0, 15, 10, 0),
				)],
				['config.ini', file(
					'config.ini',
					'[General]\ntheme=dark\nlanguage=en-US\nautosave=true\n\n[Editor]\nfont_size=14\nword_wrap=true\ntab_size=4',
					undefined,
					new Date(2025, 0, 15, 10, 0),
				)],
				['log.txt', file(
					'log.txt',
					'[2025-01-15 08:30:00] Application started\n[2025-01-15 08:30:01] Loading configuration...\n[2025-01-15 08:30:02] Configuration loaded successfully\n[2025-01-15 08:30:05] Server listening on port 3000',
					undefined,
					new Date(2025, 0, 15, 8, 30),
				)],
				['readme.md', file(
					'readme.md',
					'# My Project\n\nThis is a sample project.\n\n## Getting Started\n\nRun the following command to begin.',
					undefined,
					new Date(2025, 0, 15, 10, 0),
				)],
			]), new Date(2025, 1, 6, 8, 0))],
		]))],

		['Windows', dir('Windows', new Map([
			['explorer.exe', file('explorer.exe', '', 3355443, new Date(2024, 9, 1, 12, 0))],
			['System32', dir('System32', new Map(), new Date(2024, 9, 1, 12, 0))],
		]), new Date(2024, 9, 1, 12, 0))],

		['Program Files', dir('Program Files', new Map(), new Date(2024, 9, 1, 12, 0))],
		['Program Files (x86)', dir('Program Files (x86)', new Map(), new Date(2024, 9, 1, 12, 0))],
	]));

	// ---- D: drive ----

	const dDrive = dir('D:', new Map([
		['Backups', dir('Backups', new Map([
			['backup-2025-01.zip', file('backup-2025-01.zip', '', 2254857830, new Date(2025, 0, 31, 23, 0))],
		]), new Date(2025, 0, 31, 23, 0))],
		['Games', dir('Games', new Map(), new Date(2025, 0, 1, 12, 0))],
	]));

	root.set('C:', cDrive);
	root.set('D:', dDrive);

	return root;
}

// ── Reactive singleton state ───────────────────────────────────────

/** VFS store — use vfs_store.root / vfs_store.version instead of top-level vars. */
export const vfs_store = $state<{ root: Map<string, FSNode>; version: number }>({
	root: createDefaultFS(),
	version: 0,
});

function bumpVersion() {
	vfs_store.version++;
}

// ── Core traversal ─────────────────────────────────────────────────

/**
 * Resolve a path (possibly relative to `cwd`) and return the FSNode plus the
 * normalised absolute path.
 */
export function resolve(
	cwd: string,
	path: string,
): { node: FSNode | null; absolutePath: string } {
	const abs = toAbsolute(normalizePath(cwd), path);
	const segments = splitPath(abs);
	if (segments.length === 0) return { node: null, absolutePath: abs };

	const driveKey = segments[0]; // e.g. "C:"
	const driveNode = vfs_store.root.get(driveKey);
	if (!driveNode) return { node: null, absolutePath: abs };

	if (segments.length === 1) {
		// Requesting the drive root itself
		return { node: driveNode, absolutePath: abs };
	}

	let current = driveNode;
	for (let i = 1; i < segments.length; i++) {
		if (current.type !== 'dir' || !current.children) {
			return { node: null, absolutePath: abs };
		}
		const child = current.children.get(segments[i]);
		if (!child) return { node: null, absolutePath: abs };
		current = child;
	}

	return { node: current, absolutePath: abs };
}

// ── Convenience helpers ────────────────────────────────────────────

function resolveAbs(path: string): { node: FSNode | null; absolutePath: string } {
	return resolve('C:/', path);
}

function getParent(absPath: string): { parentNode: FSNode | null; childName: string; parentPath: string } {
	const segments = splitPath(absPath);
	if (segments.length < 2) {
		return { parentNode: null, childName: '', parentPath: '' };
	}
	const childName = segments[segments.length - 1];
	const parentAbs = segments.slice(0, -1).join('/');
	const { node } = resolveAbs(parentAbs);
	return { parentNode: node, childName, parentPath: parentAbs };
}

// ── Public API ─────────────────────────────────────────────────────

/** Read the text content of a file. Returns null if not found or not a file. */
export function readFile(path: string): string | null {
	const { node } = resolveAbs(path);
	if (!node || node.type !== 'file') return null;
	return node.content ?? '';
}

/** Write (create or overwrite) a text file. Creates parent dirs as needed. Returns true on success. */
export function writeFile(path: string, content: string): boolean {
	const abs = toAbsolute('C:/', path);
	const { parentNode, childName } = getParent(abs);

	if (!parentNode || parentNode.type !== 'dir' || !parentNode.children) {
		// Try to recursively create parent directories
		const segments = splitPath(abs);
		if (segments.length < 2) return false;
		const parentAbs = segments.slice(0, -1).join('/');
		if (!mkdir(parentAbs)) return false;
		// Re-resolve parent
		return writeFile(path, content);
	}

	const existing = parentNode.children.get(childName);
	if (existing && existing.type === 'dir') return false; // cannot overwrite dir with file

	parentNode.children.set(childName, file(childName, content, undefined, new Date()));
	bumpVersion();
	return true;
}

/** Create a directory (and intermediate parents). Returns true on success. */
export function mkdir(path: string): boolean {
	const abs = toAbsolute('C:/', path);
	const segments = splitPath(abs);
	if (segments.length === 0) return false;

	const driveKey = segments[0];
	let current = vfs_store.root.get(driveKey);
	if (!current) {
		// Create a new drive
		current = dir(driveKey);
		vfs_store.root.set(driveKey, current);
	}

	for (let i = 1; i < segments.length; i++) {
		if (current.type !== 'dir' || !current.children) return false;
		let child = current.children.get(segments[i]);
		if (!child) {
			child = dir(segments[i], new Map(), new Date());
			current.children.set(segments[i], child);
		} else if (child.type !== 'dir') {
			return false; // path segment is a file, cannot mkdir through it
		}
		current = child;
	}

	bumpVersion();
	return true;
}

/** Remove a file or directory. If `recursive` is true, directories are removed with all contents. */
export function rm(path: string, recursive: boolean = false): boolean {
	const abs = toAbsolute('C:/', path);
	const { parentNode, childName } = getParent(abs);
	if (!parentNode || parentNode.type !== 'dir' || !parentNode.children) return false;

	const target = parentNode.children.get(childName);
	if (!target) return false;

	if (target.type === 'dir' && target.children && target.children.size > 0 && !recursive) {
		return false; // non-empty directory requires recursive
	}

	parentNode.children.delete(childName);
	bumpVersion();
	return true;
}

/** Deep-clone an FSNode (used by cp/mv). */
function cloneNode(node: FSNode, newName?: string): FSNode {
	const clone: FSNode = {
		type: node.type,
		name: newName ?? node.name,
		size: node.size,
		modified: new Date(node.modified),
		content: node.content,
	};
	if (node.children) {
		clone.children = new Map();
		for (const [key, child] of node.children) {
			clone.children.set(key, cloneNode(child));
		}
	}
	return clone;
}

/** Move a file or directory from `src` to `dest`. */
export function mv(src: string, dest: string): boolean {
	const absSrc = toAbsolute('C:/', src);
	const absDest = toAbsolute('C:/', dest);

	const { parentNode: srcParent, childName: srcName } = getParent(absSrc);
	if (!srcParent || srcParent.type !== 'dir' || !srcParent.children) return false;

	const srcNode = srcParent.children.get(srcName);
	if (!srcNode) return false;

	// Determine destination: if dest is an existing directory, move into it; otherwise rename.
	const destResolved = resolveAbs(absDest);
	let destParent: FSNode;
	let destName: string;

	if (destResolved.node && destResolved.node.type === 'dir') {
		// Move into existing directory
		destParent = destResolved.node;
		destName = srcName;
	} else {
		// Treat dest as full path (possibly renaming)
		const p = getParent(absDest);
		if (!p.parentNode || p.parentNode.type !== 'dir' || !p.parentNode.children) return false;
		destParent = p.parentNode;
		destName = p.childName;
	}

	if (!destParent.children) return false;

	// Remove from source
	srcParent.children.delete(srcName);

	// Place in destination
	const moved = cloneNode(srcNode, destName);
	moved.modified = new Date();
	destParent.children.set(destName, moved);

	bumpVersion();
	return true;
}

/** Copy a file or directory from `src` to `dest`. */
export function cp(src: string, dest: string): boolean {
	const absSrc = toAbsolute('C:/', src);
	const absDest = toAbsolute('C:/', dest);

	const { node: srcNode } = resolveAbs(absSrc);
	if (!srcNode) return false;

	// Determine destination
	const destResolved = resolveAbs(absDest);
	let destParent: FSNode;
	let destName: string;

	if (destResolved.node && destResolved.node.type === 'dir') {
		destParent = destResolved.node;
		destName = srcNode.name;
	} else {
		const p = getParent(absDest);
		if (!p.parentNode || p.parentNode.type !== 'dir' || !p.parentNode.children) return false;
		destParent = p.parentNode;
		destName = p.childName;
	}

	if (!destParent.children) return false;

	const copy = cloneNode(srcNode, destName);
	copy.modified = new Date();
	destParent.children.set(destName, copy);

	bumpVersion();
	return true;
}

/** List immediate children of a directory. Returns empty array if path is not a dir. */
export function ls(path: string): FSNode[] {
	const { node } = resolveAbs(path);
	if (!node || node.type !== 'dir' || !node.children) return [];
	return Array.from(node.children.values());
}

/** Check whether a path exists. */
export function exists(path: string): boolean {
	const { node } = resolveAbs(path);
	return node !== null;
}

/** Get the FSNode at a path, or null. */
export function stat(path: string): FSNode | null {
	const { node } = resolveAbs(path);
	return node;
}

<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { vfs_store, resolve, ls, readFile, writeFile, stat, mkdir, rm, mv, cp, exists } from '../../state/vfs.svelte';
	import type { FSNode } from '../../state/vfs.svelte';
	import { notify } from '../../state/notifications.svelte';
	import { copyText, pasteText } from '../../state/clipboard.svelte';
	import { customTitleBars } from '../../state/titlebars.svelte';

	interface TermTab {
		id: number;
		title: string;
		type: 'powershell' | 'cmd' | 'azure';
		history: string[];
		currentPath: string; // VFS path like "C:/Users/User"
		commandHistory: string[];
	}

	function createDefaultTab(id: number, type: TermTab['type']): TermTab {
		const titles: Record<string, string> = {
			powershell: 'Windows PowerShell',
			cmd: 'Command Prompt',
			azure: 'Azure Cloud Shell',
		};
		const historyLines = type === 'powershell'
			? ['Windows PowerShell', 'Copyright (C) Microsoft Corporation. All rights reserved.', '', 'Install the latest PowerShell for new features and improvements! https://aka.ms/PSWindows', '']
			: type === 'cmd'
			? ['Microsoft Windows [Version 10.0.22631.4169]', '(c) Microsoft Corporation. All rights reserved.', '']
			: ['Welcome to Azure Cloud Shell', 'Type "az" to use Azure CLI', ''];
		return {
			id,
			title: titles[type],
			type,
			history: historyLines,
			currentPath: 'C:/Users/User',
			commandHistory: [],
		};
	}

	let tabs = $state<TermTab[]>([createDefaultTab(1, 'powershell')]);
	let activeTabId = $state(1);
	let nextTabId = $state(2);
	let currentInput = $state('');
	let historyIndex = $state(-1);
	let showDropdown = $state(false);

	let activeTab = $derived(tabs.find((t) => t.id === activeTabId));

	let inputRef = $state<HTMLInputElement | null>(null);
	let outputRef = $state<HTMLDivElement | null>(null);

	function getPrompt(type: string, path: string): string {
		const winPath = path.replace(/\//g, '\\');
		switch (type) {
			case 'powershell': return `PS ${winPath}> `;
			case 'cmd': return `${winPath}>`;
			case 'azure': return 'user@Azure:~$ ';
			default: return '> ';
		}
	}

	function scrollToBottom() {
		requestAnimationFrame(() => {
			if (outputRef) outputRef.scrollTop = outputRef.scrollHeight;
		});
	}

	function focusInput() {
		requestAnimationFrame(() => {
			if (inputRef) inputRef.focus();
		});
	}

	// ── VFS-aware path helpers ──────────────────────────────────────

	/** Resolve a target path relative to the tab's cwd. Returns { node, absolutePath }. */
	function resolvePath(cwd: string, target: string) {
		// Handle %USERPROFILE% as an alias for ~
		const t = target.replace(/%USERPROFILE%/gi, '~');
		return resolve(cwd, t);
	}

	/** Format a Date for dir output like "1/15/2025   2:30 PM". */
	function formatDate(d: Date): string {
		const month = d.getMonth() + 1;
		const day = d.getDate();
		const year = d.getFullYear();
		let hours = d.getHours();
		const ampm = hours >= 12 ? 'PM' : 'AM';
		hours = hours % 12 || 12;
		const mins = String(d.getMinutes()).padStart(2, '0');
		return `${month}/${day}/${year}   ${hours}:${mins} ${ampm}`;
	}

	/** Recursively collect all nodes matching a glob-like pattern. */
	function findRecursive(cwd: string, pattern: string): string[] {
		const results: string[] = [];
		const lowerPat = pattern.toLowerCase();

		function walk(dirPath: string) {
			const children = ls(dirPath);
			for (const child of children) {
				const childPath = dirPath + '/' + child.name;
				if (child.name.toLowerCase().includes(lowerPat)) {
					results.push(childPath);
				}
				if (child.type === 'dir') {
					walk(childPath);
				}
			}
		}

		walk(cwd);
		return results;
	}

	/** Build a tree string recursively. */
	function buildTree(dirPath: string, prefix: string = ''): string[] {
		const children = ls(dirPath);
		const lines: string[] = [];
		children.forEach((child, i) => {
			const isLast = i === children.length - 1;
			const connector = isLast ? '└── ' : '├── ';
			lines.push(prefix + connector + child.name);
			if (child.type === 'dir') {
				const nextPrefix = prefix + (isLast ? '    ' : '│   ');
				lines.push(...buildTree(dirPath + '/' + child.name, nextPrefix));
			}
		});
		return lines;
	}

	// ── Command execution ───────────────────────────────────────────

	function executeCommand(tab: TermTab, rawCmd: string) {
		const cmd = rawCmd.toLowerCase();

		// --- cls / clear ---
		if (cmd === 'cls' || cmd === 'clear') {
			tab.history = [];
			return;
		}

		// --- dir / ls ---
		if (cmd === 'dir' || cmd === 'ls' || cmd.startsWith('dir ') || cmd.startsWith('ls ')) {
			const arg = cmd.startsWith('dir ') ? rawCmd.slice(4).trim() : cmd.startsWith('ls ') ? rawCmd.slice(3).trim() : '';
			const targetPath = arg ? resolvePath(tab.currentPath, arg).absolutePath : tab.currentPath;
			const children = ls(targetPath);
			const winPath = targetPath.replace(/\//g, '\\');

			// Access vfsVersion so Svelte tracks reactivity
			void vfs_store.version;

			const dirEntries: string[] = [];
			const fileEntries: string[] = [];

			for (const node of children) {
				const dateStr = formatDate(node.modified).padEnd(22);
				if (node.type === 'dir') {
					dirEntries.push(`d-----         ${dateStr}               ${node.name}`);
				} else {
					fileEntries.push(`-a----         ${dateStr}${String(node.size).padStart(8)} ${node.name}`);
				}
			}

			tab.history = [...tab.history,
				'',
				`    Directory: ${winPath}`,
				'',
				'Mode                 LastWriteTime         Length Name',
				'----                 -------------         ------ ----',
				...dirEntries,
				...fileEntries,
				'',
			];
			return;
		}

		// --- whoami ---
		if (cmd === 'whoami') {
			tab.history = [...tab.history, 'desktop-pc\\user', ''];
			return;
		}

		// --- date ---
		if (cmd === 'date') {
			tab.history = [...tab.history, new Date().toString(), ''];
			return;
		}

		// --- hostname ---
		if (cmd === 'hostname') {
			tab.history = [...tab.history, 'DESKTOP-WIN11', ''];
			return;
		}

		// --- pwd ---
		if (cmd === 'pwd') {
			tab.history = [...tab.history, tab.currentPath.replace(/\//g, '\\'), ''];
			return;
		}

		// --- ipconfig ---
		if (cmd === 'ipconfig') {
			tab.history = [...tab.history,
				'',
				'Windows IP Configuration',
				'',
				'Ethernet adapter Ethernet:',
				'',
				'   Connection-specific DNS Suffix  . : local',
				'   IPv4 Address. . . . . . . . . . . : 192.168.1.100',
				'   Subnet Mask . . . . . . . . . . . : 255.255.255.0',
				'   Default Gateway . . . . . . . . . : 192.168.1.1',
				'',
			];
			return;
		}

		// --- help ---
		if (cmd === 'help') {
			tab.history = [...tab.history,
				'Available commands:',
				'  dir, ls          List directory contents',
				'  cd <path>        Change directory',
				'  pwd              Print working directory',
				'  mkdir <name>     Create directory',
				'  cat, type <file> Display file contents',
				'  echo [text]      Print text (use > to write to file)',
				'  touch, New-Item  Create empty file',
				'  rm, del <path>   Remove file or directory (-r for recursive)',
				'  cp, copy         Copy file or directory',
				'  mv, move         Move/rename file or directory',
				'  find, where      Search for files by name',
				'  tree             Show directory tree',
				'  head <file> [n]  Show first n lines (default 10)',
				'  tail <file> [n]  Show last n lines (default 10)',
				'  wc <file>        Count lines, words, characters',
				'  grep, Select-String <pattern> <file>',
				'                   Search file contents',
				'  cls, clear       Clear screen',
				'  whoami           Show current user',
				'  date             Show current date/time',
				'  hostname         Show computer name',
				'  ipconfig         Show network configuration',
				'',
			];
			return;
		}

		// --- echo (with redirect or plain) ---
		if (cmd.startsWith('echo ')) {
			const rest = rawCmd.slice(5);
			const redirectMatch = rest.match(/^(.+?)\s*>\s*(.+)$/);
			if (redirectMatch) {
				const content = redirectMatch[1].trim();
				const fileName = redirectMatch[2].trim().replace(/"/g, '').replace(/'/g, '');
				const targetPath = resolvePath(tab.currentPath, fileName).absolutePath;
				if (writeFile(targetPath, content)) {
					tab.history = [...tab.history, ''];
				} else {
					tab.history = [...tab.history, `Error: could not write to ${fileName}`, ''];
				}
			} else {
				tab.history = [...tab.history, rest, ''];
			}
			return;
		}

		// --- cd ---
		if (cmd === 'cd' || cmd.startsWith('cd ')) {
			const target = rawCmd.slice(2).trim().replace(/"/g, '').replace(/'/g, '') || '~';
			const { node, absolutePath } = resolvePath(tab.currentPath, target);
			if (node && node.type === 'dir') {
				tab.currentPath = absolutePath;
				tab.history = [...tab.history, ''];
			} else {
				tab.history = [...tab.history,
					`The system cannot find the path specified: ${target}`,
					'',
				];
			}
			return;
		}

		// --- mkdir ---
		if (cmd.startsWith('mkdir ')) {
			const dirName = rawCmd.slice(6).trim().replace(/"/g, '').replace(/'/g, '');
			if (!dirName) {
				tab.history = [...tab.history, 'The syntax of the command is incorrect.', ''];
				return;
			}
			const targetPath = resolvePath(tab.currentPath, dirName).absolutePath;
			if (exists(targetPath)) {
				tab.history = [...tab.history,
					`A subdirectory or file ${dirName} already exists.`,
					'',
				];
			} else {
				mkdir(targetPath);
				tab.history = [...tab.history, ''];
			}
			return;
		}

		// --- cat / type ---
		if (cmd.startsWith('cat ') || cmd.startsWith('type ')) {
			const isType = cmd.startsWith('type ');
			const fileName = rawCmd.slice(isType ? 5 : 4).trim().replace(/"/g, '').replace(/'/g, '');
			const { node, absolutePath } = resolvePath(tab.currentPath, fileName);
			if (node && node.type === 'file') {
				const content = readFile(absolutePath);
				if (content !== null) {
					const lines = content.split('\n');
					tab.history = [...tab.history, ...lines, ''];
				} else {
					tab.history = [...tab.history, '', ''];
				}
			} else {
				tab.history = [...tab.history,
					`The system cannot find the file specified: ${fileName}`,
					'',
				];
			}
			return;
		}

		// --- rm / del ---
		if (cmd.startsWith('rm ') || cmd.startsWith('del ')) {
			const isRm = cmd.startsWith('rm ');
			const argsStr = rawCmd.slice(isRm ? 3 : 4).trim();
			const recursive = /\s*-r\b/.test(argsStr.toLowerCase());
			const target = argsStr.replace(/\s*-r\b/gi, '').trim().replace(/"/g, '').replace(/'/g, '');
			if (!target) {
				tab.history = [...tab.history, 'The syntax of the command is incorrect.', ''];
				return;
			}
			const { absolutePath } = resolvePath(tab.currentPath, target);
			if (!exists(absolutePath)) {
				tab.history = [...tab.history, `Could not find: ${target}`, ''];
			} else {
				const success = rm(absolutePath, recursive);
				if (success) {
					tab.history = [...tab.history, ''];
				} else {
					tab.history = [...tab.history,
						`The directory is not empty. Use -r to remove recursively.`,
						'',
					];
				}
			}
			return;
		}

		// --- touch / New-Item ---
		if (cmd.startsWith('touch ') || cmd.startsWith('new-item ')) {
			const isTouch = cmd.startsWith('touch ');
			const fileName = rawCmd.slice(isTouch ? 6 : 9).trim().replace(/"/g, '').replace(/'/g, '');
			if (!fileName) {
				tab.history = [...tab.history, 'The syntax of the command is incorrect.', ''];
				return;
			}
			const { absolutePath } = resolvePath(tab.currentPath, fileName);
			if (exists(absolutePath)) {
				tab.history = [...tab.history, `File already exists: ${fileName}`, ''];
			} else {
				writeFile(absolutePath, '');
				tab.history = [...tab.history, ''];
			}
			return;
		}

		// --- cp / copy ---
		if (cmd.startsWith('cp ') || cmd.startsWith('copy ')) {
			const isCp = cmd.startsWith('cp ');
			const argsStr = rawCmd.slice(isCp ? 3 : 5).trim();
			const parts = argsStr.split(/\s+/);
			if (parts.length < 2) {
				tab.history = [...tab.history, 'The syntax of the command is incorrect.', ''];
				return;
			}
			const srcPath = resolvePath(tab.currentPath, parts[0].replace(/"/g, '')).absolutePath;
			const destPath = resolvePath(tab.currentPath, parts[1].replace(/"/g, '')).absolutePath;
			if (!exists(srcPath)) {
				tab.history = [...tab.history, `The system cannot find the file specified: ${parts[0]}`, ''];
			} else if (cp(srcPath, destPath)) {
				tab.history = [...tab.history, '        1 file(s) copied.', ''];
			} else {
				tab.history = [...tab.history, `Error: could not copy to ${parts[1]}`, ''];
			}
			return;
		}

		// --- mv / move ---
		if (cmd.startsWith('mv ') || cmd.startsWith('move ')) {
			const isMv = cmd.startsWith('mv ');
			const argsStr = rawCmd.slice(isMv ? 3 : 5).trim();
			const parts = argsStr.split(/\s+/);
			if (parts.length < 2) {
				tab.history = [...tab.history, 'The syntax of the command is incorrect.', ''];
				return;
			}
			const srcPath = resolvePath(tab.currentPath, parts[0].replace(/"/g, '')).absolutePath;
			const destPath = resolvePath(tab.currentPath, parts[1].replace(/"/g, '')).absolutePath;
			if (!exists(srcPath)) {
				tab.history = [...tab.history, `The system cannot find the file specified: ${parts[0]}`, ''];
			} else if (mv(srcPath, destPath)) {
				tab.history = [...tab.history, '        1 file(s) moved.', ''];
			} else {
				tab.history = [...tab.history, `Error: could not move to ${parts[1]}`, ''];
			}
			return;
		}

		// --- find / where ---
		if (cmd.startsWith('find ') || cmd.startsWith('where ')) {
			const isFind = cmd.startsWith('find ');
			const pattern = rawCmd.slice(isFind ? 5 : 6).trim().replace(/"/g, '').replace(/'/g, '');
			if (!pattern) {
				tab.history = [...tab.history, 'The syntax of the command is incorrect.', ''];
				return;
			}
			const results = findRecursive(tab.currentPath, pattern);
			if (results.length === 0) {
				tab.history = [...tab.history, `No files found matching: ${pattern}`, ''];
			} else {
				tab.history = [...tab.history,
					...results.map(r => r.replace(/\//g, '\\')),
					'',
					`${results.length} item(s) found.`,
					'',
				];
			}
			return;
		}

		// --- tree ---
		if (cmd === 'tree') {
			const winPath = tab.currentPath.replace(/\//g, '\\');
			const treeLines = buildTree(tab.currentPath);
			tab.history = [...tab.history,
				winPath,
				...treeLines,
				'',
			];
			return;
		}

		// --- head ---
		if (cmd.startsWith('head ')) {
			const argsStr = rawCmd.slice(5).trim();
			const parts = argsStr.split(/\s+/);
			const fileName = parts[0]?.replace(/"/g, '').replace(/'/g, '') ?? '';
			const n = parts.length > 1 ? parseInt(parts[1], 10) : 10;
			if (!fileName) {
				tab.history = [...tab.history, 'The syntax of the command is incorrect.', ''];
				return;
			}
			const { node, absolutePath } = resolvePath(tab.currentPath, fileName);
			if (node && node.type === 'file') {
				const content = readFile(absolutePath) ?? '';
				const lines = content.split('\n').slice(0, isNaN(n) ? 10 : n);
				tab.history = [...tab.history, ...lines, ''];
			} else {
				tab.history = [...tab.history, `The system cannot find the file specified: ${fileName}`, ''];
			}
			return;
		}

		// --- tail ---
		if (cmd.startsWith('tail ')) {
			const argsStr = rawCmd.slice(5).trim();
			const parts = argsStr.split(/\s+/);
			const fileName = parts[0]?.replace(/"/g, '').replace(/'/g, '') ?? '';
			const n = parts.length > 1 ? parseInt(parts[1], 10) : 10;
			if (!fileName) {
				tab.history = [...tab.history, 'The syntax of the command is incorrect.', ''];
				return;
			}
			const { node, absolutePath } = resolvePath(tab.currentPath, fileName);
			if (node && node.type === 'file') {
				const content = readFile(absolutePath) ?? '';
				const allLines = content.split('\n');
				const count = isNaN(n) ? 10 : n;
				const lines = allLines.slice(-count);
				tab.history = [...tab.history, ...lines, ''];
			} else {
				tab.history = [...tab.history, `The system cannot find the file specified: ${fileName}`, ''];
			}
			return;
		}

		// --- wc ---
		if (cmd.startsWith('wc ')) {
			const fileName = rawCmd.slice(3).trim().replace(/"/g, '').replace(/'/g, '');
			if (!fileName) {
				tab.history = [...tab.history, 'The syntax of the command is incorrect.', ''];
				return;
			}
			const { node, absolutePath } = resolvePath(tab.currentPath, fileName);
			if (node && node.type === 'file') {
				const content = readFile(absolutePath) ?? '';
				const lines = content.split('\n').length;
				const words = content.split(/\s+/).filter(Boolean).length;
				const chars = content.length;
				tab.history = [...tab.history,
					`  ${lines}  ${words}  ${chars} ${fileName}`,
					'',
				];
			} else {
				tab.history = [...tab.history, `The system cannot find the file specified: ${fileName}`, ''];
			}
			return;
		}

		// --- grep / Select-String ---
		if (cmd.startsWith('grep ') || cmd.startsWith('select-string ')) {
			const isGrep = cmd.startsWith('grep ');
			const argsStr = rawCmd.slice(isGrep ? 5 : 14).trim();
			const parts = argsStr.split(/\s+/);
			if (parts.length < 2) {
				tab.history = [...tab.history, 'Usage: grep <pattern> <file>', ''];
				return;
			}
			const pattern = parts[0].replace(/"/g, '').replace(/'/g, '');
			const fileName = parts[1].replace(/"/g, '').replace(/'/g, '');
			const { node, absolutePath } = resolvePath(tab.currentPath, fileName);
			if (node && node.type === 'file') {
				const content = readFile(absolutePath) ?? '';
				let regex: RegExp;
				try {
					regex = new RegExp(pattern, 'gi');
				} catch {
					regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
				}
				const matches = content.split('\n').filter(line => regex.test(line));
				regex.lastIndex = 0; // reset
				if (matches.length === 0) {
					tab.history = [...tab.history, `No matches found for "${pattern}" in ${fileName}`, ''];
				} else {
					tab.history = [...tab.history, ...matches, ''];
				}
			} else {
				tab.history = [...tab.history, `The system cannot find the file specified: ${fileName}`, ''];
			}
			return;
		}

		// --- developer commands: git / pytest / npm / pnpm / make ---
		const tokens = rawCmd.trim().split(/\s+/);
		const head = tokens[0];
		const sub = tokens[1] || '';
		const rest = tokens.slice(1).join(' ');
		if (head === 'git') {
			const out: string[] = [];
			if (!sub || sub === '--version') out.push('git version 2.43.0.windows.1');
			else if (sub === 'add') out.push('');
			else if (sub === 'commit') {
				const mIdx = tokens.indexOf('-m');
				const amIdx = tokens.indexOf('-am');
				const msg = (mIdx >= 0 ? tokens.slice(mIdx + 1) : amIdx >= 0 ? tokens.slice(amIdx + 1) : []).join(' ').replace(/^['"]|['"]$/g, '') || 'commit';
				const sha = Math.random().toString(16).slice(2, 9);
				out.push(`[main ${sha}] ${msg}`, ` 1 file changed, 1 insertion(+)`);
			} else if (sub === 'push') {
				const remote = tokens[2] || 'origin';
				const branch = tokens[3] || 'main';
				out.push('Enumerating objects: 5, done.',
					'Counting objects: 100% (5/5), done.',
					'Writing objects: 100% (3/3), 412 bytes | 412.00 KiB/s, done.',
					'Total 3 (delta 2), reused 0 (delta 0), pack-reused 0',
					'To github.com:acme/api.git',
					`   a1b2c3d..e4f5g6h  ${branch} -> ${branch}`);
			} else if (sub === 'pull') {
				out.push('Already up to date.');
			} else if (sub === 'fetch') {
				out.push('From github.com:acme/api', ' * [new branch]      main       -> origin/main');
			} else if (sub === 'checkout') {
				const tgt = tokens.slice(2).find((t: string) => !t.startsWith('-')) || 'main';
				out.push(`Switched to branch '${tgt}'`);
			} else if (sub === 'status') {
				out.push('On branch main', "Your branch is up to date with 'origin/main'.", '', 'nothing to commit, working tree clean');
			} else if (sub === 'log') {
				out.push('commit a1b2c3d4e5f6 (HEAD -> main, origin/main)',
					'Author: User <user@example.com>',
					'Date:   ' + new Date().toString(),
					'',
					'    Latest commit');
			} else if (sub === 'clone') {
				const repo = tokens[2] || 'repo';
				const name = repo.split('/').pop()?.replace(/\.git$/, '') || 'repo';
				out.push(`Cloning into '${name}'...`, 'remote: Enumerating objects: 142, done.', "Receiving objects: 100% (142/142), done.", 'Resolving deltas: 100% (75/75), done.');
			} else if (sub === 'branch') {
				out.push('* main', '  develop', '  feature/new-ui');
			} else if (sub === 'remote') {
				out.push('origin\thttps://github.com/user/repo.git (fetch)', 'origin\thttps://github.com/user/repo.git (push)');
			} else if (sub === 'diff') {
				/* clean */
			} else if (sub === 'init') {
				out.push('Initialized empty Git repository in C:\\repo\\.git\\');
			} else out.push(`git: '${sub}' is not a git command. See 'git --help'.`);
			tab.history = [...tab.history, ...out, ''];
			return;
		}
		if (head === 'pytest') {
			const filter = (() => {
				const i = tokens.indexOf('-k'); return i >= 0 ? tokens[i + 1] || '' : '';
			})();
			const ran = 4 + Math.floor(Math.random() * 6);
			const passed = ran - Math.floor(Math.random() * 2);
			const failed = ran - passed;
			const elapsed = (Math.random() * 2 + 0.4).toFixed(2);
			const out = [
				'============================= test session starts ==============================',
				'platform win32 -- Python 3.12.1, pytest-7.4.4, pluggy-1.3.0',
				'rootdir: C:\\repo',
			];
			if (filter) out.push(`pytest -k ${filter}`);
			out.push(`collected ${ran} items`, '');
			for (let i = 0; i < ran; i++) out.push(`tests\\test_unit.py ${i < passed ? '.' : 'F'}`);
			out.push('');
			out.push(failed === 0
				? `============================== ${ran} passed in ${elapsed}s ==============================`
				: `========================= ${failed} failed, ${passed} passed in ${elapsed}s =========================`);
			tab.history = [...tab.history, ...out, ''];
			return;
		}
		if (head === 'npm' || head === 'pnpm' || head === 'yarn') {
			const out: string[] = [];
			if (sub === '--version' || sub === '-v') {
				out.push(head === 'npm' ? '10.2.5' : head === 'pnpm' ? '8.15.1' : '1.22.21');
			} else if (sub === 'install' || sub === 'i') {
				out.push('added 142 packages, and audited 143 packages in 1s', '', '28 packages are looking for funding', 'found 0 vulnerabilities');
			} else if (sub === 'run') {
				const script = tokens[2] || 'start';
				out.push(`> ${script}`, `> echo "running ${script}"`, '', `running ${script}`);
			} else if (sub === 'test') {
				out.push('PASS  tests/example.spec.ts', 'Tests: 8 passed, 8 total', 'Time:   1.42s');
			} else if (sub === 'build') {
				out.push('> build', '✓ 42 modules transformed.', 'dist/index.html  0.62 kB', '✓ built in 1.42s');
			} else {
				out.push(`Usage: ${head} <command>`);
			}
			tab.history = [...tab.history, ...out, ''];
			return;
		}
		if (head === 'make') {
			const target = sub || 'all';
			tab.history = [...tab.history,
				"make[1]: Entering directory 'C:\\repo'",
				'gcc -Wall -O2 -c main.c -o main.o',
				`gcc -Wall -O2 main.o -o ${target}`,
				"make[1]: Leaving directory 'C:\\repo'",
				''];
			return;
		}

		// --- unrecognized or empty ---
		if (cmd !== '') {
			tab.history = [...tab.history,
				`'${rawCmd}' is not recognized as an internal or external command,`,
				'operable program or batch file.',
				'',
			];
			notify({ appName: 'Terminal', appIcon: '💻', title: 'Command not found', body: `'${rawCmd}' is not recognized as a command` });
		} else {
			tab.history = [...tab.history, ''];
		}
	}

	// ── Keyboard handling ───────────────────────────────────────────

	function handleKeyDown(e: KeyboardEvent) {
		const tab = tabs.find((t) => t.id === activeTabId);
		if (!tab) return;

		// Ctrl+T: new PowerShell tab
		if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 't') {
			e.preventDefault();
			addTab('powershell');
			return;
		}

		// Ctrl+W: close active tab
		if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'w') {
			e.preventDefault();
			closeTab(activeTabId);
			return;
		}

		// Ctrl+Tab / Ctrl+Shift+Tab: cycle tabs
		if ((e.ctrlKey || e.metaKey) && e.key === 'Tab') {
			e.preventDefault();
			if (tabs.length < 2) return;
			const idx = tabs.findIndex((t) => t.id === activeTabId);
			const nextIdx = e.shiftKey
				? (idx - 1 + tabs.length) % tabs.length
				: (idx + 1) % tabs.length;
			switchTab(tabs[nextIdx].id);
			return;
		}

		// Ctrl+Shift+C: copy selected terminal text to shared clipboard
		if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
			e.preventDefault();
			const selection = window.getSelection();
			const selectedText = selection?.toString() ?? '';
			if (selectedText) {
				copyText(selectedText);
			}
			return;
		}

		// Ctrl+Shift+V: paste from shared clipboard into input line
		if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'v') {
			e.preventDefault();
			const text = pasteText();
			if (text !== null) {
				if (inputRef) {
					const start = inputRef.selectionStart ?? currentInput.length;
					const end = inputRef.selectionEnd ?? currentInput.length;
					currentInput = currentInput.slice(0, start) + text + currentInput.slice(end);
					const newPos = start + text.length;
					requestAnimationFrame(() => {
						if (inputRef) {
							inputRef.selectionStart = newPos;
							inputRef.selectionEnd = newPos;
						}
					});
				}
			}
			return;
		}

		if (e.key === 'ArrowUp') {
			e.preventDefault();
			if (tab.commandHistory.length === 0) return;
			if (historyIndex < tab.commandHistory.length - 1) {
				historyIndex++;
			}
			currentInput = tab.commandHistory[tab.commandHistory.length - 1 - historyIndex];
			return;
		}

		if (e.key === 'ArrowDown') {
			e.preventDefault();
			if (historyIndex > 0) {
				historyIndex--;
				currentInput = tab.commandHistory[tab.commandHistory.length - 1 - historyIndex];
			} else {
				historyIndex = -1;
				currentInput = '';
			}
			return;
		}

		if (e.key === 'Enter') {
			e.preventDefault();

			const prompt = getPrompt(tab.type, tab.currentPath);
			tab.history = [...tab.history, prompt + currentInput];

			if (currentInput.trim()) {
				tab.commandHistory = [...tab.commandHistory, currentInput.trim()];
			}
			historyIndex = -1;

			executeCommand(tab, currentInput.trim());

			tabs = tabs;
			currentInput = '';

			scrollToBottom();
		}
	}

	// ── Tab management ──────────────────────────────────────────────

	function addTab(type: TermTab['type']) {
		const newTab = createDefaultTab(nextTabId, type);
		tabs = [...tabs, newTab];
		activeTabId = nextTabId;
		nextTabId++;
		currentInput = '';
		historyIndex = -1;
		showDropdown = false;
		focusInput();
	}

	function closeTab(id: number) {
		if (tabs.length === 1) {
			// Replace with a fresh PowerShell tab
			const newTab = createDefaultTab(nextTabId, 'powershell');
			tabs = [newTab];
			activeTabId = nextTabId;
			nextTabId++;
			currentInput = '';
			historyIndex = -1;
			focusInput();
			return;
		}
		const idx = tabs.findIndex((t) => t.id === id);
		tabs = tabs.filter((t) => t.id !== id);
		if (activeTabId === id) {
			activeTabId = tabs[Math.min(idx, tabs.length - 1)].id;
		}
		currentInput = '';
		historyIndex = -1;
		focusInput();
	}

	function switchTab(id: number) {
		activeTabId = id;
		currentInput = '';
		historyIndex = -1;
		focusInput();
	}

	function handleTabMouseDown(e: MouseEvent, id: number) {
		// Middle-click closes a tab
		if (e.button === 1) {
			e.preventDefault();
			e.stopPropagation();
			closeTab(id);
		}
	}

	// ── Register custom title bar with the WindowFrame ─────────────

	onMount(() => {
		customTitleBars.set('terminal', titleBar);
		focusInput();
	});

	onDestroy(() => {
		customTitleBars.clear('terminal');
	});
</script>

{#snippet titleBar()}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="terminal-titlebar">
		<div class="tabs-row">
			{#each tabs as tab (tab.id)}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="tab"
					class:active={activeTabId === tab.id}
					data-no-drag
					onclick={(e) => { e.stopPropagation(); switchTab(tab.id); }}
					onmousedown={(e) => handleTabMouseDown(e, tab.id)}
				>
					<span class="tab-icon">
						{#if tab.type === 'powershell'}
							<svg width="14" height="14" viewBox="0 0 14 14" fill="#3A96DD">
								<polygon points="1,2 8,7 1,12" />
								<line x1="8" y1="10" x2="13" y2="10" stroke="#3A96DD" stroke-width="1.5" />
							</svg>
						{:else if tab.type === 'cmd'}
							<span style="font-size: 11px; color: rgba(255,255,255,0.85);">&#x2588;&gt;_</span>
						{:else}
							<span style="font-size: 12px; color: #3A96DD;">&#9729;</span>
						{/if}
					</span>
					<span class="tab-title">{tab.title}</span>
					<button
						class="tab-close"
						data-no-drag
						aria-label="Close tab"
						onclick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
					>
						<svg width="8" height="8" viewBox="0 0 8 8">
							<line x1="1" y1="1" x2="7" y2="7" stroke="currentColor" stroke-width="1" />
							<line x1="7" y1="1" x2="1" y2="7" stroke="currentColor" stroke-width="1" />
						</svg>
					</button>
				</div>
			{/each}
			<button
				class="new-tab-btn"
				data-no-drag
				aria-label="New tab"
				title="New tab (Ctrl+T)"
				onclick={(e) => { e.stopPropagation(); addTab('powershell'); }}
			>
				<svg width="11" height="11" viewBox="0 0 12 12">
					<line x1="6" y1="1" x2="6" y2="11" stroke="currentColor" stroke-width="1.2" />
					<line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" stroke-width="1.2" />
				</svg>
			</button>
			<div class="dropdown-wrapper" data-no-drag>
				<button
					class="dropdown-btn"
					data-no-drag
					aria-label="Open new tab type"
					title="Open new tab type"
					onclick={(e) => { e.stopPropagation(); showDropdown = !showDropdown; }}
				>
					<svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
						<polygon points="2,3 5,7 8,3" />
					</svg>
				</button>
				{#if showDropdown}
					<div class="tab-type-dropdown" data-no-drag>
						<button class="tab-type-item" data-no-drag onclick={(e) => { e.stopPropagation(); addTab('powershell'); }}>
							<svg width="14" height="14" viewBox="0 0 14 14" fill="#3A96DD">
								<polygon points="1,2 8,7 1,12" />
								<line x1="8" y1="10" x2="13" y2="10" stroke="#3A96DD" stroke-width="1.5" />
							</svg>
							<span>Windows PowerShell</span>
						</button>
						<button class="tab-type-item" data-no-drag onclick={(e) => { e.stopPropagation(); addTab('cmd'); }}>
							<span style="font-size: 12px; width: 14px; text-align: center;">&#x2588;&gt;_</span>
							<span>Command Prompt</span>
						</button>
						<button class="tab-type-item" data-no-drag onclick={(e) => { e.stopPropagation(); addTab('azure'); }}>
							<span style="font-size: 12px; width: 14px; text-align: center; color: #3A96DD;">&#9729;</span>
							<span>Azure Cloud Shell</span>
						</button>
						<div class="dropdown-separator"></div>
						<button class="tab-type-item" data-no-drag onclick={(e) => { e.stopPropagation(); showDropdown = false; }}>
							<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="1.2">
								<circle cx="7" cy="7" r="5.5" />
								<line x1="7" y1="4" x2="7" y2="8" />
								<circle cx="7" cy="10" r="0.5" fill="rgba(255,255,255,0.6)" />
							</svg>
							<span>Settings</span>
						</button>
					</div>
				{/if}
			</div>
		</div>
		<!-- Empty stretch zone keeps drag working in the space between tabs and window controls -->
		<div class="drag-spacer"></div>
	</div>
{/snippet}

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="terminal-app" onclick={() => { if (showDropdown) showDropdown = false; if (inputRef) inputRef.focus(); }}>
	<div class="terminal-content">
		<div class="terminal-output" bind:this={outputRef}>
			{#if activeTab}
				{#each activeTab.history as line}
					<div class="output-line">{line || ' '}</div>
				{/each}
			{/if}
			<div class="input-line">
				<span class="prompt">{activeTab ? getPrompt(activeTab.type, activeTab.currentPath) : '> '}</span>
				<input
					type="text"
					class="terminal-input"
					bind:value={currentInput}
					bind:this={inputRef}
					onkeydown={handleKeyDown}
					spellcheck="false"
				/>
			</div>
		</div>
	</div>
</div>

<style>
	.terminal-app {
		height: 100%;
		display: flex;
		flex-direction: column;
		background: #0C0C0C;
		font-family: 'Cascadia Code', 'Cascadia Mono', 'Consolas', 'Courier New', monospace;
	}

	/* ───── Title-bar tab strip (rendered by WindowFrame via snippet registry) ───── */

	.terminal-titlebar {
		flex: 1;
		display: flex;
		align-items: stretch;
		min-width: 0;
		height: 100%;
		background: #1F1F1F;
		padding-left: 8px;
	}

	.tabs-row {
		display: flex;
		align-items: flex-end;
		gap: 2px;
		min-width: 0;
		overflow: hidden;
		padding-top: 4px;
	}

	.drag-spacer {
		flex: 1;
		min-width: 24px;
	}

	.tab {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 0 10px;
		height: 28px;
		font-size: 12px;
		color: rgba(255, 255, 255, 0.65);
		background: transparent;
		border-radius: 6px 6px 0 0;
		cursor: default;
		transition: background-color 0.1s ease, color 0.1s ease;
		max-width: 220px;
		min-width: 80px;
		flex-shrink: 1;
	}

	.tab:hover {
		background: rgba(255, 255, 255, 0.06);
		color: rgba(255, 255, 255, 0.85);
	}

	/* Active tab is "cut out" of the title bar — matches terminal body bg, extends to bottom edge. */
	.tab.active {
		background: #0C0C0C;
		color: rgba(255, 255, 255, 0.95);
	}

	.tab-icon {
		flex-shrink: 0;
		display: flex;
		align-items: center;
	}

	.tab-title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 12px;
		flex: 1;
		min-width: 0;
	}

	.tab-close {
		width: 16px;
		height: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 3px;
		color: rgba(255, 255, 255, 0.5);
		opacity: 0;
		transition: opacity 0.08s ease, background-color 0.08s ease, color 0.08s ease;
		flex-shrink: 0;
	}

	.tab:hover .tab-close,
	.tab.active .tab-close {
		opacity: 1;
	}

	.tab-close:hover {
		background: rgba(255, 255, 255, 0.12);
		color: rgba(255, 255, 255, 0.95);
	}

	.new-tab-btn,
	.dropdown-btn {
		width: 28px;
		height: 28px;
		margin-bottom: 0;
		align-self: flex-end;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--win-radius-sm);
		color: rgba(255, 255, 255, 0.7);
		transition: background-color 0.08s ease, color 0.08s ease;
		flex-shrink: 0;
	}

	.new-tab-btn:hover,
	.dropdown-btn:hover {
		background: rgba(255, 255, 255, 0.08);
		color: rgba(255, 255, 255, 0.95);
	}

	.dropdown-wrapper {
		position: relative;
		display: flex;
		align-items: flex-end;
	}

	.tab-type-dropdown {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		min-width: 220px;
		background: #2D2D2D;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 6px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
		padding: 4px;
		z-index: 100;
	}

	.tab-type-item {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 8px 12px;
		font-size: 12px;
		color: rgba(255, 255, 255, 0.85);
		text-align: left;
		border-radius: 4px;
		transition: background-color 0.08s ease;
	}

	.tab-type-item:hover {
		background: rgba(255, 255, 255, 0.08);
	}

	.dropdown-separator {
		height: 1px;
		background: rgba(255, 255, 255, 0.08);
		margin: 4px 8px;
	}

	/* ───── Terminal body ───── */

	.terminal-content {
		flex: 1;
		overflow: hidden;
		padding: 4px 0;
	}

	.terminal-output {
		height: 100%;
		overflow-y: auto;
		padding: 8px 12px;
		user-select: text;
		-webkit-user-select: text;
	}

	.output-line {
		font-size: 13px;
		line-height: 1.4;
		color: #CCCCCC;
		white-space: pre-wrap;
		word-break: break-all;
		user-select: text;
		-webkit-user-select: text;
	}

	.input-line {
		display: flex;
		align-items: center;
		font-size: 13px;
		line-height: 1.4;
	}

	.prompt {
		color: #569CD6;
		white-space: pre;
		flex-shrink: 0;
	}

	.terminal-input {
		flex: 1;
		background: none;
		border: none;
		color: #CCCCCC;
		font-family: inherit;
		font-size: 13px;
		caret-color: #CCCCCC;
	}

	.terminal-input:focus {
		outline: none;
	}

	/* Blinking cursor via caret-color animation */
	@keyframes blink {
		0%, 49% { caret-color: #CCCCCC; }
		50%, 100% { caret-color: transparent; }
	}

	.terminal-input:focus {
		outline: none;
		animation: blink 1s step-end infinite;
	}

	/* Scrollbar */
	.terminal-output::-webkit-scrollbar {
		width: 8px;
	}

	.terminal-output::-webkit-scrollbar-track {
		background: transparent;
	}

	.terminal-output::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.15);
		border-radius: 4px;
	}

	.terminal-output::-webkit-scrollbar-thumb:hover {
		background: rgba(255, 255, 255, 0.25);
	}
</style>

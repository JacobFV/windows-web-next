# windows-web-next

> Project page: [jacobfv.com/projects/windows-web-next](https://jacobfv.com/projects/windows-web-next) · Used as a native execution substrate by [SynthUX](https://jacobfv.com/projects/synthux) ([github.com/JacobFV/synthux](https://github.com/JacobFV/synthux))

A browser-based Windows 11 simulation built in Svelte for human annotation and computer-use agent research.

## What it is

- Recreates a desktop environment with window management, taskbar, start menu, and bundled apps in Svelte.
- Includes a reactive in-memory filesystem and app surface for realistic computer-use interaction traces.
- Serves as a controlled environment for annotation, evaluation, and agent training rather than a visual parody of Windows.

The repo is intentionally a research substrate: structured affordances (open app, navigate folders, manipulate files, resize windows, handle menus, move through a desktop workflow) are exposed so external agent/dataset systems can drive it without a real machine.

## Local development

```bash
pnpm install
pnpm dev             # default port 5173
pnpm dev --port 5174 # alternate port for multi-sim runs
```

## SynthUX bridge

`src/lib/embed-bridge.ts` exposes:

- `window.__synthuxLaunchApp(appId)` and a `synthux-launch` postMessage handler that route through `wm.openApp(...)`. The SynthUX launcher overlay calls this on a real low-level click, so visible state changes still flow from real DOM events.
- A `synthux.getState` postMessage handler that returns the active workspace and window snapshot.

No other bridge command mutates state. See [`SynthUX`](https://github.com/JacobFV/synthux) for the executor side and the per-(env, surface) compilers that drive Notepad, Terminal, Edge, Mail, Wordpad, and VSCode here.

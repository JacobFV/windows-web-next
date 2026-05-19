/** File type registry: maps file extensions to the app that opens them. */

import type { AppID } from './windows.svelte';

export interface FileTypeInfo {
	appId: AppID | null;
	typeLabel: string;
	icon: string;
}

const registry: Record<string, FileTypeInfo> = {
	// Text files → Notepad
	'.txt': { appId: 'notepad', typeLabel: 'Text Document', icon: '📄' },
	'.md': { appId: 'notepad', typeLabel: 'Markdown File', icon: '📄' },
	'.log': { appId: 'notepad', typeLabel: 'Log File', icon: '📄' },
	'.ini': { appId: 'notepad', typeLabel: 'Configuration File', icon: '📄' },
	'.json': { appId: 'notepad', typeLabel: 'JSON File', icon: '📄' },
	'.js': { appId: 'notepad', typeLabel: 'JavaScript File', icon: '📄' },
	'.ts': { appId: 'notepad', typeLabel: 'TypeScript File', icon: '📄' },
	'.css': { appId: 'notepad', typeLabel: 'CSS File', icon: '📄' },
	'.html': { appId: 'notepad', typeLabel: 'HTML File', icon: '📄' },
	'.xml': { appId: 'notepad', typeLabel: 'XML File', icon: '📄' },
	'.csv': { appId: 'notepad', typeLabel: 'CSV File', icon: '📄' },
	'.yml': { appId: 'notepad', typeLabel: 'YAML File', icon: '📄' },
	'.yaml': { appId: 'notepad', typeLabel: 'YAML File', icon: '📄' },
	'.env': { appId: 'notepad', typeLabel: 'Environment File', icon: '📄' },
	'.bat': { appId: 'notepad', typeLabel: 'Batch File', icon: '📄' },
	'.ps1': { appId: 'notepad', typeLabel: 'PowerShell Script', icon: '📄' },
	'.sh': { appId: 'notepad', typeLabel: 'Shell Script', icon: '📄' },

	// Images → Photos
	'.png': { appId: 'photos', typeLabel: 'PNG File', icon: '🖼️' },
	'.jpg': { appId: 'photos', typeLabel: 'JPG File', icon: '🖼️' },
	'.jpeg': { appId: 'photos', typeLabel: 'JPEG File', icon: '🖼️' },
	'.gif': { appId: 'photos', typeLabel: 'GIF File', icon: '🖼️' },
	'.bmp': { appId: 'photos', typeLabel: 'Bitmap File', icon: '🖼️' },
	'.webp': { appId: 'photos', typeLabel: 'WebP File', icon: '🖼️' },
	'.ico': { appId: 'photos', typeLabel: 'Icon File', icon: '🖼️' },
	'.svg': { appId: 'photos', typeLabel: 'SVG File', icon: '🖼️' },

	// Documents → Edge (as viewer)
	'.pdf': { appId: 'edge', typeLabel: 'PDF Document', icon: '📕' },
	'.docx': { appId: 'edge', typeLabel: 'Microsoft Word', icon: '📝' },
	'.xlsx': { appId: 'excel', typeLabel: 'Microsoft Excel', icon: '📊' },
	'.pptx': { appId: 'edge', typeLabel: 'Microsoft PowerPoint', icon: '📊' },

	// Archives
	'.zip': { appId: null, typeLabel: 'Compressed Folder', icon: '📦' },
	'.rar': { appId: null, typeLabel: 'RAR Archive', icon: '📦' },
	'.7z': { appId: null, typeLabel: '7-Zip Archive', icon: '📦' },
	'.tar': { appId: null, typeLabel: 'TAR Archive', icon: '📦' },
	'.gz': { appId: null, typeLabel: 'GZip Archive', icon: '📦' },

	// Executables — cannot run
	'.exe': { appId: null, typeLabel: 'Application', icon: '⚙️' },
	'.msi': { appId: null, typeLabel: 'Windows Installer', icon: '⚙️' },

	// Media
	'.mp3': { appId: null, typeLabel: 'MP3 Audio', icon: '🎵' },
	'.wav': { appId: null, typeLabel: 'WAV Audio', icon: '🎵' },
	'.flac': { appId: null, typeLabel: 'FLAC Audio', icon: '🎵' },
	'.m3u': { appId: null, typeLabel: 'Playlist File', icon: '🎵' },
	'.mp4': { appId: null, typeLabel: 'MP4 Video', icon: '🎬' },
	'.avi': { appId: null, typeLabel: 'AVI Video', icon: '🎬' },
	'.mkv': { appId: null, typeLabel: 'MKV Video', icon: '🎬' },
	'.dmg': { appId: null, typeLabel: 'Disk Image', icon: '💿' },
};

export function getFileExtension(filename: string): string {
	const dot = filename.lastIndexOf('.');
	if (dot === -1 || dot === 0) return '';
	return filename.slice(dot).toLowerCase();
}

export function lookupFileType(filename: string): FileTypeInfo {
	const ext = getFileExtension(filename);
	return registry[ext] ?? { appId: null, typeLabel: 'File', icon: '📄' };
}

export function getAppForFile(filename: string): AppID | null {
	return lookupFileType(filename).appId;
}

export function getFileIcon(filename: string): string {
	return lookupFileType(filename).icon;
}

export function getFileTypeLabel(filename: string): string {
	return lookupFileType(filename).typeLabel;
}

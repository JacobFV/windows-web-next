/** File type registry: maps file extensions to the app that opens them. */

import type { AppID } from './windows.svelte';

export interface FileTypeInfo {
	appId: AppID | null;
	typeLabel: string;
	icon: string;
}

const registry: Record<string, FileTypeInfo> = {
	// Plain text files → Notepad
	'.txt': { appId: 'notepad', typeLabel: 'Text Document', icon: '📄' },
	'.log': { appId: 'notepad', typeLabel: 'Log File', icon: '📄' },
	'.ini': { appId: 'notepad', typeLabel: 'Configuration File', icon: '📄' },
	'.xml': { appId: 'notepad', typeLabel: 'XML File', icon: '📄' },
	'.csv': { appId: 'excel', typeLabel: 'CSV File', icon: '📊' },
	'.env': { appId: 'notepad', typeLabel: 'Environment File', icon: '📄' },
	'.bat': { appId: 'notepad', typeLabel: 'Batch File', icon: '📄' },
	'.ps1': { appId: 'notepad', typeLabel: 'PowerShell Script', icon: '📄' },
	// Source code files → VSCode
	'.md': { appId: 'vscode', typeLabel: 'Markdown File', icon: '📄' },
	'.json': { appId: 'vscode', typeLabel: 'JSON File', icon: '📄' },
	'.js': { appId: 'vscode', typeLabel: 'JavaScript File', icon: '📄' },
	'.jsx': { appId: 'vscode', typeLabel: 'JSX File', icon: '📄' },
	'.ts': { appId: 'vscode', typeLabel: 'TypeScript File', icon: '📄' },
	'.tsx': { appId: 'vscode', typeLabel: 'TSX File', icon: '📄' },
	'.css': { appId: 'vscode', typeLabel: 'CSS File', icon: '📄' },
	'.html': { appId: 'vscode', typeLabel: 'HTML File', icon: '📄' },
	'.py': { appId: 'vscode', typeLabel: 'Python File', icon: '📄' },
	'.rs': { appId: 'vscode', typeLabel: 'Rust File', icon: '📄' },
	'.go': { appId: 'vscode', typeLabel: 'Go File', icon: '📄' },
	'.svelte': { appId: 'vscode', typeLabel: 'Svelte Component', icon: '📄' },
	'.vue': { appId: 'vscode', typeLabel: 'Vue Component', icon: '📄' },
	'.rb': { appId: 'vscode', typeLabel: 'Ruby File', icon: '📄' },
	'.java': { appId: 'vscode', typeLabel: 'Java File', icon: '📄' },
	'.c': { appId: 'vscode', typeLabel: 'C File', icon: '📄' },
	'.cpp': { appId: 'vscode', typeLabel: 'C++ File', icon: '📄' },
	'.h': { appId: 'vscode', typeLabel: 'C Header File', icon: '📄' },
	'.sh': { appId: 'vscode', typeLabel: 'Shell Script', icon: '📄' },
	'.yaml': { appId: 'vscode', typeLabel: 'YAML File', icon: '📄' },
	'.yml': { appId: 'vscode', typeLabel: 'YAML File', icon: '📄' },
	'.toml': { appId: 'vscode', typeLabel: 'TOML File', icon: '📄' },

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

	// Word documents
	'.docx': { appId: 'word', typeLabel: 'Microsoft Word Document', icon: '📝' },
	'.doc': { appId: 'word', typeLabel: 'Microsoft Word 97-2003 Document', icon: '📝' },
	'.rtf': { appId: 'word', typeLabel: 'Rich Text Document', icon: '📝' },
	'.odt': { appId: 'word', typeLabel: 'OpenDocument Text', icon: '📝' },

	// Excel spreadsheets
	'.xlsx': { appId: 'excel', typeLabel: 'Microsoft Excel Workbook', icon: '📊' },
	'.xls': { appId: 'excel', typeLabel: 'Microsoft Excel 97-2003 Workbook', icon: '📊' },
	'.ods': { appId: 'excel', typeLabel: 'OpenDocument Spreadsheet', icon: '📊' },

	// PowerPoint presentations
	'.pptx': { appId: 'powerpoint', typeLabel: 'Microsoft PowerPoint Presentation', icon: '📽️' },
	'.ppt': { appId: 'powerpoint', typeLabel: 'Microsoft PowerPoint 97-2003 Presentation', icon: '📽️' },
	'.odp': { appId: 'powerpoint', typeLabel: 'OpenDocument Presentation', icon: '📽️' },

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
	'.mp3': { appId: 'music', typeLabel: 'MP3 Audio', icon: '🎵' },
	'.wav': { appId: 'music', typeLabel: 'WAV Audio', icon: '🎵' },
	'.flac': { appId: 'music', typeLabel: 'FLAC Audio', icon: '🎵' },
	'.m3u': { appId: 'music', typeLabel: 'Playlist File', icon: '🎵' },
	'.mp4': { appId: 'videos', typeLabel: 'MP4 Video', icon: '🎬' },
	'.avi': { appId: 'videos', typeLabel: 'AVI Video', icon: '🎬' },
	'.mkv': { appId: 'videos', typeLabel: 'MKV Video', icon: '🎬' },
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

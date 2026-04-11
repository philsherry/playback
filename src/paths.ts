/**
 * @module paths
 *
 * XDG Base Directory helpers for playback.
 *
 * Voice models (~240 MB) are cached in `$XDG_CACHE_HOME/playback/voices/`
 * so they can be shared across every project that uses playback. The
 * pipeline checks project-local paths first, falling back to the XDG
 * cache — so per-project overrides still work.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Returns the playback-specific XDG cache directory.
 *
 * Reads `$XDG_CACHE_HOME` if set, otherwise falls back to `~/.cache`.
 * Uses `~/.cache` on macOS (not `~/Library/Caches`) for consistency
 * with other developer CLI tools.
 * @returns Absolute path to `$XDG_CACHE_HOME/playback`.
 */
export function xdgCacheDir(): string {
	const base = process.env['XDG_CACHE_HOME'] || join(homedir(), '.cache');
	return join(base, 'playback');
}

/**
 * Returns the playback-specific XDG config directory.
 *
 * Reads `$XDG_CONFIG_HOME` if set, otherwise falls back to `~/.config`.
 * @returns Absolute path to `$XDG_CONFIG_HOME/playback`.
 */
export function xdgConfigDir(): string {
	const base = process.env['XDG_CONFIG_HOME'] || join(homedir(), '.config');
	return join(base, 'playback');
}

/**
 * Returns the shared voice model cache directory.
 * @returns Absolute path to `$XDG_CACHE_HOME/playback/voices`.
 */
export function voicesCacheDir(): string {
	return join(xdgCacheDir(), 'voices');
}

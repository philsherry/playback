import { describe, it, expect, vi, afterEach } from 'vitest';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { xdgCacheDir, voicesCacheDir } from './paths';

describe('xdgCacheDir', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('uses $XDG_CACHE_HOME when set', () => {
		vi.stubEnv('XDG_CACHE_HOME', '/custom/cache');
		expect(xdgCacheDir()).toBe('/custom/cache/playback');
	});

	it('falls back to ~/.cache when $XDG_CACHE_HOME is not set', () => {
		vi.stubEnv('XDG_CACHE_HOME', '');
		expect(xdgCacheDir()).toBe(join(homedir(), '.cache', 'playback'));
	});
});

describe('voicesCacheDir', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('returns the voices subdirectory of the XDG cache', () => {
		vi.stubEnv('XDG_CACHE_HOME', '/custom/cache');
		expect(voicesCacheDir()).toBe('/custom/cache/playback/voices');
	});
});

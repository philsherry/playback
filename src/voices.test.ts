import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
	existsSync: vi.fn(),
	readFileSync: vi.fn(),
}));

import { existsSync, readFileSync } from 'node:fs';
const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);

import { getVoiceSpeaker } from './voices';

describe('getVoiceSpeaker', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// No catalogue files present → loadVoiceCatalogue falls back to DEFAULT_VOICES.
		mockExistsSync.mockReturnValue(false);
		mockReadFileSync.mockImplementation(() => {
			throw new Error('ENOENT');
		});
	});

	it('returns undefined for a voice without a speaker field', () => {
		expect(getVoiceSpeaker('northern_english_male')).toBeUndefined();
	});

	it('throws for an unknown voice identifier', () => {
		expect(() => getVoiceSpeaker('does_not_exist')).toThrow(/Unknown voice/);
	});

	it('returns the speaker ID when the catalogue entry has a speaker field', async () => {
		// Reset modules so the cached catalogue is cleared, then re-import
		// with readFileSync returning YAML that includes a speaker ID.
		vi.resetModules();
		const { readFileSync: freshReadFileSync } = await import('node:fs');
		vi.mocked(freshReadFileSync).mockReturnValue(
			[
				'voices:',
				'  semaine_obaidah:',
				'    gender: male',
				'    locale: en-GB',
				'    model: en_GB-semaine-medium',
				'    quality: medium',
				'    url: en/en_GB/semaine/medium',
				'    speaker: 0',
			].join('\n') as unknown as ReturnType<typeof readFileSync>
		);
		const { getVoiceSpeaker: freshGetVoiceSpeaker } = await import('./voices');
		expect(freshGetVoiceSpeaker('semaine_obaidah')).toBe(0);
	});
});

import { describe, it, expect } from 'vitest';
import * as v from 'valibot';
import { MetaSchema, getVoiceIds } from './meta';

describe('MetaSchema', () => {
	describe('valid inputs', () => {
		it('accepts a minimal document with only title', () => {
			const result = v.safeParse(MetaSchema, { title: 'My Episode' });
			expect(result.success).toBe(true);
		});

		it('defaults voices to northern_english_male when omitted', () => {
			const result = v.safeParse(MetaSchema, { title: 'My Episode' });
			expect(result.success && result.output.voices).toEqual([
				'northern_english_male',
			]);
		});

		it('accepts all valid voices', () => {
			const result = v.safeParse(MetaSchema, {
				title: 'My Episode',
				voices: getVoiceIds(),
			});
			expect(result.success).toBe(true);
		});

		it('accepts all optional fields', () => {
			const result = v.safeParse(MetaSchema, {
				description: 'A description.',
				episode: 1,
				locale: 'en-GB',
				poster: 3,
				series: 's1-getting-started',
				tags: ['accessibility', 'components'],
				title: 'My Episode',
				version: '1.2.0',
				voices: ['northern_english_male'],
			});
			expect(result.success).toBe(true);
		});

		it('strips unrecognised fields', () => {
			const result = v.safeParse(MetaSchema, {
				title: 'My Episode',
				unknown: 'should be stripped',
			});
			expect(result.success && 'unknown' in result.output).toBe(false);
		});
	});

	describe('invalid inputs', () => {
		it('rejects a document missing title', () => {
			const result = v.safeParse(MetaSchema, { voices: ['northern_english_male'] });
			expect(result.success).toBe(false);
		});

		it('rejects an unrecognised voice name', () => {
			const result = v.safeParse(MetaSchema, {
				title: 'My Episode',
				voices: ['unknown_voice'],
			});
			expect(result.success).toBe(false);
		});

		it('rejects an empty voices array', () => {
			const result = v.safeParse(MetaSchema, {
				title: 'My Episode',
				voices: [],
			});
			expect(result.success).toBe(false);
		});

		it('rejects poster: 0', () => {
			const result = v.safeParse(MetaSchema, {
				poster: 0,
				title: 'My Episode',
			});
			expect(result.success).toBe(false);
		});

		it('rejects a non-integer poster value', () => {
			const result = v.safeParse(MetaSchema, {
				poster: 1.5,
				title: 'My Episode',
			});
			expect(result.success).toBe(false);
		});

		it('rejects episode: 0', () => {
			const result = v.safeParse(MetaSchema, {
				episode: 0,
				title: 'My Episode',
			});
			expect(result.success).toBe(false);
		});
	});

	describe('vhs overrides', () => {
		it('accepts a plain shell name', () => {
			const result = v.safeParse(MetaSchema, {
				title: 'My Episode',
				vhs: { shell: 'bash' },
			});
			expect(result.success).toBe(true);
		});

		it('accepts a shell path', () => {
			const result = v.safeParse(MetaSchema, {
				title: 'My Episode',
				vhs: { shell: '/usr/local/bin/fish' },
			});
			expect(result.success).toBe(true);
		});

		it('rejects vhs.shell containing double-quote characters', () => {
			const result = v.safeParse(MetaSchema, {
				title: 'My Episode',
				vhs: { shell: 'bash -lc "exec zsh"' },
			});
			expect(result.success).toBe(false);
		});

		it('accepts vhs.fontFamily', () => {
			const result = v.safeParse(MetaSchema, {
				title: 'My Episode',
				vhs: { fontFamily: 'ProggyClean TT NF' },
			});
			expect(result.success).toBe(true);
		});

		it('rejects vhs.fontFamily containing double-quote characters', () => {
			const result = v.safeParse(MetaSchema, {
				title: 'My Episode',
				vhs: { fontFamily: 'Font "Name"' },
			});
			expect(result.success).toBe(false);
		});

		it('accepts vhs.width, vhs.framerate', () => {
			const result = v.safeParse(MetaSchema, {
				title: 'My Episode',
				vhs: { framerate: 60, width: 720 },
			});
			expect(result.success).toBe(true);
		});

		it('accepts vhs.borderRadius, vhs.margin, vhs.marginFill, vhs.windowBar', () => {
			const result = v.safeParse(MetaSchema, {
				title: 'My Episode',
				vhs: { borderRadius: 0, margin: 0, marginFill: '#1a1b26', windowBar: 'Hidden' },
			});
			expect(result.success).toBe(true);
		});

		it('rejects vhs.marginFill containing double-quote characters', () => {
			const result = v.safeParse(MetaSchema, {
				title: 'My Episode',
				vhs: { marginFill: '#abc"def' },
			});
			expect(result.success).toBe(false);
		});

		it('rejects vhs.borderRadius below 0', () => {
			const result = v.safeParse(MetaSchema, {
				title: 'My Episode',
				vhs: { borderRadius: -1 },
			});
			expect(result.success).toBe(false);
		});

		it('rejects vhs.framerate below 1', () => {
			const result = v.safeParse(MetaSchema, {
				title: 'My Episode',
				vhs: { framerate: 0 },
			});
			expect(result.success).toBe(false);
		});
	});
});

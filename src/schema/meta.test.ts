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
				title: 'My Episode',
				description: 'A description.',
				locale: 'en-GB',
				poster: 3,
				episode: 1,
				series: 's1-getting-started',
				tags: ['accessibility', 'components'],
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
				title: 'My Episode',
				poster: 0,
			});
			expect(result.success).toBe(false);
		});

		it('rejects a non-integer poster value', () => {
			const result = v.safeParse(MetaSchema, {
				title: 'My Episode',
				poster: 1.5,
			});
			expect(result.success).toBe(false);
		});

		it('rejects episode: 0', () => {
			const result = v.safeParse(MetaSchema, {
				title: 'My Episode',
				episode: 0,
			});
			expect(result.success).toBe(false);
		});
	});
});

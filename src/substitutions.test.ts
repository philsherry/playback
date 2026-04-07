import { describe, it, expect } from 'vitest';
import { applySubstitutions } from './substitutions';

describe('applySubstitutions', () => {
	it('replaces GOV.UK with phonetic spelling', () => {
		expect(applySubstitutions('Visit GOV.UK for guidance.')).toBe(
			'Visit guv yew-kay for guidance.'
		);
	});

	it('replaces govuk with phonetic spelling', () => {
		expect(applySubstitutions('Install govuk-frontend.')).toBe(
			'Install guv yew-kay-frontend.'
		);
	});

	it('is case-insensitive', () => {
		expect(applySubstitutions('gov.uk')).toBe('guv yew-kay');
		expect(applySubstitutions('Gov.Uk')).toBe('guv yew-kay');
	});

	it('replaces all occurrences in a string', () => {
		expect(applySubstitutions('GOV.UK and govuk')).toBe(
			'guv yew-kay and guv yew-kay'
		);
	});

	it('returns unchanged text when no substitution matches', () => {
		expect(applySubstitutions('Hello, world!')).toBe('Hello, world!');
	});

	it('handles empty string', () => {
		expect(applySubstitutions('')).toBe('');
	});
});

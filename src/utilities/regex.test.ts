import { describe, it, expect } from 'vitest';
import { WHITESPACE_SPLIT, TAPE_YAML_SUFFIX } from './regex';

describe('WHITESPACE_SPLIT', () => {
	it('splits on single spaces', () => {
		expect('one two three'.split(WHITESPACE_SPLIT)).toEqual([
			'one',
			'two',
			'three',
		]);
	});

	it('splits on tabs', () => {
		expect('one\ttwo'.split(WHITESPACE_SPLIT)).toEqual(['one', 'two']);
	});

	it('treats multiple consecutive spaces as one boundary', () => {
		expect('one  two'.split(WHITESPACE_SPLIT)).toEqual(['one', 'two']);
	});

	it('splits on newlines', () => {
		expect('one\ntwo'.split(WHITESPACE_SPLIT)).toEqual(['one', 'two']);
	});
});

describe('TAPE_YAML_SUFFIX', () => {
	it('matches a /tape.yaml suffix', () => {
		expect(TAPE_YAML_SUFFIX.test('/tapes/s1/01-episode/tape.yaml')).toBe(true);
	});

	it('matches a /tape.yml suffix', () => {
		expect(TAPE_YAML_SUFFIX.test('/tapes/s1/01-episode/tape.yml')).toBe(true);
	});

	it('does not match other yaml files', () => {
		expect(TAPE_YAML_SUFFIX.test('/tapes/s1/01-episode/meta.yaml')).toBe(
			false
		);
	});

	it('does not match tape.yaml in the middle of a path', () => {
		expect(TAPE_YAML_SUFFIX.test('/tapes/tape.yaml/other')).toBe(false);
	});

	it('strips the suffix when used with .replace()', () => {
		const path = '/tapes/s1/01-episode/tape.yaml';
		expect(path.replace(TAPE_YAML_SUFFIX, '')).toBe('/tapes/s1/01-episode');
	});

	it('strips the .yml variant too', () => {
		const path = '/tapes/s1/01-episode/tape.yml';
		expect(path.replace(TAPE_YAML_SUFFIX, '')).toBe('/tapes/s1/01-episode');
	});
});

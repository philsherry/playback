import { describe, it, expect } from 'vitest';
import { escapeVhs, escapeAssPath } from './escape';

describe('escapeVhs', () => {
	it('passes through a plain command unchanged', () => {
		expect(escapeVhs('ls -la')).toBe('ls -la');
		expect(escapeVhs('npm install')).toBe('npm install');
	});

	it('escapes backticks', () => {
		expect(escapeVhs('echo `date`')).toBe('echo \\`date\\`');
	});

	it('passes backslashes through unchanged', () => {
		// VHS types characters verbatim — \n stays \n, which printf interprets correctly.
		expect(escapeVhs('printf \'hello\\nworld\\n\'')).toBe('printf \'hello\\nworld\\n\'');
	});

	it('escapes backtick when preceded by a backslash', () => {
		// The backslash is left alone; only the backtick gets the \` treatment.
		expect(escapeVhs('echo \\`date\\`')).toBe('echo \\\\`date\\\\`');
	});
});

describe('escapeAssPath', () => {
	it('passes through a plain Unix path unchanged', () => {
		expect(escapeAssPath('/output/my-episode.ass')).toBe(
			'/output/my-episode.ass'
		);
	});

	it('escapes backslashes', () => {
		// Both the backslashes and the drive-letter colon are escaped
		expect(escapeAssPath('C:\\Users\\file.ass')).toBe(
			'C\\:\\\\Users\\\\file.ass'
		);
	});

	it('escapes colons', () => {
		expect(escapeAssPath('/output/dir:name.ass')).toBe(
			'/output/dir\\:name.ass'
		);
	});

	it('escapes Windows drive letters', () => {
		expect(escapeAssPath('C:/output/file.ass')).toBe('C\\:/output/file.ass');
	});

	it('escapes backslashes before colons to avoid double-escaping', () => {
		// Input: \: (backslash then colon)
		// After backslash pass: \\: (two backslashes + colon)
		// After colon pass: \\\\: is wrong — colon is escaped to \: → \\\\:
		// Actually: \\ (escaped backslash) then \: (escaped colon)
		expect(escapeAssPath('\\:')).toBe('\\\\\\:');
	});
});

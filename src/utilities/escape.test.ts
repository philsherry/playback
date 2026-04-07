import { describe, it, expect } from 'vitest';
import { escapeVhs, escapeAssPath } from './escape';

describe('escapeVhs', () => {
	it('passes through a plain command unchanged', () => {
		expect(escapeVhs('ls -la')).toBe('ls -la');
		expect(escapeVhs('npm install')).toBe('npm install');
	});

	it('escapes backslashes', () => {
		expect(escapeVhs('echo C:\\Windows')).toBe('echo C:\\\\Windows');
	});

	it('escapes double quotes', () => {
		expect(escapeVhs('echo "hello"')).toBe('echo \\"hello\\"');
	});

	it('escapes backticks', () => {
		expect(escapeVhs('echo `date`')).toBe('echo \\`date\\`');
	});

	it('escapes backslashes before double quotes to avoid double-escaping', () => {
		// Input: \" (backslash then double-quote)
		// After backslash pass:  \\\"  (two backslashes + double-quote)
		// After double-quote pass: \\\\"  (two backslashes + escaped double-quote)
		expect(escapeVhs('\\"')).toBe('\\\\\\"');
	});

	it('handles all three special characters in one command', () => {
		expect(escapeVhs('echo `\\"hi\\"`')).toBe('echo \\`\\\\\\"hi\\\\\\"\\`');
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

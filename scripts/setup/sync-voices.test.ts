import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';

const scriptPath = new URL('sync-voices.cjs', import.meta.url).pathname;
const examplePath = new URL('../../voices.example.yaml', import.meta.url).pathname;

function run(catalogueContent: string): { stdout: string; catalogue: string } {
	const dir = mkdtempSync(join(tmpdir(), 'playback-sync-test-'));
	const cataloguePath = join(dir, 'voices.yaml');
	writeFileSync(cataloguePath, catalogueContent, 'utf8');
	try {
		const stdout = execFileSync('node', [scriptPath, cataloguePath], {
			encoding: 'utf8',
		});
		const catalogue = readFileSync(cataloguePath, 'utf8');
		return { stdout, catalogue };
	} finally {
		rmSync(dir, { recursive: true });
	}
}

let allKeysPresent: string;
let withoutAru: string;

beforeAll(() => {
	const example = readFileSync(examplePath, 'utf8');
	allKeysPresent = example;

	// Strip the aru_09 block (including its preceding ## comment lines) to
	// produce a catalogue that has only the four original voices.
	const markerIndex = example.indexOf('\n  ## Multi-speaker example');
	withoutAru =
		markerIndex !== -1 ? example.slice(0, markerIndex + 1) : example;
});

describe('sync-voices.cjs', () => {
	it('prints nothing and leaves the file unchanged when all example keys are present', () => {
		const { stdout, catalogue } = run(allKeysPresent);
		expect(stdout).toBe('');
		expect(catalogue).toBe(allKeysPresent);
	});

	it('appends a missing voice entry and prints its key to stdout', () => {
		const { stdout, catalogue } = run(withoutAru);
		expect(stdout.trim()).toBe('aru_09');
		expect(catalogue).toContain('aru_09:');
		expect(catalogue).toContain('speaker: 4');
	});

	it('includes preceding ## comment lines when appending an entry', () => {
		const { catalogue } = run(withoutAru);
		expect(catalogue).toContain('## Multi-speaker example');
	});

	it('does not modify existing entries', () => {
		const original = withoutAru;
		const { catalogue } = run(original);
		expect(catalogue.startsWith(original.trimEnd())).toBe(true);
	});

	it('adds a newline before appending when the file has no trailing newline', () => {
		const noTrailingNewline = withoutAru.trimEnd();
		const { catalogue } = run(noTrailingNewline);
		expect(catalogue).toContain('\n  aru_09:');
	});

	it('exits 0 when called with no catalogue path argument', () => {
		expect(() =>
			execFileSync('node', [scriptPath], { encoding: 'utf8' }),
		).not.toThrow();
	});

	it('exits 0 when the catalogue path does not exist', () => {
		expect(() =>
			execFileSync('node', [scriptPath, '/tmp/does-not-exist-voices.yaml'], {
				encoding: 'utf8',
			}),
		).not.toThrow();
	});
});

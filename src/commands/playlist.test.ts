import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { findTapeDirs } from './playlist';

describe('findTapeDirs', () => {
	let tmp: string;

	beforeEach(() => {
		tmp = join(import.meta.dirname, `__tmp_${Date.now()}`);
		mkdirSync(tmp, { recursive: true });
	});

	afterEach(() => {
		rmSync(tmp, { force: true, recursive: true });
	});

	it('returns [] for an empty directory', () => {
		expect(findTapeDirs(tmp)).toEqual([]);
	});

	it('returns a directory that contains tape.yaml', () => {
		const ep = join(tmp, 's1-intro', '01-start');
		mkdirSync(ep, { recursive: true });
		writeFileSync(join(ep, 'tape.yaml'), '');
		expect(findTapeDirs(tmp)).toEqual([ep]);
	});

	it('sorts results lexicographically across series and episodes', () => {
		for (const path of ['s2-advanced/01-start', 's1-intro/02-second', 's1-intro/01-first']) {
			const full = join(tmp, path);
			mkdirSync(full, { recursive: true });
			writeFileSync(join(full, 'tape.yaml'), '');
		}
		expect(findTapeDirs(tmp)).toEqual([
			join(tmp, 's1-intro', '01-first'),
			join(tmp, 's1-intro', '02-second'),
			join(tmp, 's2-advanced', '01-start'),
		]);
	});

	it('ignores directories that do not contain tape.yaml', () => {
		mkdirSync(join(tmp, 's1-intro', '01-no-tape'), { recursive: true });
		expect(findTapeDirs(tmp)).toEqual([]);
	});

	it('ignores files at any level', () => {
		writeFileSync(join(tmp, 'tape.yaml'), '');
		expect(findTapeDirs(tmp)).toEqual([]);
	});
});

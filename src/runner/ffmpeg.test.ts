import { describe, it, expect } from 'vitest';
import { buildMetadataFlags } from './ffmpeg';
import type { VideoMetadata } from '../types';

describe('buildMetadataFlags', () => {
	it('includes all populated fields', () => {
		const meta: VideoMetadata = {
			album: 's1-getting-started',
			artist: 'Created by Playback',
			comment: 'Clone the repo and look around',
			language: 'en-GB',
			title: 'Install and explore',
			track: 1,
		};

		const flags = buildMetadataFlags(meta);

		expect(flags).toContain('title=Install and explore');
		expect(flags).toContain('comment=Clone the repo and look around');
		expect(flags).toContain('artist=Created by Playback');
		expect(flags).toContain('album=s1-getting-started');
		expect(flags).toContain('track=1');
		expect(flags).toContain('language=en-GB');
	});

	it('omits undefined fields', () => {
		const meta: VideoMetadata = {
			artist: 'Created by Playback',
			title: 'Minimal tape',
		};

		const flags = buildMetadataFlags(meta);

		expect(flags).toContain('title=Minimal tape');
		expect(flags).toContain('artist=Created by Playback');
		expect(flags.join(' ')).not.toContain('comment=');
		expect(flags.join(' ')).not.toContain('album=');
		expect(flags.join(' ')).not.toContain('track=');
		expect(flags.join(' ')).not.toContain('language=');
	});

	it('omits empty string fields', () => {
		const meta: VideoMetadata = {
			artist: 'Created by Playback',
			comment: '',
			title: 'Test',
		};

		const flags = buildMetadataFlags(meta);

		expect(flags.join(' ')).not.toContain('comment=');
	});

	it('uses a custom artist when provided', () => {
		const meta: VideoMetadata = {
			artist: 'Phil Sherry',
			title: 'Custom credit',
		};

		const flags = buildMetadataFlags(meta);

		expect(flags).toContain('artist=Phil Sherry');
		expect(flags).not.toContain('artist=Created by Playback');
	});

	it('sets stream-level audio language from BCP-47 locale', () => {
		const meta: VideoMetadata = {
			artist: 'Test',
			language: 'en-GB',
			title: 'Language test',
		};

		const flags = buildMetadataFlags(meta);

		expect(flags).toContain('-metadata:s:a:0');
		expect(flags).toContain('language=eng');
	});

	it('omits stream-level language when locale is absent', () => {
		const meta: VideoMetadata = {
			artist: 'Test',
			title: 'No locale',
		};

		const flags = buildMetadataFlags(meta);

		expect(flags).not.toContain('-metadata:s:a:0');
	});

	it('handles Welsh locale', () => {
		const meta: VideoMetadata = {
			artist: 'Test',
			language: 'cy',
			title: 'Welsh test',
		};

		const flags = buildMetadataFlags(meta);

		expect(flags).toContain('language=cym');
	});
});

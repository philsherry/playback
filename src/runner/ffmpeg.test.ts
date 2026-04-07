import { describe, it, expect } from 'vitest';
import { buildMetadataFlags } from './ffmpeg';
import type { VideoMetadata } from '../types';

describe('buildMetadataFlags', () => {
	it('includes all populated fields', () => {
		const meta: VideoMetadata = {
			title: 'Install and explore',
			comment: 'Clone the repo and look around',
			artist: 'Created by Playback',
			album: 's1-getting-started',
			track: 1,
			language: 'en-GB',
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
			title: 'Minimal tape',
			artist: 'Created by Playback',
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
			title: 'Test',
			comment: '',
			artist: 'Created by Playback',
		};

		const flags = buildMetadataFlags(meta);

		expect(flags.join(' ')).not.toContain('comment=');
	});

	it('uses a custom artist when provided', () => {
		const meta: VideoMetadata = {
			title: 'Custom credit',
			artist: 'Phil Sherry',
		};

		const flags = buildMetadataFlags(meta);

		expect(flags).toContain('artist=Phil Sherry');
		expect(flags).not.toContain('artist=Created by Playback');
	});

	it('sets stream-level audio language from BCP-47 locale', () => {
		const meta: VideoMetadata = {
			title: 'Language test',
			artist: 'Test',
			language: 'en-GB',
		};

		const flags = buildMetadataFlags(meta);

		expect(flags).toContain('-metadata:s:a:0');
		expect(flags).toContain('language=eng');
	});

	it('omits stream-level language when locale is absent', () => {
		const meta: VideoMetadata = {
			title: 'No locale',
			artist: 'Test',
		};

		const flags = buildMetadataFlags(meta);

		expect(flags).not.toContain('-metadata:s:a:0');
	});

	it('handles Welsh locale', () => {
		const meta: VideoMetadata = {
			title: 'Welsh test',
			artist: 'Test',
			language: 'cy',
		};

		const flags = buildMetadataFlags(meta);

		expect(flags).toContain('language=cym');
	});
});

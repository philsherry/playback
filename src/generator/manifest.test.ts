import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
    writeFileSync: vi.fn(),
}));

import { writeFileSync } from 'node:fs';
import { generateManifest } from './manifest';
import type { ParsedTape } from '../types';

const mockWriteFileSync = vi.mocked(writeFileSync);

/**
 * Returns the parsed manifest object written by the most recent `generateManifest` call.
 * @returns The manifest as a plain object.
 */
function capturedManifest(): Record<string, unknown> {
    const call = mockWriteFileSync.mock.calls.find(([path]) =>
        String(path).endsWith('.manifest.json')
    );
    expect(call, 'no manifest write call found').toBeDefined();
    return JSON.parse(String(call![1])) as Record<string, unknown>;
}

const parsed: ParsedTape = {
    dir: '/tapes/s1/01-example',
    meta: {
        artist: 'Test',
        description: 'Test tape',
        episode: 1,
        locale: 'en-GB',
        series: 's1',
        title: 'Test Episode',
        version: '1.0.0',
        voices: ['alan', 'alba'],
    } as ParsedTape['meta'],
    posterFile: null,
    tape: { output: 's1/01-example', steps: [], title: 'Test Episode' } as ParsedTape['tape'],
};

const voiceOutputs = [
    {
        audioFile: '/out/s1/01-example/01-example.alan.m4a',
        srtFile: '/out/s1/01-example/01-example.alan.srt',
        voice: 'alan',
        vttFile: '/out/s1/01-example/01-example.alan.vtt',
    },
    {
        audioFile: '/out/s1/01-example/01-example.alba.m4a',
        srtFile: '/out/s1/01-example/01-example.alba.srt',
        voice: 'alba',
        vttFile: '/out/s1/01-example/01-example.alba.vtt',
    },
];

describe('generateManifest', () => {
    beforeEach(() => mockWriteFileSync.mockClear());

    it('places video at the top level', () => {
        generateManifest(
            parsed,
            '/out/s1/01-example',
            '/out/s1/01-example/01-example.silent.mp4',
            '/out/s1/01-example/01-example.gif',
            null, null, null,
            voiceOutputs
        );
        const manifest = capturedManifest();
        expect(manifest.video).toBe('01-example.silent.mp4');
    });

    it('places gif at the top level', () => {
        generateManifest(
            parsed,
            '/out/s1/01-example',
            '/out/s1/01-example/01-example.silent.mp4',
            '/out/s1/01-example/01-example.gif',
            null, null, null,
            voiceOutputs
        );
        const manifest = capturedManifest();
        expect(manifest.gif).toBe('01-example.gif');
    });

    it('each voice entry has an audio field (not video)', () => {
        generateManifest(
            parsed,
            '/out/s1/01-example',
            '/out/s1/01-example/01-example.silent.mp4',
            null,
            null, null, null,
            voiceOutputs
        );
        const manifest = capturedManifest();
        const voices = manifest.voices as Array<Record<string, unknown>>;
        expect(voices[0].audio).toBe('01-example.alan.m4a');
        expect(voices[0]).not.toHaveProperty('video');
    });

    it('manifest keys are alphabetised at the top level', () => {
        generateManifest(
            parsed,
            '/out/s1/01-example',
            '/out/s1/01-example/01-example.silent.mp4',
            null,
            null, null, null,
            voiceOutputs
        );
        const manifest = capturedManifest();
        const keys = Object.keys(manifest);
        expect(keys).toEqual([...keys].sort());
    });

    it('gif is null when not provided', () => {
        generateManifest(
            parsed,
            '/out/s1/01-example',
            '/out/s1/01-example/01-example.silent.mp4',
            null,
            null, null, null,
            voiceOutputs
        );
        const manifest = capturedManifest();
        expect(manifest.gif).toBeNull();
    });

    it('download points to the voiced MP4', () => {
        generateManifest(
            parsed,
            '/out/s1/01-example',
            '/out/s1/01-example/01-example.silent.mp4',
            null,
            null, null, null,
            voiceOutputs,
            '/out/s1/01-example/01-example.alan.mp4'
        );
        const manifest = capturedManifest();
        expect(manifest.download).toBe('01-example.alan.mp4');
    });

    it('download is null when not provided', () => {
        generateManifest(
            parsed,
            '/out/s1/01-example',
            '/out/s1/01-example/01-example.silent.mp4',
            null,
            null, null, null,
            voiceOutputs
        );
        const manifest = capturedManifest();
        expect(manifest.download).toBeNull();
    });
});

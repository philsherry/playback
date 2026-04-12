import { existsSync, mkdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { parseTape } from '../parser/index';
import {
	buildTimeline,
	applyAudioDurations,
	extractSegments,
	syncSegmentsToTimeline,
} from '../timeline';
import { auditTimings } from '../audit/timings';
import { buildOverlayFilter } from '../audit/overlay';
import { runVhs } from '../runner/vhs';
import { runPiper } from '../runner/piper';
import { generateCaptions } from '../generator/captions';
import { generateChapters } from '../generator/chapters';
import { runFfmpeg } from '../runner/ffmpeg';
import { generateManifest } from '../generator/manifest';
import type { VoiceOutput } from '../generator/manifest';
import { stepToTime, VIDEO_HEIGHT } from '../constants';
import { loadConfig, loadRawProjectConfig, CONFIG_DEFAULTS } from '../config';
import { loadXdgConfig, xdgThemeOverridePath } from '../config/xdg';
import { loadTheme } from '../theme';
import type { SynthesisedSegment, VideoMetadata } from '../types';
import type { Voice } from '../schema/meta';
import {
	loadWorkspace,
	resolveWorkspaceSources,
	getWorkspaceConstants,
	getRequiredSourceNames,
	validateWorkspaceReferences,
} from '../workspace';
import { configureLogger, logInfo, logSuccess, logVerbose, logWarn } from '../logger';

export interface TapeCommandOptions {
	auditFixFlag: boolean;
	auditFlag: boolean;
	captionsOnly: boolean;
	debugOverlayFlag: boolean;
	manifestOnly: boolean;
	mkvFlag: boolean;
	tapePath: string;
	vhsOnly: boolean;
	webFlag: boolean;
}

const AUDIO_BUFFER = 0.5;

/**
 * Runs the full playback pipeline for a single tape directory.
 * @param options - Resolved tape options including path, flags, and feature toggles.
 */
export async function runTape(options: TapeCommandOptions): Promise<void> {
	const {
		auditFixFlag,
		auditFlag,
		captionsOnly,
		debugOverlayFlag,
		manifestOnly,
		mkvFlag,
		tapePath,
		vhsOnly,
		webFlag,
	} = options;

	const xdgConfig = loadXdgConfig();
	const [config, rawProjectConfig] = await Promise.all([
		loadConfig(),
		loadRawProjectConfig(),
	]);

	const themeName = xdgConfig?.theme ?? 'default';
	const theme = loadTheme(themeName, xdgThemeOverridePath());
	configureLogger({ theme });

	const DIST_DIR = resolve(process.cwd(), config.outputDir);
	const projectRoot = process.cwd();
	const workspaceConfig = loadWorkspace(projectRoot);

	const parsed = parseTape(tapePath, getWorkspaceConstants(workspaceConfig));
	const requiredSources = getRequiredSourceNames(parsed, workspaceConfig);
	const workspace = resolveWorkspaceSources(workspaceConfig, projectRoot, requiredSources);
	const { meta, tape } = parsed;
	const outputDir = join(DIST_DIR, tape.output);
	const outputSlug = basename(tape.output);

	logInfo(`▶ ${meta.title}`);
	logInfo('  Validating workspace paths…');
	validateWorkspaceReferences(parsed, workspace);

	const posterTime = meta.poster != null
		? stepToTime(tape.steps, meta.poster)
		: null;

	const vhsHeight = meta.vhs?.height;
	const captionMarginV = (vhsHeight != null && vhsHeight >= VIDEO_HEIGHT) ? 40 : undefined;

	const videoMetadata: VideoMetadata = {
		album: meta.series,
		artist: meta.artist ?? 'Created by Playback',
		comment: meta.description,
		language: meta.locale,
		title: meta.title,
		track: meta.episode,
	};

	const voices = (
		meta.voices ??
		rawProjectConfig?.defaultVoices ??
		xdgConfig?.voices ??
		CONFIG_DEFAULTS.defaultVoices
	) as Voice[];
	const webEnabled = webFlag || config.webOutput;

	if (vhsOnly) {
		logInfo('  Recording terminal…');
		const { rawMp4 } = await runVhs(parsed, DIST_DIR, workspace);
		logSuccess(`\n✓ Done. Raw recording: ${rawMp4}`);
		return;
	}

	if (manifestOnly) {
		const posterFile = join(outputDir, `${outputSlug}.poster.png`);
		const cardFile = join(outputDir, `${outputSlug}.card.png`);
		const voiceOutputs: VoiceOutput[] = voices.map((voice) => ({
			mp4File: join(outputDir, `${outputSlug}.mp4`),
			srtFile: join(outputDir, `${outputSlug}.srt`),
			voice,
			vttFile: join(outputDir, `${outputSlug}.vtt`),
		}));
		const manifestFile = generateManifest(
			parsed,
			outputDir,
			existsSync(posterFile) ? posterFile : null,
			existsSync(cardFile) ? cardFile : null,
			null,
			voiceOutputs
		);
		logSuccess(`✓ ${manifestFile}`);
		return;
	}

	mkdirSync(outputDir, { recursive: true });

	const narrationByStep = new Map<number, string>();
	if (meta.fixedTiming) {
		for (let i = 0; i < parsed.tape.steps.length; i++) {
			const step = parsed.tape.steps[i];
			if (step.action === 'narrate' || step.action === 'chapter') continue;
			if (step.narration) {
				narrationByStep.set(i, step.narration);
				step.narration = undefined;
			}
		}
	}

	logInfo('  Building timeline…');
	const timeline = buildTimeline(parsed);

	if (meta.fixedTiming) {
		for (const event of timeline.events) {
			const text = narrationByStep.get(event.stepIndex);
			if (text) {
				event.narration = {
					audioDuration: null,
					audioStartTime: event.startTime,
					offset: 0,
					text,
				};
			}
		}
	}

	const script = extractSegments(timeline, outputDir);

	if (script.segments.length === 0) {
		logInfo('  Generating chapters…');
		const chaptersNoNarr = generateChapters(timeline, parsed.tape.steps, outputDir);
		logInfo('  Recording terminal…');
		const { rawMp4 } = await runVhs(parsed, DIST_DIR, workspace);
		logWarn('  No narration found — skipping audio and captions.');
		await runFfmpeg(rawMp4, [], { assFile: '', srtFile: '', vttFile: '' }, outputDir, outputSlug, posterTime, parsed.posterFile, videoMetadata, undefined, chaptersNoNarr.hasExplicit ? chaptersNoNarr.path : undefined);
		logSuccess(`\n✓ Done. Output: ${outputDir}`);
		return;
	}

	const primaryVoice = voices[0];
	let primarySynthesised: SynthesisedSegment[] | null = null;

	if (!captionsOnly) {
		logInfo(`  Synthesising audio (${voices.join(', ')})…`);
		logVerbose(`  Voice: ${primaryVoice}`);
		primarySynthesised = await runPiper(script.segments, outputDir, primaryVoice, config.voicesDir);

		if (meta.fixedTiming) {
			logWarn('  Fixed timing — skipping back-fill.');
			const segByStep = new Map(primarySynthesised.map((s) => [s.stepIndex, s]));
			for (const event of timeline.events) {
				const seg = segByStep.get(event.stepIndex);
				if (seg && event.narration) {
					event.narration.audioDuration = seg.audioDuration;
				}
			}
		} else {
			applyAudioDurations(timeline, primarySynthesised, AUDIO_BUFFER);

			for (const event of timeline.events) {
				if (event.narration?.audioDuration != null) {
					const step = parsed.tape.steps[event.stepIndex];
					if (step.action === 'chapter') continue;
					step.pause = Math.max(step.pause ?? 0.5, event.narration.audioDuration + AUDIO_BUFFER);
					step.narration = undefined;
				}
			}
		}

		extractSegments(timeline, outputDir);
		primarySynthesised = syncSegmentsToTimeline(timeline, primarySynthesised);

		if (auditFlag || auditFixFlag) {
			auditTimings(
				timeline,
				primarySynthesised,
				join(parsed.dir, 'tape.yaml'),
				AUDIO_BUFFER,
				auditFixFlag
			);
		}
	}

	logInfo('  Generating chapters…');
	const chaptersResult = generateChapters(timeline, parsed.tape.steps, outputDir);

	const overlayFilter = debugOverlayFlag ? buildOverlayFilter(timeline) : undefined;

	logInfo('  Recording terminal…');
	const { rawMp4 } = await runVhs(parsed, DIST_DIR, workspace);

	const voiceOutputs: VoiceOutput[] = [];
	let lastPosterFile: string | null = null;
	let lastCardFile: string | null = null;
	let lastOgFile: string | null = null;

	const activeScript = extractSegments(timeline, outputDir);

	for (const voice of voices) {
		if (voice !== primaryVoice) {
			logVerbose(`  Voice: ${voice}`);
		}

		const synthesised = resolveStartTimes(
			primarySynthesised !== null && voice === primaryVoice
				? primarySynthesised
				: await runPiper(activeScript.segments, outputDir, voice, config.voicesDir)
		);

		if (!captionsOnly) {
			logInfo('  Generating captions…');
		}
		const captions = generateCaptions(synthesised, outputDir, outputSlug, captionMarginV);

		if (captionsOnly) {
			logSuccess(`  ✓ Captions: ${captions.vttFile}`);
			continue;
		}

		logInfo('  Stitching video…');
		const result = await runFfmpeg(
			rawMp4,
			synthesised,
			captions,
			outputDir,
			outputSlug,
			posterTime,
			parsed.posterFile,
			videoMetadata,
			overlayFilter || undefined,
			chaptersResult.hasExplicit ? chaptersResult.path : undefined,
			mkvFlag
		);

		logSuccess(`  ✓ ${result.mp4File}`);
		logSuccess(`  ✓ ${result.gifFile}`);
		if (result.mkvFile) logSuccess(`  ✓ ${result.mkvFile}`);
		if (result.posterFile) logSuccess(`  ✓ ${result.posterFile}`);
		if (result.cardFile) logSuccess(`  ✓ ${result.cardFile}`);
		if (result.ogFile) logSuccess(`  ✓ ${result.ogFile}`);
		lastPosterFile = result.posterFile;
		lastCardFile = result.cardFile;
		lastOgFile = result.ogFile;

		if (webEnabled) {
			voiceOutputs.push({
				mp4File: result.mp4File,
				srtFile: captions.srtFile,
				voice,
				vttFile: captions.vttFile,
			});
		}
	}

	if (webEnabled && voiceOutputs.length > 0) {
		logInfo('  Generating manifest…');
		const manifestFile = generateManifest(parsed, outputDir, lastPosterFile, lastCardFile, lastOgFile, voiceOutputs);
		logSuccess(`  ✓ ${manifestFile}`);
	}

	logSuccess(`\n✓ Done. Output: ${outputDir}`);
}

/**
 * Enforces a minimum 0.25s gap between consecutive synthesised segments by advancing start times forward.
 * @param segments - Synthesised segments to deconflict.
 * @returns New array of segments with adjusted start times.
 */
function resolveStartTimes(
	segments: import('../types').SynthesisedSegment[]
): import('../types').SynthesisedSegment[] {
	const GAP = 0.25;
	const result = segments.map((s) => ({ ...s }));
	for (let i = 1; i < result.length; i++) {
		const prev = result[i - 1];
		const minStart = prev.startTime + prev.audioDuration + GAP;
		if (result[i].startTime < minStart) {
			result[i].startTime = minStart;
		}
	}
	return result;
}

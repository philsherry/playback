import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
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
import {
	extractPosterFromMp4,
	generateCardFromPoster,
	generateGif,
	mixAudioToM4a,
	padVideoOnly,
	runFfmpeg,
	stitchMkvMultiVoice,
} from '../runner/ffmpeg';
import { generateManifest } from '../generator/manifest';
import type { VoiceOutput } from '../generator/manifest';
import { stepToTime, VIDEO_HEIGHT, countWords, CAPTION_WARN_WORDS } from '../constants';
import { loadConfig, loadRawProjectConfig, CONFIG_DEFAULTS } from '../config';
import { loadXdgConfig, xdgThemeOverridePath } from '../config/xdg';
import { loadTheme } from '../theme';
import type { MultiVoiceTrack, SynthesisedSegment, VideoMetadata } from '../types';
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
	const webOutputDir = join(outputDir, 'web');

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
		const posterFile = join(webOutputDir, `${outputSlug}.poster.png`);
		const cardFile = join(webOutputDir, `${outputSlug}.card.png`);
		const multiVoice = voices.length > 1;
		const silentMp4 = join(webOutputDir, `${outputSlug}.silent.mp4`);
		const gifFile = join(webOutputDir, `${outputSlug}.gif`);
		const primaryVoiceName = multiVoice ? `${outputSlug}.${voices[0]}` : outputSlug;
		const dlMp4 = join(webOutputDir, `${primaryVoiceName}.mp4`);
		const voiceOutputs: VoiceOutput[] = voices.map((voice) => {
			const name = multiVoice ? `${outputSlug}.${voice}` : outputSlug;
			return {
				audioFile: join(webOutputDir, `${name}.m4a`),
				srtFile: join(webOutputDir, `${name}.srt`),
				voice,
				vttFile: join(webOutputDir, `${name}.vtt`),
			};
		});
		const manifestFile = generateManifest(
			parsed,
			webOutputDir,
			silentMp4,
			existsSync(gifFile) ? gifFile : null,
			existsSync(posterFile) ? posterFile : null,
			existsSync(cardFile) ? cardFile : null,
			null,
			voiceOutputs,
			existsSync(dlMp4) ? dlMp4 : null
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

		// Warn about overly long narration segments.
		for (const seg of primarySynthesised) {
			const words = countWords(seg.text);
			if (words > CAPTION_WARN_WORDS) {
				logWarn(`  ⚠ Step ${seg.stepIndex + 1}: narration is ${words} words (limit: ${CAPTION_WARN_WORDS})`);
			}
		}

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

	let rawMp4 = '';
	if (!captionsOnly) {
		logInfo('  Recording terminal…');
		({ rawMp4 } = await runVhs(parsed, DIST_DIR, workspace));
	}

	const voiceOutputs: VoiceOutput[] = [];
	const mkvTracks: MultiVoiceTrack[] = [];
	let lastPosterFile: string | null = null;
	let lastCardFile: string | null = null;
	let lastOgFile: string | null = null;
	let sharedGifFile: string | null = null;
	let downloadMp4: string | null = null;

	const activeScript = extractSegments(timeline, outputDir);
	const multiVoice = voices.length > 1;

	if (webEnabled) {
		// ── Web path: shared padded video + per-voice M4A ──────────────────────
		mkdirSync(webOutputDir, { recursive: true });

		if (!captionsOnly) {
			const silentMp4 = join(webOutputDir, `${outputSlug}.silent.mp4`);
			const sharedGif = join(webOutputDir, `${outputSlug}.gif`);

			logInfo('  Encoding shared video…');
			await padVideoOnly(rawMp4, silentMp4);
			logSuccess(`  ✓ ${silentMp4}`);

			logInfo('  Generating GIF…');
			await generateGif(silentMp4, sharedGif);
			logSuccess(`  ✓ ${sharedGif}`);
			sharedGifFile = sharedGif;

			// Poster and card: copy source poster into webOutputDir so the manifest
			// stays self-contained. If no source poster, extract from the silent video.
			if (parsed.posterFile) {
				const posterFile = join(webOutputDir, `${outputSlug}.poster.png`);
				const cardFile = join(webOutputDir, `${outputSlug}.card.png`);
				copyFileSync(parsed.posterFile, posterFile);
				await generateCardFromPoster(posterFile, cardFile);
				lastPosterFile = posterFile;
				lastCardFile = cardFile;
			} else if (posterTime !== null) {
				const posterFile = join(webOutputDir, `${outputSlug}.poster.png`);
				const cardFile = join(webOutputDir, `${outputSlug}.card.png`);
				await extractPosterFromMp4(silentMp4, posterFile, posterTime);
				await generateCardFromPoster(posterFile, cardFile);
				lastPosterFile = posterFile;
				lastCardFile = cardFile;
			}
		}

		for (const voice of voices) {
			logVerbose(`  Voice: ${voice}`);
			const voiceOutputName = multiVoice ? `${outputSlug}.${voice}` : outputSlug;

			const synthesised = resolveStartTimes(
				primarySynthesised !== null && voice === primaryVoice
					? primarySynthesised
					: await runPiper(activeScript.segments, outputDir, voice, config.voicesDir)
			);

			if (!captionsOnly) logInfo('  Generating captions…');
			const captions = generateCaptions(synthesised, webOutputDir, voiceOutputName, captionMarginV);

			if (captionsOnly) {
				logSuccess(`  ✓ Captions: ${captions.vttFile}`);
				continue;
			}

			const m4aFile = join(webOutputDir, `${voiceOutputName}.m4a`);
			logInfo('  Mixing audio…');
			await mixAudioToM4a(synthesised, m4aFile);
			logSuccess(`  ✓ ${m4aFile}`);

			// Primary voice also gets a full MP4 (audio + burned captions) for download.
			if (voice === primaryVoice) {
				logInfo('  Stitching download MP4…');
				const dlResult = await runFfmpeg(
					rawMp4,
					synthesised,
					captions,
					webOutputDir,
					voiceOutputName,
					null,
					null,
					videoMetadata,
					overlayFilter || undefined,
					chaptersResult.hasExplicit ? chaptersResult.path : undefined,
					false,
					true  // skipGif — GIF already generated from silent video
				);
				logSuccess(`  ✓ ${dlResult.mp4File}`);
				downloadMp4 = dlResult.mp4File;
			}

			voiceOutputs.push({
				audioFile: m4aFile,
				srtFile: captions.srtFile,
				voice,
				vttFile: captions.vttFile,
			});

			if (mkvFlag) {
				mkvTracks.push({ captions, segments: synthesised, voice });
			}
		}
	} else {
		// ── Non-web path: per-voice MP4 with burned-in captions ────────────────
		let isFirstVoice = true;

		for (const voice of voices) {
			if (voice !== primaryVoice) logVerbose(`  Voice: ${voice}`);
			const voiceOutputName = multiVoice ? `${outputSlug}.${voice}` : outputSlug;

			const synthesised = resolveStartTimes(
				primarySynthesised !== null && voice === primaryVoice
					? primarySynthesised
					: await runPiper(activeScript.segments, outputDir, voice, config.voicesDir)
			);

			if (!captionsOnly) logInfo('  Generating captions…');
			const captions = generateCaptions(synthesised, outputDir, voiceOutputName, captionMarginV);

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
				voiceOutputName,
				posterTime,
				parsed.posterFile,
				videoMetadata,
				overlayFilter || undefined,
				chaptersResult.hasExplicit ? chaptersResult.path : undefined,
				false,                       // mkv handled separately below
				multiVoice || !isFirstVoice  // skipGif in multi-voice; GIF generated once below
			);

			logSuccess(`  ✓ ${result.mp4File}`);
			if (result.gifFile) logSuccess(`  ✓ ${result.gifFile}`);
			if (result.posterFile) logSuccess(`  ✓ ${result.posterFile}`);
			if (result.cardFile) logSuccess(`  ✓ ${result.cardFile}`);

			if (isFirstVoice) {
				sharedGifFile = result.gifFile;
				lastPosterFile = result.posterFile;
				lastCardFile = result.cardFile;
				lastOgFile = result.ogFile;
				isFirstVoice = false;
			}

			if (mkvFlag) {
				mkvTracks.push({ captions, segments: synthesised, voice });
			}
		}

		// In multi-voice mode runFfmpeg skips GIF for all voices (to avoid naming it
		// after the primary voice). Generate one voice-agnostic GIF from the primary
		// voice MP4 after all voices have been stitched.
		if (multiVoice) {
			const primaryMp4 = join(outputDir, `${outputSlug}.${primaryVoice}.mp4`);
			const gifFile = join(outputDir, `${outputSlug}.gif`);
			logInfo('  Generating GIF…');
			await generateGif(primaryMp4, gifFile);
			logSuccess(`  ✓ ${gifFile}`);
			sharedGifFile = gifFile;
		}
	}

	// ── MKV bundle ─────────────────────────────────────────────────────────────
	if (mkvFlag && mkvTracks.length > 0) {
		const mkvFile = join(outputDir, `${outputSlug}.mkv`);
		logInfo('  Bundling MKV…');
		await stitchMkvMultiVoice(
			rawMp4,
			mkvTracks,
			mkvFile,
			videoMetadata,
			chaptersResult.hasExplicit ? chaptersResult.path : undefined
		);
		logSuccess(`  ✓ ${mkvFile}`);
	}

	if (webEnabled && voiceOutputs.length > 0) {
		logInfo('  Generating manifest…');
		const silentMp4 = join(webOutputDir, `${outputSlug}.silent.mp4`);
		const manifestFile = generateManifest(
			parsed,
			webOutputDir,
			silentMp4,
			sharedGifFile,
			lastPosterFile,
			lastCardFile,
			lastOgFile,
			voiceOutputs,
			downloadMp4
		);
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

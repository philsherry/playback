import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import type { Voice } from '../schema/meta';
import type { NarrationSegment, SynthesisedSegment } from '../types';
import { applySubstitutions } from '../substitutions';
import { getVoiceModel, getVoiceSpeaker, loadVoiceCatalogue } from '../voices';
import { voicesCacheDir } from '../paths';
import { FFMPEG_FULL_BIN } from '../constants';
import { logWarn } from '../logger';

/**
 * Thrown when piper-tts fails, is not installed, or a required voice model is missing.
 * @param message - Human-readable description of the failure.
 */
export class PiperError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'PiperError';
	}
}

/**
 * Synthesis tuning parameters for a single piper voice.
 *
 * These map directly to piper CLI flags. All three parameters are part of the
 * VITS stochastic vocoder — understanding what they each affect helps when
 * tuning a new voice:
 *
 * - `noiseScale` (`--noise_scale`) — phonation/timbre variance. High values
 *   cause adjacent sentences to sound like different speakers. Keep low.
 * - `noiseW` (`--noise_w`) — phoneme duration variance. Controls natural
 *   rhythm; higher values sound less robotic. Can be kept moderate.
 * - `lengthScale` (`--length_scale`) — global speaking-rate multiplier.
 *   `1.0` = model default speed. `0.85` = 15 % faster; `1.15` = 15 % slower.
 */
type VoiceSynthConfig = {
	/** Speaking-rate multiplier (piper default: 1.0). Lower = faster. */
	lengthScale: number;
	/** Phonation/timbre variance (piper default: 0.667). Low = consistent speaker identity. */
	noiseScale: number;
	/** Phoneme-duration variance (piper default: 0.8). Moderate = natural rhythm. */
	noiseW: number;
};

/**
 * Default synthesis config used when a voice has no entry in `VOICE_CONFIG`.
 * Allows consumer-defined voices (e.g. multi-speaker models added in a
 * project-local `voices.yaml`) to work without requiring this package to
 * enumerate them. Tune per-voice entries in `VOICE_CONFIG` if the defaults
 * are not suitable after listening.
 */
const DEFAULT_SYNTH_CONFIG: VoiceSynthConfig = { lengthScale: 1.0, noiseScale: 0.1, noiseW: 0.6 };

/**
 * Per-voice synthesis configuration.
 *
 * Voice model filenames and quality levels are sourced from `voices.yaml` via
 * `src/voices.ts`. This map holds only the VITS stochastic vocoder tuning
 * parameters. Add a new entry here whenever a voice is added to `voices.yaml`.
 * Tune `lengthScale` to normalise speaking rate across voices and
 * `noiseScale`/`noiseW` to balance consistency vs. expressiveness.
 */
export const VOICE_CONFIG: Record<string, VoiceSynthConfig> = {
	alan: { lengthScale: 0.82, noiseScale: 0.1, noiseW: 0.6 },
	alba: { lengthScale: 1.0, noiseScale: 0.1, noiseW: 0.6 },
	// ARU Speech Corpus (Liverpool) — Received Pronunciation, 12 speakers.
	// Starting values; tune after listening.
	aru_09: { lengthScale: 1.0, noiseScale: 0.1, noiseW: 0.6 },
	northern_english_male: { lengthScale: 1.0, noiseScale: 0.1, noiseW: 0.6 },
	southern_english_female: { lengthScale: 1.0, noiseScale: 0.1, noiseW: 0.6 },
};


/**
 * Resolves the absolute path to a piper `.onnx` voice model file.
 *
 * The model filename is read from `voices.yaml` — the single source of truth
 * for voice model names and quality levels. Throws {@link PiperError} if the
 * resolved path does not exist on disk — this usually means `npm run setup`
 * has not been run.
 * @param voice - Voice identifier from `voices.yaml`.
 * @param voicesDir - Path (relative to `cwd`) containing `.onnx` model files.
 * @returns Absolute path to the resolved `.onnx` model file.
 */
function resolveModel(voice: Voice, voicesDir: string): string {
	const modelFile = `${getVoiceModel(voice)}.onnx`;

	// 1. Project-local (existing behaviour — allows per-project overrides).
	const localPath = resolve(process.cwd(), voicesDir, modelFile);
	if (existsSync(localPath)) return localPath;

	// 2. Shared XDG cache (~/.cache/playback/voices/).
	const cachePath = join(voicesCacheDir(), modelFile);
	if (existsSync(cachePath)) return cachePath;

	// 3. Not found.
	throw new PiperError(
		`Voice model not found.\nSearched:\n  ${localPath}\n  ${cachePath}\nRun: npm run setup`
	);
}

/**
 * Spawns `piper` to synthesise a single narration segment to a WAV file.
 *
 * Text is written to piper's stdin and closed; audio is written to
 * `outputFile` directly by piper via `--output_file`. Stderr is captured
 * to include in the rejection message when synthesis fails. Rejects with
 * {@link PiperError} on non-zero exit or if `piper` is not on `$PATH`.
 * @param text - Narration text to synthesise (substitutions already applied).
 * @param modelPath - Absolute path to the `.onnx` voice model file.
 * @param outputFile - Absolute path where the output `.wav` will be written.
 * @param noiseScale - Phonation/timbre variance (`--noise_scale`).
 * @param noiseW - Phoneme-duration variance (`--noise_w`).
 * @param lengthScale - Speaking-rate multiplier (`--length_scale`).
 * @param speakerId - Speaker index for multi-speaker models (`--speaker`). Omit for single-speaker models.
 * @returns A promise that resolves when synthesis completes successfully.
 */
function synthesise(
	text: string,
	modelPath: string,
	outputFile: string,
	noiseScale: number,
	noiseW: number,
	lengthScale: number,
	speakerId?: number
): Promise<void> {
	return new Promise((resolve, reject) => {
		const piperArgs = [
			'--model',
			modelPath,
			'--output_file',
			outputFile,
			// Per-voice VITS tuning — see VOICE_CONFIG for rationale.
			'--noise_scale',
			String(noiseScale),
			'--noise_w',
			String(noiseW),
			'--length_scale',
			String(lengthScale),
		];

		if (speakerId !== undefined) {
			piperArgs.push('--speaker', String(speakerId));
		}

		const child = spawn('piper', piperArgs, { stdio: ['pipe', 'inherit', 'pipe'] });

		let stderr = '';

		child.stderr.on('data', (chunk: Buffer) => {
			stderr += chunk.toString();
		});

		child.on('error', (err) => {
			if ((err as Error & { code?: string }).code === 'ENOENT') {
				reject(
					new PiperError(
						'piper is not installed or not on PATH.\nRun: uv tool install piper-tts'
					)
				);
			} else {
				reject(new PiperError(`Failed to spawn piper: ${err.message}`));
			}
		});

		child.on('close', (code) => {
			if (code !== 0) {
				reject(
					new PiperError(
						`piper exited with code ${code}${stderr ? `:\n${stderr.trim()}` : ''}`
					)
				);
				return;
			}
			// Surface any synthesis warnings without requiring a crash.
			if (stderr.trim()) {
				for (const line of stderr.trim().split('\n')) {
					if (line.trim()) logWarn(`piper: ${line.trim()}`);
				}
			}
			resolve();
		});

		// Write narration text to piper's stdin and close it
		child.stdin.write(text);
		child.stdin.end();
	});
}

/**
 * Uses `ffprobe` to measure the exact duration of a synthesised audio file.
 *
 * Duration is measured after synthesis because estimated durations from
 * {@link narrationDuration} are only approximations — actual piper output
 * varies slightly. The measured value is used by {@link runPiper} to resolve
 * accurate start times for subsequent narration segments.
 * @param audioFile - Absolute path to the `.wav` file to probe.
 * @returns Duration of the audio file in seconds.
 */
function probeAudioDuration(audioFile: string): number {
	const raw = execFileSync(
		`${FFMPEG_FULL_BIN}/ffprobe`,
		[
			'-v',
			'quiet',
			'-show_entries',
			'format=duration',
			'-of',
			'csv=p=0',
			audioFile
		],
		{ encoding: 'utf8' }
	);

	return parseFloat(raw.trim());
}

/**
 * Synthesises narration audio for each segment in the TTS script.
 *
 * Segments are processed sequentially — piper performs ONNX inference on the
 * CPU and parallelising synthesis would thrash on longer scripts without
 * reducing wall time. Each segment produces a `.wav` file named
 * `<NN>-<voice>.wav` (zero-padded to two digits) in `outputDir/segments/`. After synthesis,
 * {@link probeAudioDuration} measures the actual audio length so that
 * start times can be resolved accurately by the caller.
 * @param segments - Narration segments extracted from the tape.
 * @param outputDir - Absolute path to the directory where `.wav` files are written.
 * @param voice - Voice model to use for synthesis.
 * @param voicesDir - Path (relative to `cwd`) containing `.onnx` model files.
 * @returns Array of synthesised segments with audio file paths and durations.
 */
export async function runPiper(
	segments: NarrationSegment[],
	outputDir: string,
	voice: Voice = 'northern_english_male',
	voicesDir = 'voices'
): Promise<SynthesisedSegment[]> {
	if (segments.length === 0) {
		return [];
	}

	const modelPath = resolveModel(voice, voicesDir);
	// Tuning priority: voices.yaml entry fields → VOICE_CONFIG → DEFAULT_SYNTH_CONFIG.
	// This allows consumer projects to tune synthesis in their own voices.yaml without
	// modifying this package.
	const catalogueEntry = loadVoiceCatalogue()[voice];
	const hasCatalogueTuning = catalogueEntry?.lengthScale !== undefined
		|| catalogueEntry?.noiseScale !== undefined
		|| catalogueEntry?.noiseW !== undefined;
	const { lengthScale, noiseScale, noiseW } = hasCatalogueTuning
		? {
			lengthScale: catalogueEntry.lengthScale ?? DEFAULT_SYNTH_CONFIG.lengthScale,
			noiseScale: catalogueEntry.noiseScale ?? DEFAULT_SYNTH_CONFIG.noiseScale,
			noiseW: catalogueEntry.noiseW ?? DEFAULT_SYNTH_CONFIG.noiseW,
		}
		: (VOICE_CONFIG[voice] ?? DEFAULT_SYNTH_CONFIG);
	const speakerId = getVoiceSpeaker(voice);
	const results: SynthesisedSegment[] = [];

	const segmentsDir = join(outputDir, 'segments');
	mkdirSync(segmentsDir, { recursive: true });

	// Run sequentially — piper is CPU-intensive (ONNX inference)
	// and parallel synthesis would thrash on longer scripts.
	for (const segment of segments) {
		const audioFile = join(
			segmentsDir,
			`${String(segment.stepIndex).padStart(2, '0')}-${voice}.wav`
		);

		await synthesise(
			applySubstitutions(segment.text),
			modelPath,
			audioFile,
			noiseScale,
			noiseW,
			lengthScale,
			speakerId
		);

		const audioDuration = probeAudioDuration(audioFile);
		results.push({ ...segment, audioDuration, audioFile });
	}

	return results;
}

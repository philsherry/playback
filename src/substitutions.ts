/**
 * Phonetic substitutions applied to narration text before synthesis.
 *
 * Piper reads unknown tokens as single words, which produces wrong
 * pronunciations for acronyms, domain names, and technical terms.
 * Each entry maps a literal string (case-insensitive) to the phonetic
 * spelling that piper should receive instead.
 *
 * Entries are applied in order — put longer/more-specific patterns first
 * so they match before shorter overlapping ones.
 *
 * Examples:
 *   govuk     → guv yew-kay   ("GOV.UK" the domain name)
 *   GOV.UK    → guv yew-kay
 */

type Substitution = {
	/** Literal string to match (case-insensitive). */
	from: string;
	/** Phonetic replacement to pass to piper. */
	to: string;
};

const SUBSTITUTIONS: Substitution[] = [
	{ from: 'GOV.UK', to: 'guv yew-kay' },
	{ from: 'govuk', to: 'guv yew-kay' },
];

/**
 * Applies phonetic substitutions to a narration string.
 * Matches are case-insensitive; replacement preserves the substitution's
 * own casing (the `to` value is used verbatim).
 * @param text - Narration text to normalise before synthesis.
 * @returns The narration text with substitutions applied.
 */
export function applySubstitutions(text: string): string {
	let result = text;
	for (const { from, to } of SUBSTITUTIONS) {
		result = result.replace(new RegExp(from, 'gi'), to);
	}
	return result;
}

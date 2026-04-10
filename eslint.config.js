import js from '@eslint/js';
import comments from '@eslint-community/eslint-plugin-eslint-comments/configs';
import globals from 'globals';
import { jsdoc } from 'eslint-plugin-jsdoc';
import perfectionist from 'eslint-plugin-perfectionist';
import tseslint from 'typescript-eslint';

const sharedGlobals = {
	...globals.browser,
	...globals.commonjs,
	...globals.jest,
	...globals.node,
	...globals.serviceworker,
	...globals['shared-node-browser'],
	...globals.worker
};

export default tseslint.config(
	js.configs.recommended,
	comments.recommended,
	jsdoc({
		config: 'flat/recommended-mixed'
	}),
	...tseslint.configs.recommended,
	{
		languageOptions: {
			ecmaVersion: 'latest',
			globals: {
				...sharedGlobals
			},
			sourceType: 'module'
		},
		plugins: {
			perfectionist,
		},
		rules: {
			'@eslint-community/eslint-comments/no-unused-disable': 'error',
			'@typescript-eslint/no-unused-vars': [
				'warn',
				{
					argsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_'
				}
			],
			'no-undef': 'warn',
			'no-unused-vars': 'off',
			'perfectionist/sort-interfaces': ['error', { type: 'natural' }],
			'perfectionist/sort-object-types': ['error', { type: 'natural' }],
			'perfectionist/sort-objects': ['error', { type: 'natural' }],
		}
	},
	{
		files: ['**/*.{js,mjs,cjs}'],
		...tseslint.configs.disableTypeChecked
	}
);

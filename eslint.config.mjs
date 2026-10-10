import js from '@eslint/js';
import astro from 'eslint-plugin-astro';

export default [
	{
		ignores: ['.astro/', 'dist/', 'node_modules/'],
	},
	{
		files: ['scripts/**/*.mjs'],
		languageOptions: {
			globals: {
				fetch: 'readonly',
				process: 'readonly',
				URLSearchParams: 'readonly',
			},
		},
	},
	js.configs.recommended,
	...astro.configs['flat/recommended'],
];

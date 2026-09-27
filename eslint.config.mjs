import js from '@eslint/js';
import astro from 'eslint-plugin-astro';

export default [
	{
		ignores: ['.astro/', 'dist/', 'node_modules/'],
	},
	js.configs.recommended,
	...astro.configs['flat/recommended'],
];

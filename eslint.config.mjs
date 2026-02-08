import { defineConfig } from 'eslint/config';
import tseslint from '@electron-toolkit/eslint-config-ts';
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier';

export default defineConfig(
	{ ignores: ['**/node_modules', '**/dist', '**/out', '**/*.html'] },
	tseslint.configs.recommended,
	eslintConfigPrettier,
	{
		rules: {
			'no-unused-vars': [
				'error',
				{
					varsIgnorePattern: '^_',
					argsIgnorePatten: '^_',
					destructuredArrayIgnorePattern: '^_',
				},
			],
		},
	},
);

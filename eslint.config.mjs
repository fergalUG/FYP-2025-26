// @ts-check

import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig([
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'babel.config.js',
      'prettierrc',
      '.prettierignore',
      'ios/**',
      'android/**',
      '.expo/**',
      '.git',
      '.github/**',
      '.vscode/**',
      '__tests__/**',
      'tmp/**',
      '.venv/**',
      'logs/**',
      'coverage/**',
      'docs/**',
      'output/**',
      'scripts/**',
      'testdb/**',

      // files
      'src/utils/logger.ts',
      'jest.config.js',
      'jest.setup.js',
      'eslint.config.mjs',
    ],
  },
]);

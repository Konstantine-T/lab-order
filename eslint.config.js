import js from '@eslint/js';
import globals from 'globals';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  { ignores: ['dist', 'node_modules', 'supabase'] },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parser: tsparser,
      parserOptions: { ecmaFeatures: { jsx: true } },
      // This is browser code, so declare the browser globals. Without them
      // `no-undef` flagged every `document`, `File`, `setTimeout` and DOM type
      // as undefined — ~60 false positives that buried the real findings (an
      // undefined `React` in CrownAndBridgeForm sat in there unnoticed).
      // `ParentNode` is a DOM interface the `globals` browser list omits (it's
      // a type, never a runtime value), so add it by hand.
      globals: { ...globals.browser, ParentNode: 'readonly' },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tseslint.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Build tooling runs in Node, not the browser.
    files: ['*.config.{ts,js}', 'scripts/**/*.{ts,js,mjs}'],
    languageOptions: { globals: { ...globals.node } },
  },
];
